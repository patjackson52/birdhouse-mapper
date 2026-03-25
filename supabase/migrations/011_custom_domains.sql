-- Phase 4A: Custom Domains & Tenant Resolution
-- Migration: 011_custom_domains.sql

-- =============================================================================
-- Step 1: Create custom_domains table
-- =============================================================================

CREATE TABLE custom_domains (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  property_id         uuid REFERENCES properties(id) ON DELETE CASCADE,
  -- null property_id = org-level domain
  -- non-null = property-specific domain

  domain              text NOT NULL UNIQUE,

  -- Verification
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'verifying', 'active', 'failed', 'disabled')),
  verification_token  text,
  verified_at         timestamptz,
  last_checked_at     timestamptz,

  -- Caddy / SSL state (Phase 4B — stored but not used yet)
  ssl_status          text NOT NULL DEFAULT 'pending'
                      CHECK (ssl_status IN ('pending', 'issuing', 'active', 'failed', 'expiring_soon')),
  ssl_expires_at      timestamptz,
  caddy_last_issued   timestamptz,

  -- Domain type
  domain_type         text NOT NULL DEFAULT 'subdomain'
                      CHECK (domain_type IN ('subdomain', 'apex')),

  -- Redirect config
  is_primary          boolean NOT NULL DEFAULT true,
  redirect_to_domain_id uuid REFERENCES custom_domains(id),

  -- Metadata
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT no_self_redirect CHECK (id != redirect_to_domain_id)
);

-- =============================================================================
-- Step 2: Add primary_custom_domain_id to properties
-- =============================================================================

ALTER TABLE properties ADD COLUMN primary_custom_domain_id uuid;

-- =============================================================================
-- Step 3: Add allowed_domain_id to anonymous_access_tokens
-- =============================================================================

ALTER TABLE anonymous_access_tokens ADD COLUMN allowed_domain_id uuid;

-- =============================================================================
-- Step 4: Wire foreign keys on existing tables
-- =============================================================================

-- orgs.primary_custom_domain_id (column exists from Phase 1, FK missing)
ALTER TABLE orgs ADD CONSTRAINT orgs_primary_custom_domain_fk
  FOREIGN KEY (primary_custom_domain_id) REFERENCES custom_domains(id) ON DELETE SET NULL;

-- properties.primary_custom_domain_id FK
ALTER TABLE properties ADD CONSTRAINT properties_primary_custom_domain_fk
  FOREIGN KEY (primary_custom_domain_id) REFERENCES custom_domains(id) ON DELETE SET NULL;

-- anonymous_access_tokens.allowed_domain_id FK
ALTER TABLE anonymous_access_tokens ADD CONSTRAINT anon_tokens_allowed_domain_fk
  FOREIGN KEY (allowed_domain_id) REFERENCES custom_domains(id) ON DELETE SET NULL;

-- =============================================================================
-- Step 5: RLS + policies for custom_domains
-- =============================================================================

ALTER TABLE custom_domains ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's domains
CREATE POLICY "custom_domains_org_read" ON custom_domains FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

-- Org admins can manage domains
CREATE POLICY "custom_domains_admin_manage" ON custom_domains FOR ALL
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

-- Platform admin full access
CREATE POLICY "custom_domains_platform_admin" ON custom_domains FOR ALL
  TO authenticated
  USING (is_platform_admin());

-- =============================================================================
-- Step 6: Indexes
-- =============================================================================

-- domain already has a unique index from the UNIQUE constraint (global uniqueness —
-- a domain can only appear once regardless of status). The partial index below
-- optimizes the hot-path lookup for active domains only.
CREATE INDEX idx_custom_domains_active ON custom_domains (domain)
  WHERE status = 'active';

-- Admin lookups
CREATE INDEX idx_custom_domains_org ON custom_domains (org_id, status);
CREATE INDEX idx_custom_domains_property ON custom_domains (property_id, status)
  WHERE property_id IS NOT NULL;

-- =============================================================================
-- Step 7: updated_at trigger
-- =============================================================================

CREATE TRIGGER custom_domains_updated_at
  BEFORE UPDATE ON custom_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
