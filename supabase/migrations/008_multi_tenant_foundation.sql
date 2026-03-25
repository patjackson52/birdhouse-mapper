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

-- ======================
-- 5. Create org_memberships table
-- ======================

CREATE TABLE org_memberships (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id               uuid REFERENCES users(id) ON DELETE SET NULL,
  role_id               uuid NOT NULL REFERENCES roles(id),  -- ON DELETE defaults to RESTRICT: roles cannot be deleted while memberships reference them
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

-- ======================
-- RLS helper functions (SECURITY DEFINER to avoid recursion)
-- ======================
-- These functions bypass RLS when querying users/roles/org_memberships,
-- preventing infinite recursion in self-referencing and cross-table policies.

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.users WHERE id = auth.uid()),
    false
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION user_org_admin_org_ids()
RETURNS SETOF uuid AS $$
  SELECT om.org_id FROM public.org_memberships om
  JOIN public.roles r ON r.id = om.role_id
  WHERE om.user_id = auth.uid() AND om.status = 'active'
    AND r.base_role = 'org_admin'
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION user_active_org_ids()
RETURNS SETOF uuid AS $$
  SELECT org_id FROM public.org_memberships
  WHERE user_id = auth.uid() AND status = 'active'
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION user_visible_to_org_admin(target_user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships om1
    JOIN public.roles r ON r.id = om1.role_id
    JOIN public.org_memberships om2 ON om2.org_id = om1.org_id
    WHERE om1.user_id = auth.uid()
      AND om1.status = 'active'
      AND r.base_role = 'org_admin'
      AND om2.user_id = target_user_id
      AND om2.status = 'active'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ======================
-- 12. Drop old RLS policies on users (formerly profiles)
-- ======================
-- After ALTER TABLE RENAME, these policies are now on the users table
-- with their original names.

DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all profiles" ON users;
DROP POLICY IF EXISTS "Admins can update profiles" ON users;

-- ======================
-- 13. Create new RLS policies on users, orgs, roles, org_memberships
-- ======================
-- All policies use SECURITY DEFINER helper functions to avoid
-- self-referencing and cross-table RLS recursion.

-- ── users ──────────────────────────────────────────────────────────
-- RLS already enabled from 001_initial_schema.sql (survived the rename)

CREATE POLICY "users_read_own" ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_platform_admin" ON users FOR ALL
  TO authenticated
  USING (is_platform_admin());

CREATE POLICY "users_org_admin_read" ON users FOR SELECT
  TO authenticated
  USING (user_visible_to_org_admin(id));

CREATE POLICY "users_update_own" ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── orgs ───────────────────────────────────────────────────────────

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs_member_read" ON orgs FOR SELECT
  TO authenticated
  USING (id IN (SELECT * FROM user_active_org_ids()));

CREATE POLICY "orgs_admin_update" ON orgs FOR UPDATE
  TO authenticated
  USING (id IN (SELECT * FROM user_org_admin_org_ids()));

CREATE POLICY "orgs_platform_admin" ON orgs FOR ALL
  TO authenticated
  USING (is_platform_admin());

-- ── roles ──────────────────────────────────────────────────────────

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_org_member_read" ON roles FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT * FROM user_active_org_ids()));

CREATE POLICY "roles_org_admin_manage" ON roles FOR ALL
  TO authenticated
  USING (org_id IN (SELECT * FROM user_org_admin_org_ids()));

-- ── org_memberships ────────────────────────────────────────────────

ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_memberships_read_own" ON org_memberships FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "org_memberships_admin_read" ON org_memberships FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT * FROM user_org_admin_org_ids()));

CREATE POLICY "org_memberships_admin_manage" ON org_memberships FOR ALL
  TO authenticated
  USING (org_id IN (SELECT * FROM user_org_admin_org_ids()));

-- ======================
-- 14. Update existing content and storage policies (profiles → users rename)
-- ======================
-- Only policies that reference `profiles` in their expressions need updating.
-- Public SELECT policies (using (true)) are unchanged.

-- ── items ──────────────────────────────────────────────────────────

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
