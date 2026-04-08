-- Add updated_at column to item_types so delta sync picks up layout changes.
-- Without this, editing an item_type (e.g. saving a layout) never propagates
-- to clients that already cached the row, because delta sync used created_at.

ALTER TABLE item_types
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill: set updated_at = created_at for existing rows
UPDATE item_types SET updated_at = created_at;

-- Auto-update trigger (same pattern as items, entities, entity_types, etc.)
CREATE TRIGGER item_types_updated_at
  BEFORE UPDATE ON item_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
