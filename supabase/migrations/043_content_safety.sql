-- 043_content_safety.sql
-- Content safety: moderation columns, org settings, moderation_actions table, public_contributor support

-- 1. Add moderation columns to vault_items
ALTER TABLE vault_items
  ADD COLUMN moderation_status text NOT NULL DEFAULT 'approved'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged_for_review')),
  ADD COLUMN moderation_scores jsonb,
  ADD COLUMN rejection_reason text,
  ADD COLUMN moderated_at timestamptz;

CREATE INDEX idx_vault_items_moderation_status ON vault_items(moderation_status);

-- 2. Add org settings for public contributions
ALTER TABLE orgs
  ADD COLUMN allow_public_contributions boolean NOT NULL DEFAULT false,
  ADD COLUMN moderation_mode text NOT NULL DEFAULT 'manual_review'
    CHECK (moderation_mode IN ('auto_approve', 'manual_review'));

-- 3. Extend org_memberships status to include 'banned'
ALTER TABLE org_memberships
  DROP CONSTRAINT IF EXISTS org_memberships_status_check,
  ADD CONSTRAINT org_memberships_status_check
    CHECK (status IN ('invited', 'active', 'suspended', 'revoked', 'banned'));

-- 4. Add rate limiting columns to org_memberships
ALTER TABLE org_memberships
  ADD COLUMN upload_count_this_hour int NOT NULL DEFAULT 0,
  ADD COLUMN last_upload_window_start timestamptz;

-- 5. Extend base_role check to include public_contributor
ALTER TABLE roles
  DROP CONSTRAINT IF EXISTS roles_base_role_check,
  ADD CONSTRAINT roles_base_role_check
    CHECK (base_role IN ('platform_admin', 'org_admin', 'org_staff', 'contributor', 'viewer', 'public', 'public_contributor'));

-- 6. Create moderation_actions table
CREATE TABLE moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('warn', 'ban', 'takedown')),
  reason text,
  vault_item_id uuid REFERENCES vault_items(id) ON DELETE SET NULL,
  acted_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_moderation_actions_org ON moderation_actions(org_id);
CREATE INDEX idx_moderation_actions_user ON moderation_actions(user_id);

-- 7. RLS for moderation_actions
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY moderation_actions_select ON moderation_actions
  FOR SELECT USING (
    is_platform_admin()
    OR org_id IN (SELECT user_org_admin_org_ids())
  );

CREATE POLICY moderation_actions_insert ON moderation_actions
  FOR INSERT WITH CHECK (
    is_platform_admin()
    OR org_id IN (SELECT user_org_admin_org_ids())
  );

-- 8. Add RLS policy: only approved vault_items visible to non-admins in public queries
CREATE POLICY vault_items_public_approved ON vault_items
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM vault_items vi
      JOIN orgs o ON o.id = vi.org_id
      WHERE vi.id = vault_items.id
      AND vi.moderation_status = 'approved'
      AND o.allow_public_contributions = true
    )
  );
