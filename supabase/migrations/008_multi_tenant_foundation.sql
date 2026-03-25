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
