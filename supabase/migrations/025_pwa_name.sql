-- Add pwa_name column to orgs and properties for custom PWA app name override
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS pwa_name text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS pwa_name text;
