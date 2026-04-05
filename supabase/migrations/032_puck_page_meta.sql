-- Add page metadata column to properties table
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS puck_page_meta JSONB DEFAULT '{}';

-- Backfill: for properties that already have puck_pages with a "/" key,
-- we don't add a meta entry for "/" since the landing page is implicit.
