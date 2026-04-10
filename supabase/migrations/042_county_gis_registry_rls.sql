-- Enable RLS on county_gis_registry (was missing)
ALTER TABLE county_gis_registry ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read registry entries (used during parcel lookups)
CREATE POLICY "Authenticated users can read county_gis_registry"
  ON county_gis_registry FOR SELECT
  TO authenticated
  USING (true);

-- Only platform admins can insert/update/delete registry entries.
-- Server actions that upsert use the service role, so authenticated
-- end-user writes are correctly blocked.
CREATE POLICY "Platform admins can insert county_gis_registry"
  ON county_gis_registry FOR INSERT
  TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "Platform admins can update county_gis_registry"
  ON county_gis_registry FOR UPDATE
  TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "Platform admins can delete county_gis_registry"
  ON county_gis_registry FOR DELETE
  TO authenticated
  USING (is_platform_admin());
