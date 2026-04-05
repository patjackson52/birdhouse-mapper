# Platform Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a platform admin interface at `/platform/*` for managing organizations, tiers, and per-org feature overrides.

**Architecture:** New `/platform` route group with its own shell layout, protected by `is_platform_admin` checks at middleware, layout, and server action levels. Feature definitions and tier defaults live in code (`lib/platform/features.ts`); per-org overrides stored in a new `org_feature_overrides` table with RLS restricted to platform admins. A `resolveOrgFeatures()` utility merges tier defaults with overrides for enforcement throughout the app.

**Tech Stack:** Next.js 14 (App Router), Supabase (PostgreSQL + RLS), Tailwind CSS, Vitest

---

### Task 1: Database Migration — `org_feature_overrides` Table

**Files:**
- Create: `supabase/migrations/031_platform_feature_overrides.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db push` (or your local migration apply command)
Expected: Migration applies cleanly, table created.

- [ ] **Step 3: Verify in Supabase**

Run: `npx supabase db reset` or check the table exists in Supabase Studio.
Expected: `org_feature_overrides` table visible with RLS enabled and one policy.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/031_platform_feature_overrides.sql
git commit -m "feat: add org_feature_overrides table with RLS"
```

---

### Task 2: Feature Definitions & Resolution Utility

**Files:**
- Create: `src/lib/platform/features.ts`
- Test: `src/lib/platform/__tests__/features.test.ts`

- [ ] **Step 1: Write the failing test for feature resolution**

Create `src/lib/platform/__tests__/features.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  PLATFORM_FEATURES,
  TIER_DEFAULTS,
  resolveFeatures,
  type FeatureMap,
} from '../features';

describe('PLATFORM_FEATURES', () => {
  it('has type and label for every feature', () => {
    for (const [key, def] of Object.entries(PLATFORM_FEATURES)) {
      expect(def).toHaveProperty('type');
      expect(def).toHaveProperty('label');
      expect(['boolean', 'numeric']).toContain(def.type);
      expect(typeof def.label).toBe('string');
    }
  });
});

describe('TIER_DEFAULTS', () => {
  it('defines defaults for all four tiers', () => {
    expect(Object.keys(TIER_DEFAULTS)).toEqual(['free', 'community', 'pro', 'municipal']);
  });

  it('has a value for every feature in every tier', () => {
    const featureKeys = Object.keys(PLATFORM_FEATURES);
    for (const tier of Object.keys(TIER_DEFAULTS)) {
      const defaults = TIER_DEFAULTS[tier as keyof typeof TIER_DEFAULTS];
      for (const key of featureKeys) {
        expect(defaults).toHaveProperty(key);
      }
    }
  });
});

describe('resolveFeatures', () => {
  it('returns tier defaults when no overrides', () => {
    const result = resolveFeatures('free', []);
    expect(result.tasks).toBe(false);
    expect(result.public_forms).toBe(true);
    expect(result.max_properties).toBe(1);
    expect(result.max_members).toBe(5);
  });

  it('applies boolean overrides', () => {
    const overrides = [
      { feature: 'tasks', value: true },
      { feature: 'reports', value: true },
    ];
    const result = resolveFeatures('free', overrides);
    expect(result.tasks).toBe(true);
    expect(result.reports).toBe(true);
    // Non-overridden values stay at tier default
    expect(result.volunteers).toBe(false);
  });

  it('applies numeric overrides', () => {
    const overrides = [
      { feature: 'max_properties', value: 10 },
      { feature: 'storage_limit_mb', value: null }, // unlimited
    ];
    const result = resolveFeatures('free', overrides);
    expect(result.max_properties).toBe(10);
    expect(result.storage_limit_mb).toBeNull();
    // Non-overridden stays at default
    expect(result.max_members).toBe(5);
  });

  it('works with pro tier defaults', () => {
    const result = resolveFeatures('pro', []);
    expect(result.tasks).toBe(true);
    expect(result.reports).toBe(true);
    expect(result.max_properties).toBeNull(); // unlimited
    expect(result.storage_limit_mb).toBe(5000);
  });

  it('overrides can downgrade pro features', () => {
    const overrides = [
      { feature: 'reports', value: false },
      { feature: 'max_properties', value: 5 },
    ];
    const result = resolveFeatures('pro', overrides);
    expect(result.reports).toBe(false);
    expect(result.max_properties).toBe(5);
  });

  it('ignores unknown feature keys in overrides', () => {
    const overrides = [{ feature: 'nonexistent_feature', value: true }];
    const result = resolveFeatures('free', []);
    const resultWithUnknown = resolveFeatures('free', overrides);
    expect(resultWithUnknown).toEqual(result);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/platform/__tests__/features.test.ts`
Expected: FAIL — module `../features` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/platform/features.ts`:

```typescript
import type { SubscriptionTier } from '@/lib/types';

// --- Feature Registry ---

export const PLATFORM_FEATURES = {
  // Boolean features
  tasks:          { type: 'boolean' as const, label: 'Tasks Module' },
  volunteers:     { type: 'boolean' as const, label: 'Volunteers Module' },
  public_forms:   { type: 'boolean' as const, label: 'Public Forms' },
  qr_codes:       { type: 'boolean' as const, label: 'QR Codes' },
  reports:        { type: 'boolean' as const, label: 'Reports' },
  ai_context:     { type: 'boolean' as const, label: 'AI Context' },
  custom_domains: { type: 'boolean' as const, label: 'Custom Domains' },
  site_builder:   { type: 'boolean' as const, label: 'Site Builder' },
  // Numeric limits (null = unlimited)
  max_properties:         { type: 'numeric' as const, label: 'Max Properties' },
  max_members:            { type: 'numeric' as const, label: 'Max Members' },
  storage_limit_mb:       { type: 'numeric' as const, label: 'Storage Limit (MB)' },
  max_ai_context_entries: { type: 'numeric' as const, label: 'Max AI Context Entries' },
} as const;

export type FeatureKey = keyof typeof PLATFORM_FEATURES;

export type FeatureMap = {
  [K in FeatureKey]: typeof PLATFORM_FEATURES[K]['type'] extends 'boolean'
    ? boolean
    : number | null;
};

// --- Tier Defaults ---

export const TIER_DEFAULTS: Record<SubscriptionTier, FeatureMap> = {
  free: {
    tasks: false, volunteers: false, public_forms: true, qr_codes: false,
    reports: false, ai_context: false, custom_domains: false, site_builder: false,
    max_properties: 1, max_members: 5, storage_limit_mb: 100, max_ai_context_entries: 0,
  },
  community: {
    tasks: true, volunteers: true, public_forms: true, qr_codes: true,
    reports: false, ai_context: false, custom_domains: false, site_builder: false,
    max_properties: 3, max_members: 25, storage_limit_mb: 500, max_ai_context_entries: 10,
  },
  pro: {
    tasks: true, volunteers: true, public_forms: true, qr_codes: true,
    reports: true, ai_context: true, custom_domains: true, site_builder: true,
    max_properties: null, max_members: null, storage_limit_mb: 5000, max_ai_context_entries: 100,
  },
  municipal: {
    tasks: true, volunteers: true, public_forms: true, qr_codes: true,
    reports: true, ai_context: true, custom_domains: true, site_builder: true,
    max_properties: null, max_members: null, storage_limit_mb: null, max_ai_context_entries: null,
  },
};

// --- Feature Resolution ---

export type FeatureOverride = { feature: string; value: unknown };

export function resolveFeatures(
  tier: SubscriptionTier,
  overrides: FeatureOverride[],
): FeatureMap {
  const defaults = { ...TIER_DEFAULTS[tier] };
  const featureKeys = Object.keys(PLATFORM_FEATURES) as FeatureKey[];

  for (const override of overrides) {
    if (featureKeys.includes(override.feature as FeatureKey)) {
      (defaults as Record<string, unknown>)[override.feature] = override.value;
    }
  }

  return defaults;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/platform/__tests__/features.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/platform/features.ts src/lib/platform/__tests__/features.test.ts
git commit -m "feat: add platform feature definitions and resolution utility"
```

---

### Task 3: `resolveOrgFeatures()` — Server-Side Data Fetcher

**Files:**
- Create: `src/lib/platform/resolve-org-features.ts`
- Test: `src/lib/platform/__tests__/resolve-org-features.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/platform/__tests__/resolve-org-features.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockOrg: any = { subscription_tier: 'free' };
let mockOverrides: any[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'orgs') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: mockOrg, error: null }),
            }),
          }),
        };
      }
      if (table === 'org_feature_overrides') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: mockOverrides, error: null }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  }),
}));

import { resolveOrgFeatures } from '../resolve-org-features';

describe('resolveOrgFeatures', () => {
  beforeEach(() => {
    mockOrg = { subscription_tier: 'free' };
    mockOverrides = [];
  });

  it('returns free tier defaults with no overrides', async () => {
    const result = await resolveOrgFeatures('org-1');
    expect(result.tasks).toBe(false);
    expect(result.max_properties).toBe(1);
  });

  it('applies overrides from DB', async () => {
    mockOverrides = [
      { feature: 'tasks', value: true },
      { feature: 'max_properties', value: 10 },
    ];
    const result = await resolveOrgFeatures('org-1');
    expect(result.tasks).toBe(true);
    expect(result.max_properties).toBe(10);
  });

  it('uses the correct tier for the org', async () => {
    mockOrg = { subscription_tier: 'pro' };
    const result = await resolveOrgFeatures('org-1');
    expect(result.tasks).toBe(true);
    expect(result.reports).toBe(true);
    expect(result.max_properties).toBeNull();
  });

  it('returns free defaults if org not found', async () => {
    mockOrg = null;
    const result = await resolveOrgFeatures('nonexistent');
    expect(result.tasks).toBe(false);
    expect(result.max_properties).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/platform/__tests__/resolve-org-features.test.ts`
Expected: FAIL — module `../resolve-org-features` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/platform/resolve-org-features.ts`:

```typescript
import { createServiceClient } from '@/lib/supabase/server';
import { resolveFeatures, type FeatureMap } from './features';
import type { SubscriptionTier } from '@/lib/types';

/**
 * Fetches an org's subscription tier and feature overrides,
 * then resolves the full feature map.
 *
 * Uses service-role client so this works in any context
 * (platform admin pages AND org-context pages for enforcement).
 */
export async function resolveOrgFeatures(orgId: string): Promise<FeatureMap> {
  const supabase = createServiceClient();

  const [orgResult, overridesResult] = await Promise.all([
    supabase.from('orgs').select('subscription_tier').eq('id', orgId).single(),
    supabase.from('org_feature_overrides').select('feature, value').eq('org_id', orgId),
  ]);

  const tier = (orgResult.data?.subscription_tier as SubscriptionTier) ?? 'free';
  const overrides = overridesResult.data ?? [];

  return resolveFeatures(tier, overrides);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/platform/__tests__/resolve-org-features.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/platform/resolve-org-features.ts src/lib/platform/__tests__/resolve-org-features.test.ts
git commit -m "feat: add resolveOrgFeatures server-side data fetcher"
```

---

### Task 4: Middleware — Protect `/platform` Routes

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Add `/platform` to protected routes check**

In `src/lib/supabase/middleware.ts`, find the `isProtectedRoute` check (around line 223) and add `/platform`:

Change:
```typescript
  const isProtectedRoute =
    pathname.startsWith('/manage') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/org') ||
    pathname.startsWith('/p/') ||
    pathname.startsWith('/account');
```

To:
```typescript
  const isProtectedRoute =
    pathname.startsWith('/manage') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/org') ||
    pathname.startsWith('/platform') ||
    pathname.startsWith('/p/') ||
    pathname.startsWith('/account');
```

- [ ] **Step 2: Add platform admin route gate**

Find the `isAdminRoute` check (around line 279) and add a separate block **before** it for platform routes:

Insert before the `// Non-admin users cannot access admin routes` comment:

```typescript
  // Platform admin routes: only is_platform_admin users
  if (pathname.startsWith('/platform')) {
    if (!profile?.is_platform_admin) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }
```

- [ ] **Step 3: Verify the middleware change doesn't break existing routes**

Run: `npm run build`
Expected: Build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "feat: protect /platform routes with is_platform_admin middleware check"
```

---

### Task 5: PlatformShell Layout Component

**Files:**
- Create: `src/app/platform/PlatformShell.tsx`
- Create: `src/app/platform/layout.tsx`

- [ ] **Step 1: Create the PlatformShell component**

Create `src/app/platform/PlatformShell.tsx`:

```typescript
'use client';

import { AdminSidebar, type SidebarItem } from '@/components/admin/AdminSidebar';
import { AvatarMenu } from '@/components/layout/AvatarMenu';
import { useState } from 'react';

const PLATFORM_NAV_ITEMS: SidebarItem[] = [
  { label: 'Dashboard', href: '/platform' },
  { label: 'Organizations', href: '/platform/orgs' },
  { label: 'Tier Reference', href: '/platform/tiers' },
];

interface PlatformShellProps {
  userEmail: string;
  children: React.ReactNode;
}

export function PlatformShell({ userEmail, children }: PlatformShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Header — indigo accent to distinguish from org admin (amber) */}
      <div className="bg-indigo-800 text-white flex-shrink-0">
        <div className="px-4 flex items-center justify-between h-12">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <button
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="md:hidden text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="font-medium truncate leading-none">Platform Admin</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <AvatarMenu userEmail={userEmail} />
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 bottom-0 shadow-xl">
            <AdminSidebar
              title="Platform Admin"
              items={PLATFORM_NAV_ITEMS}
              onNavClick={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        <div className="hidden md:block">
          <AdminSidebar title="Platform Admin" items={PLATFORM_NAV_ITEMS} hideTitle />
        </div>
        <main className="flex-1 overflow-auto flex flex-col">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the platform layout**

Create `src/app/platform/layout.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PlatformShell } from './PlatformShell';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Defense-in-depth: middleware already checks this, but guard here too
  const { data: profile } = await supabase
    .from('users')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) {
    redirect('/');
  }

  return (
    <PlatformShell userEmail={user.email ?? ''}>
      {children}
    </PlatformShell>
  );
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/platform/PlatformShell.tsx src/app/platform/layout.tsx
git commit -m "feat: add PlatformShell layout with indigo accent and sidebar"
```

---

### Task 6: Platform Dashboard Page

**Files:**
- Create: `src/app/platform/page.tsx`

- [ ] **Step 1: Create the dashboard page**

Create `src/app/platform/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type TierCount = { tier: string; count: number };
type StatusCount = { status: string; count: number };
type RecentOrg = { id: string; name: string; slug: string; subscription_tier: string; created_at: string };

export default function PlatformDashboardPage() {
  const [totalOrgs, setTotalOrgs] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalProperties, setTotalProperties] = useState(0);
  const [tierCounts, setTierCounts] = useState<TierCount[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCount[]>([]);
  const [recentOrgs, setRecentOrgs] = useState<RecentOrg[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const [orgsRes, usersRes, propsRes] = await Promise.all([
        supabase.from('orgs').select('id, name, slug, subscription_tier, subscription_status, created_at'),
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('properties').select('id', { count: 'exact', head: true }),
      ]);

      const orgs = orgsRes.data ?? [];
      setTotalOrgs(orgs.length);
      setTotalUsers(usersRes.count ?? 0);
      setTotalProperties(propsRes.count ?? 0);

      // Tier breakdown
      const tiers: Record<string, number> = {};
      const statuses: Record<string, number> = {};
      for (const org of orgs) {
        tiers[org.subscription_tier] = (tiers[org.subscription_tier] || 0) + 1;
        statuses[org.subscription_status] = (statuses[org.subscription_status] || 0) + 1;
      }
      setTierCounts(Object.entries(tiers).map(([tier, count]) => ({ tier, count })));
      setStatusCounts(Object.entries(statuses).map(([status, count]) => ({ status, count })));

      // Recent orgs (last 5)
      const sorted = [...orgs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRecentOrgs(sorted.slice(0, 5));

      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="h-24 bg-sage-light rounded" />
            <div className="h-24 bg-sage-light rounded" />
            <div className="h-24 bg-sage-light rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-8">
        Platform Dashboard
      </h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <Link href="/platform/orgs" className="card py-4 md:py-6 hover:shadow-md transition-shadow">
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">Organizations</p>
          <p className="text-3xl font-semibold text-forest-dark">{totalOrgs}</p>
        </Link>
        <div className="card py-4 md:py-6">
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">Users</p>
          <p className="text-3xl font-semibold text-forest-dark">{totalUsers}</p>
        </div>
        <div className="card py-4 md:py-6">
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">Properties</p>
          <p className="text-3xl font-semibold text-forest-dark">{totalProperties}</p>
        </div>
      </div>

      {/* Tier & Status breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
        <div className="card p-4">
          <h2 className="font-heading text-sm font-semibold text-forest-dark mb-3">By Tier</h2>
          <div className="space-y-2">
            {tierCounts.map(({ tier, count }) => (
              <div key={tier} className="flex justify-between text-sm">
                <span className="text-gray-600 capitalize">{tier}</span>
                <span className="font-medium text-forest-dark">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-4">
          <h2 className="font-heading text-sm font-semibold text-forest-dark mb-3">By Status</h2>
          <div className="space-y-2">
            {statusCounts.map(({ status, count }) => (
              <div key={status} className="flex justify-between text-sm">
                <span className="text-gray-600 capitalize">{status}</span>
                <span className="font-medium text-forest-dark">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent orgs */}
      <h2 className="font-heading text-lg font-semibold text-forest-dark mb-4">Recent Organizations</h2>
      {recentOrgs.length === 0 ? (
        <p className="text-sm text-sage">No organizations yet.</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Tier</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {recentOrgs.map((org) => (
                <tr key={org.id} className="hover:bg-sage-light/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/platform/orgs/${org.slug}`} className="text-sm font-medium text-forest-dark hover:underline">
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 capitalize">{org.subscription_tier}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(org.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Navigate to `http://localhost:3000/platform` (as a platform admin user).
Expected: Dashboard loads showing org counts, tier/status breakdowns, and recent orgs.

- [ ] **Step 4: Commit**

```bash
git add src/app/platform/page.tsx
git commit -m "feat: add platform dashboard page with summary cards"
```

---

### Task 7: Platform Server Actions

**Files:**
- Create: `src/app/platform/actions.ts`
- Test: `src/app/platform/__tests__/actions.test.ts`

- [ ] **Step 1: Write failing tests for server actions**

Create `src/app/platform/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockUser: any = { id: 'admin-1' };
let mockProfile: any = { is_platform_admin: true };
let mockOrg: any = { id: 'org-1', name: 'Test Org', slug: 'test-org', subscription_tier: 'free', subscription_status: 'active' };
let mockUpdateError: any = null;
let mockUpsertError: any = null;
let mockDeleteError: any = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockUser } }),
    },
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockProfile, error: null }) }) }),
        };
      }
      if (table === 'orgs') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockOrg, error: null }) }) }),
          update: (payload: any) => ({
            eq: () => Promise.resolve({ error: mockUpdateError }),
          }),
        };
      }
      if (table === 'org_feature_overrides') {
        return {
          upsert: () => Promise.resolve({ error: mockUpsertError }),
          delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: mockDeleteError }) }) }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  }),
}));

import { updateOrg, setFeatureOverride, removeFeatureOverride } from '../actions';

describe('platform actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'admin-1' };
    mockProfile = { is_platform_admin: true };
    mockOrg = { id: 'org-1', name: 'Test Org', slug: 'test-org', subscription_tier: 'free', subscription_status: 'active' };
    mockUpdateError = null;
    mockUpsertError = null;
    mockDeleteError = null;
  });

  describe('updateOrg', () => {
    it('rejects unauthenticated users', async () => {
      mockUser = null;
      const result = await updateOrg('org-1', { name: 'New Name' });
      expect(result).toEqual({ error: 'Not authenticated' });
    });

    it('rejects non-platform-admin users', async () => {
      mockProfile = { is_platform_admin: false };
      const result = await updateOrg('org-1', { name: 'New Name' });
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('updates org successfully', async () => {
      const result = await updateOrg('org-1', { subscription_tier: 'pro' });
      expect(result).toEqual({ success: true });
    });

    it('returns error on DB failure', async () => {
      mockUpdateError = { message: 'DB error' };
      const result = await updateOrg('org-1', { name: 'New Name' });
      expect(result).toEqual({ error: 'DB error' });
    });
  });

  describe('setFeatureOverride', () => {
    it('rejects non-platform-admin users', async () => {
      mockProfile = { is_platform_admin: false };
      const result = await setFeatureOverride('org-1', 'tasks', true);
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('sets override successfully', async () => {
      const result = await setFeatureOverride('org-1', 'tasks', true, 'trial');
      expect(result).toEqual({ success: true });
    });

    it('rejects unknown feature keys', async () => {
      const result = await setFeatureOverride('org-1', 'nonexistent', true);
      expect(result).toEqual({ error: 'Unknown feature: nonexistent' });
    });
  });

  describe('removeFeatureOverride', () => {
    it('removes override successfully', async () => {
      const result = await removeFeatureOverride('org-1', 'tasks');
      expect(result).toEqual({ success: true });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/app/platform/__tests__/actions.test.ts`
Expected: FAIL — module `../actions` not found.

- [ ] **Step 3: Write the implementation**

Create `src/app/platform/actions.ts`:

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { PLATFORM_FEATURES, type FeatureKey } from '@/lib/platform/features';
import type { SubscriptionTier, SubscriptionStatus } from '@/lib/types';

async function requirePlatformAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' as const, supabase: null, userId: null };

  const { data: profile } = await supabase
    .from('users')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) return { error: 'Unauthorized' as const, supabase: null, userId: null };

  return { error: null, supabase, userId: user.id };
}

export async function updateOrg(
  orgId: string,
  updates: {
    name?: string;
    slug?: string;
    subscription_tier?: SubscriptionTier;
    subscription_status?: SubscriptionStatus;
  },
): Promise<{ success?: boolean; error?: string }> {
  const { error: authError, supabase } = await requirePlatformAdmin();
  if (authError) return { error: authError };

  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.slug !== undefined) payload.slug = updates.slug;
  if (updates.subscription_tier !== undefined) payload.subscription_tier = updates.subscription_tier;
  if (updates.subscription_status !== undefined) payload.subscription_status = updates.subscription_status;

  if (Object.keys(payload).length === 0) return { success: true };

  const { error } = await supabase!.from('orgs').update(payload).eq('id', orgId);
  if (error) return { error: error.message };

  return { success: true };
}

export async function setFeatureOverride(
  orgId: string,
  feature: string,
  value: unknown,
  note?: string,
): Promise<{ success?: boolean; error?: string }> {
  const { error: authError, supabase, userId } = await requirePlatformAdmin();
  if (authError) return { error: authError };

  const featureKeys = Object.keys(PLATFORM_FEATURES) as FeatureKey[];
  if (!featureKeys.includes(feature as FeatureKey)) {
    return { error: `Unknown feature: ${feature}` };
  }

  const { error } = await supabase!.from('org_feature_overrides').upsert(
    {
      org_id: orgId,
      feature,
      value: value as any,
      note: note ?? null,
      set_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,feature' },
  );

  if (error) return { error: error.message };
  return { success: true };
}

export async function removeFeatureOverride(
  orgId: string,
  feature: string,
): Promise<{ success?: boolean; error?: string }> {
  const { error: authError, supabase } = await requirePlatformAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase!
    .from('org_feature_overrides')
    .delete()
    .eq('org_id', orgId)
    .eq('feature', feature);

  if (error) return { error: error.message };
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/app/platform/__tests__/actions.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/platform/actions.ts src/app/platform/__tests__/actions.test.ts
git commit -m "feat: add platform server actions for org updates and feature overrides"
```

---

### Task 8: Org List Page

**Files:**
- Create: `src/app/platform/orgs/page.tsx`

- [ ] **Step 1: Create the org list page**

Create `src/app/platform/orgs/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { SubscriptionTier, SubscriptionStatus } from '@/lib/types';

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  created_at: string;
  member_count: number;
  property_count: number;
};

export default function PlatformOrgsPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const { data: orgsData } = await supabase
        .from('orgs')
        .select('id, name, slug, subscription_tier, subscription_status, created_at')
        .order('created_at', { ascending: false });

      if (!orgsData) {
        setLoading(false);
        return;
      }

      // Fetch member and property counts
      const orgIds = orgsData.map((o) => o.id);

      const [membershipsRes, propertiesRes] = await Promise.all([
        supabase
          .from('org_memberships')
          .select('org_id')
          .in('org_id', orgIds)
          .eq('status', 'active'),
        supabase
          .from('properties')
          .select('org_id')
          .in('org_id', orgIds)
          .is('deleted_at', null),
      ]);

      const memberCounts: Record<string, number> = {};
      for (const m of membershipsRes.data ?? []) {
        memberCounts[m.org_id] = (memberCounts[m.org_id] || 0) + 1;
      }

      const propCounts: Record<string, number> = {};
      for (const p of propertiesRes.data ?? []) {
        propCounts[p.org_id] = (propCounts[p.org_id] || 0) + 1;
      }

      setOrgs(
        orgsData.map((o) => ({
          ...o,
          member_count: memberCounts[o.id] || 0,
          property_count: propCounts[o.id] || 0,
        })),
      );
      setLoading(false);
    }
    fetchData();
  }, []);

  const filtered = orgs.filter((org) => {
    if (search && !org.name.toLowerCase().includes(search.toLowerCase()) && !org.slug.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (tierFilter !== 'all' && org.subscription_tier !== tierFilter) return false;
    if (statusFilter !== 'all' && org.subscription_status !== statusFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-10 bg-sage-light rounded w-full" />
          <div className="h-64 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">
        Organizations
      </h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by name or slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field flex-1"
        />
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="input-field sm:w-40"
        >
          <option value="all">All Tiers</option>
          <option value="free">Free</option>
          <option value="community">Community</option>
          <option value="pro">Pro</option>
          <option value="municipal">Municipal</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field sm:w-40"
        >
          <option value="all">All Statuses</option>
          <option value="trialing">Trialing</option>
          <option value="active">Active</option>
          <option value="past_due">Past Due</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Results count */}
      <p className="text-sm text-sage mb-3">{filtered.length} organization{filtered.length !== 1 ? 's' : ''}</p>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Slug</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Tier</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Members</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Properties</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {filtered.map((org) => (
                <tr
                  key={org.id}
                  className="hover:bg-sage-light/30 cursor-pointer transition-colors"
                  onClick={() => router.push(`/platform/orgs/${org.slug}`)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-forest-dark">{org.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{org.slug}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 capitalize">{org.subscription_tier}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 capitalize">{org.subscription_status}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{org.member_count}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{org.property_count}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{new Date(org.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-sage">
                    No organizations match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/platform/orgs/page.tsx
git commit -m "feat: add platform org list page with search and filters"
```

---

### Task 9: Org Detail Page with Feature Overrides

**Files:**
- Create: `src/app/platform/orgs/[slug]/page.tsx`

- [ ] **Step 1: Create the org detail page**

Create `src/app/platform/orgs/[slug]/page.tsx`:

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PLATFORM_FEATURES, TIER_DEFAULTS, type FeatureKey } from '@/lib/platform/features';
import { updateOrg, setFeatureOverride, removeFeatureOverride } from '../../actions';
import type { SubscriptionTier, SubscriptionStatus } from '@/lib/types';

type OrgDetail = {
  id: string;
  name: string;
  slug: string;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  logo_url: string | null;
  created_at: string;
};

type PropertyRow = { id: string; name: string; slug: string; is_active: boolean };

type Override = {
  feature: string;
  value: unknown;
  note: string | null;
};

const TIERS: SubscriptionTier[] = ['free', 'community', 'pro', 'municipal'];
const STATUSES: SubscriptionStatus[] = ['trialing', 'active', 'past_due', 'cancelled'];

export default function PlatformOrgDetailPage() {
  const params = useParams<{ slug: string }>();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Editable org fields
  const [editTier, setEditTier] = useState<SubscriptionTier>('free');
  const [editStatus, setEditStatus] = useState<SubscriptionStatus>('active');

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    const { data: orgData } = await supabase
      .from('orgs')
      .select('id, name, slug, subscription_tier, subscription_status, logo_url, created_at')
      .eq('slug', params.slug)
      .single();

    if (!orgData) {
      setLoading(false);
      return;
    }

    setOrg(orgData as OrgDetail);
    setEditTier(orgData.subscription_tier as SubscriptionTier);
    setEditStatus(orgData.subscription_status as SubscriptionStatus);

    const [membersRes, propsRes, overridesRes] = await Promise.all([
      supabase
        .from('org_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgData.id)
        .eq('status', 'active'),
      supabase
        .from('properties')
        .select('id, name, slug, is_active')
        .eq('org_id', orgData.id)
        .is('deleted_at', null)
        .order('name'),
      supabase
        .from('org_feature_overrides')
        .select('feature, value, note')
        .eq('org_id', orgData.id),
    ]);

    setMemberCount(membersRes.count ?? 0);
    setProperties(propsRes.data ?? []);
    setOverrides((overridesRes.data ?? []) as Override[]);
    setLoading(false);
  }, [params.slug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleSaveOrg() {
    if (!org) return;
    setSaving(true);
    const result = await updateOrg(org.id, {
      subscription_tier: editTier,
      subscription_status: editStatus,
    });
    setSaving(false);
    if (result.error) {
      showMessage('error', result.error);
    } else {
      showMessage('success', 'Org updated');
      fetchData();
    }
  }

  async function handleSetOverride(feature: FeatureKey, value: unknown, note?: string) {
    if (!org) return;
    const result = await setFeatureOverride(org.id, feature, value, note);
    if (result.error) {
      showMessage('error', result.error);
    } else {
      fetchData();
    }
  }

  async function handleRemoveOverride(feature: FeatureKey) {
    if (!org) return;
    const result = await removeFeatureOverride(org.id, feature);
    if (result.error) {
      showMessage('error', result.error);
    } else {
      fetchData();
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-64" />
          <div className="h-48 bg-sage-light rounded" />
          <div className="h-64 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-sage">Organization not found.</p>
        <Link href="/platform/orgs" className="text-sm text-golden hover:underline mt-2 inline-block">
          ← Back to organizations
        </Link>
      </div>
    );
  }

  const tierDefaults = TIER_DEFAULTS[editTier];
  const overrideMap = new Map(overrides.map((o) => [o.feature, o]));
  const featureKeys = Object.keys(PLATFORM_FEATURES) as FeatureKey[];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/platform/orgs" className="text-sm text-golden hover:underline mb-4 inline-block">
        ← Back to organizations
      </Link>

      {/* Status message */}
      {message && (
        <div className={`mb-4 p-3 rounded text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">{org.name}</h1>

      {/* Info card */}
      <div className="card p-4 mb-6">
        <h2 className="font-heading text-sm font-semibold text-forest-dark mb-4">Organization Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Name</label>
            <p className="text-sm text-forest-dark">{org.name}</p>
          </div>
          <div>
            <label className="label">Slug</label>
            <p className="text-sm text-forest-dark">{org.slug}</p>
          </div>
          <div>
            <label className="label">Tier</label>
            <select
              value={editTier}
              onChange={(e) => setEditTier(e.target.value as SubscriptionTier)}
              className="input-field"
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as SubscriptionStatus)}
              className="input-field"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Created</label>
            <p className="text-sm text-forest-dark">{new Date(org.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        {(editTier !== org.subscription_tier || editStatus !== org.subscription_status) && (
          <div className="mt-4 flex gap-2">
            <button onClick={handleSaveOrg} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => { setEditTier(org.subscription_tier); setEditStatus(org.subscription_status); }}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">Members</p>
          <p className="text-2xl font-semibold text-forest-dark">{memberCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">Properties</p>
          <p className="text-2xl font-semibold text-forest-dark">{properties.length}</p>
        </div>
      </div>

      {properties.length > 0 && (
        <div className="card p-4 mb-6">
          <h2 className="font-heading text-sm font-semibold text-forest-dark mb-3">Properties</h2>
          <div className="space-y-2">
            {properties.map((p) => (
              <div key={p.id} className="flex justify-between text-sm">
                <span className="text-forest-dark">{p.name} <span className="text-sage">({p.slug})</span></span>
                <span className={p.is_active ? 'text-green-600' : 'text-sage'}>{p.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature overrides */}
      <div className="card p-4">
        <h2 className="font-heading text-sm font-semibold text-forest-dark mb-4">Feature Configuration</h2>
        <p className="text-xs text-sage mb-4">
          Showing resolved features for <span className="capitalize font-medium">{editTier}</span> tier.
          Toggle overrides to customize this org.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light">
                <th className="text-left px-3 py-2 text-xs font-medium text-sage uppercase">Feature</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-sage uppercase">Tier Default</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-sage uppercase">Override</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-sage uppercase">Resolved</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-sage uppercase">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {featureKeys.map((key) => {
                const def = PLATFORM_FEATURES[key];
                const tierDefault = tierDefaults[key];
                const override = overrideMap.get(key);
                const resolved = override ? override.value : tierDefault;
                const hasOverride = override !== undefined;

                return (
                  <FeatureRow
                    key={key}
                    featureKey={key}
                    label={def.label}
                    type={def.type}
                    tierDefault={tierDefault}
                    override={override ?? null}
                    resolved={resolved}
                    hasOverride={hasOverride}
                    onSetOverride={(value, note) => handleSetOverride(key, value, note)}
                    onRemoveOverride={() => handleRemoveOverride(key)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({
  featureKey,
  label,
  type,
  tierDefault,
  override,
  resolved,
  hasOverride,
  onSetOverride,
  onRemoveOverride,
}: {
  featureKey: string;
  label: string;
  type: 'boolean' | 'numeric';
  tierDefault: boolean | number | null;
  override: Override | null;
  resolved: unknown;
  hasOverride: boolean;
  onSetOverride: (value: unknown, note?: string) => void;
  onRemoveOverride: () => void;
}) {
  function formatValue(val: unknown): string {
    if (val === null) return 'unlimited';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    return String(val);
  }

  return (
    <tr>
      <td className="px-3 py-2 text-sm text-forest-dark">{label}</td>
      <td className="px-3 py-2 text-sm text-sage">{formatValue(tierDefault)}</td>
      <td className="px-3 py-2">
        {hasOverride ? (
          <div className="flex items-center gap-2">
            {type === 'boolean' ? (
              <button
                onClick={() => onSetOverride(!(override!.value as boolean))}
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  override!.value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {override!.value ? 'true' : 'false'}
              </button>
            ) : (
              <input
                type="number"
                value={override!.value === null ? '' : String(override!.value)}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : Number(e.target.value);
                  onSetOverride(val, override!.note ?? undefined);
                }}
                placeholder="unlimited"
                className="input-field w-24 text-xs py-1"
              />
            )}
            <button
              onClick={onRemoveOverride}
              className="text-xs text-red-500 hover:text-red-700"
              title="Remove override"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              if (type === 'boolean') {
                onSetOverride(!(tierDefault as boolean));
              } else {
                onSetOverride(tierDefault);
              }
            }}
            className="text-xs text-golden hover:underline"
          >
            + Override
          </button>
        )}
      </td>
      <td className={`px-3 py-2 text-sm font-medium ${hasOverride ? 'text-forest-dark' : 'text-sage'}`}>
        {formatValue(resolved)}
      </td>
      <td className="px-3 py-2">
        {hasOverride ? (
          <input
            type="text"
            value={override!.note ?? ''}
            onChange={(e) => onSetOverride(override!.value, e.target.value || undefined)}
            placeholder="Add note..."
            className="input-field text-xs py-1 w-full"
          />
        ) : (
          <span className="text-sage text-xs">—</span>
        )}
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Navigate to `/platform/orgs/[your-org-slug]`.
Expected: Org detail loads with info card, member/property counts, and feature override table. You can toggle overrides, add notes, and save org tier/status changes.

- [ ] **Step 4: Commit**

```bash
git add src/app/platform/orgs/[slug]/page.tsx
git commit -m "feat: add platform org detail page with feature overrides"
```

---

### Task 10: Tier Reference Page

**Files:**
- Create: `src/app/platform/tiers/page.tsx`

- [ ] **Step 1: Create the tier reference page**

Create `src/app/platform/tiers/page.tsx`:

```typescript
import { PLATFORM_FEATURES, TIER_DEFAULTS, type FeatureKey } from '@/lib/platform/features';
import type { SubscriptionTier } from '@/lib/types';

const TIERS: SubscriptionTier[] = ['free', 'community', 'pro', 'municipal'];

function formatValue(val: boolean | number | null): string {
  if (val === null) return '∞';
  if (typeof val === 'boolean') return val ? '✓' : '—';
  return String(val);
}

export default function TierReferencePage() {
  const featureKeys = Object.keys(PLATFORM_FEATURES) as FeatureKey[];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-2">
        Tier Reference
      </h1>
      <p className="text-sm text-sage mb-6">
        Default feature values for each subscription tier. These are defined in code.
        Per-org overrides can be set on the org detail page.
      </p>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Feature</th>
                {TIERS.map((tier) => (
                  <th key={tier} className="text-center px-4 py-3 text-xs font-medium text-sage uppercase capitalize">
                    {tier}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {featureKeys.map((key) => (
                <tr key={key} className="hover:bg-sage-light/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-forest-dark">{PLATFORM_FEATURES[key].label}</td>
                  {TIERS.map((tier) => {
                    const val = TIER_DEFAULTS[tier][key];
                    return (
                      <td
                        key={tier}
                        className={`px-4 py-3 text-sm text-center ${
                          val === true ? 'text-green-600 font-medium' :
                          val === false ? 'text-sage' :
                          val === null ? 'text-forest-dark font-medium' :
                          'text-forest-dark'
                        }`}
                      >
                        {formatValue(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/platform/tiers/page.tsx
git commit -m "feat: add platform tier reference page"
```

---

### Task 11: Full Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: All existing tests pass, plus the new tests in `src/lib/platform/__tests__/` and `src/app/platform/__tests__/`.

- [ ] **Step 2: Run type check**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Production build completes with no errors.

- [ ] **Step 4: Manual end-to-end smoke test**

Run: `npm run dev`

1. Navigate to `/platform` — see dashboard with org stats
2. Navigate to `/platform/orgs` — see org list with search and filters
3. Click an org — see org detail with info, properties, and feature overrides table
4. Change the org's tier dropdown — see "Save Changes" button appear, click save
5. Click "+ Override" on a boolean feature — see it toggle and persist
6. Click "+ Override" on a numeric feature — enter a number, see it persist
7. Add a note to an override
8. Click ✕ to remove an override — see it revert to tier default
9. Navigate to `/platform/tiers` — see tier comparison table
10. As a non-admin user, try navigating to `/platform` — should redirect to `/`

- [ ] **Step 5: Commit any fixes, then final commit**

If any fixes were needed during smoke testing, commit them. Then:

```bash
git add -A
git commit -m "feat: platform admin panel — complete v1"
```
