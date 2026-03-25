# Phase 4A: Tenant Resolution & Custom Domains — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `custom_domains` table, tenant resolution middleware (Step 0 — resolve org/property from hostname), and fix the middleware `site_config` bug.

**Architecture:** Small SQL migration (`011_custom_domains.sql`) with one new table and two new columns on existing tables. Tenant resolution utility resolves hostname → org/property context using 4 signals. Middleware injects tenant context as headers for server components.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, Next.js, Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-phase4a-tenant-resolution-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/011_custom_domains.sql` | Table, FKs, RLS, indexes, trigger |
| Create | `src/lib/tenant/resolve.ts` | `resolveTenant()` — hostname → TenantContext |
| Create | `src/lib/tenant/server.ts` | `getTenantContext()` — read headers in server components |
| Create | `src/lib/tenant/__tests__/resolve.test.ts` | Tests for tenant resolution |
| Create | `src/lib/__tests__/phase4a-types.test.ts` | Type tests for CustomDomain |
| Modify | `src/lib/types.ts` | Add CustomDomain type, update Property + AnonymousAccessToken |
| Modify | `src/lib/supabase/middleware.ts` | Add tenant resolution, fix setup_complete, scope admin check |
| Modify | `.env.example` | Add PLATFORM_DOMAIN |

---

## Task 1: Migration file

**Files:**
- Create: `supabase/migrations/011_custom_domains.sql`

- [ ] **Step 1: Create migration file with all 7 steps**

Read the spec at `docs/superpowers/specs/2026-03-24-phase4a-tenant-resolution-design.md` and create the migration with:

1. `CREATE TABLE custom_domains` — copy from spec Section 1 (lines 68-108)
2. `ALTER TABLE properties ADD COLUMN primary_custom_domain_id` + FK (spec lines 118-120)
3. `ALTER TABLE anonymous_access_tokens ADD COLUMN allowed_domain_id` + FK (spec lines 123-125)
4. Wire `orgs.primary_custom_domain_id` FK (spec lines 113-115). The column already exists from Phase 1.
5. Enable RLS + create 3 policies on `custom_domains` (spec Section 2, lines 130-148)
6. Create indexes (spec Section 3, lines 152-160). Note: `domain` already has a UNIQUE constraint; the partial index on `WHERE status = 'active'` is for lookup optimization only (not UNIQUE).
7. Create `updated_at` trigger (spec Section 4, lines 164-166)

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/011_custom_domains.sql
git commit -m "feat(migration): Phase 4A custom_domains table with RLS and indexes"
```

---

## Task 2: TypeScript types (TDD)

**Files:**
- Create: `src/lib/__tests__/phase4a-types.test.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Write failing type tests**

Create `src/lib/__tests__/phase4a-types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type {
  CustomDomain,
  CustomDomainStatus,
  SslStatus,
  DomainType,
  Property,
  AnonymousAccessToken,
  Database,
} from '../types';

describe('Phase 4A types', () => {
  describe('CustomDomain', () => {
    it('has required fields', () => {
      const cd: CustomDomain = {
        id: 'test', org_id: 'org-1', property_id: null,
        domain: 'app.example.com', status: 'active',
        verification_token: null, verified_at: null, last_checked_at: null,
        ssl_status: 'pending', ssl_expires_at: null, caddy_last_issued: null,
        domain_type: 'subdomain', is_primary: true,
        redirect_to_domain_id: null, created_by: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      };
      expect(cd.domain).toBe('app.example.com');
      expect(cd.property_id).toBeNull();
    });

    it('rejects invalid status at compile time', () => {
      // @ts-expect-error - 'unknown' is not valid
      const _bad: CustomDomainStatus = 'unknown';
    });

    it('rejects invalid ssl_status at compile time', () => {
      // @ts-expect-error - 'expired' is not valid
      const _bad: SslStatus = 'expired';
    });

    it('rejects invalid domain_type at compile time', () => {
      // @ts-expect-error - 'cname' is not valid
      const _bad: DomainType = 'cname';
    });
  });

  describe('Updated types', () => {
    it('Property has primary_custom_domain_id', () => {
      const p = {} as Property;
      const _id: string | null = p.primary_custom_domain_id;
      expect(true).toBe(true);
    });

    it('AnonymousAccessToken has allowed_domain_id', () => {
      const t = {} as AnonymousAccessToken;
      const _id: string | null = t.allowed_domain_id;
      expect(true).toBe(true);
    });
  });

  describe('Database interface', () => {
    it('includes custom_domains table', () => {
      type Row = Database['public']['Tables']['custom_domains']['Row'];
      const _check: Row extends CustomDomain ? true : never = true;
      expect(_check).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/__tests__/phase4a-types.test.ts`

Expected: FAIL

- [ ] **Step 3: Add types**

In `src/lib/types.ts`:
- Add `CustomDomainStatus`, `SslStatus`, `DomainType` union types and `CustomDomain` interface (spec Section 7, lines 379-402)
- Add `primary_custom_domain_id: string | null` to `Property` interface
- Add `allowed_domain_id: string | null` to `AnonymousAccessToken` interface
- Add `custom_domains` to `Database.public.Tables`

- [ ] **Step 4: Run tests to verify pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/__tests__/phase4a-types.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/__tests__/phase4a-types.test.ts src/lib/types.ts
git commit -m "feat: add CustomDomain type, update Property and AnonymousAccessToken"
```

---

## Task 3: Tenant resolution utility (TDD)

**Files:**
- Create: `src/lib/tenant/resolve.ts`
- Create: `src/lib/tenant/server.ts`
- Create: `src/lib/tenant/__tests__/resolve.test.ts`

- [ ] **Step 1: Write tests**

Create `src/lib/tenant/__tests__/resolve.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveTenant, type TenantContext } from '../resolve';

// Mock Supabase client
function createMockClient(responses: Record<string, any>) {
  const mockChain: any = {};
  const methods = ['from', 'select', 'eq', 'is', 'order', 'limit', 'single', 'maybeSingle'];

  methods.forEach(method => {
    mockChain[method] = vi.fn().mockReturnValue(mockChain);
  });

  // Override 'from' to track table name
  let currentTable = '';
  mockChain.from = vi.fn((table: string) => {
    currentTable = table;
    return mockChain;
  });

  // Override terminal methods to return data
  mockChain.single = vi.fn().mockImplementation(() => {
    const data = responses[currentTable];
    return Promise.resolve({ data, error: data ? null : { message: 'not found' } });
  });
  mockChain.maybeSingle = vi.fn().mockImplementation(() => {
    const data = responses[`${currentTable}_maybe`] ?? null;
    return Promise.resolve({ data, error: null });
  });

  return mockChain;
}

describe('resolveTenant', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('returns default org when PLATFORM_DOMAIN is not set', async () => {
    delete process.env.PLATFORM_DOMAIN;
    const client = createMockClient({
      orgs: { id: 'org-1', slug: 'default', default_property_id: 'prop-1' },
    });

    const result = await resolveTenant('localhost', '/', client);

    expect(result).toEqual({
      orgId: 'org-1',
      orgSlug: 'default',
      propertyId: 'prop-1',
      propertySlug: null,
      source: 'default',
    });
  });

  it('returns null for unknown custom domain', async () => {
    process.env.PLATFORM_DOMAIN = 'myplatform.com';
    const client = createMockClient({
      custom_domains: null,
    });

    const result = await resolveTenant('unknown.example.com', '/', client);
    expect(result).toBeNull();
  });

  it('resolves custom domain to org', async () => {
    process.env.PLATFORM_DOMAIN = 'myplatform.com';
    const client = createMockClient({
      custom_domains: {
        org_id: 'org-1', property_id: null,
        orgs: { slug: 'willow-creek' },
        properties: null,
      },
    });

    const result = await resolveTenant('app.willowcreek.org', '/', client);

    expect(result?.source).toBe('custom_domain');
    expect(result?.orgId).toBe('org-1');
    expect(result?.propertyId).toBeNull();
  });

  it('resolves platform subdomain', async () => {
    process.env.PLATFORM_DOMAIN = 'myplatform.com';
    const client = createMockClient({
      orgs: { id: 'org-1', slug: 'willow-creek', default_property_id: 'prop-1' },
      properties_maybe: null,
    });

    const result = await resolveTenant('willow-creek.myplatform.com', '/map', client);

    expect(result?.source).toBe('platform_subdomain');
    expect(result?.orgSlug).toBe('willow-creek');
  });

  it('returns default org for localhost', async () => {
    process.env.PLATFORM_DOMAIN = 'myplatform.com';
    const client = createMockClient({
      orgs: { id: 'org-1', slug: 'default', default_property_id: 'prop-1' },
    });

    const result = await resolveTenant('localhost', '/', client);
    expect(result?.source).toBe('default');
  });
});
```

- [ ] **Step 2: Create resolve.ts**

Create `src/lib/tenant/resolve.ts` with the `TenantContext` interface and `resolveTenant()` function from spec Section 5 (lines 193-298).

- [ ] **Step 3: Create server.ts**

Create `src/lib/tenant/server.ts` with the `getTenantContext()` function from spec Section 5 (lines 306-316). Note: uses `await headers()` (async, Next.js 15+).

- [ ] **Step 4: Run tests**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/tenant/__tests__/resolve.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenant/
git commit -m "feat: add tenant resolution utility with tests"
```

---

## Task 4: Update middleware

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

This task makes 3 changes to the middleware. Read the file first.

- [ ] **Step 1: Add tenant resolution at the top**

After creating the Supabase client (around line 30), add:

```typescript
import { createClient } from '@supabase/supabase-js';
import { resolveTenant } from '@/lib/tenant/resolve';

// Inside updateSession(), after the supabase client creation:

// Service-role client for tenant resolution (bypasses RLS on custom_domains)
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

This should go BEFORE the QR code redirect handler and setup check.

- [ ] **Step 2: Fix setup_complete bug**

Find the `site_config` query (around lines 66-72):

```typescript
// Before (broken — site_config was dropped in Phase 2)
const { data } = await supabase
  .from('site_config')
  .select('value')
  .eq('key', 'setup_complete')
  .single();
const setupComplete = data?.value === true;

// After
const { data } = await supabase
  .from('orgs')
  .select('setup_complete')
  .eq('id', tenant.orgId)
  .single();
const setupComplete = data?.setup_complete === true;
```

- [ ] **Step 3: Scope admin check to current org**

Find the org_memberships query for admin check (around lines 156-163). Add `.eq('org_id', tenant.orgId)`:

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

- [ ] **Step 4: Run all tests**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "feat: add tenant resolution to middleware, fix setup_complete, scope admin check"
```

---

## Task 5: Env var and final verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add PLATFORM_DOMAIN to .env.example**

Add to `.env.example`:

```
# Platform domain for subdomain-based tenant resolution
# e.g., "myplatform.com" — tenants access via slug.myplatform.com
# Leave empty for single-tenant mode (default org used)
PLATFORM_DOMAIN=
```

- [ ] **Step 2: Run all tests**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run`

Expected: All tests pass.

- [ ] **Step 3: Run TypeScript check**

Run: `cd /Users/patrick/birdhousemapper && npx tsc --noEmit`

Expected: No new type errors.

- [ ] **Step 4: Review migration file**

Read `supabase/migrations/011_custom_domains.sql` end-to-end. Verify all 7 steps present.

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "docs: add PLATFORM_DOMAIN to .env.example"
```

---

## Post-Implementation Notes

### How to verify after applying

1. Check custom_domains table exists: `SELECT * FROM custom_domains;` (empty — no domains yet)
2. Verify tenant resolution works: app should load normally on localhost (Signal D default)
3. Verify setup_complete reads from orgs: no more `site_config` error in middleware
4. Test admin route guarding: admin check now scoped to current org

### What comes next

- **Phase 4B (future):** Caddy On-Demand TLS, DNS verification polling, ask endpoint, SSL management
- **Admin UI:** Domain management, property access config management, temporary grant management
- **Embed feature:** Anonymous token validation middleware, embed endpoints
- **Org switcher UI:** Frontend for switching between orgs/properties
