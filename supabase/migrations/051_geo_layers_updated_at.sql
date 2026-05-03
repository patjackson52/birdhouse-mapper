-- 051_geo_layers_updated_at.sql
-- Adds updated_at to geo_layers so the client can revalidate cached GeoJSON
-- by version. Backfills updated_at = created_at for existing rows.

ALTER TABLE geo_layers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

UPDATE geo_layers
SET updated_at = created_at
WHERE updated_at IS NULL OR updated_at = '1970-01-01T00:00:00Z'::timestamptz;

DROP TRIGGER IF EXISTS geo_layers_updated_at ON geo_layers;
CREATE TRIGGER geo_layers_updated_at
  BEFORE UPDATE ON geo_layers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
