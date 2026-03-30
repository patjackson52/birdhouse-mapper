-- seed.sql — Seed data for local development and testing
-- Auto-runs on `supabase db reset` (configured in config.toml)
--
-- Creates 4 test users (one per role) with deterministic UUIDs,
-- a test org, property, item types, sample items, and all associations.
--
-- Test accounts (all passwords: "test-admin-password-123" etc.):
--   admin@test.fieldmapper.org       → org_admin   (pw: test-admin-password-123)
--   staff@test.fieldmapper.org       → org_staff   (pw: test-staff-password-123)
--   contributor@test.fieldmapper.org → contributor  (pw: test-contributor-password-123)
--   viewer@test.fieldmapper.org      → viewer       (pw: test-viewer-password-123)
--
-- In CI, users are created via the Auth Admin API before seed runs.
-- ON CONFLICT DO NOTHING ensures seed is idempotent either way.

-- ============================================================================
-- Auth Users (Supabase local dev allows direct auth.users inserts)
-- ============================================================================

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
) VALUES
(
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'admin@test.fieldmapper.org',
  crypt('test-admin-password-123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Test Admin"}'::jsonb,
  'authenticated', 'authenticated', now(), now()
),
(
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'staff@test.fieldmapper.org',
  crypt('test-staff-password-123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Test Staff"}'::jsonb,
  'authenticated', 'authenticated', now(), now()
),
(
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'contributor@test.fieldmapper.org',
  crypt('test-contributor-password-123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Test Contributor"}'::jsonb,
  'authenticated', 'authenticated', now(), now()
),
(
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000000',
  'viewer@test.fieldmapper.org',
  crypt('test-viewer-password-123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Test Viewer"}'::jsonb,
  'authenticated', 'authenticated', now(), now()
)
ON CONFLICT (id) DO NOTHING;

-- Auth identities (required for email login to work)
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) VALUES
(
  '00000000-0000-0000-0000-100000000001',
  '00000000-0000-0000-0000-000000000001',
  'admin@test.fieldmapper.org',
  'email',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@test.fieldmapper.org"}'::jsonb,
  now(), now(), now()
),
(
  '00000000-0000-0000-0000-100000000002',
  '00000000-0000-0000-0000-000000000002',
  'staff@test.fieldmapper.org',
  'email',
  '{"sub":"00000000-0000-0000-0000-000000000002","email":"staff@test.fieldmapper.org"}'::jsonb,
  now(), now(), now()
),
(
  '00000000-0000-0000-0000-100000000003',
  '00000000-0000-0000-0000-000000000003',
  'contributor@test.fieldmapper.org',
  'email',
  '{"sub":"00000000-0000-0000-0000-000000000003","email":"contributor@test.fieldmapper.org"}'::jsonb,
  now(), now(), now()
),
(
  '00000000-0000-0000-0000-100000000004',
  '00000000-0000-0000-0000-000000000004',
  'viewer@test.fieldmapper.org',
  'email',
  '{"sub":"00000000-0000-0000-0000-000000000004","email":"viewer@test.fieldmapper.org"}'::jsonb,
  now(), now(), now()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Disable auto-populate triggers during seeding
-- ============================================================================

ALTER TABLE item_types DISABLE TRIGGER item_types_auto_org;
ALTER TABLE custom_fields DISABLE TRIGGER custom_fields_auto_org;
ALTER TABLE update_types DISABLE TRIGGER update_types_auto_org;
ALTER TABLE items DISABLE TRIGGER items_auto_org_property;
ALTER TABLE item_updates DISABLE TRIGGER item_updates_auto_org_property;
ALTER TABLE photos DISABLE TRIGGER photos_auto_org_property;
ALTER TABLE location_history DISABLE TRIGGER location_history_auto_org_property;
ALTER TABLE entity_types DISABLE TRIGGER entity_types_auto_org;
ALTER TABLE entity_type_fields DISABLE TRIGGER entity_type_fields_auto_org;
ALTER TABLE entities DISABLE TRIGGER entities_auto_org;
ALTER TABLE item_entities DISABLE TRIGGER item_entities_auto_org;
ALTER TABLE update_entities DISABLE TRIGGER update_entities_auto_org;

-- ============================================================================
-- Org
-- ============================================================================

INSERT INTO orgs (id, name, slug, setup_complete, theme, tagline)
VALUES (
  '00000000-0000-0000-0000-000000000100',
  'Test Org',
  'test-org',
  true,
  '{"preset": "forest"}'::jsonb,
  'E2E test organization'
);

-- ============================================================================
-- Property
-- ============================================================================

INSERT INTO properties (id, org_id, name, slug, description, is_active, map_default_lat, map_default_lng, map_default_zoom, about_content)
VALUES (
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000100',
  'Test Property',
  'default',
  'Test property for E2E tests',
  true,
  64.8378,
  -147.7164,
  13,
  '# About\n\nThis is the test property for automated testing.'
);

-- Set default property on org
UPDATE orgs SET default_property_id = '00000000-0000-0000-0000-000000000200'
WHERE id = '00000000-0000-0000-0000-000000000100';

-- ============================================================================
-- Roles (4 system roles matching onboardCreateOrg permissions)
-- ============================================================================

INSERT INTO roles (id, org_id, name, description, base_role, permissions, is_system_role, is_default_new_member_role, sort_order) VALUES
(
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000100',
  'Admin',
  'Full control within the org.',
  'org_admin',
  '{
    "org": {"manage_settings": true, "manage_members": true, "manage_billing": true, "manage_roles": true, "view_audit_log": true},
    "properties": {"create": true, "manage_all": true, "view_all": true},
    "items": {"view": true, "create": true, "edit_any": true, "edit_assigned": true, "delete": true},
    "updates": {"view": true, "create": true, "edit_own": true, "edit_any": true, "delete": true, "approve_public_submissions": true},
    "tasks": {"view_assigned": true, "view_all": true, "create": true, "assign": true, "complete": true},
    "attachments": {"upload": true, "delete_own": true, "delete_any": true},
    "reports": {"view": true, "export": true},
    "modules": {"tasks": true, "volunteers": true, "public_forms": true, "qr_codes": true, "reports": true},
    "ai_context": {"view": true, "download": true, "upload": true, "manage": true}
  }'::jsonb,
  true, false, 0
),
(
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000100',
  'Staff',
  'Can create and edit all content.',
  'org_staff',
  '{
    "org": {"manage_settings": false, "manage_members": false, "manage_billing": false, "manage_roles": false, "view_audit_log": false},
    "properties": {"create": false, "manage_all": false, "view_all": true},
    "items": {"view": true, "create": true, "edit_any": true, "edit_assigned": true, "delete": false},
    "updates": {"view": true, "create": true, "edit_own": true, "edit_any": false, "delete": false, "approve_public_submissions": false},
    "tasks": {"view_assigned": true, "view_all": true, "create": true, "assign": true, "complete": true},
    "attachments": {"upload": true, "delete_own": true, "delete_any": false},
    "reports": {"view": true, "export": false},
    "modules": {"tasks": true, "volunteers": false, "public_forms": false, "qr_codes": false, "reports": false},
    "ai_context": {"view": true, "download": true, "upload": true, "manage": false}
  }'::jsonb,
  true, false, 1
),
(
  '00000000-0000-0000-0000-000000000303',
  '00000000-0000-0000-0000-000000000100',
  'Contributor',
  'Can create and edit assigned content.',
  'contributor',
  '{
    "org": {"manage_settings": false, "manage_members": false, "manage_billing": false, "manage_roles": false, "view_audit_log": false},
    "properties": {"create": false, "manage_all": false, "view_all": true},
    "items": {"view": true, "create": false, "edit_any": false, "edit_assigned": true, "delete": false},
    "updates": {"view": true, "create": true, "edit_own": true, "edit_any": false, "delete": false, "approve_public_submissions": false},
    "tasks": {"view_assigned": true, "view_all": false, "create": false, "assign": false, "complete": true},
    "attachments": {"upload": true, "delete_own": true, "delete_any": false},
    "reports": {"view": false, "export": false},
    "modules": {"tasks": true, "volunteers": false, "public_forms": false, "qr_codes": false, "reports": false},
    "ai_context": {"view": true, "download": true, "upload": false, "manage": false}
  }'::jsonb,
  true, true, 2
),
(
  '00000000-0000-0000-0000-000000000304',
  '00000000-0000-0000-0000-000000000100',
  'Viewer',
  'Read-only access.',
  'viewer',
  '{
    "org": {"manage_settings": false, "manage_members": false, "manage_billing": false, "manage_roles": false, "view_audit_log": false},
    "properties": {"create": false, "manage_all": false, "view_all": true},
    "items": {"view": true, "create": false, "edit_any": false, "edit_assigned": false, "delete": false},
    "updates": {"view": true, "create": false, "edit_own": false, "edit_any": false, "delete": false, "approve_public_submissions": false},
    "tasks": {"view_assigned": true, "view_all": false, "create": false, "assign": false, "complete": false},
    "attachments": {"upload": false, "delete_own": false, "delete_any": false},
    "reports": {"view": false, "export": false},
    "modules": {"tasks": false, "volunteers": false, "public_forms": false, "qr_codes": false, "reports": false},
    "ai_context": {"view": false, "download": false, "upload": false, "manage": false}
  }'::jsonb,
  true, false, 3
);

-- ============================================================================
-- Org Memberships (one user per role)
-- ============================================================================

INSERT INTO org_memberships (org_id, user_id, role_id, status, is_primary_org, joined_at) VALUES
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', 'active', true, now()),  -- admin → Admin
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000302', 'active', true, now()),  -- staff → Staff
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000303', 'active', true, now()),  -- contributor → Contributor
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000304', 'active', true, now());  -- viewer → Viewer

-- Set last_active_org_id for all users
UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data || '{"last_active_org_id":"00000000-0000-0000-0000-000000000100"}'::jsonb
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004'
);

-- ============================================================================
-- Item Types
-- ============================================================================

INSERT INTO item_types (id, org_id, name, icon, color, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000100', 'Bird Box', '🏠', '#5D7F3A', 0),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000100', 'Trail Marker', '📍', '#8B6914', 1);

-- ============================================================================
-- Update Types
-- ============================================================================

INSERT INTO update_types (id, org_id, name, icon, is_global, item_type_id, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000100', 'Maintenance', '🔧', true, NULL, 0),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000100', 'Observation', '👀', true, NULL, 1),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000100', 'Note', '📝', true, NULL, 2),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000100', 'Installation', '🏗️', false, '00000000-0000-0000-0000-000000000401', 3),
  ('00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000100', 'Bird Sighting', '🐦', false, '00000000-0000-0000-0000-000000000401', 4),
  ('00000000-0000-0000-0000-000000000506', '00000000-0000-0000-0000-000000000100', 'Damage Report', '⚠️', false, '00000000-0000-0000-0000-000000000401', 5);

-- ============================================================================
-- Entity Type: Species
-- ============================================================================

INSERT INTO entity_types (id, org_id, name, icon, color, link_to, sort_order)
VALUES (
  '00000000-0000-0000-0000-000000000600',
  '00000000-0000-0000-0000-000000000100',
  'Species',
  '🐦',
  '#5D7F3A',
  '{items,updates}',
  0
);

INSERT INTO entity_type_fields (id, entity_type_id, org_id, name, field_type, options, required, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000600', '00000000-0000-0000-0000-000000000100', 'Scientific Name', 'text', NULL, false, 0),
  ('00000000-0000-0000-0000-000000000612', '00000000-0000-0000-0000-000000000600', '00000000-0000-0000-0000-000000000100', 'Conservation Status', 'dropdown', '["LC","NT","VU","EN","CR"]'::jsonb, false, 1);

-- ============================================================================
-- Entities (3 species)
-- ============================================================================

INSERT INTO entities (id, entity_type_id, org_id, name, description, custom_field_values, sort_order) VALUES
(
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000600',
  '00000000-0000-0000-0000-000000000100',
  'Black-capped Chickadee',
  'Small, curious songbird common in forests and backyards.',
  '{"00000000-0000-0000-0000-000000000611": "Poecile atricapillus", "00000000-0000-0000-0000-000000000612": "LC"}'::jsonb,
  0
),
(
  '00000000-0000-0000-0000-000000000702',
  '00000000-0000-0000-0000-000000000600',
  '00000000-0000-0000-0000-000000000100',
  'Violet-green Swallow',
  'Fast-flying insectivore that nests in cavities.',
  '{"00000000-0000-0000-0000-000000000611": "Tachycineta thalassina", "00000000-0000-0000-0000-000000000612": "LC"}'::jsonb,
  1
),
(
  '00000000-0000-0000-0000-000000000703',
  '00000000-0000-0000-0000-000000000600',
  '00000000-0000-0000-0000-000000000100',
  'Tree Swallow',
  'Iridescent blue-green swallow, common near water.',
  '{"00000000-0000-0000-0000-000000000611": "Tachycineta bicolor", "00000000-0000-0000-0000-000000000612": "LC"}'::jsonb,
  2
);

-- ============================================================================
-- Items (5 items with varying statuses)
-- ============================================================================

INSERT INTO items (id, org_id, property_id, name, description, latitude, longitude, status, item_type_id, custom_field_values) VALUES
(
  '00000000-0000-0000-0000-000000000801',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200',
  'Meadow View Box #1',
  'Near the south meadow trail junction',
  64.8390, -147.7180,
  'active',
  '00000000-0000-0000-0000-000000000401',
  '{}'::jsonb
),
(
  '00000000-0000-0000-0000-000000000802',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200',
  'Riverside Box #2',
  'Mounted on birch tree near the river bend',
  64.8375, -147.7150,
  'active',
  '00000000-0000-0000-0000-000000000401',
  '{}'::jsonb
),
(
  '00000000-0000-0000-0000-000000000803',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200',
  'Hilltop Box #3',
  'Exposed location, needs wind guard',
  64.8400, -147.7200,
  'damaged',
  '00000000-0000-0000-0000-000000000401',
  '{}'::jsonb
),
(
  '00000000-0000-0000-0000-000000000804',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200',
  'Planned Box #4',
  'Scheduled for installation next season',
  64.8365, -147.7140,
  'planned',
  '00000000-0000-0000-0000-000000000401',
  '{}'::jsonb
),
(
  '00000000-0000-0000-0000-000000000805',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200',
  'Loop Trail Marker A',
  'Start of the interpretive loop trail',
  64.8385, -147.7170,
  'active',
  '00000000-0000-0000-0000-000000000402',
  '{}'::jsonb
);

-- ============================================================================
-- Item-Entity associations
-- ============================================================================

INSERT INTO item_entities (item_id, entity_id, org_id) VALUES
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000100'),
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000100'),
  ('00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000100');

-- ============================================================================
-- Item Updates
-- ============================================================================

INSERT INTO item_updates (id, org_id, property_id, item_id, update_type_id, content, update_date) VALUES
(
  '00000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000801',
  '00000000-0000-0000-0000-000000000505',
  'Pair of chickadees observed entering box. Nest material visible.',
  '2026-03-15'
),
(
  '00000000-0000-0000-0000-000000000902',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000802',
  '00000000-0000-0000-0000-000000000501',
  'Cleaned out old nest. Box in good condition.',
  '2026-03-10'
),
(
  '00000000-0000-0000-0000-000000000903',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000803',
  '00000000-0000-0000-0000-000000000506',
  'Wind damage to mounting bracket. Needs repair before nesting season.',
  '2026-03-20'
);

-- ============================================================================
-- Update-Entity associations
-- ============================================================================

INSERT INTO update_entities (update_id, entity_id, org_id) VALUES
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000100');

-- ============================================================================
-- Property Access Config (enable public access for testing)
-- ============================================================================

INSERT INTO property_access_config (org_id, property_id, anon_access_enabled, anon_can_view_map, anon_can_view_items, anon_can_view_item_details)
VALUES (
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200',
  true, true, true, true
);

-- ============================================================================
-- Re-enable all triggers
-- ============================================================================

ALTER TABLE item_types ENABLE TRIGGER item_types_auto_org;
ALTER TABLE custom_fields ENABLE TRIGGER custom_fields_auto_org;
ALTER TABLE update_types ENABLE TRIGGER update_types_auto_org;
ALTER TABLE items ENABLE TRIGGER items_auto_org_property;
ALTER TABLE item_updates ENABLE TRIGGER item_updates_auto_org_property;
ALTER TABLE photos ENABLE TRIGGER photos_auto_org_property;
ALTER TABLE location_history ENABLE TRIGGER location_history_auto_org_property;
ALTER TABLE entity_types ENABLE TRIGGER entity_types_auto_org;
ALTER TABLE entity_type_fields ENABLE TRIGGER entity_type_fields_auto_org;
ALTER TABLE entities ENABLE TRIGGER entities_auto_org;
ALTER TABLE item_entities ENABLE TRIGGER item_entities_auto_org;
ALTER TABLE update_entities ENABLE TRIGGER update_entities_auto_org;
