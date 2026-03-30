-- 021_geo_layers.sql — Geographic data layers

-- ======================
-- geo_layers table
-- ======================

CREATE TABLE IF NOT EXISTS geo_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#3b82f6',
  opacity float NOT NULL DEFAULT 0.6,
  source_format text NOT NULL,
  source_filename text NOT NULL,
  geojson jsonb NOT NULL,
  feature_count int NOT NULL DEFAULT 0,
  bbox jsonb,
  is_property_boundary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_geo_layers_org_id ON geo_layers(org_id);

-- ======================
-- geo_layer_properties join table
-- ======================

CREATE TABLE IF NOT EXISTS geo_layer_properties (
  geo_layer_id uuid NOT NULL REFERENCES geo_layers(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  visible_default boolean NOT NULL DEFAULT true,
  PRIMARY KEY (geo_layer_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_geo_layer_properties_property_id ON geo_layer_properties(property_id);
CREATE INDEX IF NOT EXISTS idx_geo_layer_properties_org_id ON geo_layer_properties(org_id);

-- ======================
-- Add boundary_layer_id to properties
-- ======================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS boundary_layer_id uuid REFERENCES geo_layers(id) ON DELETE SET NULL;

-- ======================
-- RLS for geo_layers
-- ======================

ALTER TABLE geo_layers ENABLE ROW LEVEL SECURITY;

-- Org members can read layers
DROP POLICY IF EXISTS "Org members can view geo_layers" ON geo_layers;
CREATE POLICY "Org members can view geo_layers"
  ON geo_layers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      WHERE om.org_id = geo_layers.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- Public can view layers (for public maps)
DROP POLICY IF EXISTS "Public can view geo_layers" ON geo_layers;
CREATE POLICY "Public can view geo_layers"
  ON geo_layers FOR SELECT
  TO anon
  USING (true);

-- Org admins and staff can insert
DROP POLICY IF EXISTS "Org admins can insert geo_layers" ON geo_layers;
CREATE POLICY "Org admins can insert geo_layers"
  ON geo_layers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = geo_layers.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role IN ('org_admin', 'org_staff')
    )
  );

-- Org admins and staff can update
DROP POLICY IF EXISTS "Org admins can update geo_layers" ON geo_layers;
CREATE POLICY "Org admins can update geo_layers"
  ON geo_layers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = geo_layers.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role IN ('org_admin', 'org_staff')
    )
  );

-- Org admins can delete
DROP POLICY IF EXISTS "Org admins can delete geo_layers" ON geo_layers;
CREATE POLICY "Org admins can delete geo_layers"
  ON geo_layers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = geo_layers.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role = 'org_admin'
    )
  );

-- ======================
-- RLS for geo_layer_properties
-- ======================

ALTER TABLE geo_layer_properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view geo_layer_properties" ON geo_layer_properties;
CREATE POLICY "Org members can view geo_layer_properties"
  ON geo_layer_properties FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      WHERE om.org_id = geo_layer_properties.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Public can view geo_layer_properties" ON geo_layer_properties;
CREATE POLICY "Public can view geo_layer_properties"
  ON geo_layer_properties FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Org admins can insert geo_layer_properties" ON geo_layer_properties;
CREATE POLICY "Org admins can insert geo_layer_properties"
  ON geo_layer_properties FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = geo_layer_properties.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role IN ('org_admin', 'org_staff')
    )
  );

DROP POLICY IF EXISTS "Org admins can update geo_layer_properties" ON geo_layer_properties;
CREATE POLICY "Org admins can update geo_layer_properties"
  ON geo_layer_properties FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = geo_layer_properties.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role IN ('org_admin', 'org_staff')
    )
  );

DROP POLICY IF EXISTS "Org admins can delete geo_layer_properties" ON geo_layer_properties;
CREATE POLICY "Org admins can delete geo_layer_properties"
  ON geo_layer_properties FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = geo_layer_properties.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role IN ('org_admin', 'org_staff')
    )
  );
