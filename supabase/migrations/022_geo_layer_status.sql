-- 022_geo_layer_status.sql — Add status and source columns to geo_layers

ALTER TABLE geo_layers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai'));

-- Migrate existing layers to published (they were explicitly created)
UPDATE geo_layers SET status = 'published' WHERE status = 'draft';
