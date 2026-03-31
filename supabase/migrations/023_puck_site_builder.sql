-- Add Puck site builder columns to properties table
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS puck_pages jsonb,
  ADD COLUMN IF NOT EXISTS puck_root jsonb,
  ADD COLUMN IF NOT EXISTS puck_template text,
  ADD COLUMN IF NOT EXISTS puck_pages_draft jsonb,
  ADD COLUMN IF NOT EXISTS puck_root_draft jsonb;

COMMENT ON COLUMN properties.puck_pages IS 'Per-page Puck editor data, keyed by path (e.g. {"/": {...}})';
COMMENT ON COLUMN properties.puck_root IS 'Published site chrome (header/footer) Puck data';
COMMENT ON COLUMN properties.puck_template IS 'Name of the template applied to this property';
COMMENT ON COLUMN properties.puck_pages_draft IS 'Unpublished draft of puck_pages';
COMMENT ON COLUMN properties.puck_root_draft IS 'Unpublished draft of puck_root';
