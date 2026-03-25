# Phase 1: Multi-Tenant Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the single-tenant birdhouse mapper into a multi-tenant-ready data model by renaming `profiles` → `users`, creating `orgs`/`roles`/`org_memberships` tables, migrating existing data, and rewriting all RLS policies — while keeping the frontend fully functional via a compatibility view.

**Architecture:** Single atomic SQL migration (`008_multi_tenant_foundation.sql`) handles all schema changes, data migration, and policy rewrites. A `profiles` view preserves backward compatibility so no frontend code changes are needed. TypeScript types are added for the new tables.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-phase1-multi-tenant-foundation-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/008_multi_tenant_foundation.sql` | All schema changes, data migration, RLS policies, triggers, indexes |
| Modify | `src/lib/types.ts` | Add `Org`, `Role`, `OrgMembership`, `RolePermissions`, `BaseRole`, `OrgMembershipStatus` types + `Database` interface |
| Create | `src/lib/__tests__/multi-tenant-types.test.ts` | Type-level tests for new interfaces and Database schema |

---

## Task 1: Create the migration file — Table rename and new columns

**Files:**
- Create: `supabase/migrations/008_multi_tenant_foundation.sql`

This task writes the first section of the migration: renaming `profiles` → `users` and adding new columns.

- [ ] **Step 1: Create migration file with header and table rename**

Create `supabase/migrations/008_multi_tenant_foundation.sql`:

```sql
-- 008_multi_tenant_foundation.sql — Phase 1: Multi-Tenant Foundation
-- Transforms single-tenant schema into multi-tenant with orgs, roles, and memberships.
-- See: docs/superpowers/specs/2026-03-24-phase1-multi-tenant-foundation-design.md
--
-- This migration is atomic (transactional). If any step fails, all changes roll back.

-- ======================
-- 1. Rename profiles → users
-- ======================

ALTER TABLE profiles RENAME TO users;

-- NOTE: FK references from invites.created_by, invites.claimed_by, and
-- location_history.created_by all pointed to profiles(id). PostgreSQL
-- automatically updates these FK constraints to reference users(id)
-- after the rename. No manual FK changes needed.

-- Rename the temp cleanup index for consistency
ALTER INDEX idx_profiles_temp_cleanup RENAME TO idx_users_temp_cleanup;

-- ======================
-- 2. Add new columns to users
-- ======================

ALTER TABLE users ADD COLUMN email text;
ALTER TABLE users ADD COLUMN email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN full_name text;
ALTER TABLE users ADD COLUMN avatar_url text;
ALTER TABLE users ADD COLUMN phone text;
ALTER TABLE users ADD COLUMN timezone text NOT NULL DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN locale text NOT NULL DEFAULT 'en';
ALTER TABLE users ADD COLUMN is_platform_admin boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN last_active_org_id uuid;  -- FK added after orgs table created
ALTER TABLE users ADD COLUMN last_seen_at timestamptz;
ALTER TABLE users ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
```

- [ ] **Step 2: Verify the SQL is syntactically valid**

Read the file back and confirm no typos. The FK for `last_active_org_id` is deferred — it references `orgs` which doesn't exist yet. We add the FK constraint after creating the `orgs` table.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/008_multi_tenant_foundation.sql
git commit -m "feat(migration): rename profiles to users and add new columns"
```

---

## Task 2: Create `orgs` table

**Files:**
- Modify: `supabase/migrations/008_multi_tenant_foundation.sql`

- [ ] **Step 1: Append `orgs` table creation and FK back-link**

Append to `008_multi_tenant_foundation.sql`:

```sql
-- ======================
-- 3. Create orgs table
-- ======================

CREATE TABLE orgs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  slug                     text UNIQUE NOT NULL,
  is_active                boolean NOT NULL DEFAULT true,
  subscription_tier        text NOT NULL DEFAULT 'free'
                           CHECK (subscription_tier IN ('free', 'community', 'pro', 'municipal')),
  subscription_status      text NOT NULL DEFAULT 'trialing'
                           CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'cancelled')),
  primary_custom_domain_id uuid,  -- FK to custom_domains added in Phase 4
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Now add the FK from users.last_active_org_id → orgs.id
ALTER TABLE users ADD CONSTRAINT users_last_active_org_fk
  FOREIGN KEY (last_active_org_id) REFERENCES orgs(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/008_multi_tenant_foundation.sql
git commit -m "feat(migration): add orgs table and users FK"
```

---

## Task 3: Create `roles` table

**Files:**
- Modify: `supabase/migrations/008_multi_tenant_foundation.sql`

- [ ] **Step 1: Append `roles` table creation**

Append to `008_multi_tenant_foundation.sql`:

```sql
-- ======================
-- 4. Create roles table
-- ======================

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
  is_default_new_member_role  boolean NOT NULL DEFAULT false,
  is_public_role              boolean NOT NULL DEFAULT false,
  is_system_role              boolean NOT NULL DEFAULT false,
  sort_order                  int NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/008_multi_tenant_foundation.sql
git commit -m "feat(migration): add roles table"
```

---

## Task 4: Create `org_memberships` table

**Files:**
- Modify: `supabase/migrations/008_multi_tenant_foundation.sql`

- [ ] **Step 1: Append `org_memberships` table creation**

Append to `008_multi_tenant_foundation.sql`:

```sql
-- ======================
-- 5. Create org_memberships table
-- ======================

CREATE TABLE org_memberships (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id               uuid REFERENCES users(id) ON DELETE SET NULL,
  role_id               uuid NOT NULL REFERENCES roles(id),
  status                text NOT NULL DEFAULT 'invited'
                        CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  invited_email         text,
  invited_by            uuid REFERENCES users(id),
  invitation_token      text UNIQUE,
  invitation_expires_at timestamptz,
  accepted_at           timestamptz,
  is_primary_org        boolean NOT NULL DEFAULT false,
  default_property_id   uuid,    -- FK to properties added in Phase 2
  notification_prefs    jsonb NOT NULL DEFAULT '{}',
  joined_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
-- No table-level UNIQUE (org_id, user_id) — partial unique index in the indexes section
-- handles this, allowing multiple (org_id, NULL) rows for pending invitations.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/008_multi_tenant_foundation.sql
git commit -m "feat(migration): add org_memberships table"
```

---

## Task 5: Data migration — Create default org, seed roles, migrate users

**Files:**
- Modify: `supabase/migrations/008_multi_tenant_foundation.sql`

- [ ] **Step 1: Append default org creation**

Append to `008_multi_tenant_foundation.sql`:

```sql
-- ======================
-- 6. Insert default org from site_config
-- ======================

INSERT INTO orgs (name, slug)
VALUES (
  COALESCE(
    (SELECT value#>>'{}' FROM site_config WHERE key = 'site_name'),
    'My Organization'
  ),
  'default'
);
```

- [ ] **Step 2: Append role seeding with full permissions JSONB**

Append to `008_multi_tenant_foundation.sql`:

```sql
-- ======================
-- 7. Seed 4 system roles for the default org
-- ======================

INSERT INTO roles (org_id, name, description, base_role, permissions, is_default_new_member_role, is_system_role, sort_order)
VALUES
  -- Admin
  (
    (SELECT id FROM orgs LIMIT 1),
    'Admin',
    'Full control within the org. Can manage members, config, and billing.',
    'org_admin',
    '{
      "org": { "manage_settings": true, "manage_members": true, "manage_billing": true, "manage_roles": true, "view_audit_log": true },
      "properties": { "create": true, "manage_all": true, "view_all": true },
      "items": { "view": true, "create": true, "edit_any": true, "edit_assigned": true, "delete": true },
      "updates": { "view": true, "create": true, "edit_own": true, "edit_any": true, "delete": true, "approve_public_submissions": true },
      "tasks": { "view_assigned": true, "view_all": true, "create": true, "assign": true, "complete": true },
      "attachments": { "upload": true, "delete_own": true, "delete_any": true },
      "reports": { "view": true, "export": true },
      "modules": { "tasks": true, "volunteers": true, "public_forms": true, "qr_codes": true, "reports": true }
    }'::jsonb,
    false,
    true,
    0
  ),
  -- Staff
  (
    (SELECT id FROM orgs LIMIT 1),
    'Staff',
    'Can create and edit all content. Cannot manage org settings.',
    'org_staff',
    '{
      "org": { "manage_settings": false, "manage_members": false, "manage_billing": false, "manage_roles": false, "view_audit_log": false },
      "properties": { "create": false, "manage_all": false, "view_all": true },
      "items": { "view": true, "create": true, "edit_any": true, "edit_assigned": true, "delete": false },
      "updates": { "view": true, "create": true, "edit_own": true, "edit_any": false, "delete": false, "approve_public_submissions": false },
      "tasks": { "view_assigned": true, "view_all": true, "create": true, "assign": true, "complete": true },
      "attachments": { "upload": true, "delete_own": true, "delete_any": false },
      "reports": { "view": true, "export": false },
      "modules": { "tasks": true, "volunteers": false, "public_forms": false, "qr_codes": false, "reports": false }
    }'::jsonb,
    false,
    true,
    1
  ),
  -- Contributor
  (
    (SELECT id FROM orgs LIMIT 1),
    'Contributor',
    'Can create and edit content they are assigned to. Limited visibility.',
    'contributor',
    '{
      "org": { "manage_settings": false, "manage_members": false, "manage_billing": false, "manage_roles": false, "view_audit_log": false },
      "properties": { "create": false, "manage_all": false, "view_all": true },
      "items": { "view": true, "create": false, "edit_any": false, "edit_assigned": true, "delete": false },
      "updates": { "view": true, "create": true, "edit_own": true, "edit_any": false, "delete": false, "approve_public_submissions": false },
      "tasks": { "view_assigned": true, "view_all": false, "create": false, "assign": false, "complete": true },
      "attachments": { "upload": true, "delete_own": true, "delete_any": false },
      "reports": { "view": false, "export": false },
      "modules": { "tasks": true, "volunteers": false, "public_forms": false, "qr_codes": false, "reports": false }
    }'::jsonb,
    true,
    true,
    2
  ),
  -- Viewer
  (
    (SELECT id FROM orgs LIMIT 1),
    'Viewer',
    'Read-only access across org or property.',
    'viewer',
    '{
      "org": { "manage_settings": false, "manage_members": false, "manage_billing": false, "manage_roles": false, "view_audit_log": false },
      "properties": { "create": false, "manage_all": false, "view_all": true },
      "items": { "view": true, "create": false, "edit_any": false, "edit_assigned": false, "delete": false },
      "updates": { "view": true, "create": false, "edit_own": false, "edit_any": false, "delete": false, "approve_public_submissions": false },
      "tasks": { "view_assigned": true, "view_all": false, "create": false, "assign": false, "complete": false },
      "attachments": { "upload": false, "delete_own": false, "delete_any": false },
      "reports": { "view": false, "export": false },
      "modules": { "tasks": false, "volunteers": false, "public_forms": false, "qr_codes": false, "reports": false }
    }'::jsonb,
    false,
    true,
    3
  );
```

- [ ] **Step 3: Append user data population and org_memberships creation**

Append to `008_multi_tenant_foundation.sql`:

```sql
-- ======================
-- 8. Populate users columns from auth.users
-- ======================

UPDATE users SET
  email = au.email,
  email_verified = (au.email_confirmed_at IS NOT NULL),
  full_name = COALESCE(users.display_name, au.raw_user_meta_data->>'display_name', 'Unknown'),
  updated_at = now()
FROM auth.users au
WHERE users.id = au.id;

-- ======================
-- 9. Create org_memberships from existing users
-- ======================

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

-- ======================
-- 10. Set last_active_org_id on all non-deleted users
-- ======================

UPDATE users SET last_active_org_id = (SELECT id FROM orgs LIMIT 1)
WHERE deleted_at IS NULL;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/008_multi_tenant_foundation.sql
git commit -m "feat(migration): data migration - default org, roles, user population"
```

---

## Task 6: Compatibility view

**Files:**
- Modify: `supabase/migrations/008_multi_tenant_foundation.sql`

- [ ] **Step 1: Append profiles compatibility view**

Append to `008_multi_tenant_foundation.sql`:

```sql
-- ======================
-- 11. Create profiles compatibility view
-- ======================
-- This is a simple single-table SELECT, making it auto-updatable in PostgreSQL.
-- INSERT, UPDATE, DELETE, and UPSERT operations through the view pass through
-- to the users table. All NOT NULL columns on users not exposed through the
-- view have defaults (email_verified, timezone, locale, is_platform_admin,
-- updated_at) or are nullable (email, full_name, etc.).
-- The view inherits RLS from the underlying users table.

CREATE VIEW profiles AS
SELECT id, display_name, role, created_at,
       is_temporary, session_expires_at, invite_id, deleted_at
FROM users;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/008_multi_tenant_foundation.sql
git commit -m "feat(migration): add profiles compatibility view"
```

---

## Task 7: Drop old RLS policies on users table

**Files:**
- Modify: `supabase/migrations/008_multi_tenant_foundation.sql`

After `ALTER TABLE profiles RENAME TO users`, all policies that were on `profiles` are now on `users` (Postgres auto-renames). We need to drop these old policies before creating new ones.

- [ ] **Step 1: Append old policy drops**

Append to `008_multi_tenant_foundation.sql`:

```sql
-- ======================
-- 12. Drop old RLS policies on users (formerly profiles)
-- ======================
-- After ALTER TABLE RENAME, these policies are now on the users table
-- with their original names.

DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all profiles" ON users;
DROP POLICY IF EXISTS "Admins can update profiles" ON users;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/008_multi_tenant_foundation.sql
git commit -m "feat(migration): drop old profiles RLS policies"
```

---

## Task 8: New RLS policies on `users`, `orgs`, `roles`, `org_memberships`

**Files:**
- Modify: `supabase/migrations/008_multi_tenant_foundation.sql`

- [ ] **Step 1: Append RLS enable and policies for new tables**

Append to `008_multi_tenant_foundation.sql`:

```sql
-- ======================
-- 13. Create new RLS policies on users, orgs, roles, org_memberships
-- ======================

-- ── users ──────────────────────────────────────────────────────────
-- RLS already enabled from 001_initial_schema.sql (survived the rename)

CREATE POLICY "users_read_own" ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_platform_admin" ON users FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_platform_admin
  ));

CREATE POLICY "users_org_admin_read" ON users FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM org_memberships om
    JOIN roles r ON r.id = om.role_id
    WHERE om.user_id = auth.uid()
      AND om.status = 'active'
      AND r.base_role = 'org_admin'
      AND om.org_id IN (
        SELECT om2.org_id FROM org_memberships om2
        WHERE om2.user_id = users.id AND om2.status = 'active'
      )
  ));

CREATE POLICY "users_update_own" ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── orgs ───────────────────────────────────────────────────────────

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs_member_read" ON orgs FOR SELECT
  TO authenticated
  USING (id IN (
    SELECT org_id FROM org_memberships
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "orgs_admin_update" ON orgs FOR UPDATE
  TO authenticated
  USING (id IN (
    SELECT om.org_id FROM org_memberships om
    JOIN roles r ON r.id = om.role_id
    WHERE om.user_id = auth.uid() AND om.status = 'active'
      AND r.base_role = 'org_admin'
  ));

CREATE POLICY "orgs_platform_admin" ON orgs FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND is_platform_admin
  ));

-- ── roles ──────────────────────────────────────────────────────────

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_org_member_read" ON roles FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM org_memberships
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "roles_org_admin_manage" ON roles FOR ALL
  TO authenticated
  USING (org_id IN (
    SELECT om.org_id FROM org_memberships om
    JOIN roles r ON r.id = om.role_id
    WHERE om.user_id = auth.uid() AND om.status = 'active'
      AND r.base_role = 'org_admin'
  ));

-- ── org_memberships ────────────────────────────────────────────────

ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_memberships_read_own" ON org_memberships FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "org_memberships_admin_read" ON org_memberships FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT om.org_id FROM org_memberships om
    JOIN roles r ON r.id = om.role_id
    WHERE om.user_id = auth.uid() AND om.status = 'active'
      AND r.base_role = 'org_admin'
  ));

CREATE POLICY "org_memberships_admin_manage" ON org_memberships FOR ALL
  TO authenticated
  USING (org_id IN (
    SELECT om.org_id FROM org_memberships om
    JOIN roles r ON r.id = om.role_id
    WHERE om.user_id = auth.uid() AND om.status = 'active'
      AND r.base_role = 'org_admin'
  ));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/008_multi_tenant_foundation.sql
git commit -m "feat(migration): add RLS policies for users, orgs, roles, org_memberships"
```

---

## Task 9: Update existing content and storage policies (`profiles` → `users` rename)

**Files:**
- Modify: `supabase/migrations/008_multi_tenant_foundation.sql`

Every existing RLS policy that contains `FROM profiles` needs to be dropped and recreated with `FROM users`. Policies that use `to authenticated using (true)` (species, item_species, update_species, location_history) are unchanged.

- [ ] **Step 1: Append policy drops and recreations for content tables**

Append to `008_multi_tenant_foundation.sql`:

```sql
-- ======================
-- 14. Update existing content and storage policies (profiles → users rename)
-- ======================
-- Only policies that reference `profiles` in their expressions need updating.
-- Public SELECT policies (using (true)) are unchanged.

-- ── items ──────────────────────────────────────────────────────────
-- (renamed from birdhouses in 002, policies renamed in 002)

DROP POLICY IF EXISTS "Authenticated users can insert items" ON items;
CREATE POLICY "Authenticated users can insert items"
  ON items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "Authenticated users can update items" ON items;
CREATE POLICY "Authenticated users can update items"
  ON items FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "Admins can delete items" ON items;
CREATE POLICY "Admins can delete items"
  ON items FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- ── item_updates ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert item updates" ON item_updates;
CREATE POLICY "Authenticated users can insert item updates"
  ON item_updates FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "Authenticated users can update item updates" ON item_updates;
CREATE POLICY "Authenticated users can update item updates"
  ON item_updates FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "Admins can delete item updates" ON item_updates;
CREATE POLICY "Admins can delete item updates"
  ON item_updates FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- ── photos ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert photos" ON photos;
CREATE POLICY "Authenticated users can insert photos"
  ON photos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "Authenticated users can update photos" ON photos;
CREATE POLICY "Authenticated users can update photos"
  ON photos FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "Admins can delete photos" ON photos;
CREATE POLICY "Admins can delete photos"
  ON photos FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- ── site_config ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can insert site config" ON site_config;
CREATE POLICY "Admins can insert site config"
  ON site_config FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update site config" ON site_config;
CREATE POLICY "Admins can update site config"
  ON site_config FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete site config" ON site_config;
CREATE POLICY "Admins can delete site config"
  ON site_config FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- ── item_types ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can insert item types" ON item_types;
CREATE POLICY "Admins can insert item types"
  ON item_types FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update item types" ON item_types;
CREATE POLICY "Admins can update item types"
  ON item_types FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete item types" ON item_types;
CREATE POLICY "Admins can delete item types"
  ON item_types FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- ── custom_fields ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can insert custom fields" ON custom_fields;
CREATE POLICY "Admins can insert custom fields"
  ON custom_fields FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update custom fields" ON custom_fields;
CREATE POLICY "Admins can update custom fields"
  ON custom_fields FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete custom fields" ON custom_fields;
CREATE POLICY "Admins can delete custom fields"
  ON custom_fields FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- ── update_types ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can insert update types" ON update_types;
CREATE POLICY "Admins can insert update types"
  ON update_types FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update update types" ON update_types;
CREATE POLICY "Admins can update update types"
  ON update_types FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete update types" ON update_types;
CREATE POLICY "Admins can delete update types"
  ON update_types FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- ── invites ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can view invites" ON invites;
CREATE POLICY "Admins can view invites"
  ON invites FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can create invites" ON invites;
CREATE POLICY "Admins can create invites"
  ON invites FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update invites" ON invites;
CREATE POLICY "Admins can update invites"
  ON invites FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete invites" ON invites;
CREATE POLICY "Admins can delete invites"
  ON invites FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Keep: "Users can view their own claimed invite" — does not reference profiles

-- ── redirects ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can insert redirects" ON redirects;
CREATE POLICY "Admins can insert redirects"
  ON redirects FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update redirects" ON redirects;
CREATE POLICY "Admins can update redirects"
  ON redirects FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete redirects" ON redirects;
CREATE POLICY "Admins can delete redirects"
  ON redirects FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- ── storage.objects ────────────────────────────────────────────────
-- Only admin-gated policies reference profiles. Public read and auth upload are unchanged.

DROP POLICY IF EXISTS "Admins can delete item photos from storage" ON storage.objects;
CREATE POLICY "Admins can delete item photos from storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'item-photos'
    AND EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "Admin users can upload landing assets" ON storage.objects;
CREATE POLICY "Admin users can upload landing assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'landing-assets'
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admin users can delete landing assets" ON storage.objects;
CREATE POLICY "Admin users can delete landing assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'landing-assets'
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/008_multi_tenant_foundation.sql
git commit -m "feat(migration): update all existing RLS policies from profiles to users"
```

---

## Task 10: Trigger updates, `updated_at` triggers, and indexes

**Files:**
- Modify: `supabase/migrations/008_multi_tenant_foundation.sql`

- [ ] **Step 1: Append trigger function replacement**

Append to `008_multi_tenant_foundation.sql`:

```sql
-- ======================
-- 15. Replace handle_new_user() trigger function
-- ======================

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
    'editor'  -- kept for compatibility; actual role comes from org_memberships
  );
  -- NOTE: No org_membership is created here. New users join orgs through
  -- the invite/join flow (Phase 2). Until then, new signups can access
  -- content tables via users.role but cannot query orgs/roles/org_memberships.
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Append updated_at triggers for new tables**

Append to `008_multi_tenant_foundation.sql`:

```sql
-- ======================
-- 16. Add updated_at triggers for new tables
-- ======================
-- Reuse the existing update_updated_at() function from 001_initial_schema.sql

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

- [ ] **Step 3: Append indexes**

Append to `008_multi_tenant_foundation.sql`:

```sql
-- ======================
-- 17. Add indexes
-- ======================

-- org_memberships
CREATE INDEX idx_org_memberships_user ON org_memberships (user_id);
CREATE INDEX idx_org_memberships_org_active ON org_memberships (org_id, status) WHERE status = 'active';
CREATE INDEX idx_org_memberships_token ON org_memberships (invitation_token) WHERE invitation_token IS NOT NULL;
CREATE UNIQUE INDEX idx_org_memberships_org_user ON org_memberships (org_id, user_id) WHERE user_id IS NOT NULL;

-- roles
CREATE INDEX idx_roles_org ON roles (org_id);

-- users (new indexes)
CREATE INDEX idx_users_last_active_org ON users (last_active_org_id);
CREATE INDEX idx_users_email ON users (email);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/008_multi_tenant_foundation.sql
git commit -m "feat(migration): add triggers and indexes"
```

---

## Task 11: Write failing TypeScript type tests

**Files:**
- Create: `src/lib/__tests__/multi-tenant-types.test.ts`

We test that the new types are correctly structured and the Database interface includes the new tables.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/multi-tenant-types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type {
  BaseRole,
  OrgMembershipStatus,
  Org,
  Role,
  RolePermissions,
  OrgMembership,
  Database,
} from '../types';

describe('Multi-tenant types', () => {
  describe('BaseRole', () => {
    it('accepts all valid base_role values', () => {
      const roles: BaseRole[] = [
        'platform_admin',
        'org_admin',
        'org_staff',
        'contributor',
        'viewer',
        'public',
      ];
      expect(roles).toHaveLength(6);
    });

    it('rejects invalid values at compile time', () => {
      // @ts-expect-error - 'superadmin' is not a valid BaseRole
      const _bad: BaseRole = 'superadmin';
    });
  });

  describe('OrgMembershipStatus', () => {
    it('accepts all valid status values', () => {
      const statuses: OrgMembershipStatus[] = [
        'invited',
        'active',
        'suspended',
        'revoked',
      ];
      expect(statuses).toHaveLength(4);
    });

    it('rejects invalid values at compile time', () => {
      // @ts-expect-error - 'banned' is not a valid OrgMembershipStatus
      const _bad: OrgMembershipStatus = 'banned';
    });
  });

  describe('Org', () => {
    it('has required fields', () => {
      const org: Org = {
        id: 'test-id',
        name: 'Test Org',
        slug: 'test-org',
        is_active: true,
        subscription_tier: 'free',
        subscription_status: 'trialing',
        primary_custom_domain_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      expect(org.slug).toBe('test-org');
      expect(org.primary_custom_domain_id).toBeNull();
    });
  });

  describe('RolePermissions', () => {
    it('has all permission categories', () => {
      const perms: RolePermissions = {
        org: {
          manage_settings: false,
          manage_members: false,
          manage_billing: false,
          manage_roles: false,
          view_audit_log: false,
        },
        properties: { create: false, manage_all: false, view_all: true },
        items: {
          view: true,
          create: false,
          edit_any: false,
          edit_assigned: false,
          delete: false,
        },
        updates: {
          view: true,
          create: false,
          edit_own: false,
          edit_any: false,
          delete: false,
          approve_public_submissions: false,
        },
        tasks: {
          view_assigned: false,
          view_all: false,
          create: false,
          assign: false,
          complete: false,
        },
        attachments: { upload: false, delete_own: false, delete_any: false },
        reports: { view: false, export: false },
        modules: {
          tasks: false,
          volunteers: false,
          public_forms: false,
          qr_codes: false,
          reports: false,
        },
      };
      expect(Object.keys(perms)).toEqual([
        'org',
        'properties',
        'items',
        'updates',
        'tasks',
        'attachments',
        'reports',
        'modules',
      ]);
    });
  });

  describe('Role', () => {
    it('has required fields including permissions', () => {
      const role: Role = {
        id: 'test-id',
        org_id: 'org-id',
        name: 'Admin',
        description: 'Full access',
        base_role: 'org_admin',
        color: '#ff0000',
        icon: 'shield',
        permissions: {
          org: {
            manage_settings: true,
            manage_members: true,
            manage_billing: true,
            manage_roles: true,
            view_audit_log: true,
          },
          properties: { create: true, manage_all: true, view_all: true },
          items: {
            view: true,
            create: true,
            edit_any: true,
            edit_assigned: true,
            delete: true,
          },
          updates: {
            view: true,
            create: true,
            edit_own: true,
            edit_any: true,
            delete: true,
            approve_public_submissions: true,
          },
          tasks: {
            view_assigned: true,
            view_all: true,
            create: true,
            assign: true,
            complete: true,
          },
          attachments: { upload: true, delete_own: true, delete_any: true },
          reports: { view: true, export: true },
          modules: {
            tasks: true,
            volunteers: true,
            public_forms: true,
            qr_codes: true,
            reports: true,
          },
        },
        is_default_new_member_role: false,
        is_public_role: false,
        is_system_role: true,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      expect(role.base_role).toBe('org_admin');
    });
  });

  describe('OrgMembership', () => {
    it('allows nullable user_id for pending invites', () => {
      const membership: OrgMembership = {
        id: 'test-id',
        org_id: 'org-id',
        user_id: null,
        role_id: 'role-id',
        status: 'invited',
        invited_email: 'new@example.com',
        invited_by: 'admin-id',
        invitation_token: 'abc123',
        invitation_expires_at: '2026-02-01T00:00:00Z',
        accepted_at: null,
        is_primary_org: false,
        default_property_id: null,
        notification_prefs: {},
        joined_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      expect(membership.user_id).toBeNull();
      expect(membership.status).toBe('invited');
    });
  });

  describe('Database interface', () => {
    it('includes orgs table', () => {
      // Type-level assertion: this compiles only if orgs exists on Database
      type OrgsRow = Database['public']['Tables']['orgs']['Row'];
      const _check: OrgsRow extends Org ? true : never = true;
      expect(_check).toBe(true);
    });

    it('includes roles table', () => {
      type RolesRow = Database['public']['Tables']['roles']['Row'];
      const _check: RolesRow extends Role ? true : never = true;
      expect(_check).toBe(true);
    });

    it('includes org_memberships table', () => {
      type OmRow = Database['public']['Tables']['org_memberships']['Row'];
      const _check: OmRow extends OrgMembership ? true : never = true;
      expect(_check).toBe(true);
    });

    it('still includes profiles in Tables for compatibility', () => {
      // profiles remains in Tables (view acts as table for Supabase client)
      type ProfilesRow = Database['public']['Tables']['profiles']['Row'];
      const _check: ProfilesRow extends { id: string; role: string } ? true : never = true;
      expect(_check).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/__tests__/multi-tenant-types.test.ts`

Expected: FAIL — the types `BaseRole`, `Org`, `Role`, etc. do not exist yet in `types.ts`.

- [ ] **Step 3: Commit the failing test**

```bash
git add src/lib/__tests__/multi-tenant-types.test.ts
git commit -m "test: add failing tests for multi-tenant types"
```

---

## Task 12: Add new TypeScript types to make tests pass

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add new type definitions**

Add the following after the existing `UserRole` type (around line 9) in `src/lib/types.ts`:

```typescript
export type BaseRole = 'platform_admin' | 'org_admin' | 'org_staff' | 'contributor' | 'viewer' | 'public';

export type OrgMembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked';
```

Add the following after the existing `Profile` interface (around line 86) in `src/lib/types.ts`:

```typescript
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

- [ ] **Step 2: Add new tables to the Database interface**

In the `Database` interface in `src/lib/types.ts`, add the following entries inside `Tables` (after the existing `profiles` entry, around line 201):

```typescript
      orgs: {
        Row: Org;
        Insert: Omit<Org, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Org, 'id' | 'created_at'>>;
        Relationships: [];
      };
      roles: {
        Row: Role;
        Insert: Omit<Role, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Role, 'id' | 'created_at'>>;
        Relationships: [];
      };
      org_memberships: {
        Row: OrgMembership;
        Insert: Omit<OrgMembership, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<OrgMembership, 'id' | 'created_at'>>;
        Relationships: [];
      };
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/__tests__/multi-tenant-types.test.ts`

Expected: PASS — all type tests should compile and pass.

- [ ] **Step 4: Run all existing tests to verify nothing broke**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run`

Expected: All existing tests PASS. The `Profile` type and `Database.public.Tables.profiles` entry are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add multi-tenant types (Org, Role, OrgMembership, RolePermissions)"
```

---

## Task 13: Final verification

- [ ] **Step 1: Review the complete migration file**

Read `supabase/migrations/008_multi_tenant_foundation.sql` end-to-end. Verify:
- All 17 sections are present in order
- No syntax errors (trailing commas, missing semicolons)
- Every `DROP POLICY` has a matching `CREATE POLICY`
- All JSONB permission blocks are valid JSON

- [ ] **Step 2: Run all tests one final time**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run`

Expected: All tests PASS.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd /Users/patrick/birdhousemapper && npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 4: Commit any remaining changes**

If any fixes were needed during review:

```bash
git add -A
git commit -m "fix: address issues found during final migration review"
```

---

## Post-Implementation Notes

### How to apply the migration

The migration runs against the Supabase project. It can be applied via:

1. **Supabase CLI:** `supabase db push` (if using local development)
2. **SQL Editor:** Copy-paste into the Supabase dashboard SQL editor
3. **Migration tool:** Supabase auto-applies files in `supabase/migrations/` on `supabase db reset`

### How to verify after applying

1. Check `users` table has new columns: `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position;`
2. Check org exists: `SELECT * FROM orgs;`
3. Check roles seeded: `SELECT name, base_role FROM roles;`
4. Check memberships created: `SELECT u.email, r.name FROM org_memberships om JOIN users u ON u.id = om.user_id JOIN roles r ON r.id = om.role_id;`
5. Test profiles view write-through: `INSERT INTO profiles (id, display_name, role) VALUES (gen_random_uuid(), 'Test', 'editor');` then `SELECT * FROM users WHERE display_name = 'Test';`
6. Clean up test row: `DELETE FROM users WHERE display_name = 'Test';`

### What comes next

Phase 2: Properties, property_memberships, property_access_config, permission resolution function. This will add `org_id` and `property_id` to content tables and begin the transition away from `users.role`-based RLS.
