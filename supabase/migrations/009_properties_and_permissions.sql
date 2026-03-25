-- Migration: 009_properties_and_permissions.sql
-- Phase 2: Properties & Permission Resolution (steps 1-11)
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
