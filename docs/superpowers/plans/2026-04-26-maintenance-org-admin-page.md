# Org-level Scheduled Maintenance admin page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Maintenance` entry in the org admin sidebar that lands on a new `/admin/maintenance` page aggregating projects across the org's active properties. Refactor the property-scoped list to share one `MaintenanceListView` client component used by all three list routes.

**Architecture:** New server page fetches all active properties + projects for the org, computes org-wide stats, and passes them to a shared client list component. The shared component renames/replaces the existing property-scoped `MaintenanceListClient` and adds: a `mode='org'|'property'` prop, optional grouping by property, and a chooser-aware "+ New project" button. Existing property routes are flipped to use the same view; their hard-wired URLs become parent-controlled via `buildDetailHref`/`buildCreateHref`.

**Tech Stack:** Next.js 14 App Router (server component for the org page, client component for the view), Supabase client, TypeScript, Tailwind CSS, Vitest + @testing-library/react, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-04-26-maintenance-org-admin-page-design.md`

**Foundation:** PR 1 (`ea37d54`) added the property-scoped admin pages with `MaintenanceListClient`, `MaintenanceProjectRow`, `MaintenanceStatCard`, `useFocusTrap`, `classifyScheduled`, `computeProgress`, and the `MaintenanceProjectRowData` type. PR 3 (`#283`) shipped the public viewer.

---

## File structure

**Create:**

```
src/components/maintenance/MaintenanceListView.tsx
src/components/maintenance/NewProjectButton.tsx
src/__tests__/maintenance/MaintenanceListView.test.tsx
src/__tests__/maintenance/NewProjectButton.test.tsx

src/app/admin/maintenance/page.tsx
src/app/admin/maintenance/loading.tsx
src/app/admin/maintenance/error.tsx
```

**Modify:**

```
src/components/maintenance/MaintenanceProjectRow.tsx          (prop rename)
src/__tests__/maintenance/MaintenanceProjectRow.test.tsx      (update fixtures)
src/app/admin/properties/[slug]/maintenance/page.tsx          (use MaintenanceListView)
src/app/admin/AdminShell.tsx                                  (+1 sidebar entry)
e2e/tests/admin/maintenance.spec.ts                           (sidebar nav assertion)
```

**Delete (superseded):**

```
src/app/admin/properties/[slug]/maintenance/MaintenanceListClient.tsx
src/__tests__/maintenance/MaintenanceListClient.test.tsx
```

`src/app/p/[slug]/admin/maintenance/page.tsx` is a one-line re-export of the org-domain property page — no change needed; it picks up the refactor automatically.

---

## Task 1: Refactor `MaintenanceProjectRow` to take `detailHref` directly

The row currently builds its href from `propertySlug`. The org page links to a different URL pattern (`/admin/properties/<slug>/maintenance/<id>`), so the parent should compute the URL.

**Files:**
- Modify: `src/components/maintenance/MaintenanceProjectRow.tsx`
- Modify: `src/__tests__/maintenance/MaintenanceProjectRow.test.tsx`

- [ ] **Step 1: Update the test to drive the new prop**

Replace the contents of `src/__tests__/maintenance/MaintenanceProjectRow.test.tsx` with:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MaintenanceProjectRow } from '@/components/maintenance/MaintenanceProjectRow';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

function makeRow(overrides: Partial<MaintenanceProjectRowData> = {}): MaintenanceProjectRowData {
  return {
    id: 'p-1',
    org_id: 'o-1',
    property_id: 'prop-1',
    title: 'Spring cleaning',
    description: null,
    status: 'in_progress',
    scheduled_for: '2026-04-05',
    created_by: 'u-1',
    updated_by: 'u-1',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-10T00:00:00Z',
    items_completed: 1,
    items_total: 4,
    knowledge_count: 0,
    creator_name: null,
    ...overrides,
  };
}

describe('MaintenanceProjectRow', () => {
  it('links to the provided detailHref', () => {
    render(
      <MaintenanceProjectRow
        row={makeRow()}
        today="2026-04-10"
        detailHref="/admin/properties/discovery-park/maintenance/p-1"
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/admin/properties/discovery-park/maintenance/p-1');
  });

  it('renders status pill, title, and progress bar for in_progress', () => {
    render(
      <MaintenanceProjectRow
        row={makeRow({ status: 'in_progress', items_completed: 2, items_total: 8 })}
        today="2026-04-10"
        detailHref="/x"
      />,
    );
    expect(screen.getByText('Spring cleaning')).toBeInTheDocument();
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
  });

  it('shows Overdue chip when scheduled in the past and status is planned', () => {
    render(
      <MaintenanceProjectRow
        row={makeRow({ status: 'planned', scheduled_for: '2026-03-01' })}
        today="2026-04-10"
        detailHref="/x"
      />,
    );
    expect(screen.getByText(/Overdue/)).toBeInTheDocument();
  });

  it('shows "in N days" chip when scheduled within 14 days and status is planned', () => {
    render(
      <MaintenanceProjectRow
        row={makeRow({ status: 'planned', scheduled_for: '2026-04-15' })}
        today="2026-04-10"
        detailHref="/x"
      />,
    );
    expect(screen.getByText(/in 5d/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails on the prop change**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceProjectRow.test.tsx`

Expected: FAIL — type error or "received undefined" on `detailHref`.

- [ ] **Step 3: Update the component to accept `detailHref` directly**

Replace `src/components/maintenance/MaintenanceProjectRow.tsx` with:

```tsx
import Link from 'next/link';
import { MaintenanceStatusPill } from './MaintenanceStatusPill';
import { classifyScheduled, computeProgress } from '@/lib/maintenance/logic';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

interface Props {
  row: MaintenanceProjectRowData;
  today: string;
  detailHref: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : '')).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MaintenanceProjectRow({ row, today, detailHref }: Props) {
  const schedule = classifyScheduled(row.scheduled_for, row.status, today);
  const progress = computeProgress(row.items_completed, row.items_total);

  return (
    <Link
      href={detailHref}
      className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-5 px-5 py-4 border-b border-sage-light hover:bg-sage-light/20 transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="font-heading text-forest-dark text-[15px] font-semibold truncate">
            {row.title}
          </span>
          <MaintenanceStatusPill status={row.status} size="sm" />
          {schedule.tone === 'overdue' && (
            <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 text-[11px] px-2 py-0.5 font-medium">
              Overdue
            </span>
          )}
          {schedule.tone === 'soon' && (
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 font-medium">
              in {schedule.daysUntil}d
            </span>
          )}
        </div>
        <div className="text-[12px] text-gray-600 flex flex-wrap gap-3">
          <span>{formatDate(row.scheduled_for)}</span>
          <span>{row.items_total} items</span>
          {row.knowledge_count > 0 && (
            <span>{row.knowledge_count} article{row.knowledge_count > 1 ? 's' : ''}</span>
          )}
          {row.creator_name && <span className="opacity-70">by {row.creator_name}</span>}
        </div>
      </div>

      {row.status === 'in_progress' ? (
        <div className="w-[140px]">
          <div className="text-[11px] text-right text-gray-600 mb-1">
            {progress.completed}/{progress.total} done
          </div>
          <div className="h-1.5 rounded-full bg-sage-light overflow-hidden" data-testid="progress-bar">
            <div className="h-full bg-forest" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      ) : (
        <div className="w-[140px]" />
      )}

      <div className="text-[11px] text-right w-[90px] text-gray-600">
        {row.status === 'completed' ? 'Completed' : 'Updated'}
        <br />
        <span className="text-forest-dark font-medium">{formatDate(row.updated_at.slice(0, 10))}</span>
      </div>

      <span aria-hidden className="text-sage">→</span>
    </Link>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceProjectRow.test.tsx`

Expected: PASS (4 tests).

- [ ] **Step 5: Run type-check to surface old callers**

Run: `npm run type-check 2>&1 | tail -30`

Expected: errors at the existing caller `src/app/admin/properties/[slug]/maintenance/MaintenanceListClient.tsx` (still passes `propertySlug`). Don't fix yet — that file is superseded in Task 4 and the call site there will be removed entirely.

If `npm run type-check` fails the build: temporarily restore the old prop by accepting BOTH `propertySlug?` and `detailHref?` and computing href as `detailHref ?? \`/p/\${propertySlug}/admin/maintenance/\${row.id}\``. Pick the simpler approach for your sequencing:

- **Sequenced (recommended):** keep the row clean (only `detailHref`) and DON'T commit until Task 4 has refactored the caller. In that case, hold off on Step 6 below and bundle this with Task 4.
- **Independent commits:** add the temporary `propertySlug?` shim and remove it in Task 4.

**Default to the sequenced approach** — combine the Task 1 + Task 4 commits to keep the refactor tidy.

- [ ] **Step 6 (sequenced): Defer commit**

If sequencing with Task 4: skip the commit here. The combined commit happens at the end of Task 4.

If using the shim: commit now with:

```bash
git add src/components/maintenance/MaintenanceProjectRow.tsx src/__tests__/maintenance/MaintenanceProjectRow.test.tsx
git commit -m "refactor(maintenance): MaintenanceProjectRow takes detailHref directly"
```

---

## Task 2: `NewProjectButton` component (TDD)

A presentational button used by both org and property modes. In property mode it renders a direct link. In org mode it picks based on the number of active properties: 1 → direct link to that property's create page; ≥2 → a button that opens a modal with a property list. Hidden when `properties.length === 0`.

**Files:**
- Create: `src/components/maintenance/NewProjectButton.tsx`
- Test: `src/__tests__/maintenance/NewProjectButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/maintenance/NewProjectButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NewProjectButton } from '@/components/maintenance/NewProjectButton';

const ONE_PROP = [{ id: 'p1', name: 'Discovery Park', slug: 'discovery-park' }];
const TWO_PROPS = [
  { id: 'p1', name: 'Discovery Park', slug: 'discovery-park' },
  { id: 'p2', name: 'Cedar Loop', slug: 'cedar-loop' },
];

const buildCreateHref = (slug: string) => `/admin/properties/${slug}/maintenance/new`;

describe('NewProjectButton', () => {
  it('property mode: renders an anchor to the passed createHref', () => {
    render(<NewProjectButton mode="property" properties={ONE_PROP} createHref="/p/discovery-park/admin/maintenance/new" buildCreateHref={buildCreateHref} />);
    const link = screen.getByRole('link', { name: /new project/i });
    expect(link).toHaveAttribute('href', '/p/discovery-park/admin/maintenance/new');
  });

  it('org mode + 1 property: renders an anchor to that property\'s create form', () => {
    render(<NewProjectButton mode="org" properties={ONE_PROP} buildCreateHref={buildCreateHref} />);
    const link = screen.getByRole('link', { name: /new project/i });
    expect(link).toHaveAttribute('href', '/admin/properties/discovery-park/maintenance/new');
  });

  it('org mode + 2 properties: renders a button (no link) that opens a chooser modal', () => {
    render(<NewProjectButton mode="org" properties={TWO_PROPS} buildCreateHref={buildCreateHref} />);
    expect(screen.queryByRole('link', { name: /new project/i })).toBeNull();
    const button = screen.getByRole('button', { name: /new project/i });
    fireEvent.click(button);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Discovery Park')).toBeInTheDocument();
    expect(screen.getByText('Cedar Loop')).toBeInTheDocument();
  });

  it('chooser modal: clicking a property navigates to its create form', () => {
    const originalLocation = window.location;
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: assignSpy, href: originalLocation.href },
    });

    render(<NewProjectButton mode="org" properties={TWO_PROPS} buildCreateHref={buildCreateHref} />);
    fireEvent.click(screen.getByRole('button', { name: /new project/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cedar Loop/i }));
    expect(assignSpy).toHaveBeenCalledWith('/admin/properties/cedar-loop/maintenance/new');

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('chooser modal: Escape closes it', () => {
    render(<NewProjectButton mode="org" properties={TWO_PROPS} buildCreateHref={buildCreateHref} />);
    fireEvent.click(screen.getByRole('button', { name: /new project/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders nothing when no active properties exist', () => {
    const { container } = render(<NewProjectButton mode="org" properties={[]} buildCreateHref={buildCreateHref} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/__tests__/maintenance/NewProjectButton.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/maintenance/NewProjectButton.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useFocusTrap } from './useFocusTrap';

interface Property {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  mode: 'org' | 'property';
  properties: Property[];
  /** Property mode: required href to the create form. */
  createHref?: string;
  /** Builds /admin/properties/<slug>/maintenance/new for the org-mode chooser. */
  buildCreateHref: (slug: string) => string;
}

export function NewProjectButton({ mode, properties, createHref, buildCreateHref }: Props) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, () => setOpen(false));

  if (properties.length === 0) return null;

  // Property mode: direct link.
  if (mode === 'property') {
    const href = createHref ?? buildCreateHref(properties[0].slug);
    return (
      <Link href={href} className="btn-primary">
        + New project
      </Link>
    );
  }

  // Org mode + 1 property: skip chooser, direct link.
  if (properties.length === 1) {
    return (
      <Link href={buildCreateHref(properties[0].slug)} className="btn-primary">
        + New project
      </Link>
    );
  }

  // Org mode + 2+ properties: button + chooser modal.
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        + New project
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-project-chooser-title"
            className="card max-w-sm w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="new-project-chooser-title" className="font-heading text-forest-dark text-base mb-3">
              Which property?
            </h2>
            <ul className="space-y-1.5">
              {properties.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      window.location.assign(buildCreateHref(p.slug));
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg border border-sage-light hover:bg-sage-light/30 text-sm font-medium text-forest-dark"
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full text-center text-xs text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/maintenance/NewProjectButton.test.tsx`

Expected: PASS (6 tests).

- [ ] **Step 5: Type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/maintenance/NewProjectButton.tsx src/__tests__/maintenance/NewProjectButton.test.tsx
git commit -m "feat(maintenance): add NewProjectButton with property chooser modal"
```

---

## Task 3: `MaintenanceListView` component (TDD)

The shared list-view client. Replaces the existing `MaintenanceListClient`. Adds `mode`, `properties`, `buildDetailHref`, `buildCreateHref` props, optional grouping by property, and uses `NewProjectButton`.

**Files:**
- Create: `src/components/maintenance/MaintenanceListView.tsx`
- Test: `src/__tests__/maintenance/MaintenanceListView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/maintenance/MaintenanceListView.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MaintenanceListView } from '@/components/maintenance/MaintenanceListView';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

function makeRow(overrides: Partial<MaintenanceProjectRowData> = {}): MaintenanceProjectRowData {
  return {
    id: 'p-1',
    org_id: 'o-1',
    property_id: 'prop-1',
    title: 'Spring cleaning',
    description: null,
    status: 'in_progress',
    scheduled_for: '2026-04-05',
    created_by: 'u-1',
    updated_by: 'u-1',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-10T00:00:00Z',
    items_completed: 1,
    items_total: 4,
    knowledge_count: 0,
    creator_name: null,
    ...overrides,
  };
}

const PROP_A = { id: 'prop-1', name: 'Discovery Park', slug: 'discovery-park' };
const PROP_B = { id: 'prop-2', name: 'Cedar Loop', slug: 'cedar-loop' };

const STATS = { in_progress: 1, due_soon: 0, overdue: 0, completed_this_year: 0 };

const buildDetailHref = (r: MaintenanceProjectRowData) =>
  `/admin/properties/${r.property_id}/maintenance/${r.id}`;
const buildCreateHref = (slug: string) => `/admin/properties/${slug}/maintenance/new`;

describe('MaintenanceListView', () => {
  it('renders the four stat cards', () => {
    render(
      <MaintenanceListView
        mode="property"
        rows={[makeRow()]}
        properties={[PROP_A]}
        stats={{ in_progress: 2, due_soon: 1, overdue: 3, completed_this_year: 4 }}
        today="2026-04-10"
        buildDetailHref={buildDetailHref}
        buildCreateHref={buildCreateHref}
        createHref="/admin/properties/discovery-park/maintenance/new"
      />,
    );
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Due in 2 weeks')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Completed this year')).toBeInTheDocument();
  });

  it('default Active tab filters to planned + in_progress', () => {
    const rows = [
      makeRow({ id: 'a', title: 'Active project A', status: 'in_progress' }),
      makeRow({ id: 'b', title: 'Completed project B', status: 'completed' }),
    ];
    render(
      <MaintenanceListView
        mode="property"
        rows={rows}
        properties={[PROP_A]}
        stats={STATS}
        today="2026-04-10"
        buildDetailHref={buildDetailHref}
        buildCreateHref={buildCreateHref}
        createHref="/x"
      />,
    );
    expect(screen.getByText('Active project A')).toBeInTheDocument();
    expect(screen.queryByText('Completed project B')).toBeNull();
  });

  it('clicking the Completed tab swaps the filter', () => {
    const rows = [
      makeRow({ id: 'a', title: 'Active project A', status: 'in_progress' }),
      makeRow({ id: 'b', title: 'Completed project B', status: 'completed' }),
    ];
    render(
      <MaintenanceListView
        mode="property"
        rows={rows}
        properties={[PROP_A]}
        stats={STATS}
        today="2026-04-10"
        buildDetailHref={buildDetailHref}
        buildCreateHref={buildCreateHref}
        createHref="/x"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Completed/ }));
    expect(screen.getByText('Completed project B')).toBeInTheDocument();
    expect(screen.queryByText('Active project A')).toBeNull();
  });

  it('search input filters by title (case-insensitive substring)', () => {
    const rows = [
      makeRow({ id: 'a', title: 'Spring cleanout', status: 'in_progress' }),
      makeRow({ id: 'b', title: 'Hardware swap', status: 'in_progress' }),
    ];
    render(
      <MaintenanceListView
        mode="property"
        rows={rows}
        properties={[PROP_A]}
        stats={STATS}
        today="2026-04-10"
        buildDetailHref={buildDetailHref}
        buildCreateHref={buildCreateHref}
        createHref="/x"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Search projects/i), { target: { value: 'spring' } });
    expect(screen.getByText('Spring cleanout')).toBeInTheDocument();
    expect(screen.queryByText('Hardware swap')).toBeNull();
  });

  it('org mode + single property: flat list, no group header', () => {
    render(
      <MaintenanceListView
        mode="org"
        rows={[makeRow({ status: 'in_progress' })]}
        properties={[PROP_A]}
        stats={STATS}
        today="2026-04-10"
        buildDetailHref={buildDetailHref}
        buildCreateHref={buildCreateHref}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Discovery Park' })).toBeNull();
  });

  it('org mode + 2 properties: groups by property, header links to property page', () => {
    const rows = [
      makeRow({ id: 'a', title: 'A', property_id: 'prop-1', status: 'in_progress' }),
      makeRow({ id: 'b', title: 'B', property_id: 'prop-2', status: 'in_progress' }),
    ];
    render(
      <MaintenanceListView
        mode="org"
        rows={rows}
        properties={[PROP_A, PROP_B]}
        stats={STATS}
        today="2026-04-10"
        buildDetailHref={buildDetailHref}
        buildCreateHref={buildCreateHref}
      />,
    );
    const aHeader = screen.getByRole('link', { name: 'Discovery Park' });
    expect(aHeader).toHaveAttribute('href', '/admin/properties/discovery-park/maintenance');
    const bHeader = screen.getByRole('link', { name: 'Cedar Loop' });
    expect(bHeader).toHaveAttribute('href', '/admin/properties/cedar-loop/maintenance');
  });

  it('org mode + 2 properties: groups with no projects under the current tab are hidden', () => {
    const rows = [
      makeRow({ id: 'a', title: 'A', property_id: 'prop-1', status: 'in_progress' }),
      // prop-2 has no rows under Active
    ];
    render(
      <MaintenanceListView
        mode="org"
        rows={rows}
        properties={[PROP_A, PROP_B]}
        stats={STATS}
        today="2026-04-10"
        buildDetailHref={buildDetailHref}
        buildCreateHref={buildCreateHref}
      />,
    );
    expect(screen.getByRole('link', { name: 'Discovery Park' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cedar Loop' })).toBeNull();
  });

  it('renders empty CTA when zero projects match', () => {
    render(
      <MaintenanceListView
        mode="property"
        rows={[]}
        properties={[PROP_A]}
        stats={STATS}
        today="2026-04-10"
        buildDetailHref={buildDetailHref}
        buildCreateHref={buildCreateHref}
        createHref="/admin/properties/discovery-park/maintenance/new"
      />,
    );
    expect(screen.getByText(/No active projects/i)).toBeInTheDocument();
    const ctas = screen.getAllByRole('link', { name: /New project/i });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
  });

  it('row links use buildDetailHref', () => {
    const row = makeRow({ id: 'p-99', property_id: 'prop-1', status: 'in_progress' });
    render(
      <MaintenanceListView
        mode="property"
        rows={[row]}
        properties={[PROP_A]}
        stats={STATS}
        today="2026-04-10"
        buildDetailHref={(r) => `/admin/properties/${PROP_A.slug}/maintenance/${r.id}`}
        buildCreateHref={buildCreateHref}
        createHref="/x"
      />,
    );
    const link = screen.getByRole('link', { name: /Spring cleaning/i });
    expect(link).toHaveAttribute('href', '/admin/properties/discovery-park/maintenance/p-99');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceListView.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/maintenance/MaintenanceListView.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MaintenanceProjectRow } from './MaintenanceProjectRow';
import { MaintenanceStatCard } from './MaintenanceStatCard';
import { NewProjectButton } from './NewProjectButton';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

type Tab = 'active' | 'completed' | 'cancelled' | 'all';

interface Property {
  id: string;
  name: string;
  slug: string;
}

interface Stats {
  in_progress: number;
  due_soon: number;
  overdue: number;
  completed_this_year: number;
}

interface Props {
  mode: 'org' | 'property';
  rows: MaintenanceProjectRowData[];
  properties: Property[];
  stats: Stats;
  today: string;
  /** Builds the URL each row links to. */
  buildDetailHref: (row: MaintenanceProjectRowData) => string;
  /** Builds the URL the chooser modal sends a property to. */
  buildCreateHref: (slug: string) => string;
  /** Property mode only: direct create-form URL. Required when mode === 'property'. */
  createHref?: string;
}

const TAB_LABELS: Record<Tab, string> = {
  active: 'No active projects',
  completed: 'No completed projects',
  cancelled: 'No cancelled projects',
  all: 'No projects yet',
};

function matchesTab(status: MaintenanceProjectRowData['status'], tab: Tab): boolean {
  if (tab === 'active') return status === 'planned' || status === 'in_progress';
  if (tab === 'completed') return status === 'completed';
  if (tab === 'cancelled') return status === 'cancelled';
  return true;
}

export function MaintenanceListView({
  mode,
  rows,
  properties,
  stats,
  today,
  buildDetailHref,
  buildCreateHref,
  createHref,
}: Props) {
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => ({
    active: rows.filter((r) => matchesTab(r.status, 'active')).length,
    completed: rows.filter((r) => r.status === 'completed').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
    all: rows.length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesTab(r.status, tab)) return false;
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, search]);

  const propertyById = useMemo(() => {
    const map = new Map<string, Property>();
    for (const p of properties) map.set(p.id, p);
    return map;
  }, [properties]);

  const shouldGroup = mode === 'org' && properties.length >= 2;

  // Build groups in property-prop order; only include groups with at least one matching row.
  const groups = useMemo(() => {
    if (!shouldGroup) return null;
    return properties
      .map((p) => ({
        property: p,
        rows: filtered.filter((r) => r.property_id === p.id),
      }))
      .filter((g) => g.rows.length > 0);
  }, [properties, filtered, shouldGroup]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500">Admin · Data</div>
          <h1 className="font-heading text-2xl font-semibold text-forest-dark">Scheduled Maintenance</h1>
        </div>
        <NewProjectButton
          mode={mode}
          properties={properties}
          createHref={createHref}
          buildCreateHref={buildCreateHref}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <MaintenanceStatCard label="In progress" value={stats.in_progress} tint="blue" />
        <MaintenanceStatCard label="Due in 2 weeks" value={stats.due_soon} tint="amber" />
        <MaintenanceStatCard label="Overdue" value={stats.overdue} tint="red" />
        <MaintenanceStatCard label="Completed this year" value={stats.completed_this_year} tint="green" />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-sage-light gap-3 flex-wrap">
          <div className="flex gap-1.5">
            {(
              [
                ['active', 'Active', counts.active],
                ['completed', 'Completed', counts.completed],
                ['cancelled', 'Cancelled', counts.cancelled],
                ['all', 'All', counts.all],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
                  tab === id
                    ? 'bg-sage-light/70 text-forest-dark font-semibold'
                    : 'text-gray-600 hover:bg-sage-light/30 font-medium'
                }`}
              >
                {label}
                <span className="text-[11px] text-gray-500">{count}</span>
              </button>
            ))}
          </div>
          <input
            className="input-field w-64"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div>
          {filtered.length === 0 ? (
            <div className="text-center py-12 px-5">
              <div className="font-heading text-forest-dark text-base mb-2">
                {TAB_LABELS[tab]}
              </div>
              <div className="text-sm text-gray-600 mb-4">
                {rows.length === 0
                  ? 'Plan seasonal work, repairs, and group efforts across your map items.'
                  : 'Try a different tab or clear your search.'}
              </div>
              {rows.length === 0 && (
                <NewProjectButton
                  mode={mode}
                  properties={properties}
                  createHref={createHref}
                  buildCreateHref={buildCreateHref}
                />
              )}
            </div>
          ) : shouldGroup ? (
            (groups ?? []).map((g) => (
              <div key={g.property.id}>
                <div className="px-5 py-2.5 border-b border-sage-light bg-sage-light/20">
                  <Link
                    href={`/admin/properties/${g.property.slug}/maintenance`}
                    className="font-heading text-forest-dark text-sm font-semibold hover:underline"
                  >
                    {g.property.name}
                  </Link>
                  <span className="text-xs text-gray-600 ml-2">
                    {g.rows.length} project{g.rows.length === 1 ? '' : 's'}
                  </span>
                </div>
                {g.rows.map((r) => (
                  <MaintenanceProjectRow
                    key={r.id}
                    row={r}
                    today={today}
                    detailHref={buildDetailHref(r)}
                  />
                ))}
              </div>
            ))
          ) : (
            filtered.map((r) => (
              <MaintenanceProjectRow
                key={r.id}
                row={r}
                today={today}
                detailHref={buildDetailHref(r)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceListView.test.tsx`

Expected: PASS (9 tests).

- [ ] **Step 5: Type-check**

Run: `npm run type-check 2>&1 | tail -30`

Expected: still failing on the old `MaintenanceListClient.tsx` — that's the next task. Don't act on it yet.

- [ ] **Step 6: Commit**

```bash
git add src/components/maintenance/MaintenanceListView.tsx src/__tests__/maintenance/MaintenanceListView.test.tsx
git commit -m "feat(maintenance): add MaintenanceListView shared list component"
```

---

## Task 4: Refactor property-scoped page + delete superseded files

Switch the existing property-scoped server page to use `MaintenanceListView` and remove `MaintenanceListClient`. Bundle the Task 1 commit here per the sequenced approach.

**Files:**
- Modify: `src/app/admin/properties/[slug]/maintenance/page.tsx`
- Delete: `src/app/admin/properties/[slug]/maintenance/MaintenanceListClient.tsx`
- Delete: `src/__tests__/maintenance/MaintenanceListClient.test.tsx`

(`src/app/p/[slug]/admin/maintenance/page.tsx` is a re-export — no change.)

- [ ] **Step 1: Replace the page implementation**

Replace `src/app/admin/properties/[slug]/maintenance/page.tsx` with:

```tsx
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MaintenanceListView } from '@/components/maintenance/MaintenanceListView';
import { classifyScheduled } from '@/lib/maintenance/logic';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

interface PageProps {
  params: { slug: string };
}

export default async function MaintenanceListPage({ params }: PageProps) {
  const supabase = createClient();

  const { data: property } = await supabase
    .from('properties')
    .select('id, name, slug, org_id')
    .eq('slug', params.slug)
    .single();
  if (!property) notFound();

  const { data: projects } = await supabase
    .from('maintenance_projects')
    .select('*')
    .eq('property_id', property.id)
    .order('updated_at', { ascending: false });

  const projectIds = (projects ?? []).map((p) => p.id as string);

  const [{ data: itemCounts }, { data: knowledgeCounts }] = await Promise.all([
    supabase
      .from('maintenance_project_items')
      .select('maintenance_project_id, completed_at')
      .in('maintenance_project_id', projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000']),
    supabase
      .from('maintenance_project_knowledge')
      .select('maintenance_project_id')
      .in('maintenance_project_id', projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000']),
  ]);

  const byProject = new Map<string, { completed: number; total: number; knowledge: number }>();
  for (const id of projectIds) byProject.set(id, { completed: 0, total: 0, knowledge: 0 });
  for (const row of itemCounts ?? []) {
    const bucket = byProject.get(row.maintenance_project_id as string);
    if (!bucket) continue;
    bucket.total++;
    if (row.completed_at) bucket.completed++;
  }
  for (const row of knowledgeCounts ?? []) {
    const bucket = byProject.get(row.maintenance_project_id as string);
    if (bucket) bucket.knowledge++;
  }

  const rows: MaintenanceProjectRowData[] = (projects ?? []).map((p) => {
    const agg = byProject.get(p.id as string) ?? { completed: 0, total: 0, knowledge: 0 };
    return {
      ...(p as unknown as MaintenanceProjectRowData),
      items_completed: agg.completed,
      items_total: agg.total,
      knowledge_count: agg.knowledge,
      creator_name: null,
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);

  let inProgress = 0;
  let dueSoon = 0;
  let overdue = 0;
  let completedThisYear = 0;
  for (const r of rows) {
    if (r.status === 'in_progress') inProgress++;
    const c = classifyScheduled(r.scheduled_for, r.status, today);
    if (c.tone === 'overdue') overdue++;
    else if (c.tone === 'soon') dueSoon++;
    if (r.status === 'completed' && r.updated_at.slice(0, 4) === year) completedThisYear++;
  }

  const propertySlug = params.slug;

  return (
    <MaintenanceListView
      mode="property"
      rows={rows}
      properties={[{ id: property.id, name: property.name, slug: property.slug }]}
      stats={{
        in_progress: inProgress,
        due_soon: dueSoon,
        overdue: overdue,
        completed_this_year: completedThisYear,
      }}
      today={today}
      buildDetailHref={(r) => `/p/${propertySlug}/admin/maintenance/${r.id}`}
      buildCreateHref={(slug) => `/p/${slug}/admin/maintenance/new`}
      createHref={`/p/${propertySlug}/admin/maintenance/new`}
    />
  );
}
```

Note: detail and create URLs continue to use the `/p/<slug>/admin/...` prefix as before, preserving the existing behavior of both the org-domain and property-domain entry points (the `/p/...` route is a one-line re-export).

- [ ] **Step 2: Delete `MaintenanceListClient.tsx`**

```bash
git rm src/app/admin/properties/[slug]/maintenance/MaintenanceListClient.tsx
```

- [ ] **Step 3: Delete the old client test**

```bash
git rm src/__tests__/maintenance/MaintenanceListClient.test.tsx
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`

Expected: PASS — the only stale caller of the old row prop is gone.

- [ ] **Step 5: Run full vitest**

Run: `npm run test 2>&1 | tail -10`

Expected: PASS. The new `MaintenanceListView` test takes over what `MaintenanceListClient.test.tsx` was covering.

- [ ] **Step 6: Commit (bundles the Task 1 row refactor)**

```bash
git add src/components/maintenance/MaintenanceProjectRow.tsx src/__tests__/maintenance/MaintenanceProjectRow.test.tsx src/app/admin/properties/[slug]/maintenance/page.tsx
git commit -m "refactor(maintenance): consolidate property page on MaintenanceListView

MaintenanceProjectRow now takes detailHref directly so each list page
controls its own URL pattern. The property-scoped page (and its
property-domain re-export) now render MaintenanceListView."
```

---

## Task 5: New `/admin/maintenance` org-level page

Server component that aggregates active properties + projects + rollups org-wide and renders `MaintenanceListView` in `mode='org'`.

**Files:**
- Create: `src/app/admin/maintenance/page.tsx`
- Create: `src/app/admin/maintenance/loading.tsx`
- Create: `src/app/admin/maintenance/error.tsx`

- [ ] **Step 1: Write the server page**

Create `src/app/admin/maintenance/page.tsx`:

```tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MaintenanceListView } from '@/components/maintenance/MaintenanceListView';
import { classifyScheduled } from '@/lib/maintenance/logic';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

export const metadata = {
  title: 'Scheduled Maintenance',
};

export default async function OrgMaintenancePage() {
  const orgId = headers().get('x-org-id');
  if (!orgId) redirect('/admin');

  const supabase = createClient();

  const { data: properties } = await supabase
    .from('properties')
    .select('id, name, slug')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name');

  const propertyList = (properties ?? []).map((p) => ({
    id: p.id as string,
    name: (p.name as string) ?? p.slug as string,
    slug: p.slug as string,
  }));
  const propertyIds = propertyList.map((p) => p.id);

  const { data: projects } = propertyIds.length > 0
    ? await supabase
        .from('maintenance_projects')
        .select('*')
        .in('property_id', propertyIds)
        .order('updated_at', { ascending: false })
    : { data: [] as unknown[] };

  const projectIds = (projects ?? []).map((p) => (p as { id: string }).id);

  const [{ data: itemCounts }, { data: knowledgeCounts }] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from('maintenance_project_items')
          .select('maintenance_project_id, completed_at')
          .in('maintenance_project_id', projectIds)
      : Promise.resolve({ data: [] as Array<{ maintenance_project_id: string; completed_at: string | null }> }),
    projectIds.length > 0
      ? supabase
          .from('maintenance_project_knowledge')
          .select('maintenance_project_id')
          .in('maintenance_project_id', projectIds)
      : Promise.resolve({ data: [] as Array<{ maintenance_project_id: string }> }),
  ]);

  const byProject = new Map<string, { completed: number; total: number; knowledge: number }>();
  for (const id of projectIds) byProject.set(id, { completed: 0, total: 0, knowledge: 0 });
  for (const row of itemCounts ?? []) {
    const bucket = byProject.get(row.maintenance_project_id as string);
    if (!bucket) continue;
    bucket.total++;
    if (row.completed_at) bucket.completed++;
  }
  for (const row of knowledgeCounts ?? []) {
    const bucket = byProject.get(row.maintenance_project_id as string);
    if (bucket) bucket.knowledge++;
  }

  const rows: MaintenanceProjectRowData[] = (projects ?? []).map((p) => {
    const proj = p as unknown as MaintenanceProjectRowData;
    const agg = byProject.get(proj.id) ?? { completed: 0, total: 0, knowledge: 0 };
    return {
      ...proj,
      items_completed: agg.completed,
      items_total: agg.total,
      knowledge_count: agg.knowledge,
      creator_name: null,
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);

  let inProgress = 0;
  let dueSoon = 0;
  let overdue = 0;
  let completedThisYear = 0;
  for (const r of rows) {
    if (r.status === 'in_progress') inProgress++;
    const c = classifyScheduled(r.scheduled_for, r.status, today);
    if (c.tone === 'overdue') overdue++;
    else if (c.tone === 'soon') dueSoon++;
    if (r.status === 'completed' && r.updated_at.slice(0, 4) === year) completedThisYear++;
  }

  const slugById = new Map(propertyList.map((p) => [p.id, p.slug]));

  return (
    <MaintenanceListView
      mode="org"
      rows={rows}
      properties={propertyList}
      stats={{
        in_progress: inProgress,
        due_soon: dueSoon,
        overdue,
        completed_this_year: completedThisYear,
      }}
      today={today}
      buildDetailHref={(r) => {
        const slug = slugById.get(r.property_id ?? '') ?? '';
        return `/admin/properties/${slug}/maintenance/${r.id}`;
      }}
      buildCreateHref={(slug) => `/admin/properties/${slug}/maintenance/new`}
    />
  );
}
```

- [ ] **Step 2: Write `loading.tsx`**

Create `src/app/admin/maintenance/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 animate-pulse">
      <div className="h-7 bg-sage-light rounded w-1/3 mb-5" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="card h-16" />
        <div className="card h-16" />
        <div className="card h-16" />
        <div className="card h-16" />
      </div>
      <div className="card h-64" />
    </div>
  );
}
```

- [ ] **Step 3: Write `error.tsx`**

Create `src/app/admin/maintenance/error.tsx`:

```tsx
'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-md mx-auto px-4 py-12 text-center">
      <h1 className="font-heading text-forest-dark text-lg mb-2">Something went wrong</h1>
      <p className="text-sm text-gray-600 mb-4">{error.message}</p>
      <button onClick={reset} className="btn-secondary">Retry</button>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 5: Build**

Run: `npm run build 2>&1 | tail -20`

Expected: PASS — confirm `/admin/maintenance` appears in the route list.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/maintenance/page.tsx" "src/app/admin/maintenance/loading.tsx" "src/app/admin/maintenance/error.tsx"
git commit -m "feat(maintenance): add /admin/maintenance org-level aggregate page"
```

---

## Task 6: Sidebar entry in `AdminShell`

**Files:**
- Modify: `src/app/admin/AdminShell.tsx`

- [ ] **Step 1: Add the entry**

In `src/app/admin/AdminShell.tsx`, find the `BASE_NAV_ITEMS` array. After the `Geo Layers` line:

```ts
    { label: 'Geo Layers', href: '/admin/geo-layers' },
```

insert:

```ts
    { label: 'Maintenance', href: '/admin/maintenance' },
```

Result (full Data section):

```ts
    { type: 'section', label: 'Data' },
    { label: 'Knowledge', href: '/admin/knowledge' },
    { label: 'Data Vault', href: '/admin/vault' },
    { label: 'AI Context', href: '/admin/ai-context' },
    { label: 'Geo Layers', href: '/admin/geo-layers' },
    { label: 'Maintenance', href: '/admin/maintenance' },
```

- [ ] **Step 2: Type-check + tests**

Run: `npm run type-check && npm run test 2>&1 | tail -5`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/AdminShell.tsx
git commit -m "feat(admin): add Maintenance entry to org admin sidebar"
```

---

## Task 7: E2E — sidebar navigation assertion

Add a test at the top of the existing serial describe that proves the new `/admin/maintenance` page is reachable from the sidebar. Don't change the rest of the suite.

**Files:**
- Modify: `e2e/tests/admin/maintenance.spec.ts`

- [ ] **Step 1: Add the test as the first member of the serial describe**

Insert this test directly after `test.use({ storageState: ADMIN_AUTH });` and before the existing `test('create a project', ...)`:

```ts
test('navigates to /admin/maintenance from the org sidebar', async ({ page }) => {
  await page.goto('/admin');
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: /^Maintenance$/ }).click();
  await page.waitForURL(/\/admin\/maintenance$/);
  await expect(page.getByRole('heading', { name: /Scheduled Maintenance/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('In progress')).toBeVisible();
  await expect(page.getByText('Due in 2 weeks')).toBeVisible();
});
```

- [ ] **Step 2: Commit**

```bash
git add e2e/tests/admin/maintenance.spec.ts
git commit -m "test(maintenance): assert org-admin sidebar link reaches /admin/maintenance"
```

---

## Task 8: Final verification

- [ ] **Step 1: Type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 2: Full vitest**

Run: `npm run test 2>&1 | tail -10`

Expected: PASS. Net-new tests: `MaintenanceListView` (9), `NewProjectButton` (6). Replaces `MaintenanceListClient.test.tsx`. Updated: `MaintenanceProjectRow.test.tsx`.

- [ ] **Step 3: Build**

Run: `npm run build 2>&1 | tail -10`

Expected: PASS. `/admin/maintenance` route is listed.

- [ ] **Step 4: Git log sanity**

Run: `git log --oneline origin/main..HEAD`

Expected commits (8):
1. `feat(maintenance): add NewProjectButton with property chooser modal`
2. `feat(maintenance): add MaintenanceListView shared list component`
3. `refactor(maintenance): consolidate property page on MaintenanceListView`
4. `feat(maintenance): add /admin/maintenance org-level aggregate page`
5. `feat(admin): add Maintenance entry to org admin sidebar`
6. `test(maintenance): assert org-admin sidebar link reaches /admin/maintenance`

(Plus the spec doc commit and any plan-doc commit at the start of the branch.)

- [ ] **Step 5: Optional — local E2E**

If the dev server is free and Supabase is up:

```bash
npm run supabase:setup  # idempotent
npm run test:e2e -- e2e/tests/admin/maintenance.spec.ts
```

Expected: PASS. If the env is busy, defer to CI.

- [ ] **Step 6: Manual UI walkthrough**

Per `docs/playbooks/visual-diff-screenshots.md`:

- Sign in as org admin → land on `/admin` → click `Maintenance` in the sidebar.
- Verify list page renders with stat strip + tabs.
- For an org with one active property, verify the list is flat and "+ New project" goes straight to that property's create form.
- For an org with two or more active properties, verify the list groups by property, group headers link to the property page, and "+ New project" opens the chooser modal.
- Switch tabs (Active / Completed / Cancelled / All) — counts update; empty groups disappear.
- Type in the search box — results filter live.
- Click a row → land on `/admin/properties/<slug>/maintenance/<id>` (existing detail page).
- Visit `/admin/properties/<slug>/maintenance` directly — verify it now uses the new shared view (visually identical to the org page when one property; "+ New project" links straight to create).
- Visit `/p/<slug>/admin/maintenance` (property-domain admin) — same view, sourced from the same component via the re-export.

Capture before/after screenshots.

---

## Self-review summary

- **Spec coverage:**
  - Sidebar entry → Task 6
  - `/admin/maintenance` page → Task 5
  - Shared `MaintenanceListView` → Task 3
  - Grouping by property in org mode (with single-property flat fallback, hide-empty-groups, linked headers) → Task 3 tests + implementation
  - "+ New project" chooser logic (≥2 modal, =1 direct, =0 hidden) → Task 2
  - Refactor of property routes → Task 4
  - `MaintenanceProjectRow` decoupled from `propertySlug` → Task 1 (bundled into Task 4 commit)
  - E2E sidebar navigation → Task 7
  - Verification → Task 8

- **No placeholders:** all commands, code, and assertions are concrete.

- **Type consistency:**
  - `MaintenanceProjectRowData` from `@/lib/maintenance/types` used in row, view, and both pages.
  - `Property = { id, name, slug }` used identically in `NewProjectButton` and `MaintenanceListView`.
  - `Stats = { in_progress, due_soon, overdue, completed_this_year }` matches between the page calls and `MaintenanceListView` Props.
  - `buildDetailHref(row)` and `buildCreateHref(slug)` signatures match across all callers.
  - `tab` literal types (`'active' | 'completed' | 'cancelled' | 'all'`) consistent in tests and implementation.
  - `classifyScheduled(...).tone` values `'overdue' | 'soon'` referenced consistently — verify by glancing at `src/lib/maintenance/logic.ts` before implementing if there's any doubt.

- **Out of scope (per spec):** no schema/RLS changes; no detail/create page changes; no public viewer touch; no "highlight new" badge.
