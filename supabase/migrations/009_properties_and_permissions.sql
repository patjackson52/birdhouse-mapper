-- Migration: 009_properties_and_permissions.sql
-- Phase 2: Properties & Permission Resolution (steps 1-18)
-- Spec: docs/superpowers/specs/2026-03-24-phase2-properties-permissions-design.md
--
-- Execution steps in this file:
--   1. Add config columns to orgs
--   2. Create properties table
--   3. Create property_memberships table
--   4. Wire FKs (orgs.default_property_id, org_memberships.default_property_id)
--   5. Add org_id to org-scoped tables
--   6. Add org_id + property_id to property-scoped tables
--   7. Add org_id to invites, redirects
--   8. Create default property from site_config values
--   9. Populate org config columns from site_config
--  10. Populate org_id/property_id on all content rows
--  11. Make org_id/property_id NOT NULL, add FKs
--  12. Create auto_populate_org_property trigger for content tables
--  13. Create permission resolution functions
--  14. Drop all legacy write policies on content tables
--  15. Create new permission-based RLS policies
--  16. Drop site_config table
--  17. Add updated_at triggers for new tables
--  18. Add indexes

-- ============================================================================
-- Step 1: Add config columns to orgs
-- ============================================================================

ALTER TABLE orgs ADD COLUMN logo_url text;
ALTER TABLE orgs ADD COLUMN favicon_url text;
ALTER TABLE orgs ADD COLUMN theme jsonb;              -- {preset, overrides}
ALTER TABLE orgs ADD COLUMN tagline text;
ALTER TABLE orgs ADD COLUMN setup_complete boolean NOT NULL DEFAULT false;
ALTER TABLE orgs ADD COLUMN default_property_id uuid; -- FK added after properties table created

-- ============================================================================
-- Step 2: Create properties table
-- ============================================================================

CREATE TABLE properties (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name              text NOT NULL,
  slug              text NOT NULL,
  description       text,
  is_active         boolean NOT NULL DEFAULT true,

  -- Map defaults
  map_default_lat   float8,
  map_default_lng   float8,
  map_default_zoom  int,
  map_style         text,              -- tile provider ID
  map_bounds        jsonb,             -- optional explicit bounds, independent of custom_map
  custom_map        jsonb,             -- overlay image config

  -- Landing page
  landing_headline  text,
  landing_body      text,
  landing_image_url text,
  landing_page      jsonb,             -- full LandingPageConfig (blocks, assets)

  -- Theming (overrides org if set)
  primary_color     text,
  logo_url          text,

  -- Content (migrated from site_config)
  about_content     text,              -- markdown about page
  footer_text       text,
  footer_links      jsonb,             -- array of {label, url}
  custom_nav_items  jsonb,             -- array of nav items

  -- Access
  is_publicly_listed boolean NOT NULL DEFAULT false,

  -- Metadata
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,

  UNIQUE (org_id, slug)
);

-- ============================================================================
-- Step 3: Create property_memberships table
-- ============================================================================

CREATE TABLE property_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
  role_id       uuid NOT NULL REFERENCES roles(id),
                -- ON DELETE defaults to RESTRICT: roles cannot be deleted
                -- while property memberships reference them

  grant_type    text NOT NULL DEFAULT 'explicit'
                CHECK (grant_type IN ('explicit', 'temporary')),

  granted_by    uuid REFERENCES users(id),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Step 4: Wire FKs
-- ============================================================================

-- orgs.default_property_id → properties
ALTER TABLE orgs ADD CONSTRAINT orgs_default_property_fk
  FOREIGN KEY (default_property_id) REFERENCES properties(id) ON DELETE SET NULL;

-- org_memberships.default_property_id → properties (column exists from Phase 1, FK missing)
ALTER TABLE org_memberships ADD CONSTRAINT org_memberships_default_property_fk
  FOREIGN KEY (default_property_id) REFERENCES properties(id) ON DELETE SET NULL;

-- ============================================================================
-- Step 5: Add org_id to org-scoped tables
-- ============================================================================

ALTER TABLE item_types ADD COLUMN org_id uuid;
ALTER TABLE custom_fields ADD COLUMN org_id uuid;
ALTER TABLE update_types ADD COLUMN org_id uuid;
ALTER TABLE species ADD COLUMN org_id uuid;
ALTER TABLE item_species ADD COLUMN org_id uuid;
ALTER TABLE update_species ADD COLUMN org_id uuid;

-- ============================================================================
-- Step 6: Add org_id + property_id to property-scoped tables
-- ============================================================================

ALTER TABLE items ADD COLUMN org_id uuid;
ALTER TABLE items ADD COLUMN property_id uuid;

ALTER TABLE item_updates ADD COLUMN org_id uuid;
ALTER TABLE item_updates ADD COLUMN property_id uuid;

ALTER TABLE photos ADD COLUMN org_id uuid;
ALTER TABLE photos ADD COLUMN property_id uuid;

ALTER TABLE location_history ADD COLUMN org_id uuid;
ALTER TABLE location_history ADD COLUMN property_id uuid;

-- ============================================================================
-- Step 7: Add org_id to invites, redirects
-- ============================================================================

ALTER TABLE invites ADD COLUMN org_id uuid;
ALTER TABLE redirects ADD COLUMN org_id uuid;

-- ============================================================================
-- Step 8: Create default property from site_config values
-- ============================================================================

INSERT INTO properties (org_id, name, slug, description,
  map_default_lat, map_default_lng, map_default_zoom,
  map_style, custom_map, about_content, footer_text,
  footer_links, custom_nav_items, landing_page)
VALUES (
  (SELECT id FROM orgs LIMIT 1),
  COALESCE((SELECT value#>>'{}' FROM site_config WHERE key = 'site_name'), 'Default Property'),
  'default',
  (SELECT value#>>'{}' FROM site_config WHERE key = 'location_name'),
  (SELECT (value->>'lat')::float8 FROM site_config WHERE key = 'map_center'),
  (SELECT (value->>'lng')::float8 FROM site_config WHERE key = 'map_center'),
  (SELECT (value->>'zoom')::int FROM site_config WHERE key = 'map_center'),
  (SELECT value#>>'{}' FROM site_config WHERE key = 'map_style'),
  (SELECT value FROM site_config WHERE key = 'custom_map'),
  (SELECT value#>>'{}' FROM site_config WHERE key = 'about_content'),
  (SELECT value#>>'{}' FROM site_config WHERE key = 'footer_text'),
  (SELECT value FROM site_config WHERE key = 'footer_links'),
  (SELECT value FROM site_config WHERE key = 'custom_nav_items'),
  (SELECT value FROM site_config WHERE key = 'landing_page')
);

-- ============================================================================
-- Step 9: Populate org config columns from site_config
-- ============================================================================

UPDATE orgs SET
  logo_url = (SELECT value#>>'{}' FROM site_config WHERE key = 'logo_url'),
  favicon_url = (SELECT value#>>'{}' FROM site_config WHERE key = 'favicon_url'),
  theme = (SELECT value FROM site_config WHERE key = 'theme'),
  tagline = (SELECT value#>>'{}' FROM site_config WHERE key = 'tagline'),
  setup_complete = COALESCE((SELECT (value#>>'{}')::boolean FROM site_config WHERE key = 'setup_complete'), false),
  default_property_id = (SELECT id FROM properties LIMIT 1)
WHERE id = (SELECT id FROM orgs LIMIT 1);

-- ============================================================================
-- Step 10: Populate org_id/property_id on all content rows
-- ============================================================================

-- Property-scoped tables
UPDATE items SET org_id = (SELECT id FROM orgs LIMIT 1), property_id = (SELECT id FROM properties LIMIT 1);
UPDATE item_updates SET org_id = (SELECT id FROM orgs LIMIT 1), property_id = (SELECT id FROM properties LIMIT 1);
UPDATE photos SET org_id = (SELECT id FROM orgs LIMIT 1), property_id = (SELECT id FROM properties LIMIT 1);
UPDATE location_history SET org_id = (SELECT id FROM orgs LIMIT 1), property_id = (SELECT id FROM properties LIMIT 1);

-- Org-scoped tables
UPDATE item_types SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE custom_fields SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE update_types SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE species SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE item_species SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE update_species SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE invites SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE redirects SET org_id = (SELECT id FROM orgs LIMIT 1);

-- ============================================================================
-- Step 11: Make org_id/property_id NOT NULL, add FKs
-- ============================================================================

-- items
ALTER TABLE items ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE items ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE items ADD CONSTRAINT items_org_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;
ALTER TABLE items ADD CONSTRAINT items_property_fk
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;

-- item_updates
ALTER TABLE item_updates ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE item_updates ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE item_updates ADD CONSTRAINT item_updates_org_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;
ALTER TABLE item_updates ADD CONSTRAINT item_updates_property_fk
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;

-- photos
ALTER TABLE photos ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE photos ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE photos ADD CONSTRAINT photos_org_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;
ALTER TABLE photos ADD CONSTRAINT photos_property_fk
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;

-- location_history
ALTER TABLE location_history ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE location_history ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE location_history ADD CONSTRAINT location_history_org_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;
ALTER TABLE location_history ADD CONSTRAINT location_history_property_fk
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;

-- item_types
ALTER TABLE item_types ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE item_types ADD CONSTRAINT item_types_org_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

-- custom_fields
ALTER TABLE custom_fields ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE custom_fields ADD CONSTRAINT custom_fields_org_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

-- update_types
ALTER TABLE update_types ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE update_types ADD CONSTRAINT update_types_org_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

-- species
ALTER TABLE species ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE species ADD CONSTRAINT species_org_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

-- item_species
ALTER TABLE item_species ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE item_species ADD CONSTRAINT item_species_org_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

-- update_species
ALTER TABLE update_species ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE update_species ADD CONSTRAINT update_species_org_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

-- invites
ALTER TABLE invites ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE invites ADD CONSTRAINT invites_org_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

-- redirects
ALTER TABLE redirects ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE redirects ADD CONSTRAINT redirects_org_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

-- ============================================================================
-- Step 12: Create auto_populate_org_property trigger for content tables
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_populate_org_property()
RETURNS trigger AS $$
BEGIN
  -- Auto-populate org_id from user's active org if not set
  IF NEW.org_id IS NULL THEN
    NEW.org_id := (SELECT last_active_org_id FROM public.users WHERE id = auth.uid());
  END IF;

  -- Auto-populate property_id from org's default property if not set
  IF TG_ARGV[0] = 'property_scoped' AND NEW.property_id IS NULL THEN
    NEW.property_id := (SELECT default_property_id FROM public.orgs WHERE id = NEW.org_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Property-scoped tables
CREATE TRIGGER items_auto_org_property BEFORE INSERT ON items
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('property_scoped');
CREATE TRIGGER item_updates_auto_org_property BEFORE INSERT ON item_updates
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('property_scoped');
CREATE TRIGGER photos_auto_org_property BEFORE INSERT ON photos
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('property_scoped');
CREATE TRIGGER location_history_auto_org_property BEFORE INSERT ON location_history
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('property_scoped');

-- Org-scoped tables
CREATE TRIGGER item_types_auto_org BEFORE INSERT ON item_types
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('org_scoped');
CREATE TRIGGER custom_fields_auto_org BEFORE INSERT ON custom_fields
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('org_scoped');
CREATE TRIGGER update_types_auto_org BEFORE INSERT ON update_types
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('org_scoped');
CREATE TRIGGER species_auto_org BEFORE INSERT ON species
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('org_scoped');
CREATE TRIGGER item_species_auto_org BEFORE INSERT ON item_species
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('org_scoped');
CREATE TRIGGER update_species_auto_org BEFORE INSERT ON update_species
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('org_scoped');
CREATE TRIGGER invites_auto_org BEFORE INSERT ON invites
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('org_scoped');
CREATE TRIGGER redirects_auto_org BEFORE INSERT ON redirects
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('org_scoped');

-- ============================================================================
-- Step 13: Permission resolution functions
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_property_role_id(p_user_id uuid, p_property_id uuid)
RETURNS uuid AS $$
  SELECT COALESCE(
    -- Level 1: explicit property membership override
    (SELECT pm.role_id FROM public.property_memberships pm
     WHERE pm.user_id = p_user_id AND pm.property_id = p_property_id),
    -- Level 2: inherited from org membership
    (SELECT om.role_id FROM public.org_memberships om
     JOIN public.properties p ON p.org_id = om.org_id
     WHERE om.user_id = p_user_id AND p.id = p_property_id
       AND om.status = 'active'
       AND p.is_active = true AND p.deleted_at IS NULL)
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION check_permission(
  p_user_id uuid,
  p_property_id uuid,
  p_category text,    -- 'items', 'updates', 'tasks', 'attachments', etc.
  p_action text       -- 'view', 'create', 'edit_any', 'delete', etc.
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

  IF v_role_id IS NULL THEN
    RETURN false;  -- no access at all
  END IF;

  -- Look up permission from role's JSONB
  SELECT permissions INTO v_permissions FROM public.roles WHERE id = v_role_id;

  RETURN COALESCE((v_permissions -> p_category ->> p_action)::boolean, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

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
  WHERE pm.user_id = p_user_id AND p2.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- Step 14: Drop all legacy write policies on content tables
-- ============================================================================

-- items
DROP POLICY IF EXISTS "Public can view items" ON items;
DROP POLICY IF EXISTS "Authenticated users can insert items" ON items;
DROP POLICY IF EXISTS "Authenticated users can update items" ON items;
DROP POLICY IF EXISTS "Admins can delete items" ON items;

-- item_updates
DROP POLICY IF EXISTS "Public can view item updates" ON item_updates;
DROP POLICY IF EXISTS "Authenticated users can insert item updates" ON item_updates;
DROP POLICY IF EXISTS "Authenticated users can update item updates" ON item_updates;
DROP POLICY IF EXISTS "Admins can delete item updates" ON item_updates;

-- photos
DROP POLICY IF EXISTS "Public can view photos" ON photos;
DROP POLICY IF EXISTS "Authenticated users can insert photos" ON photos;
DROP POLICY IF EXISTS "Authenticated users can update photos" ON photos;
DROP POLICY IF EXISTS "Admins can delete photos" ON photos;

-- site_config
DROP POLICY IF EXISTS "Public can view site config" ON site_config;
DROP POLICY IF EXISTS "Admins can insert site config" ON site_config;
DROP POLICY IF EXISTS "Admins can update site config" ON site_config;
DROP POLICY IF EXISTS "Admins can delete site config" ON site_config;

-- item_types
DROP POLICY IF EXISTS "Public can view item types" ON item_types;
DROP POLICY IF EXISTS "Admins can insert item types" ON item_types;
DROP POLICY IF EXISTS "Admins can update item types" ON item_types;
DROP POLICY IF EXISTS "Admins can delete item types" ON item_types;

-- custom_fields
DROP POLICY IF EXISTS "Public can view custom fields" ON custom_fields;
DROP POLICY IF EXISTS "Admins can insert custom fields" ON custom_fields;
DROP POLICY IF EXISTS "Admins can update custom fields" ON custom_fields;
DROP POLICY IF EXISTS "Admins can delete custom fields" ON custom_fields;

-- update_types
DROP POLICY IF EXISTS "Public can view update types" ON update_types;
DROP POLICY IF EXISTS "Admins can insert update types" ON update_types;
DROP POLICY IF EXISTS "Admins can update update types" ON update_types;
DROP POLICY IF EXISTS "Admins can delete update types" ON update_types;

-- invites (keep "Users can view their own claimed invite")
DROP POLICY IF EXISTS "Admins can view invites" ON invites;
DROP POLICY IF EXISTS "Admins can create invites" ON invites;
DROP POLICY IF EXISTS "Admins can update invites" ON invites;
DROP POLICY IF EXISTS "Admins can delete invites" ON invites;

-- redirects
DROP POLICY IF EXISTS "Public can view redirects" ON redirects;
DROP POLICY IF EXISTS "Admins can insert redirects" ON redirects;
DROP POLICY IF EXISTS "Admins can update redirects" ON redirects;
DROP POLICY IF EXISTS "Admins can delete redirects" ON redirects;

-- location_history
DROP POLICY IF EXISTS "Public can view location history" ON location_history;
DROP POLICY IF EXISTS "Authenticated users can insert location history" ON location_history;

-- species
DROP POLICY IF EXISTS "Public can view species" ON species;
DROP POLICY IF EXISTS "Authenticated users can insert species" ON species;
DROP POLICY IF EXISTS "Authenticated users can update species" ON species;
DROP POLICY IF EXISTS "Authenticated users can delete species" ON species;

-- item_species
DROP POLICY IF EXISTS "Public can view item species" ON item_species;
DROP POLICY IF EXISTS "Authenticated users can insert item species" ON item_species;
DROP POLICY IF EXISTS "Authenticated users can delete item species" ON item_species;

-- update_species
DROP POLICY IF EXISTS "Public can view update species" ON update_species;
DROP POLICY IF EXISTS "Authenticated users can insert update species" ON update_species;
DROP POLICY IF EXISTS "Authenticated users can delete update species" ON update_species;

-- ============================================================================
-- Step 15: Create new permission-based RLS policies
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_memberships ENABLE ROW LEVEL SECURITY;

-- properties: org members can read, org admins can manage, platform admins full access
CREATE POLICY "properties_org_member_read" ON properties FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

CREATE POLICY "properties_admin_manage" ON properties FOR ALL
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "properties_platform_admin" ON properties FOR ALL
  TO authenticated
  USING (is_platform_admin());

-- property_memberships: org members can read, org admins can manage, platform admins full access
CREATE POLICY "property_memberships_read" ON property_memberships FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

CREATE POLICY "property_memberships_admin_manage" ON property_memberships FOR ALL
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "property_memberships_platform_admin" ON property_memberships FOR ALL
  TO authenticated
  USING (is_platform_admin());

-- items: public read, permission-based writes
CREATE POLICY "items_public_read" ON items FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "items_insert" ON items FOR INSERT
  TO authenticated
  WITH CHECK (check_permission(auth.uid(), property_id, 'items', 'create'));

CREATE POLICY "items_update" ON items FOR UPDATE
  TO authenticated
  USING (check_permission(auth.uid(), property_id, 'items', 'edit_any'));

CREATE POLICY "items_delete" ON items FOR DELETE
  TO authenticated
  USING (check_permission(auth.uid(), property_id, 'items', 'delete'));

-- item_updates: public read, permission-based writes (category 'updates')
CREATE POLICY "item_updates_public_read" ON item_updates FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "item_updates_insert" ON item_updates FOR INSERT
  TO authenticated
  WITH CHECK (check_permission(auth.uid(), property_id, 'updates', 'create'));

CREATE POLICY "item_updates_update" ON item_updates FOR UPDATE
  TO authenticated
  USING (check_permission(auth.uid(), property_id, 'updates', 'edit_any'));

CREATE POLICY "item_updates_delete" ON item_updates FOR DELETE
  TO authenticated
  USING (check_permission(auth.uid(), property_id, 'updates', 'delete'));

-- photos: public read, permission-based writes (category 'attachments')
CREATE POLICY "photos_public_read" ON photos FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "photos_insert" ON photos FOR INSERT
  TO authenticated
  WITH CHECK (check_permission(auth.uid(), property_id, 'attachments', 'upload'));

CREATE POLICY "photos_update" ON photos FOR UPDATE
  TO authenticated
  USING (check_permission(auth.uid(), property_id, 'attachments', 'upload'));

CREATE POLICY "photos_delete" ON photos FOR DELETE
  TO authenticated
  USING (check_permission(auth.uid(), property_id, 'attachments', 'delete_any'));

-- location_history: public read, insert requires item edit permission (append-only)
CREATE POLICY "location_history_public_read" ON location_history FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "location_history_insert" ON location_history FOR INSERT
  TO authenticated
  WITH CHECK (check_permission(auth.uid(), property_id, 'items', 'edit_any'));

-- item_types: public read, org-admin writes
CREATE POLICY "item_types_public_read" ON item_types FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "item_types_insert" ON item_types FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "item_types_update" ON item_types FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "item_types_delete" ON item_types FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

-- custom_fields: public read, org-admin writes
CREATE POLICY "custom_fields_public_read" ON custom_fields FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "custom_fields_insert" ON custom_fields FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "custom_fields_update" ON custom_fields FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "custom_fields_delete" ON custom_fields FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

-- update_types: public read, org-admin writes
CREATE POLICY "update_types_public_read" ON update_types FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "update_types_insert" ON update_types FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "update_types_update" ON update_types FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "update_types_delete" ON update_types FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

-- species: public read, org-admin writes
CREATE POLICY "species_public_read" ON species FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "species_insert" ON species FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "species_update" ON species FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "species_delete" ON species FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

-- item_species: public read, org-admin writes
CREATE POLICY "item_species_public_read" ON item_species FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "item_species_insert" ON item_species FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "item_species_delete" ON item_species FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

-- update_species: public read, org-admin writes
CREATE POLICY "update_species_public_read" ON update_species FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "update_species_insert" ON update_species FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "update_species_delete" ON update_species FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

-- invites: keep existing "Users can view their own claimed invite", add admin policies
CREATE POLICY "invites_admin_read" ON invites FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "invites_insert" ON invites FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "invites_update" ON invites FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "invites_delete" ON invites FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

-- redirects: public read, org-admin writes
CREATE POLICY "redirects_public_read" ON redirects FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "redirects_insert" ON redirects FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "redirects_update" ON redirects FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "redirects_delete" ON redirects FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

-- ============================================================================
-- Step 16: Drop site_config table
-- ============================================================================

DROP TABLE site_config;

-- ============================================================================
-- Step 17: Add updated_at triggers for new tables
-- ============================================================================

CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER property_memberships_updated_at
  BEFORE UPDATE ON property_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Step 18: Add indexes
-- ============================================================================

-- properties
CREATE INDEX idx_properties_org ON properties (org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_properties_publicly_listed ON properties (is_publicly_listed)
  WHERE is_publicly_listed = true;

-- property_memberships
CREATE INDEX idx_property_memberships_user ON property_memberships (user_id);
CREATE INDEX idx_property_memberships_property ON property_memberships (property_id);
CREATE UNIQUE INDEX idx_property_memberships_property_user
  ON property_memberships (property_id, user_id) WHERE user_id IS NOT NULL;

-- Content tables (org_id/property_id indexes)
CREATE INDEX idx_items_org ON items (org_id);
CREATE INDEX idx_items_property ON items (property_id);
CREATE INDEX idx_items_org_property ON items (org_id, property_id);

CREATE INDEX idx_item_updates_org ON item_updates (org_id);
CREATE INDEX idx_item_updates_property ON item_updates (property_id);

CREATE INDEX idx_photos_org ON photos (org_id);
CREATE INDEX idx_photos_property ON photos (property_id);

CREATE INDEX idx_location_history_org ON location_history (org_id);
CREATE INDEX idx_location_history_property ON location_history (property_id);

-- Org-scoped tables
CREATE INDEX idx_item_types_org ON item_types (org_id);
CREATE INDEX idx_custom_fields_org ON custom_fields (org_id);
CREATE INDEX idx_update_types_org ON update_types (org_id);
CREATE INDEX idx_species_org ON species (org_id);
CREATE INDEX idx_item_species_org ON item_species (org_id);
CREATE INDEX idx_update_species_org ON update_species (org_id);
CREATE INDEX idx_invites_org ON invites (org_id);
CREATE INDEX idx_redirects_org ON redirects (org_id);
