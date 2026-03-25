# Phase 4A: Tenant Resolution & Custom Domains — Design Spec

> **Date:** 2026-03-24
> **Phase:** 4A of 4 (IAM Northstar implementation)
> **Scope:** custom_domains table, tenant resolution middleware, PLATFORM_DOMAIN env var, middleware fixes
> **Approach:** Small migration + middleware rewrite
> **Prerequisite:** Phase 3 (`feature/phase3-access-grants-anon`)
> **Deployment target:** Vercel

---

## Context

Phases 1-3 delivered the complete multi-tenant data model: users, orgs, roles, org_memberships,
properties, property_memberships, permission resolution, configurable anonymous access, temporary
access grants, and full RLS rewrite with all legacy `users.role` artifacts removed.

Phase 4A adds the **tenant resolution layer** — the middleware that determines which org and
property a request is for based on the hostname and URL path. This is Step 0 of the permission
resolution hierarchy, running before any auth or access checks.

Phase 4B (Caddy On-Demand TLS, DNS verification, SSL management) is deferred until there's
a real need for custom domain automation.

### Phase roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Users, orgs, org_memberships, roles | Complete (PR #23) |
| 2 | Properties, property_memberships, permission resolution, config split, RLS rewrite | Complete (PR #24) |
| 3 | Access grants, anonymous access, property_access_config, legacy cleanup | Complete (PR #25) |
| **4A** | **Custom domains table, tenant resolution middleware** | **This spec** |
| 4B | Caddy On-Demand TLS, DNS verification, SSL management | Future |

### Design decisions made

- **Vercel deployment** — no Caddy integration needed; custom domains managed via Vercel dashboard/API
- **Default-org shortcut** — single-org deployments skip hostname lookup; full resolution when `PLATFORM_DOMAIN` is set
- **Token validation middleware deferred** — `property_access_config`-based anon access already works; token middleware comes with embed feature
- **Phase 4B deferred** — Caddy/DNS only when someone needs custom domain automation
- **SSL/Caddy columns included** in `custom_domains` table for future-proofing but not used

---

## Migration: `011_custom_domains.sql`

### Execution order

```
1. Create custom_domains table
2. Add primary_custom_domain_id column to properties
3. Add allowed_domain_id column to anonymous_access_tokens
4. Wire FKs (orgs.primary_custom_domain_id, properties, anonymous_access_tokens)
5. Enable RLS + policies for custom_domains
6. Add indexes
7. Add updated_at trigger
```

---

## Section 1: `custom_domains` Table

```sql
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
```

### Wire FKs on existing tables

```sql
-- orgs.primary_custom_domain_id (column exists from Phase 1, FK missing)
ALTER TABLE orgs ADD CONSTRAINT orgs_primary_custom_domain_fk
  FOREIGN KEY (primary_custom_domain_id) REFERENCES custom_domains(id) ON DELETE SET NULL;

-- properties.primary_custom_domain_id (new column)
ALTER TABLE properties ADD COLUMN primary_custom_domain_id uuid;
ALTER TABLE properties ADD CONSTRAINT properties_primary_custom_domain_fk
  FOREIGN KEY (primary_custom_domain_id) REFERENCES custom_domains(id) ON DELETE SET NULL;

-- anonymous_access_tokens.allowed_domain_id (new column)
ALTER TABLE anonymous_access_tokens ADD COLUMN allowed_domain_id uuid;
ALTER TABLE anonymous_access_tokens ADD CONSTRAINT anon_tokens_allowed_domain_fk
  FOREIGN KEY (allowed_domain_id) REFERENCES custom_domains(id) ON DELETE SET NULL;
```

---

## Section 2: RLS for `custom_domains`

```sql
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
```

The tenant resolution query (custom domain lookup by hostname) uses a service role client
in the middleware, bypassing RLS. No anonymous SELECT policy is needed.

---

## Section 3: Indexes

```sql
-- domain already has a unique index from the UNIQUE constraint (global uniqueness —
-- a domain can only appear once regardless of status). The partial index below
-- optimizes the hot-path lookup for active domains only.
CREATE INDEX idx_custom_domains_active ON custom_domains (domain)
  WHERE status = 'active';

-- Admin lookups
CREATE INDEX idx_custom_domains_org ON custom_domains (org_id, status);
CREATE INDEX idx_custom_domains_property ON custom_domains (property_id, status)
  WHERE property_id IS NOT NULL;
```

---

## Section 4: Trigger

```sql
CREATE TRIGGER custom_domains_updated_at
  BEFORE UPDATE ON custom_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## Section 5: Tenant Resolution Middleware

### Resolution hierarchy (Step 0)

Before any auth or permission check, the middleware resolves which org and property this
request is for. Four signals are checked in order:

```
Signal A: Custom domain (highest priority)
  Host = "app.willowcreeklandtrust.org"
  → SELECT FROM custom_domains WHERE domain = host AND status = 'active'
  → org_id + property_id (nullable)

Signal B: Platform subdomain
  Host = "willow-creek.platformdomain.com"
  → Parse subdomain → SELECT FROM orgs WHERE slug = subdomain
  → org_id, property = default

Signal C: Platform subdomain + property path
  Host = "willow-creek.platformdomain.com", path = "/meadow-preserve/..."
  → Org from subdomain, property from first path segment
  → SELECT FROM properties WHERE org_id = ? AND slug = path[0]

Signal D: Default org (no PLATFORM_DOMAIN, localhost, bare domain)
  → SELECT FROM orgs LIMIT 1 (single-org shortcut)
```

### Implementation: `src/lib/tenant/resolve.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TenantContext {
  orgId: string;
  orgSlug: string;
  propertyId: string | null;  // null = use org's default property
  propertySlug: string | null;
  source: 'custom_domain' | 'platform_subdomain' | 'default';
}

/**
 * Resolve tenant context from hostname and pathname.
 * IMPORTANT: The supabase client passed here MUST be a service-role client
 * (not anon key) because custom_domains has no anonymous SELECT policy.
 * The middleware creates the service-role client and passes it in.
 */
export async function resolveTenant(
  hostname: string,
  pathname: string,
  supabase: SupabaseClient
): Promise<TenantContext | null> {
  const platformDomain = process.env.PLATFORM_DOMAIN;

  // Signal A: Custom domain lookup
  if (platformDomain && !hostname.endsWith(platformDomain) && hostname !== 'localhost') {
    const { data: domain } = await supabase
      .from('custom_domains')
      .select('org_id, property_id, orgs!inner(slug, is_active), properties(slug, is_active, deleted_at)')
      .eq('domain', hostname)
      .eq('status', 'active')
      .eq('orgs.is_active', true)
      .single();

    if (domain) {
      // Skip if property is inactive or deleted
      const prop = (domain as any).properties;
      if (prop && (prop.is_active === false || prop.deleted_at !== null)) {
        return null;
      }
      return {
        orgId: domain.org_id,
        orgSlug: (domain as any).orgs?.slug,
        propertyId: domain.property_id,
        propertySlug: prop?.slug ?? null,
        source: 'custom_domain',
      };
    }
    return null; // unknown domain → 404
  }

  // Signal B/C: Platform subdomain (+ optional property path)
  if (platformDomain && hostname.endsWith(platformDomain)) {
    const subdomain = hostname.replace(`.${platformDomain}`, '');
    if (subdomain && subdomain !== hostname) {
      const { data: org } = await supabase
        .from('orgs')
        .select('id, slug, default_property_id')
        .eq('slug', subdomain)
        .eq('is_active', true)
        .single();

      if (!org) return null; // unknown subdomain → 404

      // Check if first path segment is a property slug
      const pathSegments = pathname.split('/').filter(Boolean);
      let propertyId = org.default_property_id;
      let propertySlug: string | null = null;

      if (pathSegments.length > 0) {
        const { data: property } = await supabase
          .from('properties')
          .select('id, slug')
          .eq('org_id', org.id)
          .eq('slug', pathSegments[0])
          .eq('is_active', true)
          .is('deleted_at', null)
          .maybeSingle();

        if (property) {
          propertyId = property.id;
          propertySlug = property.slug;
        }
      }

      return {
        orgId: org.id,
        orgSlug: org.slug,
        propertyId,
        propertySlug,
        source: 'platform_subdomain',
      };
    }
  }

  // Signal D: Default org shortcut (single-org, localhost, no PLATFORM_DOMAIN)
  const { data: org } = await supabase
    .from('orgs')
    .select('id, slug, default_property_id')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!org) return null;

  return {
    orgId: org.id,
    orgSlug: org.slug,
    propertyId: org.default_property_id,
    propertySlug: null,
    source: 'default',
  };
}
```

### Server-side access: `src/lib/tenant/server.ts`

```typescript
import { headers } from 'next/headers';

export async function getTenantContext() {
  const h = await headers();  // async in Next.js 15+
  return {
    orgId: h.get('x-org-id')!,
    orgSlug: h.get('x-org-slug')!,
    propertyId: h.get('x-property-id'),
    propertySlug: h.get('x-property-slug'),
  };
}
```

---

## Section 6: Middleware Update

### Changes to `src/lib/supabase/middleware.ts`

The middleware needs three changes:

**1. Add tenant resolution (Step 0) at the top, after creating the Supabase client:**

A separate service-role client is needed because `custom_domains` has no anonymous
SELECT policy. The service-role client bypasses RLS for the domain lookup only.

```typescript
import { createClient } from '@supabase/supabase-js';

// Service-role client for tenant resolution (bypasses RLS)
const tenantClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const hostname = request.headers.get('host') ?? 'localhost';
const tenant = await resolveTenant(hostname, pathname, tenantClient);

if (!tenant) {
  const url = request.nextUrl.clone();
  url.pathname = '/not-found';
  return NextResponse.rewrite(url);
}

// Inject tenant context as headers for server components
supabaseResponse.headers.set('x-org-id', tenant.orgId);
supabaseResponse.headers.set('x-org-slug', tenant.orgSlug);
if (tenant.propertyId) supabaseResponse.headers.set('x-property-id', tenant.propertyId);
if (tenant.propertySlug) supabaseResponse.headers.set('x-property-slug', tenant.propertySlug);
```

**2. Fix setup_complete bug (lines 66-72):**

The middleware currently reads `site_config` for setup_complete. Since Phase 2 dropped
`site_config`, this must read from `orgs`:

```typescript
// Before (broken — site_config dropped in Phase 2)
const { data } = await supabase.from('site_config').select('value').eq('key', 'setup_complete').single();
const setupComplete = data?.value === true;

// After
const { data } = await supabase.from('orgs').select('setup_complete').eq('id', tenant.orgId).single();
const setupComplete = data?.setup_complete === true;
```

**3. Use tenant context for org-scoped queries:**

The middleware's admin check (lines 156-163) currently queries `org_memberships` without
org scoping. With tenant context available, it can scope to the current org:

```typescript
const { data } = await supabase
  .from('org_memberships')
  .select('id, roles!inner(base_role)')
  .eq('user_id', user.id)
  .eq('org_id', tenant.orgId)  // NEW — scope to current org
  .eq('status', 'active')
  .eq('roles.base_role', 'org_admin')
  .limit(1);
```

---

## Section 7: TypeScript Changes

### New types in `src/lib/types.ts`

```typescript
export type CustomDomainStatus = 'pending' | 'verifying' | 'active' | 'failed' | 'disabled';
export type SslStatus = 'pending' | 'issuing' | 'active' | 'failed' | 'expiring_soon';
export type DomainType = 'subdomain' | 'apex';

export interface CustomDomain {
  id: string;
  org_id: string;
  property_id: string | null;
  domain: string;
  status: CustomDomainStatus;
  verification_token: string | null;
  verified_at: string | null;
  last_checked_at: string | null;
  ssl_status: SslStatus;
  ssl_expires_at: string | null;
  caddy_last_issued: string | null;
  domain_type: DomainType;
  is_primary: boolean;
  redirect_to_domain_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
```

### Updated existing types

- `Property`: add `primary_custom_domain_id: string | null`
- `AnonymousAccessToken`: add `allowed_domain_id: string | null`

### Database interface

Add `custom_domains` to `Database.public.Tables`.

### New files

| File | Purpose |
|------|---------|
| `src/lib/tenant/resolve.ts` | `resolveTenant()` — hostname → org/property context |
| `src/lib/tenant/server.ts` | `getTenantContext()` — read headers in server components |
| `src/lib/tenant/__tests__/resolve.test.ts` | Tests for tenant resolution logic |
| `src/lib/__tests__/phase4a-types.test.ts` | Type tests for CustomDomain |

### Env var

Add `PLATFORM_DOMAIN=` to `.env.example` with documentation comment.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Tenant resolution adds latency to every request | Default-org shortcut skips hostname lookup for single-org deployments. Custom domain lookup uses partial unique index on active domains. |
| Request headers can be spoofed | Tenant headers are set by the middleware (server-side), not client. Client cannot forge `x-org-id`. |
| `site_config` bug crashes middleware in production | Fixed in this phase. Should be deployed alongside or after Phase 2 migration. |
| Custom domains table has Caddy/SSL columns not yet used | Columns are nullable with defaults. No operational burden. Future-proofing only. |
| Vercel doesn't support wildcard subdomains on custom domains | Platform subdomains (slug.platform.com) work with Vercel's wildcard domain feature. Custom domains need manual Vercel dashboard config. |

---

## What This Phase Does NOT Touch

| Concern | Deferred to |
|---------|-------------|
| Caddy On-Demand TLS | Phase 4B |
| DNS verification polling job | Phase 4B |
| Ask endpoint for Caddy | Phase 4B |
| Domain verification automation | Phase 4B |
| Anonymous token validation middleware | Future (embed feature) |
| Admin UI for domain management | Future |
| Org switcher / property selector UI | Future |
| Vercel API integration for domain automation | Future |

---

## Northstar Test Scenario Coverage (Final — All Phases)

| Scenario | Coverage |
|----------|---------|
| A. Multi-org consultant | **Fully supported.** Tenant resolution routes to correct org. Org switcher UI deferred. |
| B. Property-scoped volunteer | **Fully supported.** Property from URL path or default. |
| C. Day-of volunteer event | **Fully supported.** Temporary access grants with auto-expiration. |
| D. Public trail map | **Fully supported.** property_access_config controls anon visibility. |
| E. Password-protected property | **Fully supported.** property_access_config.password_protected + hash. |
| F. Embedded public map | **Data model complete.** custom_domains + anonymous_access_tokens + property_access_config + allow_embed. Caddy/SSL deferred to 4B. Token middleware deferred to embed feature. |
