-- 023_geo_layer_source_discovered.sql — Allow 'discovered' as a geo_layers source value

-- Drop the existing CHECK constraint and re-add with 'discovered' included.
-- The constraint was added in 022_geo_layer_status.sql as an inline CHECK on the column.
-- PostgreSQL names inline CHECK constraints as "<table>_<column>_check".
ALTER TABLE geo_layers DROP CONSTRAINT IF EXISTS geo_layers_source_check;
ALTER TABLE geo_layers ADD CONSTRAINT geo_layers_source_check CHECK (source IN ('manual', 'ai', 'discovered'));
