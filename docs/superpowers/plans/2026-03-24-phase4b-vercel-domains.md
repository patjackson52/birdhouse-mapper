# Phase 4B: Vercel Domain Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate custom domain management via Vercel's API — add, verify, and remove domains programmatically when org admins configure them.

**Architecture:** No database migration. Three new modules: Vercel API client (`vercel.ts`), admin server actions (`actions.ts`), and a DNS verification cron endpoint. The existing `custom_domains` table from Phase 4A stores all state.

**Tech Stack:** TypeScript, Next.js server actions, Vercel API, Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-phase4b-vercel-domains-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/domains/vercel.ts` | Vercel API client (add/remove/check domain) |
| Create | `src/lib/domains/actions.ts` | Server actions (addCustomDomain, removeCustomDomain, checkDomainStatus) |
| Create | `src/lib/domains/__tests__/vercel.test.ts` | Tests for Vercel API client |
| Create | `src/app/api/cron/verify-domains/route.ts` | Cron endpoint — polls Vercel for pending domains |
| Modify | `.env.example` | Add VERCEL_API_TOKEN, VERCEL_PROJECT_ID |

---

## Task 1: Vercel API client (TDD)

**Files:**
- Create: `src/lib/domains/__tests__/vercel.test.ts`
- Create: `src/lib/domains/vercel.ts`

- [ ] **Step 1: Write tests**

Create `src/lib/domains/__tests__/vercel.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Must import after mocking fetch
import { addDomainToVercel, removeDomainFromVercel, checkDomainOnVercel } from '../vercel';

describe('Vercel API client', () => {
  beforeEach(() => {
    process.env.VERCEL_API_TOKEN = 'test-token';
    process.env.VERCEL_PROJECT_ID = 'test-project';
    mockFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.VERCEL_API_TOKEN;
    delete process.env.VERCEL_PROJECT_ID;
  });

  describe('addDomainToVercel', () => {
    it('calls Vercel API with correct URL and body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          name: 'app.example.com',
          verified: false,
          verification: [{ type: 'TXT', domain: '_vercel.app.example.com', value: 'verify=abc', reason: 'pending' }],
          misconfigured: false,
        }),
      });

      const result = await addDomainToVercel('app.example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vercel.com/v10/projects/test-project/domains',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'app.example.com' }),
        })
      );
      expect(result.name).toBe('app.example.com');
      expect(result.verified).toBe(false);
      expect(result.verification).toHaveLength(1);
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: { message: 'Domain already exists' } }),
      });

      await expect(addDomainToVercel('app.example.com')).rejects.toThrow('Domain already exists');
    });
  });

  describe('removeDomainFromVercel', () => {
    it('calls DELETE on the domain URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await removeDomainFromVercel('app.example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vercel.com/v10/projects/test-project/domains/app.example.com',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('silently succeeds on 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(removeDomainFromVercel('app.example.com')).resolves.toBeUndefined();
    });

    it('throws on other errors', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(removeDomainFromVercel('app.example.com')).rejects.toThrow('500');
    });
  });

  describe('checkDomainOnVercel', () => {
    it('returns domain info when found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          name: 'app.example.com',
          verified: true,
          misconfigured: false,
        }),
      });

      const result = await checkDomainOnVercel('app.example.com');

      expect(result?.verified).toBe(true);
    });

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await checkDomainOnVercel('app.example.com');
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/domains/__tests__/vercel.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Implement vercel.ts**

Create `src/lib/domains/vercel.ts` — copy the full implementation from spec Section 1 (lines 38-102).

- [ ] **Step 4: Run tests to verify pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/domains/__tests__/vercel.test.ts`

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/domains/vercel.ts src/lib/domains/__tests__/vercel.test.ts
git commit -m "feat: add Vercel API client for custom domain management"
```

---

## Task 2: Admin server actions

**Files:**
- Create: `src/lib/domains/actions.ts`

- [ ] **Step 1: Create server actions**

Create `src/lib/domains/actions.ts` — copy the full implementation from spec Section 2 (lines 108-218). The file exports:
- `addCustomDomain(orgId, domain, propertyId?)` — registers with Vercel + inserts into custom_domains
- `removeCustomDomain(domainId)` — removes from Vercel + deletes from custom_domains
- `checkDomainStatus(domainId)` — polls Vercel + updates custom_domains status

Note: These use `createClient` from `@/lib/supabase/server` (authenticated server client). RLS on `custom_domains` ensures only org admins can manage domains.

- [ ] **Step 2: Commit**

```bash
git add src/lib/domains/actions.ts
git commit -m "feat: add admin server actions for custom domain management"
```

---

## Task 3: DNS verification cron endpoint

**Files:**
- Create: `src/app/api/cron/verify-domains/route.ts`

- [ ] **Step 1: Create the cron endpoint**

Create `src/app/api/cron/verify-domains/route.ts` — copy the full implementation from spec Section 3 (lines 224-295). The endpoint:
1. Verifies cron secret
2. Queries `custom_domains WHERE status = 'verifying'`
3. For each: calls `checkDomainOnVercel()`
4. If verified → status = 'active'
5. If pending > 72 hours → status = 'failed'
6. Returns `{ checked, activated, failed, stillPending }`

Follow the same pattern as existing `/api/cron/cleanup-temp-accounts/route.ts` and `/api/cron/expire-access-grants/route.ts`.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/verify-domains/route.ts
git commit -m "feat: add cron endpoint for domain DNS verification"
```

---

## Task 4: Env vars and final verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add env vars to .env.example**

Add:

```
# Vercel API integration for custom domain management
VERCEL_API_TOKEN=     # Personal access token or team token (Settings → Tokens)
VERCEL_PROJECT_ID=    # Project ID (Project Settings → General → Project ID)
```

- [ ] **Step 2: Run all tests**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run`

Expected: All tests pass including new Vercel API client tests.

- [ ] **Step 3: Run TypeScript check**

Run: `cd /Users/patrick/birdhousemapper && npx tsc --noEmit`

Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs: add Vercel API env vars to .env.example"
```

---

## Post-Implementation Notes

### How to test

1. **Unit tests:** Vercel API client tests mock `fetch` — run with `npx vitest run src/lib/domains/`
2. **Integration test (manual):**
   - Set `VERCEL_API_TOKEN` and `VERCEL_PROJECT_ID` in `.env.local`
   - Call `addCustomDomain('org-id', 'test.example.com')` from a server action
   - Verify domain appears in Vercel dashboard
   - Set DNS records
   - Run cron: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/verify-domains`
   - Verify status changes to `active`
   - Call `removeCustomDomain(domainId)` — verify removed from Vercel

### Cron configuration

Add to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/verify-domains", "schedule": "*/10 * * * *" }
  ]
}
```

Note: Vercel free tier supports 2 cron jobs. If already using 2 (cleanup-temp-accounts, expire-access-grants), consider combining into a single multi-purpose cron endpoint, or upgrade to Pro.

### What comes next

The entire IAM Northstar spec is now implemented:
- **Admin UIs** for domain management, property access config, temporary grants, role wizard
- **Embed feature** with anonymous token validation middleware
- **Org switcher** frontend for multi-org users
- **Invite system overhaul** (deeper research needed)
