-- supabase/migrations/030_item_type_layout.sql
-- Add layout JSONB column to item_types for custom detail panel layouts

ALTER TABLE item_types
ADD COLUMN layout jsonb DEFAULT NULL;

COMMENT ON COLUMN item_types.layout IS
  'JSON layout definition for the item detail panel. NULL = use default rendering.';
