-- org_feature_overrides: per-org feature overrides managed by platform admins
CREATE TABLE org_feature_overrides (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  feature    text NOT NULL,
  value      jsonb NOT NULL,
  note       text,
  set_by     uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, feature)
);

-- Index for fast lookup by org
CREATE INDEX idx_org_feature_overrides_org_id ON org_feature_overrides(org_id);

-- RLS: only platform admins
ALTER TABLE org_feature_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can manage org_feature_overrides" ON org_feature_overrides;
CREATE POLICY "Platform admins can manage org_feature_overrides"
  ON org_feature_overrides FOR ALL
  TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- Service-role bypass for resolveOrgFeatures in org context
-- (service-role client bypasses RLS by default, no extra policy needed)
