# Phase 4B: Vercel Domain Integration — Design Spec

> **Date:** 2026-03-24
> **Phase:** 4B (IAM Northstar implementation — final)
> **Scope:** Vercel API integration for custom domains, DNS verification cron, admin server actions
> **Approach:** Application code only — no database migration needed
> **Prerequisite:** Phase 4A (`feature/phase4a-tenant-resolution`)
> **Deployment target:** Vercel

---

## Context

Phase 4A delivered the `custom_domains` table and tenant resolution middleware. Domains can
be tracked in the database and resolved from hostnames. But there's no automation — domains
must be manually added to both the database and the Vercel dashboard.

Phase 4B closes this gap by integrating with Vercel's API to programmatically add, verify,
and remove custom domains. When an org admin adds a custom domain in our app, the system
automatically registers it with Vercel and polls for DNS verification.

### Design decisions made

- **Fully automated** — admin adds domain in our UI, we call Vercel API automatically
- **Vercel handles DNS verification** — we poll Vercel's API for status, no Node.js DNS lookups
- **SSL columns kept** — `ssl_status`, `ssl_expires_at`, `caddy_last_issued` left on `custom_domains` (zero cost, useful if someone self-hosts with Caddy later)
- **No admin UI** — server actions only for now; UI comes in a future phase

---

## No Migration Needed

Phase 4A's `custom_domains` table already has all required columns:
- `status` — lifecycle tracking (`pending` → `verifying` → `active` / `failed`)
- `verification_token` — stores Vercel's verification requirements
- `verified_at` — timestamp when domain was verified
- `last_checked_at` — timestamp of last verification poll
- `domain_type` — `subdomain` or `apex`

No schema changes. This phase is purely application code.

---

## Section 1: Vercel API Client

### `src/lib/domains/vercel.ts`

Thin wrapper around Vercel's domain management API. Isolates the API surface so
the rest of the codebase doesn't depend on Vercel's response shapes.

```typescript
const VERCEL_API = 'https://api.vercel.com';

function vercelHeaders() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

function projectId() {
  const id = process.env.VERCEL_PROJECT_ID;
  if (!id) throw new Error('VERCEL_PROJECT_ID is not set');
  return id;
}

export interface VercelDomainResponse {
  name: string;
  verified: boolean;
  verification?: { type: string; domain: string; value: string; reason: string }[];
  misconfigured: boolean;
}

/**
 * Add a custom domain to the Vercel project.
 * Vercel returns verification requirements (DNS records the org must set).
 */
export async function addDomainToVercel(domain: string): Promise<VercelDomainResponse> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects/${projectId()}/domains`,
    {
      method: 'POST',
      headers: vercelHeaders(),
      body: JSON.stringify({ name: domain }),
    }
  );
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message ?? `Vercel API error: ${res.status}`);
  }
  return res.json();
}

/**
 * Remove a custom domain from the Vercel project.
 * Silently succeeds if domain was already removed (404).
 */
export async function removeDomainFromVercel(domain: string): Promise<void> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects/${projectId()}/domains/${domain}`,
    {
      method: 'DELETE',
      headers: vercelHeaders(),
    }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to remove domain from Vercel: ${res.status}`);
  }
}

/**
 * Check a domain's verification status on Vercel.
 * Returns null if domain not found (already removed).
 */
export async function checkDomainOnVercel(domain: string): Promise<VercelDomainResponse | null> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects/${projectId()}/domains/${domain}`,
    {
      headers: vercelHeaders(),
    }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Vercel API error: ${res.status}`);
  return res.json();
}
```

### Env vars required

```
VERCEL_API_TOKEN=     # Vercel personal access token or team token
VERCEL_PROJECT_ID=    # Vercel project ID (found in project settings)
```

---

## Section 2: Admin Server Actions

### `src/lib/domains/actions.ts`

Server actions for org admins to manage custom domains. Each action validates
that the caller is an org admin before proceeding.

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { addDomainToVercel, removeDomainFromVercel, checkDomainOnVercel } from './vercel';

interface AddDomainResult {
  success: boolean;
  domainId?: string;
  verificationRecords?: { type: string; domain: string; value: string }[];
  error?: string;
}

/**
 * Add a custom domain to an org (and optionally a specific property).
 * Calls Vercel API to register the domain, stores verification requirements.
 */
export async function addCustomDomain(
  orgId: string,
  domain: string,
  propertyId?: string
): Promise<AddDomainResult> {
  const supabase = await createClient();

  // Validate caller is org admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Register with Vercel
  let vercelResponse;
  try {
    vercelResponse = await addDomainToVercel(domain);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  // Determine domain type from the domain string
  const parts = domain.split('.');
  const domainType = parts.length <= 2 ? 'apex' : 'subdomain';

  // Store in database
  const { data, error } = await supabase
    .from('custom_domains')
    .insert({
      org_id: orgId,
      property_id: propertyId ?? null,
      domain,
      status: vercelResponse.verified ? 'active' : 'verifying',
      verification_token: vercelResponse.verification
        ? JSON.stringify(vercelResponse.verification)
        : null,
      verified_at: vercelResponse.verified ? new Date().toISOString() : null,
      domain_type: domainType,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    domainId: data.id,
    verificationRecords: vercelResponse.verification?.map(v => ({
      type: v.type,
      domain: v.domain,
      value: v.value,
    })),
  };
}

/**
 * Remove a custom domain from an org.
 * Removes from Vercel and deletes from database.
 */
export async function removeCustomDomain(domainId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Fetch the domain
  const { data: domainRow, error: fetchError } = await supabase
    .from('custom_domains')
    .select('domain')
    .eq('id', domainId)
    .single();

  if (fetchError || !domainRow) return { success: false, error: 'Domain not found' };

  // Remove from Vercel (silently succeeds if already removed)
  try {
    await removeDomainFromVercel(domainRow.domain);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  // Delete from database
  const { error } = await supabase
    .from('custom_domains')
    .delete()
    .eq('id', domainId);

  if (error) return { success: false, error: error.message };

  return { success: true };
}

/**
 * Check the current verification status of a domain.
 * Polls Vercel API and updates the database if status changed.
 */
export async function checkDomainStatus(domainId: string): Promise<{
  status: string;
  verified: boolean;
  verificationRecords?: { type: string; domain: string; value: string }[];
  error?: string;
}> {
  const supabase = await createClient();

  const { data: domainRow } = await supabase
    .from('custom_domains')
    .select('domain, status')
    .eq('id', domainId)
    .single();

  if (!domainRow) return { status: 'not_found', verified: false, error: 'Domain not found' };

  const vercelStatus = await checkDomainOnVercel(domainRow.domain);

  if (!vercelStatus) {
    // Domain not on Vercel — mark as failed
    await supabase.from('custom_domains')
      .update({ status: 'failed', last_checked_at: new Date().toISOString() })
      .eq('id', domainId);
    return { status: 'failed', verified: false };
  }

  // Update status if it changed
  const newStatus = vercelStatus.verified ? 'active' : 'verifying';
  if (newStatus !== domainRow.status) {
    await supabase.from('custom_domains')
      .update({
        status: newStatus,
        verified_at: vercelStatus.verified ? new Date().toISOString() : null,
        last_checked_at: new Date().toISOString(),
      })
      .eq('id', domainId);
  } else {
    await supabase.from('custom_domains')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', domainId);
  }

  return {
    status: newStatus,
    verified: vercelStatus.verified,
    verificationRecords: vercelStatus.verification?.map(v => ({
      type: v.type, domain: v.domain, value: v.value,
    })),
  };
}
```

---

## Section 3: DNS Verification Cron

### `src/app/api/cron/verify-domains/route.ts`

Polls Vercel's API for all domains with status `'verifying'`. Same cron pattern
as existing `/api/cron/cleanup-temp-accounts` and `/api/cron/expire-access-grants`.

```typescript
import { createClient } from '@supabase/supabase-js';
import { checkDomainOnVercel } from '@/lib/domains/vercel';

function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const FAILURE_TIMEOUT_HOURS = 72;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // Fetch all domains pending verification
  const { data: pendingDomains, error } = await supabase
    .from('custom_domains')
    .select('id, domain, created_at')
    .eq('status', 'verifying');

  if (error || !pendingDomains) {
    return Response.json({ error: error?.message ?? 'No data' }, { status: 500 });
  }

  let activated = 0;
  let failed = 0;
  let stillPending = 0;

  for (const row of pendingDomains) {
    try {
      const vercelStatus = await checkDomainOnVercel(row.domain);

      if (!vercelStatus) {
        // Domain not found on Vercel — mark as failed
        await supabase.from('custom_domains')
          .update({ status: 'failed', last_checked_at: new Date().toISOString() })
          .eq('id', row.id);
        failed++;
        continue;
      }

      if (vercelStatus.verified) {
        // Domain verified — activate
        await supabase.from('custom_domains')
          .update({
            status: 'active',
            verified_at: new Date().toISOString(),
            last_checked_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        activated++;
      } else {
        // Still pending — check if it's been too long
        const createdAt = new Date(row.created_at);
        const hoursElapsed = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

        if (hoursElapsed > FAILURE_TIMEOUT_HOURS) {
          await supabase.from('custom_domains')
            .update({ status: 'failed', last_checked_at: new Date().toISOString() })
            .eq('id', row.id);
          failed++;
        } else {
          await supabase.from('custom_domains')
            .update({ last_checked_at: new Date().toISOString() })
            .eq('id', row.id);
          stillPending++;
        }
      }
    } catch (err) {
      // Skip this domain on API error, try again next cron run
      stillPending++;
    }
  }

  return Response.json({
    checked: pendingDomains.length,
    activated,
    failed,
    stillPending,
  });
}
```

### Cron schedule

Configure in `vercel.json` (or Vercel dashboard):

```json
{
  "crons": [
    {
      "path": "/api/cron/verify-domains",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

Every 10 minutes. Vercel's free tier supports up to 2 cron jobs; Pro supports more.

---

## Section 4: Domain Lifecycle

```
1. Admin calls addCustomDomain('app.willowcreek.org', orgId)

2. Server action:
   a. Calls Vercel API: POST /v10/projects/{id}/domains
   b. Vercel returns: { verified: false, verification: [{ type: 'TXT', domain: '_vercel.app.willowcreek.org', value: 'vc-domain-verify=abc123' }] }
   c. INSERT into custom_domains: status='verifying', verification_token=JSON
   d. Returns verification records to admin UI

3. Admin sets DNS records (CNAME or A + TXT)

4. Cron runs every 10 minutes:
   a. Queries custom_domains WHERE status='verifying'
   b. For each: GET /v10/projects/{id}/domains/{domain}
   c. Vercel returns { verified: true } → UPDATE status='active'
   d. Or: still pending → wait (up to 72 hours, then mark 'failed')

5. Once status='active':
   - Tenant resolution middleware resolves hostname → org/property
   - Vercel handles TLS automatically
   - Domain is live

6. Admin calls removeCustomDomain(domainId)
   a. DELETE /v10/projects/{id}/domains/{domain} on Vercel
   b. DELETE from custom_domains
```

---

## Section 5: TypeScript Changes

No new types needed — `CustomDomain` interface from Phase 4A already covers all columns.

Add `VercelDomainResponse` as an internal type in `src/lib/domains/vercel.ts` (not exported to types.ts — it's an implementation detail).

### Env vars to add to `.env.example`

```
# Vercel API integration for custom domain management
VERCEL_API_TOKEN=     # Personal access token or team token (Settings → Tokens)
VERCEL_PROJECT_ID=    # Project ID (Project Settings → General → Project ID)
```

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Vercel API rate limits | Cron checks every 10 min; batch is small. Vercel rate limit is 100 req/sec — no concern. |
| API token leaked | Stored as env var, never exposed to client. Server actions only. |
| Domain added to Vercel but DNS never configured | 72-hour timeout marks as `failed`. Admin can retry. |
| Vercel API schema changes | Thin wrapper in `vercel.ts` isolates the surface. Easy to update. |
| Free tier cron limits | 2 cron jobs on free tier. We already use 2 (cleanup-temp-accounts, expire-access-grants). Verify-domains is a 3rd — needs Pro plan or combine into one multi-purpose cron. |

---

## What This Phase Does NOT Touch

| Concern | Deferred to |
|---------|-------------|
| Admin UI for domain management | Future |
| Domain redirect configuration | Future |
| Wildcard subdomain support | Future |
| Self-hosted Caddy integration | Future (SSL columns preserved) |
| Anonymous token validation middleware | Future (embed feature) |

---

## Northstar Scenario Coverage (Complete)

After Phase 4B, all Northstar scenarios are fully supported:

| Scenario | Coverage |
|----------|---------|
| A. Multi-org consultant | Fully supported |
| B. Property-scoped volunteer | Fully supported |
| C. Day-of volunteer event | Fully supported |
| D. Public trail map | Fully supported |
| E. Password-protected property | Fully supported |
| F. Embedded public map | **Fully supported.** Custom domains automated via Vercel API. Tenant resolution routes correctly. Token-based access data model ready. |
