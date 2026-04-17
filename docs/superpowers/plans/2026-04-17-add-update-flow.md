# Add Update Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken "Add Update" button in field mode (`/p/[slug]/*`). Replace the middleware rewrite that currently dead-ends on the stub Activity page with a real type-picker → form flow that reuses the existing `UpdateForm`.

**Architecture:** Add two new routes under `/p/[slug]/update/[itemId]` (picker) and `/p/[slug]/update/[itemId]/[typeId]` (form wrapper). Extend `UpdateForm` with `initialTypeId` / `lockType` props and redirect post-save to the item detail via `/p/[slug]?item=[itemId]`. Rewire the middleware rule and the two entry points (`ActionButtonsBlock`, `DetailPanel`) to hit the new path.

**Tech Stack:** Next.js 14 App Router, React client components, Supabase, existing offline store (`useOfflineStore`), Vitest + @testing-library/react, Playwright.

**Spec:** `docs/superpowers/specs/2026-04-17-add-update-flow-design.md`

---

## File Structure

**New files:**

- `src/components/manage/UpdateTypePicker.tsx` — client component that fetches update_types applicable to a given item, filters by per-type create permission, renders a grid of cards (or empty state).
- `src/components/manage/__tests__/UpdateTypePicker.test.tsx` — unit tests for the picker (multiple types, one type → auto-redirect, zero types → empty state, role-restricted filtering).
- `src/app/p/[slug]/update/[itemId]/page.tsx` — picker page; thin wrapper that mounts `<UpdateTypePicker itemId={...} />`.
- `src/app/p/[slug]/update/[itemId]/[typeId]/page.tsx` — form wrapper page; mounts `<UpdateForm initialTypeId={typeId} lockType />`.

**Modified files:**

- `src/components/manage/UpdateForm.tsx` — add `initialTypeId`/`lockType` props; read `slug` via `useParams()` for post-save redirect.
- `src/components/manage/__tests__/UpdateForm.test.tsx` — add tests for new props; update post-save redirect test.
- `src/lib/supabase/middleware.ts` — rewrite the `/manage/update` rule to be query-param-aware and point to the new picker.
- `src/components/layout/blocks/ActionButtonsBlock.tsx` — rewrite `addUpdateHref` to `/p/${slug}/update/${itemId}`, falling back to `/manage/update?item=…` when slug is unavailable.
- `src/components/layout/__tests__/ActionButtonsBlock.test.tsx` — update href assertions; add a `useParams`-mocked test for the tenant-scoped path.
- `src/components/item/DetailPanel.tsx` — rewrite the default-layout "Add Update" link similarly.

**Untouched:** `update_types`/`update_type_fields` schema, `PhotoUploader`, `SpeciesPicker`, `EntitySelect`, offline queue, RBAC, `UpdateTimeline`, `/p/[slug]/activity/page.tsx` stub.

---

## Task 1: Extend `UpdateForm` with type-lock props + item-aware post-save redirect

**Files:**
- Modify: `src/components/manage/UpdateForm.tsx`
- Modify: `src/components/manage/__tests__/UpdateForm.test.tsx`

### Context

`UpdateForm` already reads `?item=` from `useSearchParams()` (line 24) and renders a locked item card when set. We need the same for type. `useSearchParams` is the wrong tool here because the type will be a route param in the new URL; we'll accept it as a prop instead so the caller (the wrapper page) passes it in.

We also change the post-save redirect (line 220 `router.push('/manage')`) so the user returns to the map with their item's detail panel open. The slug is read from `useParams()` so the form works when mounted at `/p/[slug]/update/[itemId]/[typeId]`. If there's no slug (legacy `/manage/update` mount), we fall back to `/manage`.

- [ ] **Step 1.1: Add failing test — `initialTypeId` pre-selects and disables the type select**

Open `src/components/manage/__tests__/UpdateForm.test.tsx`. Append a new `describe` block after the existing `UpdateForm — locked (with ?item=item-1 param)` block:

```tsx
describe('UpdateForm — type locked (initialTypeId + lockType props)', () => {
  beforeEach(() => {
    mockSearchParamsGet = vi.fn((key: string) => (key === 'item' ? 'item-1' : null));
    mockPush.mockReset();
    mockBack.mockReset();
  });

  it('pre-selects the given update type', async () => {
    render(<UpdateForm initialTypeId="ut-1" lockType />);
    const select = await screen.findByLabelText(/update type/i) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('ut-1'));
  });

  it('disables the update type select when lockType is true', async () => {
    render(<UpdateForm initialTypeId="ut-1" lockType />);
    const select = await screen.findByLabelText(/update type/i) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('ut-1'));
    expect(select).toBeDisabled();
  });

  it('leaves the update type select enabled when lockType is false', async () => {
    render(<UpdateForm initialTypeId="ut-1" />);
    const select = await screen.findByLabelText(/update type/i) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('ut-1'));
    expect(select).not.toBeDisabled();
  });
});
```

- [ ] **Step 1.2: Run the new tests to confirm they fail**

Run: `npm run test -- src/components/manage/__tests__/UpdateForm.test.tsx`

Expected: the three new tests fail (current `UpdateForm` accepts no props, can't satisfy the assertions).

- [ ] **Step 1.3: Extend the `UpdateForm` signature and disable logic**

In `src/components/manage/UpdateForm.tsx`, change the component signature and the type `<select>` to accept and respect the new props.

Replace line 21:

```tsx
export default function UpdateForm() {
```

with:

```tsx
interface UpdateFormProps {
  /** When set, pre-select this update type. */
  initialTypeId?: string;
  /** When true (and initialTypeId is set), disable the type select. */
  lockType?: boolean;
}

export default function UpdateForm({ initialTypeId, lockType = false }: UpdateFormProps = {}) {
```

Change the `updateTypeId` initial state (line 46) from:

```tsx
const [updateTypeId, setUpdateTypeId] = useState('');
```

to:

```tsx
const [updateTypeId, setUpdateTypeId] = useState(initialTypeId ?? '');
```

Change the "default to first global type" logic (lines 82-83) to respect the prop:

```tsx
if (typeData) {
  setUpdateTypes(typeData);
  // Default to first global type — only when no explicit initialTypeId was given.
  if (!initialTypeId) {
    const firstGlobal = typeData.find((t) => t.is_global);
    if (firstGlobal) setUpdateTypeId(firstGlobal.id);
  }
}
```

Add `disabled={lockType && !!initialTypeId}` to the type `<select>` (around line 291-297):

```tsx
<select
  id="type"
  value={updateTypeId}
  onChange={(e) => { setUpdateTypeId(e.target.value); setCustomFieldValues({}); }}
  className="input-field"
  required
  disabled={lockType && !!initialTypeId}
>
```

- [ ] **Step 1.4: Run tests — the three new tests should now pass**

Run: `npm run test -- src/components/manage/__tests__/UpdateForm.test.tsx`

Expected: all tests in the file pass (new three plus all existing).

- [ ] **Step 1.5: Add failing test — post-save redirect targets `/p/[slug]?item=[itemId]`**

Near the top of the existing test file, extend the `next/navigation` mock to include `useParams` (the existing mock only covers `useRouter` and `useSearchParams`). Replace the `vi.mock('next/navigation', …)` block (around line 87-96) with:

```tsx
let mockParams: Record<string, string> = {};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
  useParams: () => mockParams,
}));
```

Then append a new `describe` block after the type-lock tests:

```tsx
describe('UpdateForm — post-save redirect', () => {
  beforeEach(() => {
    mockSearchParamsGet = vi.fn((key: string) => (key === 'item' ? 'item-1' : null));
    mockPush.mockReset();
    mockBack.mockReset();
    mockParams = {};
  });

  it('redirects to /p/[slug]?item=[itemId] when slug is in route params', async () => {
    mockParams = { slug: 'oak-meadow' };
    render(<UpdateForm initialTypeId="ut-1" lockType />);
    const submit = await screen.findByRole('button', { name: /add update/i });
    await userEvent.click(submit);
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/p/oak-meadow?item=item-1')
    );
  });

  it('falls back to /manage when no slug is in route params (legacy mount)', async () => {
    mockParams = {};
    render(<UpdateForm initialTypeId="ut-1" lockType />);
    const submit = await screen.findByRole('button', { name: /add update/i });
    await userEvent.click(submit);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/manage'));
  });
});
```

- [ ] **Step 1.6: Run the new redirect tests — they should fail**

Run: `npm run test -- src/components/manage/__tests__/UpdateForm.test.tsx`

Expected: the two new redirect tests fail (current code always `router.push('/manage')`).

- [ ] **Step 1.7: Implement the item-aware redirect in `UpdateForm`**

Add `useParams` to the `next/navigation` import (line 4):

```tsx
import { useRouter, useSearchParams, useParams } from 'next/navigation';
```

Inside the component body, near the existing `useRouter` / `useSearchParams` lines (22-24), add:

```tsx
const params = useParams();
const slug = typeof params?.slug === 'string' ? params.slug : null;
```

Replace the current post-save redirect (lines 220-221):

```tsx
router.push('/manage');
router.refresh();
```

with:

```tsx
if (slug && isLocked && preselectedItemId) {
  router.push(`/p/${slug}?item=${preselectedItemId}`);
} else {
  router.push('/manage');
}
router.refresh();
```

- [ ] **Step 1.8: Run the full test file**

Run: `npm run test -- src/components/manage/__tests__/UpdateForm.test.tsx`

Expected: all tests pass.

- [ ] **Step 1.9: Run type-check**

Run: `npm run type-check`

Expected: no type errors.

- [ ] **Step 1.10: Commit**

```bash
git add src/components/manage/UpdateForm.tsx src/components/manage/__tests__/UpdateForm.test.tsx
git commit -m "feat(updates): add type-lock props and item-aware post-save redirect to UpdateForm"
```

---

## Task 2: Build `UpdateTypePicker` component

**Files:**
- Create: `src/components/manage/UpdateTypePicker.tsx`
- Create: `src/components/manage/__tests__/UpdateTypePicker.test.tsx`

### Context

A client component that takes an `itemId`, resolves that item's `item_type_id`, fetches the applicable `update_types` (global + item-type-specific) from the offline store, filters by per-type create permission (via the existing `canPerformUpdateTypeAction` helper), and renders:

- **Zero types**: an empty state pointing admins to the update-type editor.
- **Exactly one type**: auto-navigates (`router.replace`) to `/p/[slug]/update/[itemId]/[typeId]` — the user never lingers here.
- **≥2 types**: a grid of cards, each linking to the form wrapper route.

The component follows the same data-access pattern as `UpdateForm` (lines 57-98): `useOfflineStore`, `useConfig().propertyId` for scoping, `usePermissions` for role resolution. It reuses `IconRenderer` for icons.

- [ ] **Step 2.1: Write the failing tests**

Create `src/components/manage/__tests__/UpdateTypePicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import UpdateTypePicker from '@/components/manage/UpdateTypePicker';

const { mockItem, mockItemTypes, mockUpdateTypes } = vi.hoisted(() => {
  const mockItem = {
    id: 'item-1',
    name: 'Box Alpha',
    status: 'active',
    item_type_id: 'type-1',
    latitude: 0,
    longitude: 0,
    description: null,
    custom_field_values: {},
    created_at: '',
    updated_at: '',
    created_by: null,
    org_id: 'org-1',
    property_id: 'prop-1',
  };
  const mockItemTypes = [
    { id: 'type-1', name: 'Birdbox', icon: { set: 'emoji', name: '🐦' }, color: '#00ff00', sort_order: 1, created_at: '', org_id: 'org-1' },
  ];
  const mockUpdateTypes = [
    { id: 'ut-1', name: 'Observation', icon: '👀', is_global: true,  item_type_id: null,     sort_order: 1, org_id: 'org-1', min_role_create: null,       min_role_edit: null, min_role_delete: null },
    { id: 'ut-2', name: 'Maintenance', icon: '🔧', is_global: true,  item_type_id: null,     sort_order: 2, org_id: 'org-1', min_role_create: null,       min_role_edit: null, min_role_delete: null },
    { id: 'ut-3', name: 'Admin Only',  icon: '🔒', is_global: true,  item_type_id: null,     sort_order: 3, org_id: 'org-1', min_role_create: 'org_admin', min_role_edit: null, min_role_delete: null },
    { id: 'ut-4', name: 'Other Type',  icon: '❓', is_global: false, item_type_id: 'type-X', sort_order: 4, org_id: 'org-1', min_role_create: null,       min_role_edit: null, min_role_delete: null },
  ];
  return { mockItem, mockItemTypes, mockUpdateTypes };
});

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useParams: () => ({ slug: 'oak-meadow' }),
}));

vi.mock('@/lib/config/client', () => ({
  useConfig: () => ({ propertyId: 'prop-1' }),
}));

let mockUpdateTypesReturn = mockUpdateTypes;
vi.mock('@/lib/offline/provider', () => ({
  useOfflineStore: () => ({
    getItem: vi.fn().mockResolvedValue(mockItem),
    getItemTypes: vi.fn().mockResolvedValue(mockItemTypes),
    getUpdateTypes: vi.fn(async () => mockUpdateTypesReturn),
    db: {
      properties: { get: vi.fn().mockResolvedValue({ org_id: 'org-1' }) },
    },
  }),
}));

vi.mock('@/lib/permissions/hooks', () => ({
  usePermissions: () => ({ userBaseRole: 'contributor', loading: false }),
}));

describe('UpdateTypePicker', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockUpdateTypesReturn = mockUpdateTypes;
  });

  it('renders a card for each eligible update type', async () => {
    render(<UpdateTypePicker itemId="item-1" />);
    await waitFor(() => expect(screen.getByText('Observation')).toBeInTheDocument());
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    // Role-restricted one is hidden for a contributor
    expect(screen.queryByText('Admin Only')).not.toBeInTheDocument();
    // Wrong item_type_id is filtered out
    expect(screen.queryByText('Other Type')).not.toBeInTheDocument();
  });

  it('each card links to /p/[slug]/update/[itemId]/[typeId]', async () => {
    render(<UpdateTypePicker itemId="item-1" />);
    const observation = await screen.findByText('Observation');
    const link = observation.closest('a');
    expect(link?.getAttribute('href')).toBe('/p/oak-meadow/update/item-1/ut-1');
  });

  it('auto-redirects when exactly one update type is eligible', async () => {
    mockUpdateTypesReturn = [mockUpdateTypes[0]]; // only "Observation"
    render(<UpdateTypePicker itemId="item-1" />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/p/oak-meadow/update/item-1/ut-1')
    );
  });

  it('renders empty state when no update types are eligible', async () => {
    mockUpdateTypesReturn = [mockUpdateTypes[3]]; // only "Other Type", wrong item_type_id
    render(<UpdateTypePicker itemId="item-1" />);
    await waitFor(() =>
      expect(screen.getByText(/no update types configured/i)).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2.2: Run the new tests — they should fail (module not found)**

Run: `npm run test -- src/components/manage/__tests__/UpdateTypePicker.test.tsx`

Expected: FAIL with "Failed to resolve import '@/components/manage/UpdateTypePicker'".

- [ ] **Step 2.3: Implement `UpdateTypePicker`**

Create `src/components/manage/UpdateTypePicker.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOfflineStore } from '@/lib/offline/provider';
import { useConfig } from '@/lib/config/client';
import { usePermissions } from '@/lib/permissions/hooks';
import { canPerformUpdateTypeAction } from '@/lib/permissions/resolve';
import { IconRenderer } from '@/components/shared/IconPicker';
import type { Item, UpdateType } from '@/lib/types';

interface UpdateTypePickerProps {
  itemId: string;
}

export default function UpdateTypePicker({ itemId }: UpdateTypePickerProps) {
  const router = useRouter();
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : null;

  const config = useConfig();
  const propertyId = config.propertyId;
  const offlineStore = useOfflineStore();
  const { userBaseRole, loading: permsLoading } = usePermissions();

  const [item, setItem] = useState<Item | null>(null);
  const [updateTypes, setUpdateTypes] = useState<UpdateType[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      if (!propertyId) return;
      const property = await offlineStore.db.properties.get(propertyId);
      const orgId = property?.org_id;
      if (!orgId) return;
      const [fetchedItem, types] = await Promise.all([
        offlineStore.getItem(itemId),
        offlineStore.getUpdateTypes(orgId),
      ]);
      setItem(fetchedItem ?? null);
      setUpdateTypes(types ?? []);
      setLoaded(true);
    }
    load();
  }, [itemId, propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const eligibleTypes = useMemo(() => {
    if (!item) return [];
    return updateTypes
      .filter((t) => t.is_global || t.item_type_id === item.item_type_id)
      .filter((t) => canPerformUpdateTypeAction(userBaseRole, t, 'create') !== false)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [item, updateTypes, userBaseRole]);

  // Auto-redirect when exactly one type is eligible.
  useEffect(() => {
    if (!loaded || permsLoading) return;
    if (eligibleTypes.length === 1 && slug) {
      router.replace(`/p/${slug}/update/${itemId}/${eligibleTypes[0].id}`);
    }
  }, [loaded, permsLoading, eligibleTypes, slug, itemId, router]);

  if (!loaded || permsLoading) {
    return (
      <div className="py-8 text-center text-sm text-sage">Loading…</div>
    );
  }

  if (eligibleTypes.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-sage mb-2">No update types configured.</p>
        <p className="text-xs text-sage">
          Ask an admin to set up update types in the admin panel.
        </p>
      </div>
    );
  }

  if (eligibleTypes.length === 1) {
    // Redirecting in the effect above; show a brief loading state.
    return <div className="py-8 text-center text-sm text-sage">Loading…</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {eligibleTypes.map((t) => (
        <Link
          key={t.id}
          href={slug ? `/p/${slug}/update/${itemId}/${t.id}` : `#`}
          className="card flex flex-col items-center justify-center gap-2 py-6 hover:border-forest transition-colors"
        >
          <span className="text-3xl" aria-hidden="true">
            {typeof t.icon === 'string' ? t.icon : <IconRenderer icon={t.icon} size={32} />}
          </span>
          <span className="text-sm font-medium text-forest-dark text-center">
            {t.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2.4: Run the tests — they should now pass**

Run: `npm run test -- src/components/manage/__tests__/UpdateTypePicker.test.tsx`

Expected: all 4 tests pass.

- [ ] **Step 2.5: Run type-check**

Run: `npm run type-check`

Expected: no type errors.

- [ ] **Step 2.6: Commit**

```bash
git add src/components/manage/UpdateTypePicker.tsx src/components/manage/__tests__/UpdateTypePicker.test.tsx
git commit -m "feat(updates): add UpdateTypePicker component with auto-redirect + empty state"
```

---

## Task 3: Create the picker page route

**Files:**
- Create: `src/app/p/[slug]/update/[itemId]/page.tsx`

### Context

Thin page component that mounts `<UpdateTypePicker>`. It renders inside `FieldModeShell` (already configured in `src/app/p/[slug]/layout.tsx`), so the top bar and mobile bottom tabs come for free. Layout follows the pattern in `src/app/manage/update/page.tsx`: centered max-width wrapper, H1, short intro.

- [ ] **Step 3.1: Create the picker page**

Create `src/app/p/[slug]/update/[itemId]/page.tsx`:

```tsx
'use client';

import { useParams } from 'next/navigation';
import UpdateTypePicker from '@/components/manage/UpdateTypePicker';

export default function UpdatePickerPage() {
  const params = useParams();
  const itemId = params.itemId as string;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-2">
        Add Update
      </h1>
      <p className="text-sm text-sage mb-6">What would you like to log?</p>
      <UpdateTypePicker itemId={itemId} />
    </div>
  );
}
```

- [ ] **Step 3.2: Start the dev server and visit the picker**

Run: `npm run dev` (in another terminal or background).

In a browser, sign in and navigate to `/p/<your-slug>/update/<any-valid-item-id>`.

Expected: the header "Add Update" renders, followed by either a grid of type cards or the empty state. Confirm the grid cards go nowhere meaningful yet — that's Task 4.

- [ ] **Step 3.3: Run type-check**

Run: `npm run type-check`

Expected: no type errors.

- [ ] **Step 3.4: Commit**

```bash
git add src/app/p/[slug]/update/[itemId]/page.tsx
git commit -m "feat(updates): add type-picker route under /p/[slug]/update/[itemId]"
```

---

## Task 4: Create the form wrapper page route

**Files:**
- Create: `src/app/p/[slug]/update/[itemId]/[typeId]/page.tsx`

### Context

Mounts `<UpdateForm initialTypeId={typeId} lockType />` inside the same page shell. The form itself is responsible for reading `?item=` from searchParams — so we also ensure `?item=itemId` is present on this URL by forwarding the param when navigating (the `UpdateTypePicker` links already include the item in the path but not the query; the form expects `?item=`).

The cleanest solution: have this wrapper redirect to itself with `?item=<itemId>` appended if the query param is missing. Lower-friction: just have the wrapper pass `itemId` into a small shim that also populates the search param. We do the latter by mounting the form alongside an effect that ensures the search param is set — but even simpler: change `UpdateForm` to also honor the `itemId` route param as a fallback.

Since we don't want to thread more state into `UpdateForm` than necessary, the simplest change is: in this new wrapper page, construct the mount with `useSearchParams`/`useRouter` to add `?item=` if it's missing, then render the form. But that's a transient navigation.

**Pragmatic choice:** give the wrapper page the job of building the URL. We `router.replace` to the canonical URL-with-query the first time it mounts if the query is missing. This keeps `UpdateForm` untouched and the URL bookmarkable with full context.

- [ ] **Step 4.1: Create the form wrapper page**

Create `src/app/p/[slug]/update/[itemId]/[typeId]/page.tsx`:

```tsx
'use client';

import { useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import UpdateForm from '@/components/manage/UpdateForm';

export default function UpdateFormPage() {
  const params = useParams();
  const slug = params.slug as string;
  const itemId = params.itemId as string;
  const typeId = params.typeId as string;
  const router = useRouter();
  const searchParams = useSearchParams();

  // UpdateForm reads ?item= from searchParams to lock the item.
  // If the query is missing, canonicalize the URL so the form locks correctly.
  useEffect(() => {
    if (searchParams.get('item') !== itemId) {
      router.replace(`/p/${slug}/update/${itemId}/${typeId}?item=${itemId}`);
    }
  }, [slug, itemId, typeId, searchParams, router]);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">
        Add Update
      </h1>
      <div className="card">
        <Suspense fallback={<div className="py-8 text-center text-sm text-sage">Loading…</div>}>
          <UpdateForm initialTypeId={typeId} lockType />
        </Suspense>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.2: Test manually end-to-end**

Run: `npm run dev`.

Visit `/p/<slug>/update/<itemId>/<typeId>` (pick any valid ids). Expected: the URL redirects to `...?item=<itemId>`, the form renders with the locked item card and the type select pre-selected and disabled. Fill notes, submit. After submit, you should land on `/p/<slug>?item=<itemId>` with the detail panel open.

(If you can't easily find ids by hand yet, do this step after Task 6 when the click path is wired up.)

- [ ] **Step 4.3: Run type-check**

Run: `npm run type-check`

Expected: no type errors.

- [ ] **Step 4.4: Commit**

```bash
git add src/app/p/[slug]/update/[itemId]/[typeId]/page.tsx
git commit -m "feat(updates): add form-wrapper route under /p/[slug]/update/[itemId]/[typeId]"
```

---

## Task 5: Rewire the `/manage/update` middleware rule

**Files:**
- Modify: `src/lib/supabase/middleware.ts` (lines 328-357)

### Context

Current behavior (line 342): `/manage/update` → `/p/[slug]/activity` (dead-end stub).

New behavior:
- `/manage/update?item=X` → `/p/[slug]/update/X` (new picker).
- `/manage/update` (no `item`) → `/p/[slug]` (home, since we don't have a "pick an item first" flow in scope).

The existing `manageMap` lookup is keyed on pathname alone, so we need a small branch to read the query first.

Note: there are no existing middleware tests for this route mapping (grepping `src/lib/supabase/__tests__/` shows only an IP-hashing test). We'll verify this task via manual checks + E2E coverage in Task 9 rather than inventing new middleware integration tests.

- [ ] **Step 5.1: Update the middleware rule**

In `src/lib/supabase/middleware.ts`, locate the `/manage/update` block (around lines 328-357). Replace the current `manageMap` section:

```ts
      const manageMap: Record<string, string> = {
        '/manage': `/p/${defaultPropSlug}`,
        '/manage/add': `/p/${defaultPropSlug}/add`,
        '/manage/update': `/p/${defaultPropSlug}/activity`,
        '/manage/offline': `/p/${defaultPropSlug}`,
      };

      const editMatch = pathname.match(/^\/manage\/edit\/(.+)$/);
      if (editMatch) {
        url.pathname = `/p/${defaultPropSlug}/edit/${editMatch[1]}`;
        return NextResponse.redirect(url, 308);
      }

      if (manageMap[pathname]) {
        url.pathname = manageMap[pathname];
        return NextResponse.redirect(url, 308);
      }
```

with:

```ts
      const manageMap: Record<string, string> = {
        '/manage': `/p/${defaultPropSlug}`,
        '/manage/add': `/p/${defaultPropSlug}/add`,
        '/manage/offline': `/p/${defaultPropSlug}`,
      };

      const editMatch = pathname.match(/^\/manage\/edit\/(.+)$/);
      if (editMatch) {
        url.pathname = `/p/${defaultPropSlug}/edit/${editMatch[1]}`;
        return NextResponse.redirect(url, 308);
      }

      // /manage/update?item=X → /p/[slug]/update/X (new type picker).
      // /manage/update (no item) → /p/[slug] home, since we don't support
      // a standalone "pick an item first" flow in the public shell yet.
      if (pathname === '/manage/update') {
        const itemId = request.nextUrl.searchParams.get('item');
        url.search = '';
        url.pathname = itemId
          ? `/p/${defaultPropSlug}/update/${itemId}`
          : `/p/${defaultPropSlug}`;
        return NextResponse.redirect(url, 308);
      }

      if (manageMap[pathname]) {
        url.pathname = manageMap[pathname];
        return NextResponse.redirect(url, 308);
      }
```

- [ ] **Step 5.2: Verify the change manually**

Run: `npm run dev`.

In a browser, signed in as a user with a default property, navigate to `/manage/update?item=<valid-item-id>`.

Expected: the URL redirects to `/p/<slug>/update/<itemId>` (the new picker).

Also test `/manage/update` (no query) → should redirect to `/p/<slug>`.

- [ ] **Step 5.3: Run the full test suite to confirm no regressions**

Run: `npm run test`

Expected: all tests pass.

- [ ] **Step 5.4: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "fix(updates): rewrite /manage/update middleware rule to use new picker route"
```

---

## Task 6: Update `ActionButtonsBlock` to link to the new picker path

**Files:**
- Modify: `src/components/layout/blocks/ActionButtonsBlock.tsx`
- Modify: `src/components/layout/__tests__/ActionButtonsBlock.test.tsx`

### Context

Currently the block links to `/manage/update?item=<id>`. We want `/p/<slug>/update/<id>` directly when a slug is available (the block is rendered under `/p/[slug]/*` via `DetailPanel`/`LayoutRendererV2`). When there's no slug in route params (hypothetical non-/p context), fall back to the old URL — the middleware from Task 5 will still catch it.

- [ ] **Step 6.1: Update the tests first (TDD — rewrite expected hrefs)**

In `src/components/layout/__tests__/ActionButtonsBlock.test.tsx`, add a `next/navigation` mock at the top (below the imports):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ActionButtonsBlock from '../blocks/ActionButtonsBlock';

let mockParams: Record<string, string> = { slug: 'oak-meadow' };
vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
}));
```

Replace the existing test `'links Add Update to /manage/update when authenticated'` with:

```tsx
  it('links Add Update to /p/[slug]/update/[itemId] when authenticated and slug is present', () => {
    mockParams = { slug: 'oak-meadow' };
    render(
      <ActionButtonsBlock
        itemId="item-1"
        canEdit={false}
        canAddUpdate={true}
        isAuthenticated={true}
        mode="live"
      />
    );
    const link = screen.getByText('Add Update').closest('a');
    expect(link?.getAttribute('href')).toBe('/p/oak-meadow/update/item-1');
  });

  it('falls back to /manage/update?item=[itemId] when slug is missing', () => {
    mockParams = {};
    render(
      <ActionButtonsBlock
        itemId="item-1"
        canEdit={false}
        canAddUpdate={true}
        isAuthenticated={true}
        mode="live"
      />
    );
    const link = screen.getByText('Add Update').closest('a');
    expect(link?.getAttribute('href')).toBe('/manage/update?item=item-1');
  });
```

Replace the existing test `'links Add Update to /login with redirect when not authenticated'` with:

```tsx
  it('links Add Update to /login with redirect (using new path) when not authenticated', () => {
    mockParams = { slug: 'oak-meadow' };
    render(
      <ActionButtonsBlock
        itemId="item-1"
        canEdit={false}
        canAddUpdate={true}
        isAuthenticated={false}
        mode="live"
      />
    );
    const link = screen.getByText('Add Update').closest('a');
    expect(link?.getAttribute('href')).toBe(
      '/login?redirect=%2Fp%2Foak-meadow%2Fupdate%2Fitem-1'
    );
  });
```

- [ ] **Step 6.2: Run the tests — expect failures**

Run: `npm run test -- src/components/layout/__tests__/ActionButtonsBlock.test.tsx`

Expected: the 3 updated tests fail (component still uses `/manage/update?item=…`).

- [ ] **Step 6.3: Update `ActionButtonsBlock.tsx`**

Replace the contents of `src/components/layout/blocks/ActionButtonsBlock.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

interface ActionButtonsBlockProps {
  itemId: string;
  canEdit: boolean;
  canAddUpdate: boolean;
  isAuthenticated?: boolean;
  mode: 'live' | 'preview';
}

export default function ActionButtonsBlock({ itemId, canEdit, canAddUpdate, isAuthenticated = false, mode }: ActionButtonsBlockProps) {
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : null;
  const addUpdatePath = slug
    ? `/p/${slug}/update/${itemId}`
    : `/manage/update?item=${itemId}`;

  if (mode === 'preview') {
    return (
      <div className="flex flex-wrap gap-2 opacity-60">
        {canEdit && (
          <button disabled className="btn-secondary text-sm cursor-not-allowed">
            Edit
          </button>
        )}
        {canAddUpdate && (
          <button disabled className="btn-primary text-sm cursor-not-allowed">
            Add Update
          </button>
        )}
      </div>
    );
  }

  const addUpdateHref = isAuthenticated
    ? addUpdatePath
    : `/login?redirect=${encodeURIComponent(addUpdatePath)}`;

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit && (
        <Link href={`/manage/edit/${itemId}`} className="btn-secondary text-sm">
          Edit
        </Link>
      )}
      {canAddUpdate && (
        <Link href={addUpdateHref} className="btn-primary text-sm">
          Add Update
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 6.4: Run the tests — they should now pass**

Run: `npm run test -- src/components/layout/__tests__/ActionButtonsBlock.test.tsx`

Expected: all tests in the file pass.

- [ ] **Step 6.5: Run the broader layout test suite**

Run: `npm run test -- src/components/layout/`

Expected: all pass. If `LayoutRenderer.test.tsx` or `LayoutRendererV2.test.tsx` snapshot-assert anything about the `Add Update` anchor, update those snapshots/assertions (should be minimal — they currently use `data-can-add-update` flags; see grep evidence).

- [ ] **Step 6.6: Run type-check**

Run: `npm run type-check`

Expected: no type errors.

- [ ] **Step 6.7: Commit**

```bash
git add src/components/layout/blocks/ActionButtonsBlock.tsx src/components/layout/__tests__/ActionButtonsBlock.test.tsx
git commit -m "feat(updates): wire ActionButtonsBlock to new /p/[slug]/update/[itemId] path"
```

---

## Task 7: Update `DetailPanel` default-layout link

**Files:**
- Modify: `src/components/item/DetailPanel.tsx` (line ~196)

### Context

`DetailPanel` renders "Edit Item" / "Add Update" buttons directly (not via `ActionButtonsBlock`) when the item's type has no configured layout. Same swap as Task 6, minus the `isAuthenticated` wrapper (this branch is already guarded by `isAuthenticated &&` at line 184).

- [ ] **Step 7.1: Update the link**

In `src/components/item/DetailPanel.tsx`, near line 1-16 imports, add `useParams` to the existing `next/navigation` line — there's no existing import of that module (the file imports `Link` from `next/link`). Add a new line:

```tsx
import { useParams } from 'next/navigation';
```

Inside the component body, near line 26-28 (just after `const [isMobile, setIsMobile] = useState(false);`), add:

```tsx
const params = useParams();
const slug = typeof params?.slug === 'string' ? params.slug : null;
```

Replace the existing `Link` for "Add Update" (around line 195-200):

```tsx
<Link
  href={`/manage/update?item=${item.id}`}
  className="btn-secondary text-sm flex-1 text-center"
>
  Add Update
</Link>
```

with:

```tsx
<Link
  href={slug ? `/p/${slug}/update/${item.id}` : `/manage/update?item=${item.id}`}
  className="btn-secondary text-sm flex-1 text-center"
>
  Add Update
</Link>
```

- [ ] **Step 7.2: Run the full test suite — no regressions**

Run: `npm run test`

Expected: all pass. `DetailPanel` doesn't have a dedicated href test to update.

- [ ] **Step 7.3: Run type-check**

Run: `npm run type-check`

Expected: no type errors.

- [ ] **Step 7.4: Commit**

```bash
git add src/components/item/DetailPanel.tsx
git commit -m "feat(updates): wire DetailPanel default-layout Add Update link to new path"
```

---

## Task 8: E2E smoke test for the happy path

**Files:**
- Create: `e2e/tests/updates/add-update-flow.spec.ts`

### Context

A single Playwright test covering: map → item marker → Add Update button → picker → type card → form → submit → back on map with detail panel open and new update visible. This requires a seeded test user + property with at least 2 eligible update types.

Before writing this, check existing e2e helpers. Look at `e2e/tests/` for fixtures (`auth`, seeded property), Playwright config, and existing smoke test shape.

- [ ] **Step 8.1: Review the existing e2e structure**

Run the following and read the output to find the right patterns:

```bash
ls e2e/tests/
ls e2e/fixtures/ 2>/dev/null || true
cat e2e/playwright.config.ts
```

Identify:
- The auth fixture pattern (typical: logged-in storage state).
- How tests find a property slug and an item — likely via a seeded DB from `supabase/seed.sql`.
- An existing test you can model after (prefer a test under `e2e/tests/smoke/` or a similar short path).

- [ ] **Step 8.2: Write the e2e test**

Create `e2e/tests/updates/add-update-flow.spec.ts` modeled on the closest existing smoke test. The test body:

```ts
import { test, expect } from '@playwright/test';

// Relies on the seeded fixture: a property with ≥1 item and ≥2 eligible
// update types for the test user's role. Adjust slug/item name to match
// your seed.
const SLUG = 'oak-meadow';
const ITEM_NAME = 'Box Alpha';

test('authenticated user can add an update to an item from the field shell', async ({ page }) => {
  await page.goto(`/p/${SLUG}`);

  // Open the item's detail panel — mechanism depends on the map UI; in tests
  // it's often a marker click or a list-item click. Use a selector that the
  // existing smoke tests use.
  await page.getByRole('button', { name: ITEM_NAME }).click();

  // Click "Add Update" in the detail panel.
  await page.getByRole('link', { name: 'Add Update' }).click();

  // Picker appears.
  await expect(page.getByRole('heading', { name: 'Add Update' })).toBeVisible();

  // Pick the first card — pick by role/link with the type name visible.
  const firstCard = page.locator('a:has-text("Observation")').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();

  // Form appears; fill notes and submit.
  await page.getByLabel(/notes/i).fill('e2e smoke — spotted a robin');
  await page.getByRole('button', { name: 'Add Update' }).click();

  // Land back on the map with the detail panel re-opened and the new update
  // present in the timeline.
  await expect(page).toHaveURL(new RegExp(`/p/${SLUG}\\?item=`));
  await expect(page.getByText('e2e smoke — spotted a robin')).toBeVisible();
});
```

If the selectors above (`getByRole('button', { name: ITEM_NAME })`, etc.) don't match the app's map UI, adjust to match — the existing `e2e/tests/smoke/` tests are the source of truth for the correct interaction shape.

- [ ] **Step 8.3: Run the test against a running dev server**

Run: `npm run test:e2e -- --grep "add an update to an item"`

Expected: PASS.

If the seed data differs from the constants above (slug/item name), adjust them and re-run.

- [ ] **Step 8.4: Commit**

```bash
git add e2e/tests/updates/add-update-flow.spec.ts
git commit -m "test(updates): add e2e smoke covering full add-update flow"
```

---

## Task 9: Final verification + visual snapshot + cleanup

### Context

End-to-end manual check, capture before/after visual diff screenshots per the repo playbook, and ensure nothing else regressed (Activity tab still stubbed, `/manage/update/page.tsx` still reachable if someone lands on it via direct URL post-middleware — but the middleware now short-circuits so it should be unreachable).

- [ ] **Step 9.1: Full test sweep**

Run: `npm run test && npm run type-check`

Expected: all green.

- [ ] **Step 9.2: Smoke e2e**

Run: `npm run test:e2e:smoke`

Expected: all green.

- [ ] **Step 9.3: Manual browser walk-through**

Start dev: `npm run dev`.

Confirm:
- [ ] Desktop: marker click → side panel → Add Update button → picker renders with cards → select one → form loads with locked item + locked type → fill + submit → back on map with panel reopened and new entry in `UpdateTimeline`.
- [ ] Mobile (shrink to <768px): same flow via bottom sheet.
- [ ] Activity tab in bottom nav still renders the "Recent activity will appear here" stub — no regression.
- [ ] `/manage/update?item=<id>` URL redirects (308) to the new path.
- [ ] `/manage/update` (no query) redirects (308) to `/p/[slug]`.

- [ ] **Step 9.4: Capture visual-diff screenshots per `docs/playbooks/visual-diff-screenshots.md`**

Follow the playbook. Save before/after images for:
- The "Activity" dead-end (before) vs. the new picker (after).
- The detail panel with Add Update button (href in devtools changes from `/manage/update?item=X` to `/p/[slug]/update/X`).

Place these in the PR description.

- [ ] **Step 9.5: Push and open a PR**

```bash
git push -u origin fix/updates
```

Then open a PR with the visual screenshots attached and a link to the spec (`docs/superpowers/specs/2026-04-17-add-update-flow-design.md`).

---

## Review Checklist

Before opening the PR, confirm each spec requirement has a task:

| Spec requirement | Task |
|---|---|
| Two new routes (`/p/[slug]/update/[itemId]`, `/p/[slug]/update/[itemId]/[typeId]`) | Tasks 3, 4 |
| Middleware rewrite for `/manage/update(?item=X)` | Task 5 |
| `UpdateForm` accepts type lock props | Task 1 |
| `UpdateForm` redirects to item detail post-save | Task 1 |
| Picker filters by per-type create permission | Task 2 |
| Picker auto-redirects when exactly one type eligible | Task 2 |
| Picker empty state | Task 2 |
| `ActionButtonsBlock` uses new path | Task 6 |
| `DetailPanel` default-layout link uses new path | Task 7 |
| Unit tests for new behaviors | Tasks 1, 2, 6 |
| E2E smoke test | Task 8 |
| Visual diff screenshots | Task 9 |
| Activity tab left untouched | Task 5 (removed from `manageMap`); verified in Task 9 |
