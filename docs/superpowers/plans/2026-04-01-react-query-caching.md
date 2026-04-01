# React Query Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add React Query as a client-side caching layer for ~14 admin pages, replacing useEffect+useState patterns with useQuery for stale-while-revalidate caching.

**Architecture:** Install @tanstack/react-query, add a QueryProvider client component to the app layout, then mechanically convert each page's useEffect+useState data fetching to inline useQuery calls. Mutations stay imperative with invalidateQueries after success.

**Tech Stack:** @tanstack/react-query, React, Next.js 14, Supabase

---

### Task 1: Install React Query and create QueryProvider

**Files:**
- Create: `src/components/QueryProvider.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `package.json`

- [ ] **Step 1: Install @tanstack/react-query**

```bash
npm install @tanstack/react-query
```

- [ ] **Step 2: Create QueryProvider client component**

Create `src/components/QueryProvider.tsx`:

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 300_000,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 3: Add QueryProvider to app layout**

In `src/app/layout.tsx`, add import at top:

```tsx
import QueryProvider from '@/components/QueryProvider';
```

Wrap children inside the OfflineProvider with QueryProvider. Change lines 69-79 from:

```tsx
<OfflineProvider>
  {puckRoot ? (
    <PuckRootRenderer data={puckRoot}>
      <main className="flex-1">{children}</main>
    </PuckRootRenderer>
  ) : (
    <>
      <Navigation isAuthenticated={!!user} />
      <main className="flex-1">{children}</main>
    </>
  )}
</OfflineProvider>
```

to:

```tsx
<OfflineProvider>
  <QueryProvider>
    {puckRoot ? (
      <PuckRootRenderer data={puckRoot}>
        <main className="flex-1">{children}</main>
      </PuckRootRenderer>
    ) : (
      <>
        <Navigation isAuthenticated={!!user} />
        <main className="flex-1">{children}</main>
      </>
    )}
  </QueryProvider>
</OfflineProvider>
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/QueryProvider.tsx src/app/layout.tsx package.json package-lock.json
git commit -m "feat: add React Query provider with 30s stale time"
```

---

### Task 2: Convert /admin/settings page

**Files:**
- Modify: `src/app/admin/settings/page.tsx`

- [ ] **Step 1: Replace useEffect+useState with useQuery**

In `src/app/admin/settings/page.tsx`:

Add imports — change line 3 from:
```tsx
import { useState, useEffect } from 'react';
```
to:
```tsx
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
```

Remove the `loading` state variable (line 48):
```tsx
const [loading, setLoading] = useState(true);
```

Add useQuery and queryClient after the existing useState declarations (after line 58):
```tsx
const queryClient = useQueryClient();
const { data: settings, isLoading: loading } = useQuery({
  queryKey: ['admin', 'settings'],
  queryFn: async () => {
    const result = await getOrgSettings();
    if (result.error) {
      setMessage(`Error: ${result.error}`);
      return null;
    }
    return result.data ?? null;
  },
});
```

Remove the existing `settings` useState (line 47):
```tsx
const [settings, setSettings] = useState<OrgSettings | null>(null);
```

- [ ] **Step 2: Populate form fields from query data**

Replace the entire useEffect block (lines 60-77) with a useEffect that syncs form state from query data:
```tsx
useEffect(() => {
  if (settings) {
    setName(settings.name ?? '');
    setSlug(settings.slug ?? '');
    setTagline(settings.tagline ?? '');
    setLogoUrl(settings.logo_url ?? '');
    setThemeJson(settings.theme ? JSON.stringify(settings.theme, null, 2) : '');
  }
}, [settings]);
```

Note: We still need `useEffect` imported for this — update the import:
```tsx
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
```

- [ ] **Step 3: Update handleSave to invalidate query**

In `handleSave` (around lines 112-117), replace the manual refetch:
```tsx
      // Refresh local settings snapshot
      const fresh = await getOrgSettings();
      if (fresh.data) setSettings(fresh.data);
      router.refresh();
```
with:
```tsx
      await queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      router.refresh();
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/settings/page.tsx
git commit -m "feat: convert admin settings page to React Query"
```

---

### Task 3: Convert /admin/members page

**Files:**
- Modify: `src/app/admin/members/page.tsx`

- [ ] **Step 1: Replace useEffect+useState with useQuery**

Change imports (lines 1-8):
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { EmptyState } from '@/components/admin/EmptyState';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getOrgMembers, inviteMember } from './actions';
```

Remove state variables for `members`, `roles`, `loading` (lines 39-41), the `loadData` function (lines 52-72), and the useEffect (lines 74-77).

Replace with useQuery:
```tsx
const queryClient = useQueryClient();

const { data: queryData, isLoading: loading } = useQuery({
  queryKey: ['admin', 'members'],
  queryFn: async () => {
    const supabase = createClient();
    const [membersResult, rolesResult] = await Promise.all([
      getOrgMembers(),
      supabase.from('roles').select('id, name, base_role').order('name', { ascending: true }),
    ]);
    return {
      members: (membersResult.members ?? []) as Member[],
      roles: (rolesResult.data ?? []) as Role[],
    };
  },
});

const members = queryData?.members ?? [];
const roles = queryData?.roles ?? [];
```

- [ ] **Step 2: Set default invite role from query data**

Add a useEffect to set default inviteRoleId when roles load. Add `useEffect` back to imports:
```tsx
import { useState, useEffect } from 'react';
```

Add after the useQuery:
```tsx
useEffect(() => {
  if (roles.length > 0 && !inviteRoleId) {
    setInviteRoleId(roles[0].id);
  }
}, [roles, inviteRoleId]);
```

- [ ] **Step 3: Update handleInvite to invalidate**

In `handleInvite` (line 98), replace:
```tsx
    await loadData();
```
with:
```tsx
    await queryClient.invalidateQueries({ queryKey: ['admin', 'members'] });
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/members/page.tsx
git commit -m "feat: convert admin members page to React Query"
```

---

### Task 4: Convert /admin/properties page

**Files:**
- Modify: `src/app/admin/properties/page.tsx`

- [ ] **Step 1: Replace useEffect+useState with useQuery**

Update imports (lines 1-13):
```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge, derivePropertyStatus } from '@/components/admin/StatusBadge';
import { EmptyState } from '@/components/admin/EmptyState';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProperty,
  archiveProperty,
  unarchiveProperty,
  getProperties,
} from './actions';
```

Remove `properties`, `itemCounts`, `memberCounts`, `customDomains`, `loading` useState declarations (lines 40-44), the `loadProperties` function (lines 55-102), and the useEffect (lines 104-106).

Replace with:
```tsx
const queryClient = useQueryClient();

const { data: queryData, isLoading: loading } = useQuery({
  queryKey: ['admin', 'properties'],
  queryFn: async () => {
    const result = await getProperties();
    if (!result.properties) return { properties: [], itemCounts: {}, memberCounts: {}, customDomains: {} };

    const props = result.properties as Property[];
    const supabase = createClient();
    const propertyIds = props.map((p) => p.id);

    const [itemsRes, membershipsRes, domainsRes] = await Promise.all([
      supabase.from('items').select('property_id').in('property_id', propertyIds),
      supabase.from('property_memberships').select('property_id').in('property_id', propertyIds),
      supabase.from('custom_domains').select('property_id, domain').in('property_id', propertyIds).eq('status', 'active'),
    ]);

    const itemCounts: Record<string, number> = {};
    if (itemsRes.data) {
      for (const item of itemsRes.data) {
        itemCounts[item.property_id] = (itemCounts[item.property_id] || 0) + 1;
      }
    }

    const memberCounts: Record<string, number> = {};
    if (membershipsRes.data) {
      for (const m of membershipsRes.data) {
        memberCounts[m.property_id] = (memberCounts[m.property_id] || 0) + 1;
      }
    }

    const customDomains: Record<string, string> = {};
    if (domainsRes.data) {
      for (const d of domainsRes.data) {
        customDomains[d.property_id] = d.domain;
      }
    }

    return { properties: props, itemCounts, memberCounts, customDomains };
  },
});

const properties = queryData?.properties ?? [];
const itemCounts = queryData?.itemCounts ?? {};
const memberCounts = queryData?.memberCounts ?? {};
const customDomains = queryData?.customDomains ?? {};
```

- [ ] **Step 2: Update handleArchiveToggle to invalidate**

In `handleArchiveToggle` (line 141), replace:
```tsx
      await loadProperties();
```
with:
```tsx
      await queryClient.invalidateQueries({ queryKey: ['admin', 'properties'] });
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/properties/page.tsx
git commit -m "feat: convert admin properties page to React Query"
```

---

### Task 5: Convert /admin/properties/[slug]/settings page

**Files:**
- Modify: `src/app/admin/properties/[slug]/settings/page.tsx`

- [ ] **Step 1: Replace useEffect data fetching with useQuery**

Add import:
```tsx
import { useQuery } from '@tanstack/react-query';
```

Remove `propertyId` useState (line 34), `propertyGeoLayers` useState (line 35), `layerAssignments` useState (line 36), and `currentBoundaryId` useState (line 37).

Remove both useEffect blocks (lines 39-49 and 51-60).

Replace with:
```tsx
const { data: propertyId } = useQuery({
  queryKey: ['admin', 'property', slug, 'id'],
  queryFn: async () => {
    const supabase = createClient();
    const { data } = await supabase.from('properties').select('id').eq('slug', slug).single();
    return data?.id ?? null;
  },
});

const { data: geoLayerData } = useQuery({
  queryKey: ['admin', 'property', slug, 'geo-layers'],
  queryFn: async () => {
    if (!propertyId) return { layers: [] as GeoLayerSummary[], assignments: [] as GeoLayerProperty[], boundaryId: null };
    const result = await getPropertyGeoLayers(propertyId);
    if ('success' in result) {
      return { layers: result.layers, assignments: result.assignments, boundaryId: null };
    }
    return { layers: [] as GeoLayerSummary[], assignments: [] as GeoLayerProperty[], boundaryId: null };
  },
  enabled: activeTab === 'geo-layers' && !!propertyId,
});

const propertyGeoLayers = geoLayerData?.layers ?? [];
const layerAssignments = geoLayerData?.assignments ?? [];
const [currentBoundaryId, setCurrentBoundaryId] = useState<string | null>(null);
```

Also remove the `useEffect` import if no longer needed — but we don't use useEffect here anymore, so remove it from the import on line 3. Keep `useState`.

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/properties/[slug]/settings/page.tsx
git commit -m "feat: convert property settings page to React Query"
```

---

### Task 6: Convert /admin/properties/[slug]/data page

**Files:**
- Modify: `src/app/admin/properties/[slug]/data/page.tsx`

- [ ] **Step 1: Replace useEffect+useState with useQuery**

Update imports (lines 1-9):
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Item, ItemUpdate, UpdateType, Role } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/item/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatShortDate } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
```

Remove `users`, `availableRoles`, `items`, `updates`, `updateTypes`, `loading` useState (lines 24-29) and the entire useEffect block (lines 32-76).

Replace with:
```tsx
const queryClient = useQueryClient();

const { data: queryData, isLoading: loading } = useQuery({
  queryKey: ['admin', 'property-data'],
  queryFn: async () => {
    const supabase = createClient();
    const [membershipRes, roleRes, itemRes, updateRes, typeRes] = await Promise.all([
      supabase.from('org_memberships')
        .select('id, role_id, users!inner(id, display_name, email, is_temporary, created_at), roles!inner(id, name)')
        .eq('status', 'active')
        .order('created_at', { ascending: true }),
      supabase.from('roles').select('*').order('sort_order', { ascending: true }),
      supabase.from('items').select('*').order('name', { ascending: true }),
      supabase.from('item_updates').select('*').order('update_date', { ascending: false }),
      supabase.from('update_types').select('*').order('sort_order', { ascending: true }),
    ]);

    const users: UserWithMembership[] = (membershipRes.data ?? []).map((m: any) => ({
      id: m.users.id,
      display_name: m.users.display_name,
      email: m.users.email,
      is_temporary: m.users.is_temporary,
      created_at: m.users.created_at,
      role_name: m.roles.name,
      role_id: m.role_id,
      membership_id: m.id,
    }));

    const availableRoles = (roleRes.data ?? []) as Role[];
    const items = (itemRes.data ?? []) as Item[];
    const updateTypes = (typeRes.data ?? []) as UpdateType[];

    const typeMap = new Map(updateTypes.map((t) => [t.id, t]));
    const updates = (updateRes.data ?? []).map((u: any) => ({
      ...u,
      item_name: items.find((b) => b.id === u.item_id)?.name,
      update_type_name: typeMap.get(u.update_type_id)?.name,
    }));

    return { users, availableRoles, items, updates, updateTypes };
  },
});

const users = queryData?.users ?? [];
const availableRoles = queryData?.availableRoles ?? [];
const items = queryData?.items ?? [];
const updates = queryData?.updates ?? [];
```

- [ ] **Step 2: Update mutation handlers to invalidate**

Replace the three mutation handlers. For `handleDeleteItem` (lines 78-88):
```tsx
async function handleDeleteItem(id: string) {
  if (!confirm('Delete this item and all its updates? This cannot be undone.')) return;
  const supabase = createClient();
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (!error) {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'property-data'] });
  }
}
```

For `handleDeleteUpdate` (lines 90-99):
```tsx
async function handleDeleteUpdate(id: string) {
  if (!confirm('Delete this update?')) return;
  const supabase = createClient();
  const { error } = await supabase.from('item_updates').delete().eq('id', id);
  if (!error) {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'property-data'] });
  }
}
```

For `handleRoleChange` (lines 101-116):
```tsx
async function handleRoleChange(membershipId: string, newRoleId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from('org_memberships')
    .update({ role_id: newRoleId })
    .eq('id', membershipId);
  if (!error) {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'property-data'] });
  }
}
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/properties/[slug]/data/page.tsx
git commit -m "feat: convert property data page to React Query"
```

---

### Task 7: Convert /admin/properties/[slug]/types page

**Files:**
- Modify: `src/app/admin/properties/[slug]/types/page.tsx`

- [ ] **Step 1: Replace useEffect+useState with useQuery**

Update imports (lines 1-7):
```tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ItemType } from '@/lib/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ItemTypeEditor from '@/components/admin/ItemTypeEditor';
import { useQuery, useQueryClient } from '@tanstack/react-query';
```

Remove `itemTypes`, `itemCounts`, `loading` useState (lines 10-12), the useEffect (lines 21-23), and the `fetchData` function (lines 25-44).

Replace with:
```tsx
const queryClient = useQueryClient();

const { data: queryData, isLoading: loading } = useQuery({
  queryKey: ['admin', 'property-types'],
  queryFn: async () => {
    const supabase = createClient();
    const [typeRes, itemRes] = await Promise.all([
      supabase.from('item_types').select('*').order('sort_order', { ascending: true }),
      supabase.from('items').select('id, item_type_id'),
    ]);

    const itemTypes = (typeRes.data ?? []) as ItemType[];
    const itemCounts: Record<string, number> = {};
    if (itemRes.data) {
      for (const item of itemRes.data) {
        itemCounts[item.item_type_id] = (itemCounts[item.item_type_id] || 0) + 1;
      }
    }
    return { itemTypes, itemCounts };
  },
});

const itemTypes = queryData?.itemTypes ?? [];
const itemCounts = queryData?.itemCounts ?? {};
```

- [ ] **Step 2: Update mutation handlers to invalidate**

In `handleAddType` (lines 46-76), replace the local state updates:
```tsx
      setItemTypes((prev) => [...prev, data]);
      setItemCounts((prev) => ({ ...prev, [data.id]: 0 }));
```
with:
```tsx
      await queryClient.invalidateQueries({ queryKey: ['admin', 'property-types'] });
```

Keep the form reset and `setExpandedId(data.id)`.

In `handleSaveType` (lines 78-83), replace:
```tsx
    setItemTypes((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
```
with:
```tsx
    await queryClient.invalidateQueries({ queryKey: ['admin', 'property-types'] });
```

In `handleDeleteType` (lines 85-92), replace:
```tsx
    setItemTypes((prev) => prev.filter((t) => t.id !== id));
    setItemCounts((prev) => { const c = { ...prev }; delete c[id]; return c; });
```
with:
```tsx
    await queryClient.invalidateQueries({ queryKey: ['admin', 'property-types'] });
```

In `handleReorder` (lines 94-113), replace the local state update block (lines 108-112):
```tsx
    const updated = [...itemTypes];
    updated[index] = { ...current, sort_order: swap.sort_order };
    updated[swapIndex] = { ...swap, sort_order: current.sort_order };
    updated.sort((a, b) => a.sort_order - b.sort_order);
    setItemTypes(updated);
```
with:
```tsx
    await queryClient.invalidateQueries({ queryKey: ['admin', 'property-types'] });
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/properties/[slug]/types/page.tsx
git commit -m "feat: convert property types page to React Query"
```

---

### Task 8: Convert /admin/properties/[slug]/members page

**Files:**
- Modify: `src/app/admin/properties/[slug]/members/page.tsx`

- [ ] **Step 1: Replace useEffect+useState with useQuery**

Update imports — replace line 1-14:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { EmptyState } from '@/components/admin/EmptyState';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPropertyMembers,
  addPropertyOverrideForProperty as addPropertyOverride,
  removePropertyOverrideForProperty as removePropertyOverride,
  type PropertyMember,
} from './actions';
```

Remove `property`, `members`, `availableRoles`, `loading`, `pageError` useState (lines 34-38), the `loadData` function (lines 50-73), and the useEffect (lines 75-78).

Replace with:
```tsx
const queryClient = useQueryClient();

const { data: queryData, isLoading: loading } = useQuery({
  queryKey: ['admin', 'property', slug, 'members'],
  queryFn: async () => {
    const [membersResult, rolesResult] = await Promise.all([
      getPropertyMembers(slug),
      createClient()
        .from('roles')
        .select('id, name, base_role')
        .neq('base_role', 'platform_admin')
        .order('sort_order', { ascending: true }),
    ]);

    if (membersResult.error || !membersResult.property) {
      return { error: membersResult.error ?? 'Property not found', property: null, members: [], availableRoles: [] };
    }

    return {
      error: null,
      property: membersResult.property as Property,
      members: (membersResult.members ?? []) as PropertyMember[],
      availableRoles: (rolesResult.data ?? []) as Role[],
    };
  },
});

const property = queryData?.property ?? null;
const members = queryData?.members ?? [];
const availableRoles = queryData?.availableRoles ?? [];
const pageError = queryData?.error ?? null;
```

- [ ] **Step 2: Update mutation handlers to invalidate**

In `handleAddOverride` (line 101), replace:
```tsx
        await loadData();
```
with:
```tsx
        await queryClient.invalidateQueries({ queryKey: ['admin', 'property', slug, 'members'] });
```

In `handleRemoveOverride` (line 115), replace:
```tsx
        await loadData();
```
with:
```tsx
        await queryClient.invalidateQueries({ queryKey: ['admin', 'property', slug, 'members'] });
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/properties/[slug]/members/page.tsx
git commit -m "feat: convert property members page to React Query"
```

---

### Task 9: Convert /admin/geo-layers page

**Files:**
- Modify: `src/app/admin/geo-layers/page.tsx`

- [ ] **Step 1: Replace useEffect+useState with useQuery**

Update imports (lines 1-5):
```tsx
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
```

Remove `orgId`, `layers`, `loading`, `properties`, `assignments` useState (lines 24-26, 32-33), the `loadLayers` and `loadAssignments` useCallback functions (lines 52-69), and all three useEffect blocks (lines 36-50, 71-74, 76-90).

Replace with:
```tsx
const queryClient = useQueryClient();

const { data: orgId } = useQuery({
  queryKey: ['admin', 'org-id'],
  queryFn: async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('org_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
    return data?.org_id ?? null;
  },
});

const { data: layersData, isLoading: loading } = useQuery({
  queryKey: ['admin', 'geo-layers', orgId],
  queryFn: async () => {
    if (!orgId) return { layers: [], assignments: [], properties: [] };

    const supabase = createClient();
    const [layersResult, assignmentsResult, propertiesResult] = await Promise.all([
      listGeoLayers(orgId),
      getOrgLayerAssignments(orgId),
      supabase
        .from('properties')
        .select('id, name, slug')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('name', { ascending: true }),
    ]);

    const layers = 'error' in layersResult ? [] : layersResult.layers;
    const assignments = 'error' in assignmentsResult ? [] : assignmentsResult.assignments;
    const properties = (propertiesResult.data ?? []).map((p: { id: string; name: string; slug: string }) => ({
      id: p.id,
      name: p.name || p.slug,
    }));

    return { layers, assignments, properties };
  },
  enabled: !!orgId,
});

const layers = layersData?.layers ?? [];
const assignments = layersData?.assignments ?? [];
const properties = layersData?.properties ?? [];
```

- [ ] **Step 2: Update all mutation handlers to invalidate**

Create a helper to invalidate:
```tsx
function invalidateLayers() {
  return queryClient.invalidateQueries({ queryKey: ['admin', 'geo-layers', orgId] });
}
```

In `handleToggleProperty` (line 109), replace `loadAssignments()` with `await invalidateLayers()`.

In `handleImport` (lines 151-152), replace `loadLayers()` and `loadAssignments()` with `await invalidateLayers()`.

In `handleDelete` (lines 162-163), replace `loadLayers()` and `loadAssignments()` with `await invalidateLayers()`.

In `handleSaveEdit` (line 175), replace `loadLayers()` with `await invalidateLayers()`.

In `handlePublish` (line 184), replace `loadLayers()` with `await invalidateLayers()`.

In `handleUnpublish` (line 194), replace `loadLayers()` with `await invalidateLayers()`.

Also add error handling for `handleToggleProperty`, `handleImport`, `handleDelete` — keep the existing `setMessage` calls but replace the refetch calls.

- [ ] **Step 3: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/geo-layers/page.tsx
git commit -m "feat: convert geo layers page to React Query"
```

---

### Task 10: Convert /admin/roles/[roleId] page

**Files:**
- Modify: `src/app/admin/roles/[roleId]/page.tsx`

- [ ] **Step 1: Replace useEffect+useState with useQuery**

Update imports (lines 1-7):
```tsx
'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import PermissionEditor from '@/components/admin/PermissionEditor';
import { getRoles, updateRole } from '../actions';
import { RolePermissions } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
```

Remove `role`, `loading`, `notFound` useState (lines 24-26) and the useEffect (lines 38-62).

Replace with:
```tsx
const { data: queryResult, isLoading: loading } = useQuery({
  queryKey: ['admin', 'roles', roleId],
  queryFn: async () => {
    const result = await getRoles();
    if (!result.roles) return { role: null, notFound: true };
    const found = (result.roles as Role[]).find((r) => r.id === roleId);
    if (!found) return { role: null, notFound: true };
    return { role: found, notFound: false };
  },
});

const role = queryResult?.role ?? null;
const notFound = queryResult?.notFound ?? false;
```

Add a useEffect to sync editable fields when role loads. Add `useEffect` back to imports:
```tsx
import { useState, useEffect } from 'react';
```

Add after the useQuery:
```tsx
useEffect(() => {
  if (role) {
    setName(role.name);
    setDescription(role.description ?? '');
    setPermissions(role.permissions);
  }
}, [role]);
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/roles/[roleId]/page.tsx
git commit -m "feat: convert role editor page to React Query"
```

---

### Task 11: Convert /admin/domains page

**Files:**
- Modify: `src/app/admin/domains/page.tsx`

- [ ] **Step 1: Replace useEffect+useState with useQuery**

Update imports (lines 1-11):
```tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { EmptyState } from '@/components/admin/EmptyState';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addCustomDomain,
  removeCustomDomain,
  checkDomainStatus,
} from '@/lib/domains/actions';
```

Remove `orgDomains`, `propertyDomains`, `properties`, `loading`, `orgId` useState (lines 103-107), the `loadData` useCallback (lines 123-186), and the useEffect (lines 188-190).

Replace with:
```tsx
const queryClient = useQueryClient();

const { data: queryData, isLoading: loading } = useQuery({
  queryKey: ['admin', 'domains'],
  queryFn: async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { orgDomains: [], propertyDomains: [], properties: [], orgId: null };

    const { data: membership } = await supabase
      .from('org_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!membership) return { orgDomains: [], propertyDomains: [], properties: [], orgId: null };
    const orgId = membership.org_id;

    const { data: domainsData } = await supabase
      .from('custom_domains')
      .select(`
        id, domain, domain_type, status, ssl_status, is_primary,
        property_id, verified_at, created_at, verification_token,
        properties ( name )
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: true });

    const rows: OrgDomain[] = (domainsData || []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      domain: d.domain as string,
      domain_type: (d.domain_type as string) || 'subdomain',
      status: d.status as string,
      ssl_status: (d.ssl_status as string) ?? null,
      is_primary: d.is_primary as boolean,
      property_id: (d.property_id as string) ?? null,
      property_name: (d.properties as { name: string } | null)?.name ?? null,
      verified_at: (d.verified_at as string) ?? null,
      created_at: d.created_at as string,
      verification_token: (d.verification_token as string) ?? null,
    }));

    const { data: propsData } = await supabase
      .from('properties')
      .select('id, name, slug, primary_custom_domain_id')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    return {
      orgDomains: rows.filter((r) => r.property_id === null),
      propertyDomains: rows.filter((r) => r.property_id !== null),
      properties: (propsData || []) as PropertyInfo[],
      orgId,
    };
  },
});

const orgDomains = queryData?.orgDomains ?? [];
const propertyDomains = queryData?.propertyDomains ?? [];
const properties = queryData?.properties ?? [];
const orgId = queryData?.orgId ?? null;
```

- [ ] **Step 2: Update mutation handlers to invalidate**

In each handler, replace `await loadData()` with:
```tsx
await queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
```

This applies to:
- `handleAddDomain` (line 232)
- `handleRemove` (line 239)
- `handleCheckStatus` (line 246)
- `handleAddSubdomain` (line 258)

- [ ] **Step 3: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/domains/page.tsx
git commit -m "feat: convert domains page to React Query"
```

---

### Task 12: Convert /manage dashboard page

**Files:**
- Modify: `src/app/manage/page.tsx`

- [ ] **Step 1: Replace useEffect+useState with useQuery**

Update imports (lines 1-9):
```tsx
'use client';

import Link from 'next/link';
import type { Item } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/item/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { usePermissions } from '@/lib/permissions/hooks';
import { useQuery } from '@tanstack/react-query';
```

Remove `items` and `loading` useState (lines 12-13) and the useEffect (lines 16-29).

Replace with:
```tsx
const { data: items = [], isLoading: loading } = useQuery({
  queryKey: ['manage', 'dashboard'],
  queryFn: async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('items')
      .select('*')
      .order('name', { ascending: true });
    return (data ?? []) as Item[];
  },
});
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/app/manage/page.tsx
git commit -m "feat: convert manage dashboard to React Query"
```

---

### Task 13: Convert EntitySelect component

**Files:**
- Modify: `src/components/manage/EntitySelect.tsx`

- [ ] **Step 1: Replace useEffect+useState with useQuery**

Update imports (lines 1-5):
```tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Entity } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
```

Remove `entities` and `loading` useState (lines 15-16) and the useEffect (lines 19-31).

Replace with:
```tsx
const { data: entities = [], isLoading: loading } = useQuery({
  queryKey: ['entities', entityTypeId],
  queryFn: async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('entities')
      .select('*')
      .eq('entity_type_id', entityTypeId)
      .order('sort_order', { ascending: true });
    return (data ?? []) as Entity[];
  },
});
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/components/manage/EntitySelect.tsx
git commit -m "feat: convert EntitySelect to React Query"
```

---

### Task 14: Convert LocationHistory component

**Files:**
- Modify: `src/components/manage/LocationHistory.tsx`

- [ ] **Step 1: Replace useEffect+useState with useQuery**

Update imports (lines 1-6):
```tsx
'use client';

import { createClient } from '@/lib/supabase/client';
import type { LocationHistory as LocationHistoryType, Profile } from '@/lib/types';
import { formatShortDate } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
```

Remove `history`, `profiles`, `loading` useState (lines 14-16) and the useEffect (lines 18-53).

Replace with:
```tsx
const { data: queryData, isLoading: loading } = useQuery({
  queryKey: ['location-history', itemId],
  queryFn: async () => {
    const supabase = createClient();
    const { data: historyData } = await supabase
      .from('location_history')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (!historyData || historyData.length === 0) {
      return { history: [], profiles: {} };
    }

    const creatorIds = Array.from(new Set(historyData.map((h) => h.created_by)));
    const { data: profileData } = await supabase
      .from('users')
      .select('*')
      .in('id', creatorIds);

    const profiles: Record<string, Profile> = {};
    if (profileData) {
      for (const p of profileData) {
        profiles[p.id] = p;
      }
    }

    return { history: historyData as LocationHistoryType[], profiles };
  },
});

const history = queryData?.history ?? [];
const profiles = queryData?.profiles ?? {};
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/components/manage/LocationHistory.tsx
git commit -m "feat: convert LocationHistory to React Query"
```

---

### Task 15: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run type check**

```bash
npm run type-check
```

Expected: No type errors.

- [ ] **Step 2: Run tests**

```bash
npm run test
```

Expected: All tests pass.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Verify no unused imports**

Spot-check a few converted files to ensure no leftover `useEffect` imports where they're no longer needed, and no unused `useState` variables.
