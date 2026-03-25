# Phase 3: Access Grants & Anonymous Access — Design Spec

> **Date:** 2026-03-24
> **Phase:** 3 of 4 (IAM Northstar implementation)
> **Scope:** property_access_config, temporary_access_grants, anonymous_access_tokens, SELECT policy rewrite, legacy cleanup (drop users.role, profiles view)
> **Approach:** Big-bang migration + targeted code changes
> **Prerequisite:** Phase 2 (`feature/phase2-properties-permissions`)

---

## Context

Phase 1 delivered the core multi-tenant data model (users, orgs, roles, org_memberships).
Phase 2 delivered properties, property_memberships, permission resolution, content table
scoping, config split, and a full RLS write policy rewrite.

Phase 3 completes the access control system: configurable per-property anonymous access,
time-limited access grants, token-based public access for embeds, and removal of all
legacy `users.role` artifacts.

### Phase roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Users, orgs, org_memberships, roles | Complete (PR #23) |
| 2 | Properties, property_memberships, permission resolution, config split, RLS rewrite | Complete (PR #24) |
| **3** | **Access grants, anonymous access, property_access_config, legacy cleanup** | **This spec** |
| 4 | Custom domains, tenant resolution middleware, Caddy integration | Planned |

### Design decisions made

- **Default closed** — new properties have no anonymous access; migration explicitly enables existing property
- **Invite system unchanged** — `temporary_access_grants` runs alongside existing invites (deeper research needed for replacement)
- **Storage policies** use `is_platform_admin()` + `user_org_admin_org_ids()` (replaces `users.role`)
- **Cron** — Next.js API route `/api/cron/expire-access-grants` (same pattern as existing cleanup)
- **Anonymous tokens** — data model and RLS built now; middleware/endpoint deferred to Phase 4
- **`UserRole` type kept** — still used by invite system; cleaned up when invites are overhauled

---

## Migration: `010_access_grants_and_anon_access.sql`

### Execution order

```
 1. Create property_access_config table
 2. Create temporary_access_grants table
 3. Create anonymous_access_tokens table
 4. Create validate_anonymous_token() function
 5. Migrate: create property_access_config for existing property (anon enabled)
 6. Create check_anon_access() helper function
 7. Update check_permission() to include temp grants (Level 4)
 8. Update user_accessible_property_ids() to include temp grants
 9. Drop all public SELECT policies (USING (true))
10. Create new anon-aware SELECT policies
11. Drop users.role column and profiles view
12. Update storage.objects policies (org_admin check)
13. Update handle_new_user() trigger (remove role)
14. Add RLS for new tables
15. Add indexes
16. Add updated_at triggers
```

---

## Section 1: `property_access_config` Table

Controls what unauthenticated users can see and do on a per-property basis.
Anonymous access is **off by default** — must be explicitly enabled.

```sql
CREATE TABLE property_access_config (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  property_id                uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE UNIQUE,

  -- Anonymous/public access
  anon_access_enabled        boolean NOT NULL DEFAULT false,
  anon_can_view_map          boolean NOT NULL DEFAULT false,
  anon_can_view_items        boolean NOT NULL DEFAULT false,
  anon_can_view_item_details boolean NOT NULL DEFAULT false,
  anon_can_submit_forms      boolean NOT NULL DEFAULT false,

  -- What item fields are visible to anon users
  anon_visible_field_keys    jsonb,  -- array of field key strings, null = all public fields

  -- Password protection (optional layer on top of anon access)
  password_protected         boolean NOT NULL DEFAULT false,
  password_hash              text,   -- bcrypt hash of access password

  -- Embed / iframe allow
  allow_embed                boolean NOT NULL DEFAULT false,
  embed_allowed_origins      jsonb,  -- array of allowed origin URLs

  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
```

### Data migration

Create a config row for the existing property with full anonymous access enabled
(preserves current "everything is public" behavior):

```sql
INSERT INTO property_access_config (org_id, property_id,
  anon_access_enabled, anon_can_view_map, anon_can_view_items,
  anon_can_view_item_details)
SELECT org_id, id, true, true, true, true
FROM properties WHERE slug = 'default';
```

---

## Section 2: `temporary_access_grants` Table

Time-limited access scoped to org, property, or specific items. Runs alongside
the existing invite system (not replacing it).

```sql
CREATE TABLE temporary_access_grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

  -- Scope
  property_id     uuid REFERENCES properties(id) ON DELETE CASCADE,
  -- null property_id = org-wide temporary access (rare)

  -- Who gets access
  user_id         uuid REFERENCES users(id) ON DELETE CASCADE,
  granted_email   text,       -- if user doesn't have account yet
  invite_token    text UNIQUE,

  -- What access
  role_id         uuid NOT NULL REFERENCES roles(id),

  -- Temporal bounds
  valid_from      timestamptz NOT NULL DEFAULT now(),
  valid_until     timestamptz NOT NULL,  -- REQUIRED — no open-ended temp grants
  is_single_use   boolean NOT NULL DEFAULT false,

  -- Item-level scope (optional)
  item_ids        jsonb,   -- array of item UUIDs; null = all items in property

  -- Status
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'expired', 'revoked', 'used')),
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES users(id),
  revoke_reason   text,
  first_used_at   timestamptz,

  -- Audit
  granted_by      uuid REFERENCES users(id),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### Auto-expiration cron endpoint

`/api/cron/expire-access-grants/route.ts` — same pattern as existing
`/api/cron/cleanup-temp-accounts`:

```typescript
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('temporary_access_grants')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('status', 'active')
    .lt('valid_until', new Date().toISOString())
    .select('id');

  return Response.json({ expired: data?.length ?? 0, error: error?.message });
}
```

---

## Section 3: `anonymous_access_tokens` Table

Scoped session tokens for public embeds and kiosks. The data model and RLS are built
in Phase 3; middleware integration is deferred to Phase 4 / frontend work.

```sql
CREATE TABLE anonymous_access_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  token           text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- What this token allows (subset of property_access_config)
  can_view_map    boolean NOT NULL DEFAULT true,
  can_view_items  boolean NOT NULL DEFAULT true,
  can_submit_forms boolean NOT NULL DEFAULT false,

  -- Optional expiration
  expires_at      timestamptz,  -- null = permanent until revoked

  -- Usage tracking
  use_count       int NOT NULL DEFAULT 0,
  last_used_at    timestamptz,

  -- Status
  is_active       boolean NOT NULL DEFAULT true,
  label           text,   -- "Public trail map embed", "Conference kiosk"

  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

### Token validation function

```sql
CREATE OR REPLACE FUNCTION validate_anonymous_token(p_token text)
RETURNS TABLE(property_id uuid, can_view_map boolean, can_view_items boolean, can_submit_forms boolean) AS $$
  UPDATE anonymous_access_tokens
  SET use_count = use_count + 1, last_used_at = now()
  WHERE token = p_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING property_id, can_view_map, can_view_items, can_submit_forms;
$$ LANGUAGE sql SECURITY DEFINER;
```

### What Phase 3 does NOT build for tokens

- No middleware to set session variables (Phase 4 / frontend)
- No admin UI for managing tokens (future)
- No embed endpoint (Phase 4 custom domains)

---

## Section 4: Permission Resolution Updates

### `check_anon_access()` — NEW helper function

```sql
CREATE OR REPLACE FUNCTION check_anon_access(p_property_id uuid, p_access_type text)
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT CASE p_access_type
      WHEN 'map' THEN pac.anon_can_view_map
      WHEN 'items' THEN pac.anon_can_view_items
      WHEN 'item_details' THEN pac.anon_can_view_item_details
      WHEN 'forms' THEN pac.anon_can_submit_forms
      ELSE false
    END
    FROM public.property_access_config pac
    WHERE pac.property_id = p_property_id
      AND pac.anon_access_enabled = true),
    false  -- default closed: no config row = no access
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### Updated `check_permission()` — full replacement with Level 4

```sql
CREATE OR REPLACE FUNCTION check_permission(
  p_user_id uuid,
  p_property_id uuid,
  p_category text,
  p_action text
)
RETURNS boolean AS $$
DECLARE
  v_role_id uuid;
  v_permissions jsonb;
BEGIN
  -- Level 0: platform admin bypasses everything
  IF (SELECT is_platform_admin FROM public.users WHERE id = p_user_id) THEN
    RETURN true;
  END IF;

  -- Level 1: org_admin bypasses property-level checks
  IF EXISTS (
    SELECT 1 FROM public.org_memberships om
    JOIN public.roles r ON r.id = om.role_id
    JOIN public.properties p ON p.org_id = om.org_id
    WHERE om.user_id = p_user_id AND p.id = p_property_id
      AND om.status = 'active' AND r.base_role = 'org_admin'
  ) THEN
    RETURN true;
  END IF;

  -- Levels 2-3: resolve effective role (property override or org inherited)
  v_role_id := resolve_property_role_id(p_user_id, p_property_id);

  -- Level 4: active temporary grant (only if no permanent role found)
  IF v_role_id IS NULL THEN
    SELECT tag.role_id INTO v_role_id
    FROM public.temporary_access_grants tag
    WHERE tag.user_id = p_user_id
      AND (tag.property_id = p_property_id OR tag.property_id IS NULL)
      AND tag.status = 'active'
      AND tag.valid_from <= now()
      AND tag.valid_until > now();
  END IF;

  IF v_role_id IS NULL THEN
    RETURN false;
  END IF;

  -- Look up permission from role's JSONB
  SELECT permissions INTO v_permissions FROM public.roles WHERE id = v_role_id;

  RETURN COALESCE((v_permissions -> p_category ->> p_action)::boolean, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

### Updated `user_accessible_property_ids()` — full replacement with temp grants

```sql
CREATE OR REPLACE FUNCTION user_accessible_property_ids(p_user_id uuid)
RETURNS SETOF uuid AS $$
BEGIN
  -- Platform admins: all properties
  IF (SELECT is_platform_admin FROM public.users WHERE id = p_user_id) THEN
    RETURN QUERY SELECT id FROM public.properties WHERE deleted_at IS NULL;
    RETURN;
  END IF;

  -- Properties in orgs where user has active membership
  RETURN QUERY
  SELECT p.id FROM public.properties p
  JOIN public.org_memberships om ON om.org_id = p.org_id
  WHERE om.user_id = p_user_id AND om.status = 'active'
    AND p.deleted_at IS NULL

  UNION

  -- Properties with explicit property_membership
  SELECT pm.property_id FROM public.property_memberships pm
  JOIN public.properties p2 ON p2.id = pm.property_id
  WHERE pm.user_id = p_user_id AND p2.deleted_at IS NULL

  UNION

  -- Properties with active temporary grant
  SELECT tag.property_id FROM public.temporary_access_grants tag
  JOIN public.properties p3 ON p3.id = tag.property_id
  WHERE tag.user_id = p_user_id
    AND tag.status = 'active'
    AND tag.valid_from <= now()
    AND tag.valid_until > now()
    AND tag.property_id IS NOT NULL
    AND p3.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

---

## Section 5: SELECT Policy Rewrite

### Strategy

Replace all `USING (true)` public SELECT policies with anon-aware policies that check
three access paths:

1. **Authenticated user** — `property_id IN (SELECT user_accessible_property_ids(auth.uid()))`
2. **Anonymous via property_access_config** — `check_anon_access(property_id, 'items')`
3. **Anonymous via token** — session variable check against `anonymous_access_tokens`

### Property-scoped tables (`items`, `item_updates`, `photos`, `location_history`)

```sql
-- Drop old public SELECT
DROP POLICY IF EXISTS "items_public_read" ON items;

-- New anon-aware SELECT
CREATE POLICY "items_select" ON items FOR SELECT
  TO anon, authenticated
  USING (
    -- Authenticated: user has access to this property
    (auth.uid() IS NOT NULL AND property_id IN (
      SELECT user_accessible_property_ids(auth.uid())
    ))
    OR
    -- Anonymous via property_access_config
    (auth.uid() IS NULL AND check_anon_access(property_id, 'items'))
    OR
    -- Anonymous via token
    (auth.uid() IS NULL
      AND current_setting('app.access_mode', true) = 'anonymous_token'
      AND property_id::text = current_setting('app.current_property_id', true)
      AND EXISTS (
        SELECT 1 FROM anonymous_access_tokens aat
        WHERE aat.id::text = current_setting('app.anonymous_token_id', true)
          AND aat.is_active = true
          AND aat.can_view_items = true
          AND (aat.expires_at IS NULL OR aat.expires_at > now())
      ))
  );
```

Same pattern for `item_updates`, `photos`, `location_history` — all check `'items'` access type
since they're child data of items.

### Org-scoped tables (`item_types`, `custom_fields`, `update_types`, `species`, `item_species`, `update_species`)

These are metadata tables needed for rendering the map/list even for anonymous users.
Keep them publicly readable:

```sql
DROP POLICY IF EXISTS "<table>_public_read" ON <table>;
CREATE POLICY "<table>_public_read" ON <table> FOR SELECT
  TO anon, authenticated
  USING (true);
```

Org-scoped metadata stays public because:
- Item types, fields, and species are needed to render items correctly
- They contain no sensitive data
- Scoping them to anon access config would break map rendering for public properties

### `redirects`

Keep publicly readable (needed for QR code redirects):

```sql
DROP POLICY IF EXISTS "redirects_public_read" ON redirects;
CREATE POLICY "redirects_public_read" ON redirects FOR SELECT
  TO anon, authenticated
  USING (true);
```

### `invites`

No public SELECT policy. Keep the existing "Users can view their own claimed invite" policy
unchanged.

### `properties`

Add anonymous read for publicly listed properties:

```sql
-- Keep existing authenticated read policy
-- Add anonymous read for publicly listed properties
CREATE POLICY "properties_anon_read" ON properties FOR SELECT
  TO anon, authenticated
  USING (
    -- Allows both anonymous users and authenticated non-members to see
    -- publicly listed properties with anonymous access enabled
    is_publicly_listed = true
    AND is_active = true
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM property_access_config pac
      WHERE pac.property_id = properties.id
        AND pac.anon_access_enabled = true
    )
  );
```

---

## Section 6: Legacy Cleanup

### Drop `profiles` view FIRST (depends on `users.role`)

```sql
DROP VIEW profiles;
```

### Then drop `users.role` column

```sql
ALTER TABLE users DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE users DROP COLUMN role;
```

### Update `handle_new_user()` trigger

Remove `role` from the INSERT:

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  IF new.is_anonymous = true THEN
    RETURN new;
  END IF;

  INSERT INTO users (id, display_name, email, email_verified, full_name)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'display_name',
    new.email,
    (new.email_confirmed_at IS NOT NULL),
    COALESCE(new.raw_user_meta_data->>'display_name', 'Unknown')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Update `storage.objects` policies

Replace `users.role = 'admin'` with org_admin helper functions:

```sql
-- item-photos: admin delete
DROP POLICY IF EXISTS "Admins can delete item photos from storage" ON storage.objects;
CREATE POLICY "Admins can delete item photos from storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'item-photos'
    AND (is_platform_admin() OR EXISTS (SELECT 1 FROM user_org_admin_org_ids()))
  );

-- landing-assets: admin upload
DROP POLICY IF EXISTS "Admin users can upload landing assets" ON storage.objects;
CREATE POLICY "Admin users can upload landing assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'landing-assets'
    AND (is_platform_admin() OR EXISTS (SELECT 1 FROM user_org_admin_org_ids()))
  );

-- landing-assets: admin delete
DROP POLICY IF EXISTS "Admin users can delete landing assets" ON storage.objects;
CREATE POLICY "Admin users can delete landing assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'landing-assets'
    AND (is_platform_admin() OR EXISTS (SELECT 1 FROM user_org_admin_org_ids()))
  );
```

---

## Section 7: RLS for New Tables

### `property_access_config`

```sql
ALTER TABLE property_access_config ENABLE ROW LEVEL SECURITY;

-- Org members can read (needed for client-side config checks)
CREATE POLICY "property_access_config_org_read" ON property_access_config FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

-- Anonymous can read for their property (needed by check_anon_access via SECURITY DEFINER,
-- but also useful for the frontend to know what's enabled)
CREATE POLICY "property_access_config_anon_read" ON property_access_config FOR SELECT
  TO anon
  USING (anon_access_enabled = true);

-- Org admins can manage
CREATE POLICY "property_access_config_admin_manage" ON property_access_config FOR ALL
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

-- Platform admin full access
CREATE POLICY "property_access_config_platform_admin" ON property_access_config FOR ALL
  TO authenticated
  USING (is_platform_admin());
```

### `temporary_access_grants`

```sql
ALTER TABLE temporary_access_grants ENABLE ROW LEVEL SECURITY;

-- Users can read their own grants
CREATE POLICY "temp_grants_read_own" ON temporary_access_grants FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Org admins can manage grants in their org
CREATE POLICY "temp_grants_admin_manage" ON temporary_access_grants FOR ALL
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

-- Platform admin full access
CREATE POLICY "temp_grants_platform_admin" ON temporary_access_grants FOR ALL
  TO authenticated
  USING (is_platform_admin());
```

### `anonymous_access_tokens`

```sql
ALTER TABLE anonymous_access_tokens ENABLE ROW LEVEL SECURITY;

-- Org admins can manage tokens in their org
CREATE POLICY "anon_tokens_admin_manage" ON anonymous_access_tokens FOR ALL
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

-- Platform admin full access
CREATE POLICY "anon_tokens_platform_admin" ON anonymous_access_tokens FOR ALL
  TO authenticated
  USING (is_platform_admin());
```

Note: `validate_anonymous_token()` is SECURITY DEFINER so it bypasses RLS — anonymous
callers can validate tokens without needing a SELECT policy.

---

## Section 8: Indexes

```sql
-- property_access_config
-- property_id already has a unique index from UNIQUE constraint, no additional index needed
CREATE INDEX idx_property_access_config_org ON property_access_config (org_id);

-- temporary_access_grants
CREATE INDEX idx_temp_grants_user_active ON temporary_access_grants (user_id, status, valid_until)
  WHERE status = 'active';
CREATE INDEX idx_temp_grants_property_active ON temporary_access_grants (property_id, status)
  WHERE status = 'active';
CREATE INDEX idx_temp_grants_invite_token ON temporary_access_grants (invite_token)
  WHERE invite_token IS NOT NULL;
CREATE INDEX idx_temp_grants_status_expiry ON temporary_access_grants (status, valid_until)
  WHERE status = 'active';

-- anonymous_access_tokens
CREATE INDEX idx_anon_tokens_token ON anonymous_access_tokens (token)
  WHERE is_active = true;
CREATE INDEX idx_anon_tokens_property ON anonymous_access_tokens (property_id)
  WHERE is_active = true;
```

---

## Section 9: Triggers

```sql
CREATE TRIGGER property_access_config_updated_at
  BEFORE UPDATE ON property_access_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER temporary_access_grants_updated_at
  BEFORE UPDATE ON temporary_access_grants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

No trigger on `anonymous_access_tokens` — it has no `updated_at` column (usage tracking
updates `use_count` and `last_used_at` via the validation function).

---

## Section 10: TypeScript Changes

### New types in `src/lib/types.ts`

```typescript
export interface PropertyAccessConfig {
  id: string;
  org_id: string;
  property_id: string;
  anon_access_enabled: boolean;
  anon_can_view_map: boolean;
  anon_can_view_items: boolean;
  anon_can_view_item_details: boolean;
  anon_can_submit_forms: boolean;
  anon_visible_field_keys: string[] | null;
  password_protected: boolean;
  password_hash: string | null;
  allow_embed: boolean;
  embed_allowed_origins: string[] | null;
  created_at: string;
  updated_at: string;
}

export type TemporaryAccessGrantStatus = 'active' | 'expired' | 'revoked' | 'used';

export interface TemporaryAccessGrant {
  id: string;
  org_id: string;
  property_id: string | null;
  user_id: string | null;
  granted_email: string | null;
  invite_token: string | null;
  role_id: string;
  valid_from: string;
  valid_until: string;
  is_single_use: boolean;
  item_ids: string[] | null;
  status: TemporaryAccessGrantStatus;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  first_used_at: string | null;
  granted_by: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnonymousAccessToken {
  id: string;
  org_id: string;
  property_id: string;
  token: string;
  can_view_map: boolean;
  can_view_items: boolean;
  can_submit_forms: boolean;
  expires_at: string | null;
  use_count: number;
  last_used_at: string | null;
  is_active: boolean;
  label: string | null;
  created_by: string | null;
  created_at: string;
}
```

### Database interface

Add `property_access_config`, `temporary_access_grants`, `anonymous_access_tokens` to
`Database.public.Tables`. Remove `profiles` entry (view dropped).

### Permission resolution update

Update `src/lib/permissions/resolve.ts` — add Level 4 (temporary grants) to
`resolveUserAccess()`:

```typescript
  // After Level 3 (org_membership fallback), before returning null:
  // Level 4: Check temporary access grants
  const { data: tempGrant } = await supabase
    .from('temporary_access_grants')
    .select('role_id, roles(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lte('valid_from', new Date().toISOString())
    .gt('valid_until', new Date().toISOString())
    .or(`property_id.eq.${propertyId},property_id.is.null`)
    .maybeSingle();

  if (tempGrant) {
    const tempRole = (tempGrant as any).roles as Role;
    return { role: tempRole, permissions: tempRole.permissions, source: 'temporary_grant' };
  }
```

Add `'temporary_grant'` to the `ResolvedAccess.source` union type.

---

## Section 11: Frontend Changes

### Complete file inventory for `profiles` → `users` migration

Every file that references `.from('profiles')` or reads the `role` column must be updated.
Files that check `role` for authorization must switch to the permission resolution system.

| File | Current Usage | Required Change |
|------|--------------|-----------------|
| `src/lib/supabase/middleware.ts` | Reads `role`, `is_temporary`, `session_expires_at` from profiles | Change to `.from('users')`. Replace `role !== 'admin'` guard with `is_platform_admin` check or `resolveUserAccess()` |
| `src/app/setup/actions.ts` | Upserts profile | Change to `.from('users')` |
| `src/app/invite/[token]/actions.ts` | INSERT and DELETE on profiles | Change to `.from('users')` |
| `src/app/invite/[token]/page.tsx` | Reads `display_name` from profiles | Change to `.from('users')` |
| `src/app/manage/edit/[id]/page.tsx` | Reads `role` for permission check | Replace `role` check with `resolveUserAccess()` or `check_permission()` |
| `src/app/manage/layout.tsx` | Reads `is_temporary`, `session_expires_at` | Change to `.from('users')` |
| `src/app/admin/page.tsx` | Reads all profiles, updates `role` | Change to `.from('users')`. Replace role management with org_memberships + roles system. |
| `src/app/admin/invites/actions.ts` | Reads `role` in 4 places, reads `is_temporary`/`invite_id`, updates `is_temporary`/`session_expires_at` | Change to `.from('users')`. Replace `role` checks with membership/permission checks. |
| `src/app/api/cron/cleanup-temp-accounts/route.ts` | Reads expired temps, soft-deletes | Change to `.from('users')` |
| `src/components/manage/LocationHistory.tsx` | Reads profiles for creator display names | Change to `.from('users')` |

**Authorization migration pattern:**

Files that use `profile.role === 'admin'` for authorization should switch to one of:
- **Middleware/server:** `is_platform_admin()` DB function or check `org_memberships` for `org_admin` base_role
- **Server actions:** Use `resolveUserAccess()` from `src/lib/permissions/resolve.ts`
- **Components:** Use `hasPermission()` from the resolved access context

The admin page (`src/app/admin/page.tsx`) that manages user roles is the most complex change —
it currently updates `profiles.role` directly. After Phase 3, it should manage `org_memberships`
(change a user's role by updating `org_memberships.role_id`).

### New files

| File | Purpose |
|------|---------|
| `src/app/api/cron/expire-access-grants/route.ts` | Cron endpoint to expire temp grants |

### Types file cleanup

- Remove `profiles` from `Database.public.Tables`
- Keep `UserRole` type and `Profile` interface (still referenced by invite system code)

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Anon SELECT policies are complex (3 OR paths) | Each path independent; SECURITY DEFINER avoids recursion. Tested per-path. |
| Dropping `users.role` breaks profiles view consumers | 10 files reference `profiles` — all inventoried in Section 11 — updated in this phase. |
| Storage policy loosens to "org_admin of any org" | Acceptable for single-org. Tighten with metadata later. |
| `item_ids` JSONB scope on temp grants is expensive | Item-level check in app layer only, not RLS. RLS checks property-level. |
| `check_anon_access()` on every anon SELECT | STABLE + simple index on `property_access_config.property_id`. Fast. |
| Token session variables not set (middleware not built) | Token-based access is data-model-ready; middleware in Phase 4. Config-based anon access works immediately. |

---

## What This Phase Does NOT Touch

| Concern | Deferred to |
|---------|-------------|
| Token validation middleware (session variables) | Phase 4 / frontend |
| Admin UI for property_access_config | Future |
| Admin UI for managing access tokens | Future |
| Admin UI for temporary access grants | Future |
| Invite system replacement | Future (needs research) |
| `custom_domains`, tenant resolution | Phase 4 |
| Org switcher / property selector UI | Future |

---

## Northstar Test Scenario Coverage (Phase 3)

| Scenario | Coverage |
|----------|---------|
| A. Multi-org consultant | Fully supported (Phase 2) |
| B. Property-scoped volunteer | Fully supported (Phase 2) |
| C. Day-of volunteer event | **Fully supported.** `temporary_access_grants` with `valid_until`, auto-expiration cron. |
| D. Public trail map | **Fully supported.** `property_access_config` with `anon_can_view_map/items`, `anon_visible_field_keys`. |
| E. Password-protected property | **Fully supported.** `property_access_config.password_protected` + `password_hash`. |
| F. Embedded public map | **Data model ready.** `anonymous_access_tokens` + `property_access_config.allow_embed`. Middleware deferred to Phase 4. |
