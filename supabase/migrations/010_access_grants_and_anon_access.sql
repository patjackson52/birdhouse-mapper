-- Phase 3: Access Grants & Anonymous Access
-- Spec: docs/superpowers/specs/2026-03-24-phase3-access-grants-anon-design.md
-- Steps 1-8: Tables, functions, data migration

-- =============================================================================
-- Step 1: CREATE TABLE property_access_config (Section 1, lines 72-97)
-- =============================================================================

CREATE TABLE property_access_config (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  property_id                uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE UNIQUE,

  -- Anonymous/public access
  anon_access_enabled        boolean NOT NULL DEFAULT false,
  anon_can_view_map          boolean NOT NULL DEFAULT false,
  anon_can_view_items        boolean NOT NULL DEFAULT false,
  anon_can_view_item_details boolean NOT NULL DEFAULT false,
  anon_can_submit_forms      boolean NOT NULL DEFAULT false,

  -- What item fields are visible to anon users
  anon_visible_field_keys    jsonb,  -- array of field key strings, null = all public fields

  -- Password protection (optional layer on top of anon access)
  password_protected         boolean NOT NULL DEFAULT false,
  password_hash              text,   -- bcrypt hash of access password

  -- Embed / iframe allow
  allow_embed                boolean NOT NULL DEFAULT false,
  embed_allowed_origins      jsonb,  -- array of allowed origin URLs

  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Step 2: CREATE TABLE temporary_access_grants (Section 2, lines 121-158)
-- =============================================================================

CREATE TABLE temporary_access_grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

  -- Scope
  property_id     uuid REFERENCES properties(id) ON DELETE CASCADE,
  -- null property_id = org-wide temporary access (rare)

  -- Who gets access
  user_id         uuid REFERENCES users(id) ON DELETE CASCADE,
  granted_email   text,       -- if user doesn't have account yet
  invite_token    text UNIQUE,

  -- What access
  role_id         uuid NOT NULL REFERENCES roles(id),

  -- Temporal bounds
  valid_from      timestamptz NOT NULL DEFAULT now(),
  valid_until     timestamptz NOT NULL,  -- REQUIRED — no open-ended temp grants
  is_single_use   boolean NOT NULL DEFAULT false,

  -- Item-level scope (optional)
  item_ids        jsonb,   -- array of item UUIDs; null = all items in property

  -- Status
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'expired', 'revoked', 'used')),
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES users(id),
  revoke_reason   text,
  first_used_at   timestamptz,

  -- Audit
  granted_by      uuid REFERENCES users(id),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Step 3: CREATE TABLE anonymous_access_tokens (Section 3, lines 194-219)
-- =============================================================================

CREATE TABLE anonymous_access_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  token           text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- What this token allows (subset of property_access_config)
  can_view_map    boolean NOT NULL DEFAULT true,
  can_view_items  boolean NOT NULL DEFAULT true,
  can_submit_forms boolean NOT NULL DEFAULT false,

  -- Optional expiration
  expires_at      timestamptz,  -- null = permanent until revoked

  -- Usage tracking
  use_count       int NOT NULL DEFAULT 0,
  last_used_at    timestamptz,

  -- Status
  is_active       boolean NOT NULL DEFAULT true,
  label           text,   -- "Public trail map embed", "Conference kiosk"

  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Step 4: CREATE FUNCTION validate_anonymous_token() (Section 3, lines 225-233)
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_anonymous_token(p_token text)
RETURNS TABLE(property_id uuid, can_view_map boolean, can_view_items boolean, can_submit_forms boolean) AS $$
  UPDATE anonymous_access_tokens
  SET use_count = use_count + 1, last_used_at = now()
  WHERE token = p_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING property_id, can_view_map, can_view_items, can_submit_forms;
$$ LANGUAGE sql SECURITY DEFINER;

-- =============================================================================
-- Step 5: Data migration — create property_access_config for existing property
-- (Section 1, lines 106-110)
-- =============================================================================

INSERT INTO property_access_config (org_id, property_id,
  anon_access_enabled, anon_can_view_map, anon_can_view_items,
  anon_can_view_item_details)
SELECT org_id, id, true, true, true, true
FROM properties WHERE slug = 'default';

-- =============================================================================
-- Step 6: CREATE FUNCTION check_anon_access() (Section 4, lines 249-264)
-- =============================================================================

CREATE OR REPLACE FUNCTION check_anon_access(p_property_id uuid, p_access_type text)
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT CASE p_access_type
      WHEN 'map' THEN pac.anon_can_view_map
      WHEN 'items' THEN pac.anon_can_view_items
      WHEN 'item_details' THEN pac.anon_can_view_item_details
      WHEN 'forms' THEN pac.anon_can_submit_forms
      ELSE false
    END
    FROM public.property_access_config pac
    WHERE pac.property_id = p_property_id
      AND pac.anon_access_enabled = true),
    false  -- default closed: no config row = no access
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================================================
-- Step 7: CREATE OR REPLACE FUNCTION check_permission() — FULL replacement
-- with Level 4 (Section 4, lines 270-321)
-- =============================================================================

CREATE OR REPLACE FUNCTION check_permission(
  p_user_id uuid,
  p_property_id uuid,
  p_category text,
  p_action text
)
RETURNS boolean AS $$
DECLARE
  v_role_id uuid;
  v_permissions jsonb;
BEGIN
  -- Level 0: platform admin bypasses everything
  IF (SELECT is_platform_admin FROM public.users WHERE id = p_user_id) THEN
    RETURN true;
  END IF;

  -- Level 1: org_admin bypasses property-level checks
  IF EXISTS (
    SELECT 1 FROM public.org_memberships om
    JOIN public.roles r ON r.id = om.role_id
    JOIN public.properties p ON p.org_id = om.org_id
    WHERE om.user_id = p_user_id AND p.id = p_property_id
      AND om.status = 'active' AND r.base_role = 'org_admin'
  ) THEN
    RETURN true;
  END IF;

  -- Levels 2-3: resolve effective role (property override or org inherited)
  v_role_id := resolve_property_role_id(p_user_id, p_property_id);

  -- Level 4: active temporary grant (only if no permanent role found)
  IF v_role_id IS NULL THEN
    SELECT tag.role_id INTO v_role_id
    FROM public.temporary_access_grants tag
    WHERE tag.user_id = p_user_id
      AND (tag.property_id = p_property_id OR tag.property_id IS NULL)
      AND tag.status = 'active'
      AND tag.valid_from <= now()
      AND tag.valid_until > now();
  END IF;

  IF v_role_id IS NULL THEN
    RETURN false;
  END IF;

  -- Look up permission from role's JSONB
  SELECT permissions INTO v_permissions FROM public.roles WHERE id = v_role_id;

  RETURN COALESCE((v_permissions -> p_category ->> p_action)::boolean, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- Step 8: CREATE OR REPLACE FUNCTION user_accessible_property_ids() — FULL
-- replacement with temp grants (Section 4, lines 326-361)
-- =============================================================================

CREATE OR REPLACE FUNCTION user_accessible_property_ids(p_user_id uuid)
RETURNS SETOF uuid AS $$
BEGIN
  -- Platform admins: all properties
  IF (SELECT is_platform_admin FROM public.users WHERE id = p_user_id) THEN
    RETURN QUERY SELECT id FROM public.properties WHERE deleted_at IS NULL;
    RETURN;
  END IF;

  -- Properties in orgs where user has active membership
  RETURN QUERY
  SELECT p.id FROM public.properties p
  JOIN public.org_memberships om ON om.org_id = p.org_id
  WHERE om.user_id = p_user_id AND om.status = 'active'
    AND p.deleted_at IS NULL

  UNION

  -- Properties with explicit property_membership
  SELECT pm.property_id FROM public.property_memberships pm
  JOIN public.properties p2 ON p2.id = pm.property_id
  WHERE pm.user_id = p_user_id AND p2.deleted_at IS NULL

  UNION

  -- Properties with active temporary grant
  SELECT tag.property_id FROM public.temporary_access_grants tag
  JOIN public.properties p3 ON p3.id = tag.property_id
  WHERE tag.user_id = p_user_id
    AND tag.status = 'active'
    AND tag.valid_from <= now()
    AND tag.valid_until > now()
    AND tag.property_id IS NOT NULL
    AND p3.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
