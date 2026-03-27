-- Register fairbankseagle.org as a custom domain for the Springbrook Creek Preserve
-- This domain was in use before the multi-tenancy/IAM refactor but was never
-- registered in the custom_domains table.
--
-- Production-only data migration: only runs if the org exists.

-- Update the org slug from 'default' to 'springbrook' for subdomain routing
UPDATE orgs SET slug = 'springbrook'
WHERE id = 'ddfc4974-49e1-4c13-b535-c39364560709' AND slug = 'default';

-- Only insert domain records if the production org exists
INSERT INTO custom_domains (
  org_id,
  property_id,
  domain,
  status,
  domain_type,
  is_primary,
  verified_at,
  ssl_status,
  created_by
)
SELECT
  'ddfc4974-49e1-4c13-b535-c39364560709',
  'dfaa65e2-af38-48c4-b8ad-0052271c5724',
  'fairbankseagle.org',
  'active',
  'apex',
  true,
  now(),
  'active',
  '9065a53b-0b7f-4c4f-97e5-1a6226dd5bd2'
WHERE EXISTS (SELECT 1 FROM orgs WHERE id = 'ddfc4974-49e1-4c13-b535-c39364560709')
ON CONFLICT (domain) DO NOTHING;

-- Also register www variant with redirect
INSERT INTO custom_domains (
  org_id,
  property_id,
  domain,
  status,
  domain_type,
  is_primary,
  verified_at,
  ssl_status,
  created_by
)
SELECT
  'ddfc4974-49e1-4c13-b535-c39364560709',
  'dfaa65e2-af38-48c4-b8ad-0052271c5724',
  'www.fairbankseagle.org',
  'active',
  'subdomain',
  false,
  now(),
  'active',
  '9065a53b-0b7f-4c4f-97e5-1a6226dd5bd2'
WHERE EXISTS (SELECT 1 FROM orgs WHERE id = 'ddfc4974-49e1-4c13-b535-c39364560709')
ON CONFLICT (domain) DO NOTHING;
