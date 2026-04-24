# Scheduled Maintenance Pickers (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PR 1's interim checkbox-list pickers with the designed list-variant item picker (search, type chips, last-maintained chips, sort, select-all) and knowledge linker modal (search, visibility chips, tag chips, "Create new → new tab"). Same prop contracts, same commit actions — drop-in replacements.

**Architecture:** Two new client components under `src/components/maintenance/` swap in at the same paths as the interim pickers; `MaintenanceDetailForm` changes two import lines. No schema changes, no new server actions. A new `classifyLastMaintained` helper extends `src/lib/maintenance/logic.ts`. A `.chip` utility class goes in `src/styles/globals.css`. A small `useFocusTrap` hook supports modal accessibility.

**Tech Stack:** Next.js 14 App Router, Supabase client queries, TypeScript, Tailwind CSS, Vitest + @testing-library/react.

**Reference spec:** `docs/superpowers/specs/2026-04-24-maintenance-pickers-design.md`
**PR 1 foundation:** merged as `ea37d54` on `main`.

---

## File structure

**Create:**

```
src/components/maintenance/
  MaintenanceItemPicker.tsx
  MaintenanceKnowledgePicker.tsx
  useFocusTrap.ts

src/__tests__/maintenance/
  classifyLastMaintained.test.ts
  MaintenanceItemPicker.test.tsx
  MaintenanceKnowledgePicker.test.tsx
```

**Modify:**

```
src/lib/maintenance/logic.ts                                    (extend)
src/styles/globals.css                                          (add .chip)
src/app/admin/properties/[slug]/maintenance/[id]/MaintenanceDetailForm.tsx  (swap imports)
```

**Delete (after swap):**

```
src/components/maintenance/MaintenanceItemPickerInterim.tsx
src/components/maintenance/MaintenanceKnowledgePickerInterim.tsx
```

---

## Task 1: `classifyLastMaintained` helper (TDD)

**Files:**
- Modify: `src/lib/maintenance/logic.ts`
- Test: `src/__tests__/maintenance/classifyLastMaintained.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/maintenance/classifyLastMaintained.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyLastMaintained } from '@/lib/maintenance/logic';

// Use a fixed "today" via a helper that defaults to new Date() but accepts a string for tests.
// classifyLastMaintained(iso, today?) — today defaults to the current system time.

const TODAY = '2026-04-24';

describe('classifyLastMaintained', () => {
  it('returns "Never" with danger tone when null', () => {
    expect(classifyLastMaintained(null, TODAY)).toEqual({ tone: 'danger', label: 'Never' });
  });

  it('returns danger with "N mo ago" when older than 365 days', () => {
    // 2024-03-01 → 420 days before 2026-04-24 → 14 months
    const result = classifyLastMaintained('2025-02-28', TODAY);
    expect(result.tone).toBe('danger');
    expect(result.label).toMatch(/mo ago$/);
  });

  it('returns warn with "N mo ago" between 180 and 365 days', () => {
    // 2025-09-01 → ~235 days before 2026-04-24
    const result = classifyLastMaintained('2025-09-01', TODAY);
    expect(result.tone).toBe('warn');
    expect(result.label).toMatch(/mo ago$/);
  });

  it('returns normal with "N mo ago" between 60 and 180 days', () => {
    // 2026-01-01 → ~113 days before 2026-04-24
    const result = classifyLastMaintained('2026-01-01', TODAY);
    expect(result.tone).toBe('normal');
    expect(result.label).toMatch(/mo ago$/);
  });

  it('returns fresh with "N d ago" when 60 days or less', () => {
    // 2026-03-15 → 40 days before 2026-04-24
    const result = classifyLastMaintained('2026-03-15', TODAY);
    expect(result.tone).toBe('fresh');
    expect(result.label).toBe('40 d ago');
  });

  it('returns fresh with "0 d ago" for today', () => {
    const result = classifyLastMaintained(TODAY, TODAY);
    expect(result.tone).toBe('fresh');
    expect(result.label).toBe('0 d ago');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/__tests__/maintenance/classifyLastMaintained.test.ts`

Expected: FAIL — `classifyLastMaintained` not exported from `@/lib/maintenance/logic`.

- [ ] **Step 3: Implement the helper**

Edit `src/lib/maintenance/logic.ts`. Append:

```ts
export interface MaintenanceTone {
  tone: 'fresh' | 'normal' | 'warn' | 'danger';
  label: string;
}

export function classifyLastMaintained(
  iso: string | null,
  today: string = new Date().toISOString().slice(0, 10),
): MaintenanceTone {
  if (iso === null) return { tone: 'danger', label: 'Never' };
  const days = Math.floor(
    (Date.parse(today + 'T00:00:00Z') - Date.parse(iso.slice(0, 10) + 'T00:00:00Z')) / 86400000,
  );
  if (days > 365) return { tone: 'danger', label: `${Math.floor(days / 30)} mo ago` };
  if (days > 180) return { tone: 'warn', label: `${Math.floor(days / 30)} mo ago` };
  if (days > 60) return { tone: 'normal', label: `${Math.floor(days / 30)} mo ago` };
  return { tone: 'fresh', label: `${days} d ago` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/__tests__/maintenance/classifyLastMaintained.test.ts`

Expected: PASS (6 tests).

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/maintenance/logic.ts src/__tests__/maintenance/classifyLastMaintained.test.ts
git commit -m "feat(maintenance): add classifyLastMaintained helper"
```

---

## Task 2: `.chip` utility class

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Read the current globals.css to find where custom classes live**

Run: `grep -n "btn-primary\|btn-secondary\|input-field\|^\\.label\|^\\.card" src/styles/globals.css | head -20`

Expected: locate the `@layer components { … }` block or analogous section where `.btn-primary`, `.btn-secondary`, `.card`, `.input-field`, and `.label` are declared.

- [ ] **Step 2: Append the chip class**

Add this inside the same `@layer components { … }` block (alphabetical or adjacent to other button-like classes):

```css
.chip {
  @apply inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-sage-light/60 text-gray-700 hover:bg-sage-light cursor-pointer transition-colors border-0;
}

.chip[aria-pressed="true"] {
  @apply bg-forest text-white hover:bg-forest;
}
```

- [ ] **Step 3: Run dev build briefly to verify CSS compiles**

Run: `npm run build 2>&1 | tail -20`

Expected: build succeeds. Any `@apply` error for undefined classes (e.g., `sage-light`) would fail here. If it fails, check `tailwind.config.ts` for the color name and use the right token.

- [ ] **Step 4: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(ui): add .chip utility class for filter chips"
```

---

## Task 3: `useFocusTrap` hook

**Files:**
- Create: `src/components/maintenance/useFocusTrap.ts`

- [ ] **Step 1: Write the hook**

Create `src/components/maintenance/useFocusTrap.ts`:

```ts
'use client';

import { useEffect } from 'react';

/**
 * Traps Tab focus within the element referenced by ref while active is true.
 * Also calls onEscape when Escape is pressed.
 *
 * On activation, focuses the first focusable element if none inside is already focused.
 * On deactivation, restores focus to the element that was focused before activation.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement>,
  active: boolean,
  onEscape: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    function focusables(): HTMLElement[] {
      if (!container) return [];
      return Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('hidden') && el.offsetParent !== null);
    }

    // Initial focus
    if (!container.contains(document.activeElement)) {
      focusables()[0]?.focus();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [ref, active, onEscape]);
}
```

- [ ] **Step 2: Verify type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/maintenance/useFocusTrap.ts
git commit -m "feat(maintenance): add useFocusTrap hook for modal accessibility"
```

---

## Task 4: `MaintenanceItemPicker` (TDD)

**Files:**
- Create: `src/components/maintenance/MaintenanceItemPicker.tsx`
- Test: `src/__tests__/maintenance/MaintenanceItemPicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/maintenance/MaintenanceItemPicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MaintenanceItemPicker } from '@/components/maintenance/MaintenanceItemPicker';

// Mock next/navigation — pickers call router.refresh() after successful add.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

// Mock server actions
const addItemsSpy = vi.fn(async (_: unknown) => ({ success: true as const }));
vi.mock('@/lib/maintenance/actions', () => ({
  addItemsToProject: (input: unknown) => addItemsSpy(input),
}));

// Mock the Supabase client. The picker runs two queries in sequence:
//   1) from('items').select(...).eq('property_id', …).order('name')
//   2) from('item_updates').select(...).in('item_id', [...]).eq('update_types.name', 'Maintenance').order(...)
// We build a chainable mock whose behavior depends on which table was selected.
const itemsRows = [
  { id: 'item-a', name: 'Alpha Box', lat: 10, lng: 20, item_type_id: 't1', item_types: { name: 'Bird Box', icon: '🐦' } },
  { id: 'item-b', name: 'Beta Box', lat: 11, lng: 21, item_type_id: 't1', item_types: { name: 'Bird Box', icon: '🐦' } },
  { id: 'item-c', name: 'Charlie Marker', lat: 12, lng: 22, item_type_id: 't2', item_types: { name: 'Trail Marker', icon: '📍' } },
];

const updatesRows = [
  // Alpha: 3 months ago → normal tone
  { item_id: 'item-a', created_at: '2026-01-20T00:00:00Z', update_types: { name: 'Maintenance' } },
  // Beta: 2 years ago → danger tone
  { item_id: 'item-b', created_at: '2024-03-01T00:00:00Z', update_types: { name: 'Maintenance' } },
  // Charlie: never — no row
];

function makeChainable(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const resolver = Promise.resolve({ data: rows, error: null });
  for (const k of ['select', 'eq', 'in', 'order']) {
    chain[k] = vi.fn(() => chain as unknown as typeof chain);
  }
  chain.then = resolver.then.bind(resolver);
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn((table: string) => {
      if (table === 'items') return makeChainable(itemsRows);
      if (table === 'item_updates') return makeChainable(updatesRows);
      return makeChainable([]);
    }),
  }),
}));

describe('MaintenanceItemPicker', () => {
  beforeEach(() => addItemsSpy.mockClear());

  it('renders loading then the fetched items', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    expect(screen.getByText('Beta Box')).toBeInTheDocument();
    expect(screen.getByText('Charlie Marker')).toBeInTheDocument();
  });

  it('filters out already-linked items', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={['item-b']}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    expect(screen.queryByText('Beta Box')).toBeNull();
  });

  it('filters by search query', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/search by name/i), { target: { value: 'Alpha' } });
    expect(screen.getByText('Alpha Box')).toBeInTheDocument();
    expect(screen.queryByText('Beta Box')).toBeNull();
  });

  it('toggles type filter chips', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    // Click "Bird Box" chip to DESELECT → only non-bird-box items remain
    const chip = screen.getByRole('button', { name: /^Bird Box$/ });
    fireEvent.click(chip);
    expect(screen.queryByText('Alpha Box')).toBeNull();
    expect(screen.getByText('Charlie Marker')).toBeInTheDocument();
  });

  it('filters by last-maintained "1 yr+" chip', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Not in 1 yr\+/ }));
    // Beta (2 yr ago) and Charlie (never) qualify. Alpha (3 mo ago) does not.
    expect(screen.queryByText('Alpha Box')).toBeNull();
    expect(screen.getByText('Beta Box')).toBeInTheDocument();
    expect(screen.getByText('Charlie Marker')).toBeInTheDocument();
  });

  it('select-all toggles all visible items', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/select all visible/i));
    expect(screen.getByText(/3 selected/)).toBeInTheDocument();
  });

  it('submit button disabled with 0 selected', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Add items$/ })).toBeDisabled();
  });

  it('confirms selection with addItemsToProject', async () => {
    const onClose = vi.fn();
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Alpha Box'));
    fireEvent.click(screen.getByRole('button', { name: /^Add 1 item$/ }));
    await waitFor(() => expect(addItemsSpy).toHaveBeenCalledTimes(1));
    expect(addItemsSpy.mock.calls[0][0]).toMatchObject({
      projectId: 'p-1',
      itemIds: ['item-a'],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceItemPicker.test.tsx`

Expected: FAIL — module not found for `@/components/maintenance/MaintenanceItemPicker`.

- [ ] **Step 3: Implement the component**

Create `src/components/maintenance/MaintenanceItemPicker.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addItemsToProject } from '@/lib/maintenance/actions';
import { classifyLastMaintained, type MaintenanceTone } from '@/lib/maintenance/logic';
import { useFocusTrap } from './useFocusTrap';

interface ItemOption {
  id: string;
  name: string;
  lat: number;
  lng: number;
  typeName: string;
  typeIcon: string;
  lastMaintainedAt: string | null;
}

interface Props {
  projectId: string;
  propertyId: string;
  alreadyLinkedIds: string[];
  onClose: () => void;
}

type LastMaintFilter = 'any' | '6mo' | '1y' | 'never';

const LAST_MAINT_OPTIONS: { id: LastMaintFilter; label: string }[] = [
  { id: 'any', label: 'Any time' },
  { id: '6mo', label: 'Not in 6 mo+' },
  { id: '1y', label: 'Not in 1 yr+' },
  { id: 'never', label: 'Never' },
];

const TONE_CLASSES: Record<MaintenanceTone['tone'], { text: string; dot: string }> = {
  fresh: { text: 'text-green-700', dot: 'bg-green-600' },
  normal: { text: 'text-gray-500', dot: 'bg-gray-400' },
  warn: { text: 'text-amber-700', dot: 'bg-amber-600' },
  danger: { text: 'text-red-700', dot: 'bg-red-600' },
};

export function MaintenanceItemPicker({
  projectId,
  propertyId,
  alreadyLinkedIds,
  onClose,
}: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, onClose);

  const [items, setItems] = useState<ItemOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [lastMaint, setLastMaint] = useState<LastMaintFilter>('any');
  const [sortKey, setSortKey] = useState<'name' | 'last'>('name');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const itemsRes = await supabase
        .from('items')
        .select('id, name, lat, lng, item_type_id, item_types(name, icon)')
        .eq('property_id', propertyId)
        .order('name');
      if (cancelled) return;
      if (itemsRes.error) {
        setLoadError(itemsRes.error.message);
        setItems([]);
        return;
      }
      const itemsRaw = (itemsRes.data ?? []) as Array<{
        id: string;
        name: string;
        lat: number;
        lng: number;
        item_type_id: string;
        item_types: { name?: string; icon?: string } | null;
      }>;
      const itemIds = itemsRaw.map((i) => i.id);

      let lastMaintById = new Map<string, string>();
      if (itemIds.length > 0) {
        const updatesRes = await supabase
          .from('item_updates')
          .select('item_id, created_at, update_types!inner(name)')
          .in('item_id', itemIds)
          .eq('update_types.name', 'Maintenance')
          .order('created_at', { ascending: false });
        if (cancelled) return;
        if (!updatesRes.error) {
          for (const row of (updatesRes.data ?? []) as Array<{
            item_id: string;
            created_at: string;
          }>) {
            if (!lastMaintById.has(row.item_id)) lastMaintById.set(row.item_id, row.created_at);
          }
        }
      }

      const options: ItemOption[] = itemsRaw
        .filter((i) => !alreadyLinkedIds.includes(i.id))
        .map((i) => ({
          id: i.id,
          name: i.name ?? 'Unnamed',
          lat: i.lat,
          lng: i.lng,
          typeName: i.item_types?.name ?? 'Unknown',
          typeIcon: i.item_types?.icon ?? '📍',
          lastMaintainedAt: lastMaintById.get(i.id) ?? null,
        }));

      // All types start selected (chip "active" = type is in the filter set)
      const types = new Set(options.map((o) => o.typeName));
      setSelectedTypes(types);
      setItems(options);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [propertyId, alreadyLinkedIds]);

  const allTypes = useMemo(() => {
    if (!items) return [] as string[];
    return Array.from(new Set(items.map((i) => i.typeName))).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [] as ItemOption[];
    const q = search.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    return items
      .filter((i) => {
        if (!selectedTypes.has(i.typeName)) return false;
        if (q && !i.name.toLowerCase().includes(q)) return false;
        if (lastMaint !== 'any') {
          if (lastMaint === 'never') {
            if (i.lastMaintainedAt !== null) return false;
          } else {
            const days =
              i.lastMaintainedAt === null
                ? Infinity
                : Math.floor(
                    (Date.parse(today + 'T00:00:00Z') -
                      Date.parse(i.lastMaintainedAt.slice(0, 10) + 'T00:00:00Z')) /
                      86400000,
                  );
            if (lastMaint === '6mo' && days < 180) return false;
            if (lastMaint === '1y' && days < 365) return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'name') return a.name.localeCompare(b.name);
        // oldest-maintenance first; null sorts as oldest
        const aT = a.lastMaintainedAt ? Date.parse(a.lastMaintainedAt) : 0;
        const bT = b.lastMaintainedAt ? Date.parse(b.lastMaintainedAt) : 0;
        return aT - bT;
      });
  }, [items, search, selectedTypes, lastMaint, sortKey]);

  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const someSelected = !allSelected && filtered.some((i) => selected.has(i.id));

  function toggleType(t: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filtered.forEach((i) => next.delete(i.id));
      else filtered.forEach((i) => next.add(i.id));
      return next;
    });
  }

  async function handleConfirm() {
    if (selected.size === 0) return;
    setSaving(true);
    setSaveError(null);
    const result = await addItemsToProject({ projectId, itemIds: Array.from(selected) });
    setSaving(false);
    if ('error' in result) {
      setSaveError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  const total = items?.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 md:flex md:items-center md:justify-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add items to project"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-parchment h-full w-full flex flex-col md:h-auto md:max-h-[90vh] md:max-w-4xl md:rounded-2xl md:shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-sage-light flex items-center justify-between">
          <div>
            <h2 className="font-heading text-forest-dark text-lg">Add items to project</h2>
            <div className="text-[11px] text-gray-600 mt-0.5">
              {filtered.length} of {total} items · {selected.size} selected
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-900 text-xl leading-none px-2"
          >
            ✕
          </button>
        </div>

        {/* Search + chips */}
        <div className="px-5 pt-3 pb-2 border-b border-sage-light">
          <input
            className="input-field"
            placeholder="Search by name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5 mt-3 items-center">
            <span className="text-[11px] text-gray-600 mr-1">Type:</span>
            {allTypes.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={selectedTypes.has(t)}
                className="chip"
                onClick={() => toggleType(t)}
              >
                {t}
              </button>
            ))}
            <span className="w-px h-4 bg-sage-light mx-1.5" aria-hidden />
            <span className="text-[11px] text-gray-600 mr-1">Maintained:</span>
            {LAST_MAINT_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={lastMaint === o.id}
                className="chip"
                onClick={() => setLastMaint(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Select-all bar */}
        <div className="px-5 py-2.5 bg-sage-light/40 border-b border-sage-light flex items-center justify-between text-[13px]">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={toggleSelectAll}
              aria-label="Select all visible"
            />
            <span className="text-forest-dark font-medium">
              {someSelected || allSelected ? `${selected.size} selected` : 'Select all visible'}
            </span>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-600 hover:text-gray-900"
              >
                Clear
              </button>
            )}
          </label>
          <button
            type="button"
            className="text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
            onClick={() => setSortKey(sortKey === 'name' ? 'last' : 'name')}
          >
            Sort: {sortKey === 'name' ? 'Name' : 'Oldest maint.'}
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {items === null ? (
            <div className="p-10 text-center text-sm text-gray-600">Loading…</div>
          ) : loadError ? (
            <div className="p-10 text-center text-sm text-red-700">
              Couldn&apos;t load items. {loadError}
            </div>
          ) : total === 0 ? (
            <div className="p-10 text-center text-sm text-gray-600">
              This property has no items yet.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-600">
              No items match your filters.
            </div>
          ) : (
            <ul>
              {filtered.map((item) => {
                const isSel = selected.has(item.id);
                const last = classifyLastMaintained(item.lastMaintainedAt);
                const toneClass = TONE_CLASSES[last.tone];
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className={`w-full grid grid-cols-[auto_1fr_auto_auto] gap-3.5 items-center px-5 py-3 border-b border-sage-light text-left transition-colors ${
                        isSel ? 'bg-forest/5' : 'hover:bg-sage-light/30'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        readOnly
                        tabIndex={-1}
                        aria-hidden
                      />
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-sage-light/60 text-forest flex items-center justify-center text-lg shrink-0">
                          {item.typeIcon}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[14px] font-medium text-forest-dark truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-gray-600">
                            {item.typeName} · {item.lat.toFixed(3)}, {item.lng.toFixed(3)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right min-w-[120px]">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wide">
                          Last maintained
                        </div>
                        <div className={`text-[13px] font-medium ${toneClass.text}`}>
                          {last.label}
                        </div>
                      </div>
                      <span
                        aria-hidden
                        className={`w-2.5 h-2.5 rounded-full ${toneClass.dot}`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {saveError && (
          <div className="px-5 py-2 text-[13px] text-red-700 bg-red-50 border-t border-red-100">
            {saveError}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-sage-light flex items-center justify-end gap-2 bg-parchment">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-primary"
            disabled={saving || selected.size === 0}
          >
            {saving
              ? 'Adding…'
              : selected.size === 0
                ? 'Add items'
                : `Add ${selected.size} item${selected.size > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceItemPicker.test.tsx`

Expected: PASS (9 tests).

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/maintenance/MaintenanceItemPicker.tsx src/__tests__/maintenance/MaintenanceItemPicker.test.tsx
git commit -m "feat(maintenance): add real item picker with filter chips and select-all"
```

---

## Task 5: `MaintenanceKnowledgePicker` (TDD)

**Files:**
- Create: `src/components/maintenance/MaintenanceKnowledgePicker.tsx`
- Test: `src/__tests__/maintenance/MaintenanceKnowledgePicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/maintenance/MaintenanceKnowledgePicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MaintenanceKnowledgePicker } from '@/components/maintenance/MaintenanceKnowledgePicker';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

const addKnowledgeSpy = vi.fn(async (_: unknown) => ({ success: true as const }));
vi.mock('@/lib/maintenance/actions', () => ({
  addKnowledgeToProject: (input: unknown) => addKnowledgeSpy(input),
}));

const knowledgeRows = [
  {
    id: 'k-1',
    title: 'Spring Cleaning Protocol',
    excerpt: 'Step-by-step cleaning',
    visibility: 'org',
    tags: ['protocol', 'seasonal'],
    updated_at: '2026-02-14T00:00:00Z',
  },
  {
    id: 'k-2',
    title: 'Identifying Cavity Nesters',
    excerpt: 'Field guide to species',
    visibility: 'public',
    tags: ['field-guide', 'species'],
    updated_at: '2026-01-08T00:00:00Z',
  },
  {
    id: 'k-3',
    title: 'Bird Box Inspection Checklist',
    excerpt: 'Twelve-point inspection',
    visibility: 'org',
    tags: ['checklist'],
    updated_at: '2025-11-30T00:00:00Z',
  },
];

function makeChainable(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const resolver = Promise.resolve({ data: rows, error: null });
  for (const k of ['select', 'eq', 'order']) {
    chain[k] = vi.fn(() => chain as unknown as typeof chain);
  }
  chain.then = resolver.then.bind(resolver);
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn(() => makeChainable(knowledgeRows)),
  }),
}));

describe('MaintenanceKnowledgePicker', () => {
  beforeEach(() => addKnowledgeSpy.mockClear());

  it('renders fetched articles', async () => {
    render(
      <MaintenanceKnowledgePicker
        projectId="p-1"
        orgId="o-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Spring Cleaning Protocol')).toBeInTheDocument());
    expect(screen.getByText('Identifying Cavity Nesters')).toBeInTheDocument();
    expect(screen.getByText('Bird Box Inspection Checklist')).toBeInTheDocument();
  });

  it('filters out already-linked articles', async () => {
    render(
      <MaintenanceKnowledgePicker
        projectId="p-1"
        orgId="o-1"
        alreadyLinkedIds={['k-2']}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Spring Cleaning Protocol')).toBeInTheDocument());
    expect(screen.queryByText('Identifying Cavity Nesters')).toBeNull();
  });

  it('filters by visibility chip', async () => {
    render(
      <MaintenanceKnowledgePicker
        projectId="p-1"
        orgId="o-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Spring Cleaning Protocol')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Public$/ }));
    expect(screen.getByText('Identifying Cavity Nesters')).toBeInTheDocument();
    expect(screen.queryByText('Spring Cleaning Protocol')).toBeNull();
  });

  it('filters by tag chip', async () => {
    render(
      <MaintenanceKnowledgePicker
        projectId="p-1"
        orgId="o-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Spring Cleaning Protocol')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '#checklist' }));
    expect(screen.getByText('Bird Box Inspection Checklist')).toBeInTheDocument();
    expect(screen.queryByText('Spring Cleaning Protocol')).toBeNull();
  });

  it('has a Create-new link that opens in a new tab', async () => {
    render(
      <MaintenanceKnowledgePicker
        projectId="p-1"
        orgId="o-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    const link = await screen.findByRole('link', { name: /Create new/i });
    expect(link).toHaveAttribute('href', '/admin/knowledge/new');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('confirms selection with addKnowledgeToProject', async () => {
    const onClose = vi.fn();
    render(
      <MaintenanceKnowledgePicker
        projectId="p-1"
        orgId="o-1"
        alreadyLinkedIds={[]}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(screen.getByText('Spring Cleaning Protocol')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Spring Cleaning Protocol'));
    fireEvent.click(screen.getByRole('button', { name: /^Link 1$/ }));
    await waitFor(() => expect(addKnowledgeSpy).toHaveBeenCalledTimes(1));
    expect(addKnowledgeSpy.mock.calls[0][0]).toMatchObject({
      projectId: 'p-1',
      knowledgeIds: ['k-1'],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceKnowledgePicker.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/maintenance/MaintenanceKnowledgePicker.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addKnowledgeToProject } from '@/lib/maintenance/actions';
import { useFocusTrap } from './useFocusTrap';

interface KnowledgeOption {
  id: string;
  title: string;
  excerpt: string | null;
  visibility: 'org' | 'public';
  tags: string[];
  updatedAt: string;
}

interface Props {
  projectId: string;
  orgId: string;
  alreadyLinkedIds: string[];
  onClose: () => void;
}

type VisFilter = 'all' | 'org' | 'public';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MaintenanceKnowledgePicker({
  projectId,
  orgId,
  alreadyLinkedIds,
  onClose,
}: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, onClose);

  const [items, setItems] = useState<KnowledgeOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visFilter, setVisFilter] = useState<VisFilter>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const res = await supabase
        .from('knowledge_items')
        .select('id, title, excerpt, visibility, tags, updated_at')
        .eq('org_id', orgId)
        .order('title');
      if (cancelled) return;
      if (res.error) {
        setLoadError(res.error.message);
        setItems([]);
        return;
      }
      const raw = (res.data ?? []) as Array<{
        id: string;
        title: string;
        excerpt: string | null;
        visibility: 'org' | 'public';
        tags: string[] | null;
        updated_at: string;
      }>;
      const options: KnowledgeOption[] = raw
        .filter((k) => !alreadyLinkedIds.includes(k.id))
        .map((k) => ({
          id: k.id,
          title: k.title,
          excerpt: k.excerpt,
          visibility: k.visibility,
          tags: k.tags ?? [],
          updatedAt: k.updated_at,
        }));
      setItems(options);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [orgId, alreadyLinkedIds]);

  const allTags = useMemo(() => {
    if (!items) return [] as string[];
    return Array.from(new Set(items.flatMap((k) => k.tags))).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [] as KnowledgeOption[];
    const q = search.trim().toLowerCase();
    return items.filter((k) => {
      if (visFilter !== 'all' && k.visibility !== visFilter) return false;
      if (tagFilter && !k.tags.includes(tagFilter)) return false;
      if (q) {
        const inTitle = k.title.toLowerCase().includes(q);
        const inExcerpt = (k.excerpt ?? '').toLowerCase().includes(q);
        if (!inTitle && !inExcerpt) return false;
      }
      return true;
    });
  }, [items, search, visFilter, tagFilter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    if (selected.size === 0) return;
    setSaving(true);
    setSaveError(null);
    const result = await addKnowledgeToProject({
      projectId,
      knowledgeIds: Array.from(selected),
    });
    setSaving(false);
    if ('error' in result) {
      setSaveError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  const total = items?.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Link knowledge articles"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-parchment rounded-2xl shadow-2xl w-full max-w-[600px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-sage-light flex items-center justify-between">
          <div>
            <h2 className="font-heading text-forest-dark text-[17px]">Link knowledge articles</h2>
            <div className="text-[11px] text-gray-600 mt-0.5">
              {filtered.length} available · {selected.size} selected
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-900 text-xl leading-none px-2"
          >
            ✕
          </button>
        </div>

        {/* Search + chips */}
        <div className="px-5 pt-3 pb-2">
          <input
            className="input-field"
            placeholder="Search articles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
            {([
              { id: 'all', label: 'All' },
              { id: 'org', label: 'Org only' },
              { id: 'public', label: 'Public' },
            ] as const).map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={visFilter === o.id}
                className="chip"
                onClick={() => setVisFilter(o.id)}
              >
                {o.label}
              </button>
            ))}
            {allTags.length > 0 && (
              <span className="w-px h-4 bg-sage-light mx-1" aria-hidden />
            )}
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tagFilter === t}
                className="chip"
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
              >
                #{t}
              </button>
            ))}
          </div>
        </div>

        {/* Create-new callout */}
        <div className="mx-5 my-2 p-2.5 rounded-xl border border-dashed border-golden bg-golden/5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-sm">
              +
            </div>
            <div>
              <div className="text-[13px] font-medium text-forest-dark">Need a new article?</div>
              <div className="text-[11px] text-gray-600">
                Opens the full editor in a new tab — this picker stays open.
              </div>
            </div>
          </div>
          <a
            href="/admin/knowledge/new"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs whitespace-nowrap"
          >
            Create new ↗
          </a>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto px-5 pb-3">
          {items === null ? (
            <div className="p-8 text-center text-sm text-gray-600">Loading…</div>
          ) : loadError ? (
            <div className="p-8 text-center text-sm text-red-700">
              Couldn&apos;t load articles. {loadError}
            </div>
          ) : total === 0 ? (
            <div className="p-8 text-center text-sm text-gray-600">
              No knowledge articles yet. Use &ldquo;Create new&rdquo; above to get started.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-600">No articles match.</div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((k) => {
                const isSel = selected.has(k.id);
                return (
                  <li key={k.id}>
                    <button
                      type="button"
                      onClick={() => toggle(k.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        isSel
                          ? 'border-forest bg-forest/5'
                          : 'border-sage-light bg-white hover:bg-sage-light/30'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSel}
                          readOnly
                          tabIndex={-1}
                          aria-hidden
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[14px] font-medium text-forest-dark">
                              {k.title}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full text-[10px] px-1.5 py-0.5 font-medium ${
                                k.visibility === 'public'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {k.visibility === 'public' ? 'Public' : 'Org'}
                            </span>
                          </div>
                          {k.excerpt && (
                            <div className="text-[11px] text-gray-600 leading-relaxed">
                              {k.excerpt}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {k.tags.map((t) => (
                              <span key={t} className="text-[10px] text-gray-500">
                                #{t}
                              </span>
                            ))}
                            <span className="text-[10px] text-gray-500 ml-auto">
                              Updated {formatDate(k.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {saveError && (
          <div className="px-5 py-2 text-[13px] text-red-700 bg-red-50 border-t border-red-100">
            {saveError}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-sage-light flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-primary"
            disabled={saving || selected.size === 0}
          >
            {saving ? 'Linking…' : `Link ${selected.size || ''}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceKnowledgePicker.test.tsx`

Expected: PASS (6 tests).

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/maintenance/MaintenanceKnowledgePicker.tsx src/__tests__/maintenance/MaintenanceKnowledgePicker.test.tsx
git commit -m "feat(maintenance): add knowledge linker modal with Create-new → new tab"
```

---

## Task 6: Swap imports and delete interim pickers

**Files:**
- Modify: `src/app/admin/properties/[slug]/maintenance/[id]/MaintenanceDetailForm.tsx`
- Delete: `src/components/maintenance/MaintenanceItemPickerInterim.tsx`
- Delete: `src/components/maintenance/MaintenanceKnowledgePickerInterim.tsx`

- [ ] **Step 1: Swap imports in MaintenanceDetailForm.tsx**

Edit `src/app/admin/properties/[slug]/maintenance/[id]/MaintenanceDetailForm.tsx`.

Change:

```ts
import { MaintenanceItemPickerInterim } from '@/components/maintenance/MaintenanceItemPickerInterim';
import { MaintenanceKnowledgePickerInterim } from '@/components/maintenance/MaintenanceKnowledgePickerInterim';
```

to:

```ts
import { MaintenanceItemPicker } from '@/components/maintenance/MaintenanceItemPicker';
import { MaintenanceKnowledgePicker } from '@/components/maintenance/MaintenanceKnowledgePicker';
```

And replace the two JSX usages (search for `MaintenanceItemPickerInterim` and `MaintenanceKnowledgePickerInterim` in the file):

```tsx
{openPicker === 'items' && project.property_id && (
  <MaintenanceItemPicker
    projectId={project.id}
    propertyId={project.property_id}
    alreadyLinkedIds={linkedItems.map((i) => i.item_id)}
    onClose={() => setOpenPicker(null)}
  />
)}
{openPicker === 'knowledge' && (
  <MaintenanceKnowledgePicker
    projectId={project.id}
    orgId={project.org_id}
    alreadyLinkedIds={linkedKnowledge.map((k) => k.knowledge_item_id)}
    onClose={() => setOpenPicker(null)}
  />
)}
```

- [ ] **Step 2: Delete the interim files**

Run:

```bash
git rm src/components/maintenance/MaintenanceItemPickerInterim.tsx src/components/maintenance/MaintenanceKnowledgePickerInterim.tsx
```

- [ ] **Step 3: Verify no remaining references**

Run: `grep -rn "Interim" src/ 2>&1 | grep -i maintenance`

Expected: no matches. If any turn up, remove them.

- [ ] **Step 4: Run type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm run test`

Expected: PASS (all maintenance tests including the new picker tests; existing MaintenanceDetailForm.test.tsx still passes because its mocks don't reference the Interim names).

- [ ] **Step 6: Commit**

```bash
git add -A src/
git commit -m "feat(maintenance): swap detail form to real pickers; delete interim placeholders"
```

---

## Task 7: Final verification

- [ ] **Step 1: Type-check**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/maintenance-pickers && npm run type-check`

Expected: PASS.

- [ ] **Step 2: Full Vitest run**

Run: `npm run test`

Expected: PASS across the full suite. Report the total count and any pre-existing unrelated failures (there should be none).

- [ ] **Step 3: Build**

Run: `npm run build 2>&1 | tail -5`

Expected: build succeeds. Any `@apply` / Tailwind errors from the new `.chip` class would surface here.

- [ ] **Step 4: Full Playwright E2E smoke**

Run:

```bash
npm run supabase:setup   # idempotent — start local Supabase if not running
npm run test:e2e:smoke
```

Expected: PASS. The existing `e2e/tests/admin/maintenance.spec.ts` covers add-items via `[role="dialog"]` + `input[type="checkbox"]` + `button[name="Add"]`. The new pickers preserve the role; the checkbox role survives (hidden from a11y but present in DOM); the primary button label changed from `Add` to `Add N items` though — verify the spec still passes or fix the selector in a follow-up step.

If the existing smoke test fails because of the label change, update `e2e/tests/admin/maintenance.spec.ts`:

Change:

```ts
await page.getByRole('button', { name: /^Add$/ }).click();
```

to:

```ts
await page.getByRole('button', { name: /^Add \d+ items?$/ }).click();
```

And commit the test fix as a tiny follow-up commit:

```bash
git add e2e/tests/admin/maintenance.spec.ts
git commit -m "test(maintenance): update smoke to match new picker primary button label"
```

- [ ] **Step 5: Manual UI pass (optional but recommended)**

Run: `npm run dev`

Walk through in a browser:
- Open a maintenance project detail page with some items.
- Click "+ Add items" → verify modal opens, search works, type chips toggle, last-maintained chips filter, select-all + indeterminate works.
- On a narrow viewport (≤ md), verify the item picker goes full-screen.
- Tab through the modal — focus stays trapped, Escape closes.
- Click "+ Add articles" → verify knowledge picker, visibility + tag chips, Create-new callout opens `/admin/knowledge/new` in a new tab.
- Confirm add → modal closes, linked rows update.

Capture before/after screenshots per `docs/playbooks/visual-diff-screenshots.md`:
- Item picker (desktop populated)
- Item picker (narrow viewport — mobile full-screen)
- Knowledge picker with Create-new callout
- Empty-filter state variants

- [ ] **Step 6: Final commit (if any polish changes in Step 5)**

```bash
git status
# If there are changes, commit them with a focused message.
```

---

## Self-review summary

- **Spec coverage:** every section of `docs/superpowers/specs/2026-04-24-maintenance-pickers-design.md` is realized:
  - `classifyLastMaintained` (Task 1), `.chip` utility (Task 2), `useFocusTrap` (Task 3), item picker (Task 4), knowledge picker (Task 5), integration + interim cleanup (Task 6), verification (Task 7).
- **No placeholders:** all code and commands are spelled out. One smoke-spec label tweak is documented in Task 7 step 4 with the exact before/after; the plan instructs the implementer to apply it conditionally on the E2E outcome.
- **Type consistency:** `MaintenanceTone`, `ItemOption`, `KnowledgeOption`, `LastMaintFilter`, `VisFilter` are defined in their respective files; `classifyLastMaintained` signature matches across test and implementation.
- **Integration invariants:** `MaintenanceDetailForm` consumer props for both pickers (`projectId`, `propertyId`/`orgId`, `alreadyLinkedIds`, `onClose`) match PR 1's interim contract exactly — Task 6 is just two import lines + JSX name swap.
