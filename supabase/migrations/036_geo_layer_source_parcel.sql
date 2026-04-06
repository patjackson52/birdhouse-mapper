-- supabase/migrations/036_geo_layer_source_parcel.sql
ALTER TABLE geo_layers DROP CONSTRAINT IF EXISTS geo_layers_source_check;
ALTER TABLE geo_layers ADD CONSTRAINT geo_layers_source_check
  CHECK (source IN ('manual', 'ai', 'discovered', 'parcel_lookup'));
