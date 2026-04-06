-- Add map display configuration to orgs and properties
-- Stores control visibility toggles and legend content filters as JSONB
-- null = use all defaults (everything visible)

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS map_display_config JSONB DEFAULT NULL;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS map_display_config JSONB DEFAULT NULL;
