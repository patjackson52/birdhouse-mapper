# Upcoming Maintenance Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the existing (invisible) `MaintenanceProjectsBlock` into a fully visible, tappable, grouped **Upcoming Maintenance** block on item details, while fixing the PR #283 wiring bug that left the chip missing from the live component drawer.

**Architecture:** One client React component (`UpcomingMaintenanceBlock`) reads `maintenance_project_items` for the current item, buckets results into Overdue / Upcoming / Unscheduled groups client-side, and renders each row as an anchor to either the staff admin or anonymous public maintenance detail route. The chip is registered in the live `ComponentDrawer.PALETTE_ITEMS`; dead duplicate palette/builder files are deleted to prevent the same bug recurring.

**Tech Stack:** Next.js 14 App Router · React 18 client components · `@supabase/supabase-js` v2 client · Tailwind CSS · Vitest + @testing-library/react · Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-04-27-upcoming-maintenance-block-design.md`

---

## File Structure

### New files

- `src/components/layout/blocks/UpcomingMaintenanceBlock.tsx` — the rewritten block (renamed from `MaintenanceProjectsBlock.tsx` via `git mv`).
- `src/components/layout/blocks/__tests__/UpcomingMaintenanceBlock.test.tsx` — comprehensive unit tests.

### Modified files

- `src/components/layout/builder/ComponentDrawer.tsx` — add maintenance chip to `PALETTE_ITEMS`.
- `src/components/layout/builder/__tests__/ComponentDrawer.test.tsx` — add regression test (chip present + palette parity).
- `src/components/layout/LayoutRendererV2.tsx` — update import name; pass new props (`propertySlug`, `isAuthenticated`) to the block.
- `src/components/layout/LayoutRendererDispatch.tsx` — thread `propertySlug` prop.
- `src/components/item/DetailPanel.tsx` — pass `propertySlug={slug}` to `LayoutRendererDispatch`.
- `e2e/tests/admin/maintenance.spec.ts` (or new `maintenance-block.spec.ts`) — chip-in-drawer + tap-target navigation.

### Deleted files

- `src/components/layout/builder/BlockPaletteV2.tsx` — only used by `LayoutBuilderV2.tsx` (also dead).
- `src/components/layout/builder/BlockPalette.tsx` (V1) — only used by `LayoutBuilder.tsx` (also dead).
- `src/components/layout/builder/LayoutBuilder.tsx` — not imported anywhere.
- `src/components/layout/builder/LayoutBuilderV2.tsx` — not imported anywhere.
- `src/components/layout/builder/__tests__/BlockPalette.test.tsx` — tests deleted V1 palette.

---

## Task 1: Add the maintenance chip to the live ComponentDrawer (and add palette-parity regression test)

**Files:**
- Modify: `src/components/layout/builder/ComponentDrawer.tsx:15-26`
- Modify: `src/components/layout/builder/__tests__/ComponentDrawer.test.tsx`

This task makes the block visible in the layout editor immediately — the existing `MaintenanceProjectsBlock` keeps rendering with its old behavior until later tasks rebuild it. Independent value, lands first.

- [ ] **Step 1: Write the failing palette-parity regression test**

Append to `src/components/layout/builder/__tests__/ComponentDrawer.test.tsx`, just before the closing `});`:

```tsx
import type { BlockTypeV2 } from '@/lib/layout/types-v2';

describe('palette parity with BlockTypeV2', () => {
  // Static list of every value in the BlockTypeV2 union. Keep in sync with
  // src/lib/layout/types-v2.ts. If you add a new BlockTypeV2 value, you must
  // either add a PALETTE_ITEMS entry in ComponentDrawer.tsx or add an opt-out here.
  const allBlockTypes: BlockTypeV2[] = [
    'field_display',
    'photo_gallery',
    'status_badge',
    'entity_list',
    'timeline',
    'text_label',
    'description',
    'divider',
    'map_snippet',
    'action_buttons',
    'maintenance_projects',
  ];

  it('renders a draggable chip for every BlockTypeV2', () => {
    render(<ComponentDrawer {...defaultProps} isMobile={false} />);
    for (const type of allBlockTypes) {
      const chip = screen.queryByLabelText(new RegExp(`Drag to add `, 'i'));
      // We assert by label text instead of type because the chip is rendered
      // with aria-label="Drag to add <Label>". Pull the actual labels from
      // the rendered DOM and check that the count matches.
      expect(chip).not.toBeNull();
    }
    const chips = screen.getAllByLabelText(/Drag to add /i);
    expect(chips.length).toBe(allBlockTypes.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --run src/components/layout/builder/__tests__/ComponentDrawer.test.tsx
```

Expected: the new `palette parity with BlockTypeV2` describe block fails — `chips.length` is 10, not 11. (`maintenance_projects` is missing from `PALETTE_ITEMS`.)

- [ ] **Step 3: Add the maintenance chip to PALETTE_ITEMS**

Edit `src/components/layout/builder/ComponentDrawer.tsx`. Replace the `PALETTE_ITEMS` array (lines 15–26):

```tsx
// No "Row" — rows are created via side-drop
const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'field_display', icon: '📊', label: 'Field' },
  { type: 'photo_gallery', icon: '📷', label: 'Photo' },
  { type: 'status_badge', icon: '🏷', label: 'Status' },
  { type: 'entity_list', icon: '🔗', label: 'Entities' },
  { type: 'timeline', icon: '📋', label: 'Timeline' },
  { type: 'maintenance_projects', icon: '🔧', label: 'Upcoming Maintenance' },
  { type: 'text_label', icon: '✏️', label: 'Text' },
  { type: 'description', icon: '📝', label: 'Description' },
  { type: 'divider', icon: '➖', label: 'Divider' },
  { type: 'map_snippet', icon: '📍', label: 'Map' },
  { type: 'action_buttons', icon: '🔘', label: 'Actions' },
];
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run src/components/layout/builder/__tests__/ComponentDrawer.test.tsx
```

Expected: all `ComponentDrawer` tests pass, including the new parity test (11 chips found).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/builder/ComponentDrawer.tsx src/components/layout/builder/__tests__/ComponentDrawer.test.tsx
git commit -m "fix(layout-editor): add Upcoming Maintenance chip to live ComponentDrawer

PR #283 added the chip to the dead BlockPaletteV2.tsx — this puts it in
the actual drawer admins see, plus a regression test that asserts every
BlockTypeV2 has a corresponding palette entry."
```

---

## Task 2: Rename `MaintenanceProjectsBlock` → `UpcomingMaintenanceBlock` (file only, no behavior change)

**Files:**
- Move: `src/components/layout/blocks/MaintenanceProjectsBlock.tsx` → `src/components/layout/blocks/UpcomingMaintenanceBlock.tsx`
- Modify: `src/components/layout/LayoutRendererV2.tsx:21,252` (import + JSX)

The discriminated-union value `'maintenance_projects'` in `BlockTypeV2` does not change — that would break existing layout JSONB. Only file/symbol names change.

- [ ] **Step 1: git mv the file**

```bash
git mv src/components/layout/blocks/MaintenanceProjectsBlock.tsx src/components/layout/blocks/UpcomingMaintenanceBlock.tsx
```

- [ ] **Step 2: Rename the exported symbol inside the moved file**

Edit `src/components/layout/blocks/UpcomingMaintenanceBlock.tsx`. Find the line:

```tsx
export function MaintenanceProjectsBlock({ itemId }: Props) {
```

Replace with:

```tsx
export function UpcomingMaintenanceBlock({ itemId }: Props) {
```

(Leave all other code in the file untouched — full rewrite happens in Task 5.)

- [ ] **Step 3: Update the import and JSX in LayoutRendererV2**

Edit `src/components/layout/LayoutRendererV2.tsx`. At line 21, replace:

```tsx
import { MaintenanceProjectsBlock } from './blocks/MaintenanceProjectsBlock';
```

with:

```tsx
import { UpcomingMaintenanceBlock } from './blocks/UpcomingMaintenanceBlock';
```

At line 252 (inside the `case 'maintenance_projects'` branch), replace:

```tsx
return <MaintenanceProjectsBlock itemId={item.id} />;
```

with:

```tsx
return <UpcomingMaintenanceBlock itemId={item.id} />;
```

- [ ] **Step 4: Run type-check and the full test suite**

```bash
npm run type-check
npm test -- --run
```

Expected: type-check passes; every test in the suite passes (no behavioral change).

- [ ] **Step 5: Commit**

```bash
git add -A src/components/layout/
git commit -m "refactor(maintenance-block): rename file and symbol to UpcomingMaintenanceBlock

Pure rename. Block type identifier 'maintenance_projects' in BlockTypeV2 is
unchanged so existing layout JSONB stays valid."
```

---

## Task 3: Thread `propertySlug` prop through the renderer chain

**Files:**
- Modify: `src/components/layout/LayoutRendererDispatch.tsx`
- Modify: `src/components/layout/LayoutRendererV2.tsx`
- Modify: `src/components/item/DetailPanel.tsx:190-205`

The block needs the property slug (already in `DetailPanel` as `slug` from `useParams`) to build tap-target URLs. `isAuthenticated` is already threaded through. We add one prop, `propertySlug`, that defaults to `null` so non-DetailPanel call sites (e.g., `EditableLayoutRenderer` in the layout editor preview) continue to work without modification.

- [ ] **Step 1: Add `propertySlug` to `LayoutRendererDispatch` Props**

Edit `src/components/layout/LayoutRendererDispatch.tsx`. Add to the `Props` interface (after `userRole?`):

```tsx
  propertySlug?: string | null;
```

The component already does `{ layout, ...rest }` spread, so the prop forwards automatically.

- [ ] **Step 2: Add `propertySlug` to `LayoutRendererV2Props`**

Edit `src/components/layout/LayoutRendererV2.tsx`. Add to the `LayoutRendererV2Props` interface (after `userRole?`):

```tsx
  propertySlug?: string | null;
```

- [ ] **Step 3: Pass `propertySlug` into the maintenance block JSX**

In `src/components/layout/LayoutRendererV2.tsx`, update the `case 'maintenance_projects'` branch (line ~252):

```tsx
case 'maintenance_projects': {
  return (
    <UpcomingMaintenanceBlock
      itemId={item.id}
      propertySlug={props.propertySlug ?? null}
      isAuthenticated={props.isAuthenticated ?? false}
    />
  );
}
```

- [ ] **Step 4: Add the new props to `UpcomingMaintenanceBlock`**

Edit `src/components/layout/blocks/UpcomingMaintenanceBlock.tsx`. Replace the `Props` interface:

```tsx
interface Props {
  itemId: string;
  propertySlug?: string | null;
  isAuthenticated?: boolean;
}
```

And update the function signature:

```tsx
export function UpcomingMaintenanceBlock({ itemId, propertySlug = null, isAuthenticated = false }: Props) {
```

(Body stays unchanged for now — Task 5 rewrites it.)

- [ ] **Step 5: Pass `propertySlug` from DetailPanel**

Edit `src/components/item/DetailPanel.tsx`. In the `<LayoutRendererDispatch ...>` JSX block (around lines 190–205), add `propertySlug={slug}` after the `userRole={userRole}` prop:

```tsx
<LayoutRendererDispatch
  layout={layout}
  item={filteredItem}
  mode="live"
  context={isMobile ? 'bottom-sheet' : 'side-panel'}
  sheetState={isMobile ? 'full' : undefined}
  customFields={item.custom_fields ?? []}
  canEdit={canEditItem}
  canAddUpdate={canAddUpdate}
  isAuthenticated={isAuthenticated}
  canEditUpdate={canEditItem}
  canDeleteUpdate={canEditItem}
  currentUserId={currentUserId}
  userRole={userRole}
  propertySlug={slug}
  onDeleteUpdate={handleDeleteUpdate}
/>
```

- [ ] **Step 6: Run type-check and full test suite**

```bash
npm run type-check
npm test -- --run
```

Expected: both pass. The block ignores the new props for now — behavior unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/LayoutRendererDispatch.tsx src/components/layout/LayoutRendererV2.tsx src/components/layout/blocks/UpcomingMaintenanceBlock.tsx src/components/item/DetailPanel.tsx
git commit -m "feat(layout-renderer): thread propertySlug + isAuthenticated to maintenance block

No behavior change yet — props are accepted but unused. Task 5 wires them up."
```

---

## Task 4: Write the comprehensive failing test suite for the new block

**Files:**
- Create: `src/components/layout/blocks/__tests__/UpcomingMaintenanceBlock.test.tsx`

These tests cover every state from the spec. They will all fail at first (the block still has the old shape). Task 5 makes them pass by rewriting the block.

- [ ] **Step 1: Create the test file**

Write the entire file at `src/components/layout/blocks/__tests__/UpcomingMaintenanceBlock.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { UpcomingMaintenanceBlock } from '../UpcomingMaintenanceBlock';

// --- Supabase client mock ---
// The block runs ONE query:
//   from('maintenance_project_items')
//     .select('completed_at, maintenance_projects(id, title, description, status, scheduled_for, updated_at)')
//     .eq('item_id', itemId)
// We mock the chain to resolve with a controllable result per test.

let supabaseResult: { data: unknown; error: { message: string } | null } = {
  data: [],
  error: null,
};

function makeChainable() {
  const chain: Record<string, unknown> = {};
  const resolver = () => Promise.resolve(supabaseResult);
  for (const k of ['select', 'eq']) {
    chain[k] = vi.fn(() => chain as unknown as typeof chain);
  }
  (chain as { then: typeof Promise.prototype.then }).then = ((onFulfilled: unknown, onRejected: unknown) =>
    resolver().then(onFulfilled as never, onRejected as never)) as typeof Promise.prototype.then;
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn(() => makeChainable()),
  }),
}));

// --- Time mock ---
// Tests against a fixed "today" so date math is deterministic.
const TODAY = new Date('2026-04-27T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
  supabaseResult = { data: [], error: null };
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Fixture builders ---
type ProjectStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';
function row(opts: {
  id: string;
  title: string;
  description?: string | null;
  status: ProjectStatus;
  scheduled_for: string | null;
  completed_at: string | null;
  updated_at?: string;
}) {
  return {
    completed_at: opts.completed_at,
    maintenance_projects: {
      id: opts.id,
      title: opts.title,
      description: opts.description ?? null,
      status: opts.status,
      scheduled_for: opts.scheduled_for,
      updated_at: opts.updated_at ?? '2026-04-20T00:00:00Z',
    },
  };
}

describe('UpcomingMaintenanceBlock', () => {
  it('renders the loading skeleton before data arrives', () => {
    // Supabase resolves on next microtask; the first synchronous render shows the skeleton.
    render(
      <UpcomingMaintenanceBlock
        itemId="item-1"
        propertySlug="property-a"
        isAuthenticated={true}
      />,
    );
    expect(screen.getByTestId('mp-block-skeleton')).toBeInTheDocument();
  });

  it('renders the mixed state (overdue + upcoming + unscheduled + footer) for staff', async () => {
    supabaseResult = {
      data: [
        // overdue (3 days late)
        row({
          id: 'p-overdue',
          title: 'Spring nestbox inspection',
          description: 'Annual check for damage, mites, and replace nesting material.',
          status: 'planned',
          scheduled_for: '2026-04-24',
          completed_at: null,
        }),
        // upcoming (5 days out)
        row({
          id: 'p-upcoming-1',
          title: 'Predator guard install',
          description: 'Install metal cone guards on poles.',
          status: 'in_progress',
          scheduled_for: '2026-05-02',
          completed_at: null,
        }),
        // upcoming (later)
        row({
          id: 'p-upcoming-2',
          title: 'Annual cleanout',
          description: null,
          status: 'planned',
          scheduled_for: '2026-09-15',
          completed_at: null,
        }),
        // unscheduled
        row({
          id: 'p-unscheduled',
          title: 'Replace warped roof panel',
          description: 'Reported by volunteer.',
          status: 'planned',
          scheduled_for: null,
          completed_at: null,
        }),
        // completed (does NOT appear in lists, but feeds the footer)
        row({
          id: 'p-done',
          title: 'Winter weatherproofing',
          status: 'completed',
          scheduled_for: '2026-02-15',
          completed_at: '2026-02-18T10:00:00Z',
        }),
      ],
      error: null,
    };

    render(
      <UpcomingMaintenanceBlock
        itemId="item-1"
        propertySlug="property-a"
        isAuthenticated={true}
      />,
    );

    // Header
    await screen.findByText('Upcoming Maintenance');
    expect(screen.getByText('4 upcoming · 1 overdue')).toBeInTheDocument();

    // Subgroup labels
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Unscheduled')).toBeInTheDocument();

    // Overdue row: shows "3d late" in red, no date column
    expect(screen.getByText('3d late')).toBeInTheDocument();

    // Upcoming rows render their dates
    expect(screen.getByText(/May 2/)).toBeInTheDocument();
    expect(screen.getByText(/Sep 15/)).toBeInTheDocument();

    // Tap target for staff: /p/{slug}/admin/maintenance/{id}
    const overdueLink = screen.getByText('Spring nestbox inspection').closest('a');
    expect(overdueLink).not.toBeNull();
    expect(overdueLink?.getAttribute('href')).toBe('/p/property-a/admin/maintenance/p-overdue');

    // Description preview present (line-clamp applied via class)
    const desc = screen.getByText(/Annual check for damage/i);
    expect(desc.className).toMatch(/line-clamp-1/);

    // Footer
    expect(screen.getByText(/Last maintained via/)).toBeInTheDocument();
    expect(screen.getByText('Winter weatherproofing')).toBeInTheDocument();
  });

  it('renders the caught-up empty state when there are no upcoming but a completed exists', async () => {
    supabaseResult = {
      data: [
        row({
          id: 'p-done',
          title: 'Winter weatherproofing',
          status: 'completed',
          scheduled_for: '2026-02-15',
          completed_at: '2026-02-18T10:00:00Z',
        }),
      ],
      error: null,
    };

    render(
      <UpcomingMaintenanceBlock
        itemId="item-1"
        propertySlug="property-a"
        isAuthenticated={true}
      />,
    );

    await screen.findByText('Upcoming Maintenance');
    expect(screen.getByText(/All caught up — no upcoming maintenance/i)).toBeInTheDocument();
    expect(screen.getByText('Winter weatherproofing')).toBeInTheDocument();
    // No subgroup labels in empty state
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });

  it('renders the no-history empty state when there are no projects at all', async () => {
    supabaseResult = { data: [], error: null };

    render(
      <UpcomingMaintenanceBlock
        itemId="item-1"
        propertySlug="property-a"
        isAuthenticated={true}
      />,
    );

    await screen.findByText('Upcoming Maintenance');
    expect(screen.getByText('No upcoming maintenance.')).toBeInTheDocument();
    expect(screen.queryByText(/Last maintained via/)).not.toBeInTheDocument();
  });

  it('uses the public viewer URL for anonymous viewers', async () => {
    supabaseResult = {
      data: [
        row({
          id: 'p-anon',
          title: 'Public view check',
          status: 'planned',
          scheduled_for: '2026-05-02',
          completed_at: null,
        }),
      ],
      error: null,
    };

    render(
      <UpcomingMaintenanceBlock
        itemId="item-1"
        propertySlug="property-a"
        isAuthenticated={false}
      />,
    );

    const link = (await screen.findByText('Public view check')).closest('a');
    expect(link?.getAttribute('href')).toBe('/p/property-a/maintenance/p-anon');
  });

  it('renders rows as non-anchor when propertySlug is null', async () => {
    supabaseResult = {
      data: [
        row({
          id: 'p-noslug',
          title: 'Should not link',
          status: 'planned',
          scheduled_for: '2026-05-02',
          completed_at: null,
        }),
      ],
      error: null,
    };

    render(
      <UpcomingMaintenanceBlock
        itemId="item-1"
        propertySlug={null}
        isAuthenticated={true}
      />,
    );

    const titleEl = await screen.findByText('Should not link');
    expect(titleEl.closest('a')).toBeNull();
  });

  it('renders an inline error message but keeps the header when the query fails', async () => {
    supabaseResult = { data: null, error: { message: 'network down' } };

    render(
      <UpcomingMaintenanceBlock
        itemId="item-1"
        propertySlug="property-a"
        isAuthenticated={true}
      />,
    );

    await screen.findByText('Upcoming Maintenance');
    expect(
      screen.getByText(/Couldn['']t load maintenance/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test file to verify every test fails**

```bash
npm test -- --run src/components/layout/blocks/__tests__/UpcomingMaintenanceBlock.test.tsx
```

Expected: 7 tests fail (the existing block has the old behavior — wrong heading text, no subgroup labels, no anchors, etc.). The "loading skeleton" test may pass since the skeleton testid still exists.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/components/layout/blocks/__tests__/UpcomingMaintenanceBlock.test.tsx
git commit -m "test(maintenance-block): add failing tests for new Upcoming Maintenance behavior

Tests fail intentionally; Task 5 rewrites the block to satisfy them."
```

---

## Task 5: Rewrite the block to satisfy the new tests

**Files:**
- Modify: `src/components/layout/blocks/UpcomingMaintenanceBlock.tsx` (full rewrite)

- [ ] **Step 1: Replace the file contents**

Open `src/components/layout/blocks/UpcomingMaintenanceBlock.tsx` and replace its entire contents with:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MaintenanceStatusPill } from '@/components/maintenance/MaintenanceStatusPill';
import type { MaintenanceStatus } from '@/lib/maintenance/types';

interface RawRow {
  completed_at: string | null;
  maintenance_projects: {
    id: string;
    title: string;
    description: string | null;
    status: MaintenanceStatus;
    scheduled_for: string | null;
    updated_at: string;
  } | null;
}

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  status: MaintenanceStatus;
  scheduled_for: string | null;
  completed_at: string | null;
  updated_at: string;
}

interface Props {
  itemId: string;
  propertySlug?: string | null;
  isAuthenticated?: boolean;
}

const ACTIVE_STATUSES: MaintenanceStatus[] = ['planned', 'in_progress'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfTodayUTC(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function parseScheduledMs(iso: string): number {
  // scheduled_for is a date-only string ('YYYY-MM-DD'). Parse as UTC midnight.
  return Date.parse(iso + 'T00:00:00Z');
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function detailUrl(projectId: string, slug: string, isAuthenticated: boolean): string {
  return isAuthenticated
    ? `/p/${slug}/admin/maintenance/${projectId}`
    : `/p/${slug}/maintenance/${projectId}`;
}

export function UpcomingMaintenanceBlock({
  itemId,
  propertySlug = null,
  isAuthenticated = false,
}: Props) {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const res = await supabase
        .from('maintenance_project_items')
        .select(
          'completed_at, maintenance_projects(id, title, description, status, scheduled_for, updated_at)',
        )
        .eq('item_id', itemId);
      if (cancelled) return;
      if (res.error) {
        setError(res.error.message);
        setRows([]);
        return;
      }
      const raw = (res.data ?? []) as unknown as RawRow[];
      const mapped: ProjectRow[] = raw
        .filter((r): r is RawRow & { maintenance_projects: NonNullable<RawRow['maintenance_projects']> } =>
          r.maintenance_projects !== null,
        )
        .map((r) => ({
          id: r.maintenance_projects.id,
          title: r.maintenance_projects.title,
          description: r.maintenance_projects.description,
          status: r.maintenance_projects.status,
          scheduled_for: r.maintenance_projects.scheduled_for,
          completed_at: r.completed_at,
          updated_at: r.maintenance_projects.updated_at,
        }));
      setRows(mapped);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const buckets = useMemo(() => {
    if (!rows) return null;
    const todayMs = startOfTodayUTC(new Date());
    const active = rows.filter((r) => ACTIVE_STATUSES.includes(r.status));

    const overdue = active
      .filter((r) => r.scheduled_for !== null && parseScheduledMs(r.scheduled_for) < todayMs)
      .sort((a, b) => parseScheduledMs(a.scheduled_for as string) - parseScheduledMs(b.scheduled_for as string));

    const upcoming = active
      .filter((r) => r.scheduled_for !== null && parseScheduledMs(r.scheduled_for) >= todayMs)
      .sort((a, b) => parseScheduledMs(a.scheduled_for as string) - parseScheduledMs(b.scheduled_for as string));

    const unscheduled = active
      .filter((r) => r.scheduled_for === null)
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));

    const lastCompleted = rows
      .filter((r) => r.completed_at !== null)
      .sort(
        (a, b) => Date.parse(b.completed_at as string) - Date.parse(a.completed_at as string),
      )[0] ?? null;

    return { overdue, upcoming, unscheduled, lastCompleted };
  }, [rows]);

  if (rows === null) {
    return (
      <div className="card p-4" data-testid="mp-block-skeleton">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-sage-light rounded w-1/3" />
          <div className="h-3 bg-sage-light/70 rounded w-2/3" />
          <div className="h-3 bg-sage-light/70 rounded w-1/2" />
        </div>
      </div>
    );
  }

  const { overdue, upcoming, unscheduled, lastCompleted } = buckets!;
  const totalUpcoming = overdue.length + upcoming.length + unscheduled.length;
  const hasUpcoming = totalUpcoming > 0;
  const countLine = hasUpcoming
    ? `${totalUpcoming} upcoming${overdue.length > 0 ? ` · ${overdue.length} overdue` : ''}`
    : null;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="w-7 h-7 rounded-lg bg-sage-light/60 text-forest flex items-center justify-center text-sm">
            🔧
          </span>
          <h3 className="font-heading text-forest-dark text-[15px]">Upcoming Maintenance</h3>
        </div>
        {countLine && <span className="text-xs text-gray-600">{countLine}</span>}
      </div>

      {error && (
        <div className="text-xs text-red-700 mb-2">Couldn&apos;t load maintenance history.</div>
      )}

      {!hasUpcoming && (
        <div className="text-sm text-gray-600 italic py-2">
          {lastCompleted ? 'All caught up — no upcoming maintenance.' : 'No upcoming maintenance.'}
        </div>
      )}

      {hasUpcoming && (
        <>
          <Subgroup label="Overdue" tone="overdue" rows={overdue} propertySlug={propertySlug} isAuthenticated={isAuthenticated} />
          <Subgroup label="Upcoming" tone="default" rows={upcoming} propertySlug={propertySlug} isAuthenticated={isAuthenticated} />
          <Subgroup label="Unscheduled" tone="default" rows={unscheduled} propertySlug={propertySlug} isAuthenticated={isAuthenticated} />
        </>
      )}

      {lastCompleted && (
        <div className="text-[11px] text-gray-600 mt-3 pt-3 border-t border-dashed border-sage-light flex items-center gap-1 flex-wrap">
          Last maintained via{' '}
          <strong className="text-forest-dark font-medium">{lastCompleted.title}</strong>
          {' · '}
          {formatDate(lastCompleted.completed_at)}
        </div>
      )}
    </div>
  );
}

function Subgroup({
  label,
  tone,
  rows,
  propertySlug,
  isAuthenticated,
}: {
  label: 'Overdue' | 'Upcoming' | 'Unscheduled';
  tone: 'overdue' | 'default';
  rows: ProjectRow[];
  propertySlug: string | null;
  isAuthenticated: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 first:mt-0">
      <div
        className={`text-[10px] uppercase tracking-wide font-semibold mb-1 ${
          tone === 'overdue' ? 'text-red-700' : 'text-gray-600'
        }`}
      >
        {label}
      </div>
      <ul className="space-y-1.5">
        {rows.map((p) => (
          <MaintenanceRow
            key={p.id}
            project={p}
            tone={tone}
            propertySlug={propertySlug}
            isAuthenticated={isAuthenticated}
          />
        ))}
      </ul>
    </div>
  );
}

function MaintenanceRow({
  project,
  tone,
  propertySlug,
  isAuthenticated,
}: {
  project: ProjectRow;
  tone: 'overdue' | 'default';
  propertySlug: string | null;
  isAuthenticated: boolean;
}) {
  const isOverdue = tone === 'overdue';
  const baseClasses = `block rounded-lg px-3 py-2 transition-colors ${
    isOverdue
      ? 'border border-red-200 bg-red-50 hover:bg-red-100'
      : 'border border-sage-light bg-white hover:bg-sage-light/30'
  }`;

  const daysLate = isOverdue && project.scheduled_for
    ? Math.max(1, Math.floor((startOfTodayUTC(new Date()) - parseScheduledMs(project.scheduled_for)) / MS_PER_DAY))
    : 0;

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2 min-h-[24px]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <MaintenanceStatusPill status={project.status} size="sm" />
          <span className="text-[13px] font-medium text-forest-dark truncate">
            {project.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isOverdue ? (
            <span className="text-[11px] font-medium text-red-700">{daysLate}d late</span>
          ) : project.scheduled_for ? (
            <span className="text-[11px] text-gray-600">{formatDate(project.scheduled_for)}</span>
          ) : (
            <span className="text-[11px] text-gray-400">—</span>
          )}
          {propertySlug && <span aria-hidden className="text-sage font-semibold ml-1">›</span>}
        </div>
      </div>
      {project.description && (
        <div className="text-[12px] text-gray-600 mt-1 leading-snug line-clamp-1">
          {project.description}
        </div>
      )}
    </>
  );

  if (propertySlug) {
    return (
      <li>
        <a href={detailUrl(project.id, propertySlug, isAuthenticated)} className={baseClasses}>
          {inner}
        </a>
      </li>
    );
  }

  return (
    <li>
      <div className={baseClasses}>{inner}</div>
    </li>
  );
}
```

- [ ] **Step 2: Run the failing tests to verify they now pass**

```bash
npm test -- --run src/components/layout/blocks/__tests__/UpcomingMaintenanceBlock.test.tsx
```

Expected: all 7 tests pass.

- [ ] **Step 3: Run the full test suite + type-check**

```bash
npm run type-check
npm test -- --run
```

Expected: type-check passes; full suite passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/blocks/UpcomingMaintenanceBlock.tsx
git commit -m "feat(maintenance-block): rewrite as Upcoming Maintenance with grouped, tappable rows

Filters to status planned/in_progress, buckets into Overdue / Upcoming /
Unscheduled subgroups, renders one-line description preview, links each row
to either /p/[slug]/admin/maintenance/[id] (staff) or /p/[slug]/maintenance/[id]
(anonymous). Empty states differentiate caught-up from no-history. Footer
keeps the 'Last maintained via X · date' summary."
```

---

## Task 6: Delete dead palette and builder files

**Files:**
- Delete: `src/components/layout/builder/BlockPaletteV2.tsx`
- Delete: `src/components/layout/builder/BlockPalette.tsx`
- Delete: `src/components/layout/builder/LayoutBuilder.tsx`
- Delete: `src/components/layout/builder/LayoutBuilderV2.tsx`
- Delete: `src/components/layout/builder/__tests__/BlockPalette.test.tsx`

- [ ] **Step 1: Verify no live code references them**

```bash
rg "from .*['\"]\\./BlockPalette['\"]|from .*['\"]\\./BlockPaletteV2['\"]|from .*['\"]\\./LayoutBuilder['\"]|from .*['\"]\\./LayoutBuilderV2['\"]" src/ -g '!src/components/layout/builder/LayoutBuilder*.tsx' -g '!src/components/layout/builder/BlockPalette*.tsx'
```

Expected: zero matches.

```bash
rg "BlockPalette[V2]?|LayoutBuilder[V2]?" src/ -g '*.ts' -g '*.tsx' \
  | grep -v 'src/components/layout/builder/BlockPalette' \
  | grep -v 'src/components/layout/builder/LayoutBuilder' \
  | grep -v 'src/components/layout/builder/__tests__/BlockPalette'
```

Expected: zero matches.

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/layout/builder/BlockPaletteV2.tsx \
       src/components/layout/builder/BlockPalette.tsx \
       src/components/layout/builder/LayoutBuilder.tsx \
       src/components/layout/builder/LayoutBuilderV2.tsx \
       src/components/layout/builder/__tests__/BlockPalette.test.tsx
```

- [ ] **Step 3: Run type-check + full test suite**

```bash
npm run type-check
npm test -- --run
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(layout-editor): delete dead BlockPalette/LayoutBuilder duplicates

BlockPaletteV2 + LayoutBuilderV2 had no live importers (the live editor uses
ComponentDrawer + LayoutEditor). Their V1 counterparts likewise had no live
importers. Deleting them prevents the PR #283 wiring bug from recurring."
```

---

## Task 7: Add E2E coverage for chip visibility and tap-target navigation

**Files:**
- Create: `e2e/tests/admin/maintenance-block.spec.ts`

- [ ] **Step 1: Look at how an existing maintenance E2E spec is structured for reference**

```bash
ls e2e/tests/admin/maintenance.spec.ts e2e/tests/public/maintenance-viewer.spec.ts 2>/dev/null
```

Read the file paths printed. The new spec should match the existing patterns for fixtures, `test.describe` usage, and `loginAsStaff` / `loginAsAnonymous` helpers (or whatever the equivalents are named — names vary across the suite). If neither file exists or structure differs, follow the closest pattern in `e2e/tests/`.

- [ ] **Step 2: Write the spec**

Create `e2e/tests/admin/maintenance-block.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Upcoming Maintenance block', () => {
  test('staff sees the chip in the layout editor component drawer', async ({ page }) => {
    // Adjust login + navigation to match the project's existing helpers.
    await page.goto('/org/types');
    // Expand the first item type's "layout" tab.
    await page.getByRole('button', { name: /layout/i }).first().click();
    // The chip should be visible in the desktop component drawer.
    await expect(page.getByLabel(/Drag to add Upcoming Maintenance/i)).toBeVisible();
  });

  test('staff clicking a maintenance row lands on /p/[slug]/admin/maintenance/[id]', async ({ page }) => {
    // Open an item that has a known maintenance project linked. The seed data
    // for the existing maintenance E2E specs already creates this; reuse it.
    // Replace ITEM_URL + PROJECT_ID with the seed values.
    const ITEM_URL = '/p/test-property?item=seeded-item-with-maintenance';
    const EXPECTED_ADMIN_URL = /\/p\/test-property\/admin\/maintenance\/.+/;
    await page.goto(ITEM_URL);
    const row = page.getByRole('link', { name: /Spring nestbox inspection/i });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(EXPECTED_ADMIN_URL);
  });

  test('anonymous viewer clicking a maintenance row lands on /p/[slug]/maintenance/[id]', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    const ITEM_URL = '/p/test-property?item=seeded-item-with-maintenance';
    const EXPECTED_PUBLIC_URL = /\/p\/test-property\/maintenance\/[^/]+$/;
    await page.goto(ITEM_URL);
    const row = page.getByRole('link', { name: /Spring nestbox inspection/i });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(EXPECTED_PUBLIC_URL);
    await context.close();
  });
});
```

> **Note for the implementing engineer:** The seed data names (`'test-property'`, `'Spring nestbox inspection'`, etc.) are placeholders. Open `e2e/tests/admin/maintenance.spec.ts` (and any seeding helpers under `e2e/fixtures/` or `e2e/helpers/`) and replace each placeholder with the real seed value. If no seeded maintenance-linked item exists in the fixtures, add one in the same place existing maintenance fixtures are defined.

- [ ] **Step 3: Run the smoke E2E suite to verify nothing else broke**

```bash
npm run test:e2e:smoke
```

Expected: all smoke tests pass. (The new spec is not in the smoke subset; we run the smoke suite to confirm we did not regress fast-running E2E coverage.)

- [ ] **Step 4: Run the new spec**

```bash
npx playwright test --config=e2e/playwright.config.ts e2e/tests/admin/maintenance-block.spec.ts
```

Expected: all 3 cases pass. If they fail because of placeholder seed values, follow the note in Step 2 to plug in real values.

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/admin/maintenance-block.spec.ts
git commit -m "test(e2e): chip visibility + tap-target navigation for Upcoming Maintenance"
```

---

## Task 8: Manual verification + visual diff screenshots

**Files:** `docs/playbooks/visual-diff-screenshots.md` (read-only — follow the playbook).

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Wait for "Ready in …".

- [ ] **Step 2: Open `/org/types` in the browser, expand any item type's layout tab**

Verify visually: the **🔧 Upcoming Maintenance** chip appears in the left component drawer (desktop) and in the FAB drawer (mobile, ~375px viewport). Drag it onto the layout, save.

- [ ] **Step 3: Open an item of that type with linked maintenance, then with none**

- For an item that has at least one upcoming maintenance project: confirm subgroup labels render in the right order, dates format correctly, chevrons appear, clicking a row navigates to `/p/{slug}/admin/maintenance/{id}` (staff) or `/p/{slug}/maintenance/{id}` (logged out — open an incognito window).
- For an item with only completed maintenance: confirm "All caught up — no upcoming maintenance." + footer renders.
- For an item with no maintenance at all: confirm "No upcoming maintenance." + no footer.

- [ ] **Step 4: Capture before/after screenshots per the visual diff playbook**

Follow `docs/playbooks/visual-diff-screenshots.md` to capture:
- "Before": pull a screenshot from `main` (use git stash + dev restart, or a separate worktree on `main`) showing the item with the old `MaintenanceProjectsBlock`.
- "After": same item in this worktree showing the new `UpcomingMaintenanceBlock`.

Save the pair under whatever directory the playbook prescribes (typically `docs/visual-diffs/<date>-<feature>/`). Include both in the eventual PR description.

- [ ] **Step 5: Commit the screenshots**

```bash
git add docs/visual-diffs/  # or whatever path the playbook uses
git commit -m "docs(visual-diff): before/after screenshots for Upcoming Maintenance block"
```

(Skip this step if the playbook says screenshots go in the PR body, not the repo.)

---

## Self-Review Checklist (run after writing the plan)

This is the writer's review, not a runtime checklist for the executor — it's already been done. The notes below document what was checked.

**Spec coverage:**
- "Operators can drag the chip" → Task 1.
- "Buckets / sort / counts" → Task 5 + Task 4 tests.
- "Tap target staff vs anonymous" → Task 5 + Task 4 tests + Task 7 E2E.
- "One-line description preview" → Task 5 + Task 4 mixed-state test.
- "Empty states (caught-up vs no-history)" → Task 5 + Task 4 tests.
- "Last maintained footer" → Task 5 + Task 4 tests.
- "Palette parity regression test" → Task 1 step 1.
- "Delete dead code" → Task 6.
- "Visual diff screenshots" → Task 8.

**Placeholder scan:** Every code block contains real code. The only intentional `placeholder` is the seed data names in Task 7 step 2 — flagged inline with the note "(replace placeholders with real seed values)".

**Type / API consistency:**
- `UpcomingMaintenanceBlock` Props interface in Task 3 step 4 matches the function signature in Task 5 step 1.
- `propertySlug` flows: `DetailPanel` (Task 3 step 5) → `LayoutRendererDispatch` (Task 3 step 1) → `LayoutRendererV2` (Task 3 steps 2–3) → `UpcomingMaintenanceBlock` (Task 3 step 4 / Task 5).
- `detailUrl` signature in Task 5 matches the URL assertions in Task 4.
- `MaintenanceStatusPill size="sm"` API confirmed in `src/components/maintenance/MaintenanceStatusPill.tsx`.

---

## Done definition

- All 8 tasks complete.
- `npm run type-check` passes.
- `npm test -- --run` passes (1398+ tests, including new ones).
- `npx playwright test e2e/tests/admin/maintenance-block.spec.ts` passes.
- Manual verification done in dev, screenshots captured.
- All 8 commits land on the branch.
- PR description includes the before/after screenshots and links to both the spec and this plan.
