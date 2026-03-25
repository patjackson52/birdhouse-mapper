# Phase 1: Multi-Tenant Foundation — Design Spec

> **Date:** 2026-03-24
> **Phase:** 1 of 4 (IAM Northstar implementation)
> **Scope:** Core multi-tenant data model — users, orgs, org_memberships, roles
> **Approach:** Big-bang migration, backend-first (frontend unchanged)

---

## Context

The platform is currently single-tenant: one deployment = one site. User identity
is a `profiles` table with a hardcoded `role` enum (`admin` | `editor`). There are
no organizations, no configurable roles, and no membership model.

The IAM Northstar spec defines a multi-org, multi-property platform with hierarchical
access control. Phase 1 lays the data model foundation that all subsequent phases
build on.

### Phase roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **1** | **Users, orgs, org_memberships, roles** | **This spec** |
| 2 | Properties, property_memberships, property_access_config, permission resolution | Planned |
| 3 | Temporary access grants, anonymous access tokens, full RLS rewrite | Planned |
| 4 | Custom domains, tenant resolution middleware, Caddy integration | Planned |

### Design decisions made

- **Rename `profiles` → `users`** with compatibility view for frontend
- **Big-bang migration** — single atomic migration file
- **Backend-first** — frontend remains unchanged, compatibility preserved
- **Seed default roles** — no role management UI yet (wizard comes later)
- **Keep `users.role` column** — dropped in Phase 3 after all policies migrated
- **Existing `editor` maps to `org_staff`** — editors have full content creation rights
- **`PLATFORM_DOMAIN` env var** — base domain kept configurable, no name decided yet

---

## Migration: `008_multi_tenant_foundation.sql`

### Execution order

```
 1. Rename profiles → users
 2. Add new columns to users
 3. Create orgs table
 4. Create roles table
 5. Create org_memberships table
 6. Insert default org (name from site_config)
 7. Seed 4 system roles (Admin, Staff, Contributor, Viewer)
 8. Populate users columns from auth.users
 9. Create org_memberships from existing users
10. Set last_active_org_id on all users
11. Create profiles compatibility view
12. Drop old RLS policies on users
13. Create new RLS policies on users, orgs, roles, org_memberships
14. Update existing content and storage policies (profiles→users rename)
15. Replace handle_new_user() trigger function
16. Add updated_at triggers for new tables
17. Add indexes
```

---

## Section 1: Rename `profiles` → `users` and Extend

### Rename

```sql
ALTER TABLE profiles RENAME TO users;
```

### New columns

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `email` | text | — | Populated from `auth.users.email` |
| `email_verified` | boolean | false | |
| `full_name` | text | — | Populated from `display_name` initially |
| `avatar_url` | text | — | |
| `phone` | text | — | |
| `timezone` | text | `'UTC'` | |
| `locale` | text | `'en'` | |
| `is_platform_admin` | boolean | false | |
| `last_active_org_id` | uuid | — | FK to orgs |
| `last_seen_at` | timestamptz | — | |
| `updated_at` | timestamptz | now() | |

### Columns kept temporarily

- `role` — compatibility bridge until Phase 3 RLS rewrite
- `is_temporary`, `session_expires_at`, `invite_id`, `deleted_at` — reconsidered in Phase 3 when `temporary_access_grants` replaces the invite system

### Compatibility view

```sql
CREATE VIEW profiles AS
SELECT id, display_name, role, created_at,
       is_temporary, session_expires_at, invite_id, deleted_at
FROM users;
```

Existing frontend queries (`supabase.from('profiles')`) continue working.

**Write compatibility:** This view is a simple single-table SELECT without joins,
aggregation, or DISTINCT, which makes it [auto-updatable in PostgreSQL](https://www.postgresql.org/docs/current/sql-createview.html#SQL-CREATEVIEW-UPDATABLE-VIEWS).
INSERT, UPDATE, DELETE, and UPSERT operations through the view will pass through
to the `users` table. This is critical because several server actions write to `profiles`:

- `src/app/invite/[token]/actions.ts` — INSERT and DELETE
- `src/app/api/cron/cleanup-temp-accounts/route.ts` — UPDATE
- `src/app/setup/actions.ts` — UPSERT

All NOT NULL columns on `users` that are not exposed through the view have defaults
(`email_verified`, `timezone`, `locale`, `is_platform_admin`, `updated_at`) or are
nullable (`email`, `full_name`, etc.), so inserts through the view will succeed.
The existing CHECK constraint on `role` (`role IN ('admin', 'editor')`) remains intact.

**RLS:** Views do not have their own RLS policies — they inherit RLS from the
underlying `users` table. No RLS is set on the view itself.

**Verification step:** After migration, test `INSERT INTO profiles(id, display_name, role) VALUES (...)` to confirm write-through works.

---

## Section 2: New Tables

### `orgs`

```sql
CREATE TABLE orgs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  slug                     text UNIQUE NOT NULL,
  is_active                boolean DEFAULT true,
  subscription_tier        text DEFAULT 'free'
                           CHECK (subscription_tier IN ('free', 'community', 'pro', 'municipal')),
  subscription_status      text DEFAULT 'trialing'
                           CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'cancelled')),
  primary_custom_domain_id uuid,  -- FK added in Phase 4
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);
```

### `roles`

```sql
CREATE TABLE roles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name                        text NOT NULL,
  description                 text,
  base_role                   text NOT NULL
                              CHECK (base_role IN ('platform_admin', 'org_admin', 'org_staff', 'contributor', 'viewer', 'public')),
  color                       text,
  icon                        text,
  permissions                 jsonb NOT NULL DEFAULT '{}',
  is_default_new_member_role  boolean DEFAULT false,
  is_public_role              boolean DEFAULT false,
  is_system_role              boolean DEFAULT false,
  sort_order                  int DEFAULT 0,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  UNIQUE (org_id, name)
);
```

**`base_role` enum values:** `platform_admin`, `org_admin`, `org_staff`, `contributor`, `viewer`, `public`

### `org_memberships`

```sql
CREATE TABLE org_memberships (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id               uuid REFERENCES users(id) ON DELETE SET NULL,
  role_id               uuid NOT NULL REFERENCES roles(id),
  status                text DEFAULT 'invited'
                        CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  invited_email         text,
  invited_by            uuid REFERENCES users(id),
  invitation_token      text UNIQUE,
  invitation_expires_at timestamptz,
  accepted_at           timestamptz,
  is_primary_org        boolean DEFAULT false,
  default_property_id   uuid,    -- FK to properties added in Phase 2
  notification_prefs    jsonb DEFAULT '{}',
  joined_at             timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
```

Note: No table-level `UNIQUE (org_id, user_id)` constraint — uniqueness for non-null
user_id is enforced by the partial unique index in Section 6. PostgreSQL UNIQUE treats
NULLs as distinct, so the table-level constraint would allow unlimited `(org_id, NULL)`
rows, which is the desired behavior for pending invitations.

### Seeded default roles

| name | base_role | is_default | is_system | Key permissions |
|------|-----------|------------|-----------|-----------------|
| Admin | org_admin | false | true | Everything true |
| Staff | org_staff | false | true | All content, no org settings |
| Contributor | contributor | true | true | Edit assigned, create updates |
| Viewer | viewer | false | true | Read-only |

#### Full permissions JSONB per role

**Admin (org_admin):**
```json
{
  "org": { "manage_settings": true, "manage_members": true, "manage_billing": true, "manage_roles": true, "view_audit_log": true },
  "properties": { "create": true, "manage_all": true, "view_all": true },
  "items": { "view": true, "create": true, "edit_any": true, "edit_assigned": true, "delete": true },
  "updates": { "view": true, "create": true, "edit_own": true, "edit_any": true, "delete": true, "approve_public_submissions": true },
  "tasks": { "view_assigned": true, "view_all": true, "create": true, "assign": true, "complete": true },
  "attachments": { "upload": true, "delete_own": true, "delete_any": true },
  "reports": { "view": true, "export": true },
  "modules": { "tasks": true, "volunteers": true, "public_forms": true, "qr_codes": true, "reports": true }
}
```

**Staff (org_staff):**
```json
{
  "org": { "manage_settings": false, "manage_members": false, "manage_billing": false, "manage_roles": false, "view_audit_log": false },
  "properties": { "create": false, "manage_all": false, "view_all": true },
  "items": { "view": true, "create": true, "edit_any": true, "edit_assigned": true, "delete": false },
  "updates": { "view": true, "create": true, "edit_own": true, "edit_any": false, "delete": false, "approve_public_submissions": false },
  "tasks": { "view_assigned": true, "view_all": true, "create": true, "assign": true, "complete": true },
  "attachments": { "upload": true, "delete_own": true, "delete_any": false },
  "reports": { "view": true, "export": false },
  "modules": { "tasks": true, "volunteers": false, "public_forms": false, "qr_codes": false, "reports": false }
}
```

**Contributor:**
```json
{
  "org": { "manage_settings": false, "manage_members": false, "manage_billing": false, "manage_roles": false, "view_audit_log": false },
  "properties": { "create": false, "manage_all": false, "view_all": true },
  "items": { "view": true, "create": false, "edit_any": false, "edit_assigned": true, "delete": false },
  "updates": { "view": true, "create": true, "edit_own": true, "edit_any": false, "delete": false, "approve_public_submissions": false },
  "tasks": { "view_assigned": true, "view_all": false, "create": false, "assign": false, "complete": true },
  "attachments": { "upload": true, "delete_own": true, "delete_any": false },
  "reports": { "view": false, "export": false },
  "modules": { "tasks": true, "volunteers": false, "public_forms": false, "qr_codes": false, "reports": false }
}
```

**Viewer:**
```json
{
  "org": { "manage_settings": false, "manage_members": false, "manage_billing": false, "manage_roles": false, "view_audit_log": false },
  "properties": { "create": false, "manage_all": false, "view_all": true },
  "items": { "view": true, "create": false, "edit_any": false, "edit_assigned": false, "delete": false },
  "updates": { "view": true, "create": false, "edit_own": false, "edit_any": false, "delete": false, "approve_public_submissions": false },
  "tasks": { "view_assigned": true, "view_all": false, "create": false, "assign": false, "complete": false },
  "attachments": { "upload": false, "delete_own": false, "delete_any": false },
  "reports": { "view": false, "export": false },
  "modules": { "tasks": false, "volunteers": false, "public_forms": false, "qr_codes": false, "reports": false }
}
```

---

## Section 3: Data Migration

### Step 1 — Create default org

```sql
INSERT INTO orgs (id, name, slug)
VALUES (
  gen_random_uuid(),
  COALESCE(
    (SELECT value#>>'{}'  FROM site_config WHERE key = 'site_name'),
    'My Organization'
  ),
  'default'
);
```

Name pulled from existing `site_config`. Slug defaults to `'default'` — admin can change later.

### Step 2 — Seed default roles

Insert 4 system roles linked to the new org with full `permissions` JSONB as defined above.

### Step 3 — Populate `users` columns from `auth.users`

```sql
UPDATE users SET
  email = au.email,
  email_verified = (au.email_confirmed_at IS NOT NULL),
  full_name = COALESCE(users.display_name, au.raw_user_meta_data->>'display_name', 'Unknown'),
  updated_at = now()
FROM auth.users au
WHERE users.id = au.id;
```

### Step 4 — Create `org_memberships` from existing users

```sql
INSERT INTO org_memberships (org_id, user_id, role_id, status, joined_at, is_primary_org)
SELECT
  (SELECT id FROM orgs LIMIT 1),
  u.id,
  CASE u.role
    WHEN 'admin' THEN (SELECT id FROM roles WHERE base_role = 'org_admin'
                       AND org_id = (SELECT id FROM orgs LIMIT 1))
    WHEN 'editor' THEN (SELECT id FROM roles WHERE base_role = 'org_staff'
                        AND org_id = (SELECT id FROM orgs LIMIT 1))
    ELSE (SELECT id FROM roles WHERE base_role = 'org_staff'
          AND org_id = (SELECT id FROM orgs LIMIT 1))
  END,
  CASE WHEN u.is_temporary THEN 'invited' ELSE 'active' END,
  u.created_at,
  true
FROM users u
WHERE u.deleted_at IS NULL;
```

**Role mapping:** `admin` → `org_admin`, `editor` → `org_staff` (editors have full content creation rights matching `org_staff` definition).

### Step 5 — Set `last_active_org_id`

```sql
UPDATE users SET last_active_org_id = (SELECT id FROM orgs LIMIT 1)
WHERE deleted_at IS NULL;
```

---

## Section 4: RLS Policies

### New table policies

#### `users`

| Policy | Operation | Logic |
|--------|-----------|-------|
| `users_read_own` | SELECT | `id = auth.uid()` |
| `users_platform_admin` | ALL | `is_platform_admin = true` on caller |
| `users_org_admin_read` | SELECT | Caller is `org_admin` in a shared org |
| `users_update_own` | UPDATE | `id = auth.uid()` |

#### `orgs`

| Policy | Operation | Logic |
|--------|-----------|-------|
| `orgs_member_read` | SELECT | Caller has active `org_memberships` row |
| `orgs_admin_update` | UPDATE | Caller's role has `base_role = 'org_admin'` |
| `orgs_platform_admin` | ALL | `is_platform_admin = true` on caller |

#### `roles`

| Policy | Operation | Logic |
|--------|-----------|-------|
| `roles_org_member_read` | SELECT | Caller has active membership in `roles.org_id` |
| `roles_org_admin_manage` | ALL | Caller is `org_admin` in `roles.org_id` |

#### `org_memberships`

| Policy | Operation | Logic |
|--------|-----------|-------|
| `org_memberships_read_own` | SELECT | `user_id = auth.uid()` |
| `org_memberships_admin_read` | SELECT | Caller is `org_admin` in same org |
| `org_memberships_admin_manage` | ALL | Caller is `org_admin` in same org |

### Existing table policies — `profiles` → `users` rename

Only policies that reference `profiles` in their expressions need updating. Policies
that use `to authenticated using (true)` or don't reference the profiles table are unchanged.

**Tables with policies that reference `profiles` (must update):**
- `items` — insert/update/delete policies
- `item_updates` — insert/update/delete policies
- `photos` — insert/update/delete policies
- `site_config` — insert/update/delete policies
- `item_types` — insert/update/delete policies
- `custom_fields` — insert/update/delete policies
- `update_types` — insert/update/delete policies
- `invites` — all CRUD policies
- `redirects` — insert/update/delete policies
- `storage.objects` — delete policy on `item-photos` bucket, delete policy on `landing-assets` bucket

**Tables with policies that do NOT reference `profiles` (no change needed):**
- `species` — uses `to authenticated using (true)` for all operations
- `item_species` — uses `to authenticated using (true)`
- `update_species` — uses `to authenticated using (true)`
- `location_history` — uses `to authenticated using (true)` for insert

Example transformation:
```sql
-- Before
... EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))
-- After
... EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'editor'))
```

These policies are fully rewritten to use `org_memberships` + `roles` in Phases 2–3.

---

## Section 5: Trigger Update

### `handle_new_user()`

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  IF new.is_anonymous = true THEN
    RETURN new;
  END IF;

  INSERT INTO users (id, display_name, email, email_verified, full_name, role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'display_name',
    new.email,
    (new.email_confirmed_at IS NOT NULL),
    COALESCE(new.raw_user_meta_data->>'display_name', 'Unknown'),
    'editor'  -- kept for compatibility; actual role from org_memberships
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Note:** This trigger does NOT auto-create an `org_memberships` row. New users join orgs through the invite/join flow. The `role = 'editor'` default is for backward compatibility only.

---

## Section 6: Triggers

Reuse the existing `update_updated_at()` trigger function (from `001_initial_schema.sql`)
for the new tables:

```sql
CREATE TRIGGER orgs_updated_at
  BEFORE UPDATE ON orgs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER org_memberships_updated_at
  BEFORE UPDATE ON org_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## Section 7: Indexes

```sql
-- org_memberships
CREATE INDEX ON org_memberships (user_id);
CREATE INDEX ON org_memberships (org_id, status) WHERE status = 'active';
CREATE INDEX ON org_memberships (invitation_token) WHERE invitation_token IS NOT NULL;
CREATE UNIQUE INDEX ON org_memberships (org_id, user_id) WHERE user_id IS NOT NULL;

-- roles
CREATE INDEX ON roles (org_id);

-- orgs: slug already has a unique index from the UNIQUE constraint, no additional index needed

-- users (new)
CREATE INDEX ON users (last_active_org_id);
CREATE INDEX ON users (email);
```

---

## Section 8: TypeScript Changes

### New types in `src/lib/types.ts`

```typescript
export type BaseRole = 'platform_admin' | 'org_admin' | 'org_staff' | 'contributor' | 'viewer' | 'public';

export type OrgMembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked';

export interface Org {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  subscription_tier: string;
  subscription_status: string;
  primary_custom_domain_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  base_role: BaseRole;
  color: string | null;
  icon: string | null;
  permissions: RolePermissions;
  is_default_new_member_role: boolean;
  is_public_role: boolean;
  is_system_role: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RolePermissions {
  org: { manage_settings: boolean; manage_members: boolean; manage_billing: boolean; manage_roles: boolean; view_audit_log: boolean };
  properties: { create: boolean; manage_all: boolean; view_all: boolean };
  items: { view: boolean; create: boolean; edit_any: boolean; edit_assigned: boolean; delete: boolean };
  updates: { view: boolean; create: boolean; edit_own: boolean; edit_any: boolean; delete: boolean; approve_public_submissions: boolean };
  tasks: { view_assigned: boolean; view_all: boolean; create: boolean; assign: boolean; complete: boolean };
  attachments: { upload: boolean; delete_own: boolean; delete_any: boolean };
  reports: { view: boolean; export: boolean };
  modules: { tasks: boolean; volunteers: boolean; public_forms: boolean; qr_codes: boolean; reports: boolean };
}

export interface OrgMembership {
  id: string;
  org_id: string;
  user_id: string | null;
  role_id: string;
  status: OrgMembershipStatus;
  invited_email: string | null;
  invited_by: string | null;
  invitation_token: string | null;
  invitation_expires_at: string | null;
  accepted_at: string | null;
  is_primary_org: boolean;
  default_property_id: string | null;
  notification_prefs: Record<string, unknown>;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}
```

### `Database` interface additions

Add `orgs`, `roles`, `org_memberships` to `Database.public.Tables`. Existing `profiles` entry unchanged (compatibility view).

### No component changes

Frontend code continues using `profiles` queries and `UserRole` type. No React components modified in Phase 1.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `ALTER TABLE RENAME` breaks FK references from `invites` | Postgres auto-updates FKs on table rename — `invites.created_by` and `invites.claimed_by` FKs will point to `users` automatically |
| RLS self-referencing on `users` | Same pattern as existing `profiles` policies — works in Supabase |
| Compatibility view doesn't support writes | View is auto-updatable (simple single-table SELECT). All NOT NULL columns not in the view have defaults. Verified: INSERT, UPDATE, DELETE, UPSERT pass through to `users`. See Section 1 for details. |
| Migration fails halfway | Supabase migrations are transactional — atomic rollback |
| New user signup has no org membership | Expected — join-via-invite flow. `role = 'editor'` default on `users` keeps existing RLS working. New users cannot query `orgs`/`roles`/`org_memberships` tables (no rows returned) but no frontend code queries those yet. Invite flow update deferred to Phase 2. |
| `users.role` CHECK constraint (`IN ('admin', 'editor')`) | Kept as-is for Phase 1. Will be dropped alongside the `role` column in Phase 3. |

---

## What This Phase Does NOT Touch

| Concern | Deferred to |
|---------|-------------|
| `properties` table, property memberships | Phase 2 |
| `org_id` / `property_id` on content tables | Phase 2 |
| `site_config` → org/property config split | Phase 2 |
| Permission resolution function | Phase 2 |
| `temporary_access_grants` | Phase 3 |
| `property_access_config`, `anonymous_access_tokens` | Phase 3 |
| Full RLS rewrite (org-scoped content policies) | Phase 3 |
| Drop `users.role` column | Phase 3 |
| Drop `profiles` compatibility view | Phase 3 |
| `custom_domains`, tenant resolution middleware | Phase 4 |
| Org switcher UI, property selector UI | Future frontend phase |
| Role management UI / AI wizard | Future |

---

## Northstar Test Scenario Coverage (Phase 1)

| Scenario | Phase 1 coverage |
|----------|-----------------|
| A. Multi-org consultant | **Data model ready.** `users` + `org_memberships` supports multiple orgs. No UI yet. |
| B. Property-scoped volunteer | Not yet — requires Phase 2 `property_memberships`. |
| C. Day-of volunteer event | Not yet — requires Phase 3 `temporary_access_grants`. |
| D. Public trail map | Not yet — requires Phase 3 `property_access_config`. |
| E. Password-protected property | Not yet — requires Phase 3 `property_access_config`. |
| F. Embedded public map | Not yet — requires Phase 3 + Phase 4. |
