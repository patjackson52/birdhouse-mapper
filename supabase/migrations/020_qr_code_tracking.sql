-- 020_qr_code_tracking.sql — Enhanced QR code tracking

-- ======================
-- Extend redirects table
-- ======================

ALTER TABLE redirects
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES orgs(id),
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES properties(id),
  ADD COLUMN IF NOT EXISTS placement text,
  ADD COLUMN IF NOT EXISTS label text;

-- Index for admin queries: list all redirects for a property
CREATE INDEX IF NOT EXISTS idx_redirects_property_id ON redirects(property_id);

-- ======================
-- Scan log table
-- ======================

CREATE TABLE IF NOT EXISTS redirect_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redirect_slug text NOT NULL REFERENCES redirects(slug) ON DELETE CASCADE,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_hash text
);

CREATE INDEX IF NOT EXISTS idx_redirect_scans_slug ON redirect_scans(redirect_slug);
CREATE INDEX IF NOT EXISTS idx_redirect_scans_scanned_at ON redirect_scans(scanned_at);

-- ======================
-- RLS policies for redirect_scans
-- ======================

ALTER TABLE redirect_scans ENABLE ROW LEVEL SECURITY;

-- No public read — only admins via service client or RPC
-- Admins can view scans for redirects in their org
DROP POLICY IF EXISTS "Admins can view redirect_scans" ON redirect_scans;
CREATE POLICY "Admins can view redirect_scans"
  ON redirect_scans FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM redirects r
      JOIN org_memberships om ON om.org_id = r.org_id
      JOIN roles rl ON rl.id = om.role_id
      WHERE r.slug = redirect_scans.redirect_slug
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role = 'org_admin'
    )
  );

-- ======================
-- Updated scan logging function
-- ======================

-- Replace the old increment-only function with one that also inserts a scan record
CREATE OR REPLACE FUNCTION log_scan(
  slug_param text,
  user_agent_param text DEFAULT NULL,
  ip_hash_param text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Increment counter (fast aggregate)
  UPDATE redirects SET scan_count = scan_count + 1 WHERE slug = slug_param;

  -- Insert detailed scan record
  INSERT INTO redirect_scans (redirect_slug, user_agent, ip_hash)
  VALUES (slug_param, user_agent_param, ip_hash_param);
END;
$$;

-- ======================
-- Update RLS on redirects for org-scoped admin access
-- ======================

-- Drop old admin policies that used profiles.role (legacy)
DROP POLICY IF EXISTS "Admins can insert redirects" ON redirects;
DROP POLICY IF EXISTS "Admins can update redirects" ON redirects;
DROP POLICY IF EXISTS "Admins can delete redirects" ON redirects;

-- New org-scoped admin policies
DROP POLICY IF EXISTS "Org admins can insert redirects" ON redirects;
CREATE POLICY "Org admins can insert redirects"
  ON redirects FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = redirects.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role = 'org_admin'
    )
  );

DROP POLICY IF EXISTS "Org admins can update redirects" ON redirects;
CREATE POLICY "Org admins can update redirects"
  ON redirects FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = redirects.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role = 'org_admin'
    )
  );

DROP POLICY IF EXISTS "Org admins can delete redirects" ON redirects;
CREATE POLICY "Org admins can delete redirects"
  ON redirects FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = redirects.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role = 'org_admin'
    )
  );
