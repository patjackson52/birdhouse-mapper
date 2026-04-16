-- 044_icon_jsonb.sql
-- Convert item_types.icon and entity_types.icon from text to jsonb

-- item_types: convert existing emoji strings to { set: 'emoji', name: '<emoji>' }
ALTER TABLE item_types
  ALTER COLUMN icon TYPE jsonb USING jsonb_build_object('set', 'emoji', 'name', icon);

ALTER TABLE item_types
  ALTER COLUMN icon SET DEFAULT '{"set":"emoji","name":"📍"}'::jsonb;

-- entity_types: same conversion
ALTER TABLE entity_types
  ALTER COLUMN icon TYPE jsonb USING jsonb_build_object('set', 'emoji', 'name', icon);

ALTER TABLE entity_types
  ALTER COLUMN icon SET DEFAULT '{"set":"emoji","name":"📋"}'::jsonb;
