-- supabase/migrations/038_parcel_lookups.sql
CREATE TABLE parcel_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  input_address text,
  input_lat numeric,
  input_lng numeric,
  county_fips text,
  source text NOT NULL DEFAULT 'county_arcgis',
  status text NOT NULL CHECK (status IN ('success', 'partial', 'not_found', 'error')),
  parcels_found integer NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  result_geo_layer_id uuid REFERENCES geo_layers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_parcel_lookups_org_id ON parcel_lookups (org_id);
CREATE INDEX idx_parcel_lookups_property_id ON parcel_lookups (property_id);

ALTER TABLE parcel_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view parcel lookups"
  ON parcel_lookups FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM org_memberships WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Org admins can insert parcel lookups"
  ON parcel_lookups FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (
    SELECT om.org_id FROM org_memberships om
    JOIN roles r ON r.id = om.role_id
    WHERE om.user_id = auth.uid() AND om.status = 'active'
    AND r.base_role IN ('owner', 'admin', 'staff')
  ));

CREATE POLICY "Org admins can update parcel lookups"
  ON parcel_lookups FOR UPDATE
  TO authenticated
  USING (org_id IN (
    SELECT om.org_id FROM org_memberships om
    JOIN roles r ON r.id = om.role_id
    WHERE om.user_id = auth.uid() AND om.status = 'active'
    AND r.base_role IN ('owner', 'admin', 'staff')
  ))
  WITH CHECK (org_id IN (
    SELECT om.org_id FROM org_memberships om
    JOIN roles r ON r.id = om.role_id
    WHERE om.user_id = auth.uid() AND om.status = 'active'
    AND r.base_role IN ('owner', 'admin', 'staff')
  ));
