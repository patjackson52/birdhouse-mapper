-- 044_icon_jsonb.sql
-- Convert item_types.icon and entity_types.icon from text to jsonb

-- item_types: drop text default, convert to jsonb, set new default
ALTER TABLE item_types ALTER COLUMN icon DROP DEFAULT;
ALTER TABLE item_types ALTER COLUMN icon DROP NOT NULL;
ALTER TABLE item_types
  ALTER COLUMN icon TYPE jsonb USING jsonb_build_object('set', 'emoji', 'name', icon);
ALTER TABLE item_types ALTER COLUMN icon SET DEFAULT '{"set":"emoji","name":"📍"}'::jsonb;
ALTER TABLE item_types ALTER COLUMN icon SET NOT NULL;

-- entity_types: drop text default, convert to jsonb, set new default
ALTER TABLE entity_types ALTER COLUMN icon DROP DEFAULT;
ALTER TABLE entity_types ALTER COLUMN icon DROP NOT NULL;
ALTER TABLE entity_types
  ALTER COLUMN icon TYPE jsonb USING jsonb_build_object('set', 'emoji', 'name', icon);
ALTER TABLE entity_types ALTER COLUMN icon SET DEFAULT '{"set":"emoji","name":"📋"}'::jsonb;
ALTER TABLE entity_types ALTER COLUMN icon SET NOT NULL;
