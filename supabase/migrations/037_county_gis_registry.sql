-- supabase/migrations/037_county_gis_registry.sql
CREATE TABLE county_gis_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fips text UNIQUE NOT NULL,
  county_name text NOT NULL,
  state text NOT NULL,
  parcel_layer_url text NOT NULL,
  address_layer_url text,
  field_map jsonb NOT NULL DEFAULT '{}',
  discovery_method text NOT NULL DEFAULT 'auto' CHECK (discovery_method IN ('manual', 'auto')),
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('high', 'medium', 'low')),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_county_gis_registry_fips ON county_gis_registry (fips);
CREATE INDEX idx_county_gis_registry_state ON county_gis_registry (state);
