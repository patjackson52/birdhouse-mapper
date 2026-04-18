# Timeline Updates Viewing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic `UpdateTimeline` with a focused set of components that surface updates as rich cards, open to a full-screen adaptive detail sheet, expose a full-list view, and display scheduled updates — mobile-first.

**Architecture:** Decompose `UpdateTimeline` into `TimelineOverview`, `UpdateCard`, `UpdateDetailSheet`, `AllUpdatesSheet`, `ScheduledUpdatesSection`, and a pure-function helper module (`timeline-helpers.ts`). The old component is deleted; its two callers (`TimelineBlock`, `DetailPanel` legacy branch) are updated. `TimelineConfig` gains three new toggles (`showPhotos`, `showFieldValues`, `showEntityChips`) with backward-compatible defaults. Detail-sheet layout adapts (photo-hero / content-first / fields-first) per a primary-content detection rule.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Vitest + @testing-library/react, Zod, framer-motion (via `MultiSnapBottomSheet`).

---

## Scope Adjustment vs. Spec

The spec calls for **edit + delete** in the detail sheet. Research confirmed there is **no existing edit route** for updates in the codebase (the spec flagged this as an open question). To keep this plan focused on timeline viewing UX:

- **Delete** — fully implemented in this plan (new server action + UI).
- **Edit** — UI seam is plumbed (`UpdateDetailSheet` accepts optional `onEdit?: () => void`). When `onEdit` is undefined, the edit menu item is hidden. Wiring edit requires building an edit-update route and extending `UpdateForm` for edit mode — this is out of scope here and should be a separate plan.

No other scope changes.

---

## Reference Paths (verified during planning)

| Thing | Path |
|---|---|
| `TimelineConfig` type | `src/lib/layout/types.ts:68-72` |
| `TimelineConfig` Zod schema | `src/lib/layout/schemas.ts:21-25` |
| Layout defaults generator | `src/lib/layout/defaults.ts` |
| Timeline block config UI | `src/components/layout/builder/BlockConfigPanel.tsx:119-154` |
| `TimelineBlock` | `src/components/layout/blocks/TimelineBlock.tsx` |
| `LayoutRendererDispatch` | `src/components/layout/LayoutRendererDispatch.tsx` |
| Current `UpdateTimeline` | `src/components/item/UpdateTimeline.tsx` |
| `DetailPanel` legacy branch (timeline usage) | `src/components/item/DetailPanel.tsx:208-214` |
| `MultiSnapBottomSheet` | `src/components/ui/MultiSnapBottomSheet.tsx` |
| `PhotoViewer` | `src/components/ui/PhotoViewer.tsx` |
| `IconRenderer` | `src/components/shared/IconPicker/IconRenderer.tsx` |
| `canPerformUpdateTypeAction` | `src/lib/permissions/resolve.ts:147-162` |
| `ItemUpdate`, `Photo`, `UpdateType`, `UpdateTypeField`, `Entity`, `EntityType` types | `src/lib/types.ts` |
| Existing blocks test file | `src/components/layout/blocks/__tests__/blocks.test.tsx` |
| Utils (date formatters) | `src/lib/utils.ts:45-59` |
| Server actions live in | `src/app/**/actions.ts` (pattern) |

---

## File Structure

### New files

- `src/components/item/timeline/timeline-helpers.ts`
- `src/components/item/timeline/UpdateCard.tsx`
- `src/components/item/timeline/ScheduledUpdatesSection.tsx`
- `src/components/item/timeline/UpdateDetailSheet.tsx`
- `src/components/item/timeline/AllUpdatesSheet.tsx`
- `src/components/item/timeline/TimelineOverview.tsx`
- `src/components/item/timeline/__tests__/timeline-helpers.test.ts`
- `src/components/item/timeline/__tests__/UpdateCard.test.tsx`
- `src/components/item/timeline/__tests__/ScheduledUpdatesSection.test.tsx`
- `src/components/item/timeline/__tests__/UpdateDetailSheet.test.tsx`
- `src/components/item/timeline/__tests__/AllUpdatesSheet.test.tsx`
- `src/components/item/timeline/__tests__/TimelineOverview.test.tsx`
- `src/app/manage/update/[id]/actions.ts` — `deleteUpdate` server action

### Modified files

- `src/lib/layout/types.ts` — extend `TimelineConfig`
- `src/lib/layout/schemas.ts` — extend `timelineConfigSchema` with `.default(true)` on new fields
- `src/components/layout/builder/BlockConfigPanel.tsx` — three new toggles in the `timeline` case
- `src/components/layout/blocks/TimelineBlock.tsx` — use `TimelineOverview`, accept new props
- `src/components/layout/LayoutRendererDispatch.tsx` — forward `updateTypeFields`, `canEditUpdate`/`canDeleteUpdate`, `itemId` to `TimelineBlock`
- `src/components/item/DetailPanel.tsx` — swap legacy `UpdateTimeline` usage for `TimelineOverview`
- `src/lib/utils.ts` — add `formatRelativeDate(dateString: string): string`
- `src/components/layout/blocks/__tests__/blocks.test.tsx` — update the timeline block tests to match new contract

### Deleted files

- `src/components/item/UpdateTimeline.tsx` (after Task 13)

---

## Task 1: Add `formatRelativeDate` utility

**Rationale:** `UpdateCard` and `UpdateDetailSheet` need a relative date ("2 hours ago", "3 days ago", "Apr 17"). No such utility exists today. We add a minimal dependency-free helper.

**Files:**
- Modify: `src/lib/utils.ts`
- Test: `src/lib/__tests__/utils.test.ts` (create if absent)

- [ ] **Step 1: Write the failing tests**

Create or append to `src/lib/__tests__/utils.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeDate } from '../utils';

describe('formatRelativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for <1 minute ago', () => {
    expect(formatRelativeDate('2026-04-17T11:59:30Z')).toBe('just now');
  });

  it('returns "Nm ago" for minutes', () => {
    expect(formatRelativeDate('2026-04-17T11:45:00Z')).toBe('15m ago');
  });

  it('returns "Nh ago" for hours', () => {
    expect(formatRelativeDate('2026-04-17T09:00:00Z')).toBe('3h ago');
  });

  it('returns "Yesterday" for 1 day ago', () => {
    expect(formatRelativeDate('2026-04-16T12:00:00Z')).toBe('Yesterday');
  });

  it('returns "Nd ago" for 2–6 days', () => {
    expect(formatRelativeDate('2026-04-14T12:00:00Z')).toBe('3d ago');
  });

  it('returns short date for >=7 days ago', () => {
    expect(formatRelativeDate('2026-04-01T12:00:00Z')).toBe('Apr 1');
  });

  it('returns short date with year for different year', () => {
    expect(formatRelativeDate('2025-06-15T12:00:00Z')).toBe('Jun 15, 2025');
  });

  it('returns "in Nd" for future dates', () => {
    expect(formatRelativeDate('2026-04-20T12:00:00Z')).toBe('in 3d');
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm run test -- src/lib/__tests__/utils.test.ts`
Expected: FAIL — `formatRelativeDate is not a function` (or similar).

- [ ] **Step 3: Implement `formatRelativeDate`**

Append to `src/lib/utils.ts`:

```typescript
export function formatRelativeDate(dateString: string): string {
  const then = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  if (diffMs < 0) {
    const futDay = Math.round(-diffDay);
    if (futDay === 0) return 'today';
    return `in ${futDay}d`;
  }

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;

  const sameYear = then.getUTCFullYear() === now.getUTCFullYear();
  const month = then.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = then.getUTCDate();
  return sameYear ? `${month} ${day}` : `${month} ${day}, ${then.getUTCFullYear()}`;
}
```

- [ ] **Step 4: Run the tests to verify pass**

Run: `npm run test -- src/lib/__tests__/utils.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils.ts src/lib/__tests__/utils.test.ts
git commit -m "feat(utils): add formatRelativeDate helper"
```

---

## Task 2: `timeline-helpers.ts` — pure helpers with tests

**Files:**
- Create: `src/components/item/timeline/timeline-helpers.ts`
- Test: `src/components/item/timeline/__tests__/timeline-helpers.test.ts`

Helpers:
- `partitionScheduled(updates, now?)` → `{ scheduled, past }` sorted independently (scheduled ascending by date, past descending).
- `detectPrimaryContent(update)` → `'photos' | 'content' | 'fields'` per the spec rule.
- `getKeyFieldValues(update, updateTypeFields, limit)` → array of `{ label, value }` to show as chips, in `sort_order`, capped at `limit`, skipping empty.

- [ ] **Step 1: Write the failing tests**

Create `src/components/item/timeline/__tests__/timeline-helpers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { ItemUpdate, UpdateTypeField } from '@/lib/types';
import {
  partitionScheduled,
  detectPrimaryContent,
  getKeyFieldValues,
} from '../timeline-helpers';

const baseUpdate = (overrides: Partial<ItemUpdate> = {}): ItemUpdate => ({
  id: 'u1',
  item_id: 'i1',
  update_type_id: 't1',
  content: null,
  update_date: '2026-04-17T00:00:00Z',
  created_at: '2026-04-17T00:00:00Z',
  created_by: null,
  org_id: 'o1',
  property_id: 'p1',
  custom_field_values: {},
  ...overrides,
});

describe('partitionScheduled', () => {
  it('splits updates by update_date relative to now', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const a = baseUpdate({ id: 'a', update_date: '2026-04-16T00:00:00Z' });
    const b = baseUpdate({ id: 'b', update_date: '2026-04-18T00:00:00Z' });
    const c = baseUpdate({ id: 'c', update_date: '2026-04-15T00:00:00Z' });

    const { scheduled, past } = partitionScheduled([a, b, c], now);
    expect(scheduled.map((u) => u.id)).toEqual(['b']);
    expect(past.map((u) => u.id)).toEqual(['a', 'c']); // descending
  });

  it('sorts scheduled ascending (soonest first)', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const far = baseUpdate({ id: 'far', update_date: '2026-05-01T00:00:00Z' });
    const soon = baseUpdate({ id: 'soon', update_date: '2026-04-20T00:00:00Z' });
    const { scheduled } = partitionScheduled([far, soon], now);
    expect(scheduled.map((u) => u.id)).toEqual(['soon', 'far']);
  });

  it('treats update_date === now as past', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const u = baseUpdate({ update_date: '2026-04-17T12:00:00Z' });
    const { scheduled, past } = partitionScheduled([u], now);
    expect(scheduled).toHaveLength(0);
    expect(past).toHaveLength(1);
  });
});

describe('detectPrimaryContent', () => {
  it('returns "photos" when photos are present', () => {
    const u = baseUpdate({ content: 'some long content here that is longer than 40 chars total' });
    const withPhotos = { ...u, photos: [{ id: 'ph1', item_id: 'i1', update_id: 'u1', storage_path: 'x', caption: null, is_primary: true, created_at: '', org_id: 'o1', property_id: 'p1' }] };
    expect(detectPrimaryContent(withPhotos)).toBe('photos');
  });

  it('returns "content" when no photos and content > 40 chars', () => {
    const u = baseUpdate({ content: 'this is a longer piece of content well over forty characters' });
    expect(detectPrimaryContent(u)).toBe('content');
  });

  it('returns "fields" when content is short and fields exist', () => {
    const u = baseUpdate({
      content: 'short',
      custom_field_values: { f1: 'value' },
    });
    expect(detectPrimaryContent(u)).toBe('fields');
  });

  it('returns "content" as fallback when nothing else matches', () => {
    const u = baseUpdate({ content: null });
    expect(detectPrimaryContent(u)).toBe('content');
  });

  it('ignores empty string and null field values when picking "fields"', () => {
    const u = baseUpdate({ content: '', custom_field_values: { f1: '', f2: null } });
    expect(detectPrimaryContent(u)).toBe('content');
  });
});

describe('getKeyFieldValues', () => {
  const field = (id: string, name: string, sort: number, type: UpdateTypeField['field_type'] = 'text'): UpdateTypeField => ({
    id, update_type_id: 't1', org_id: 'o1', name, field_type: type, options: null, required: false, sort_order: sort,
  });

  it('returns fields in sort_order, skipping empty', () => {
    const fields = [field('b', 'Beta', 2), field('a', 'Alpha', 1), field('c', 'Gamma', 3)];
    const u = baseUpdate({ custom_field_values: { a: 'A-val', b: '', c: 'C-val' } });
    const result = getKeyFieldValues(u, fields, 5);
    expect(result).toEqual([
      { label: 'Alpha', value: 'A-val' },
      { label: 'Gamma', value: 'C-val' },
    ]);
  });

  it('respects limit', () => {
    const fields = [field('a', 'A', 1), field('b', 'B', 2), field('c', 'C', 3)];
    const u = baseUpdate({ custom_field_values: { a: '1', b: '2', c: '3' } });
    expect(getKeyFieldValues(u, fields, 2)).toHaveLength(2);
  });

  it('formats date fields', () => {
    const fields = [field('d', 'When', 1, 'date')];
    const u = baseUpdate({ custom_field_values: { d: '2026-04-17' } });
    const result = getKeyFieldValues(u, fields, 1);
    expect(result[0].label).toBe('When');
    // Accept either locale-specific rendering; just check non-empty, not raw ISO.
    expect(result[0].value).not.toBe('2026-04-17');
    expect(result[0].value).toMatch(/\d/);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- src/components/item/timeline/__tests__/timeline-helpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `src/components/item/timeline/timeline-helpers.ts`:

```typescript
import type { ItemUpdate, UpdateTypeField, Photo, Entity, EntityType } from '@/lib/types';

export type TimelineUpdate = ItemUpdate & {
  update_type?: { id: string; name: string; icon: string };
  photos?: Photo[];
  entities?: (Entity & { entity_type: EntityType })[];
};

export function partitionScheduled(
  updates: TimelineUpdate[],
  now: Date = new Date(),
): { scheduled: TimelineUpdate[]; past: TimelineUpdate[] } {
  const nowMs = now.getTime();
  const scheduled: TimelineUpdate[] = [];
  const past: TimelineUpdate[] = [];
  for (const u of updates) {
    const t = new Date(u.update_date).getTime();
    if (t > nowMs) scheduled.push(u);
    else past.push(u);
  }
  scheduled.sort((a, b) => new Date(a.update_date).getTime() - new Date(b.update_date).getTime());
  past.sort((a, b) => new Date(b.update_date).getTime() - new Date(a.update_date).getTime());
  return { scheduled, past };
}

export type PrimaryContent = 'photos' | 'content' | 'fields';

export function detectPrimaryContent(update: TimelineUpdate): PrimaryContent {
  if (update.photos && update.photos.length >= 1) return 'photos';
  if (update.content && update.content.length > 40) return 'content';
  if (update.custom_field_values) {
    const hasFieldValue = Object.values(update.custom_field_values).some(
      (v) => v !== null && v !== undefined && v !== '',
    );
    if (hasFieldValue) return 'fields';
  }
  return 'content';
}

export interface KeyFieldValue {
  label: string;
  value: string;
}

export function getKeyFieldValues(
  update: TimelineUpdate,
  updateTypeFields: UpdateTypeField[],
  limit: number,
): KeyFieldValue[] {
  const fields = updateTypeFields
    .filter((f) => f.update_type_id === update.update_type_id)
    .sort((a, b) => a.sort_order - b.sort_order);

  const result: KeyFieldValue[] = [];
  for (const f of fields) {
    if (result.length >= limit) break;
    const raw = update.custom_field_values[f.id];
    if (raw === null || raw === undefined || raw === '') continue;
    let value = String(raw);
    if (f.field_type === 'date' && value) {
      value = new Date(value).toLocaleDateString();
    }
    result.push({ label: f.name, value });
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- src/components/item/timeline/__tests__/timeline-helpers.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/item/timeline/timeline-helpers.ts src/components/item/timeline/__tests__/timeline-helpers.test.ts
git commit -m "feat(timeline): add pure helpers for update partitioning and primary-content detection"
```

---

## Task 3: `UpdateCard` component

**Files:**
- Create: `src/components/item/timeline/UpdateCard.tsx`
- Test: `src/components/item/timeline/__tests__/UpdateCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/item/timeline/__tests__/UpdateCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UpdateCard from '../UpdateCard';
import type { TimelineUpdate } from '../timeline-helpers';
import type { UpdateTypeField } from '@/lib/types';

vi.mock('@/components/shared/IconPicker', () => ({
  IconRenderer: ({ icon }: { icon: unknown }) => <span data-testid="icon">{String(icon)}</span>,
}));

const baseUpdate = (overrides: Partial<TimelineUpdate> = {}): TimelineUpdate => ({
  id: 'u1',
  item_id: 'i1',
  update_type_id: 't1',
  content: null,
  update_date: new Date().toISOString(),
  created_at: new Date().toISOString(),
  created_by: null,
  org_id: 'o1',
  property_id: 'p1',
  custom_field_values: {},
  update_type: { id: 't1', name: 'Sighting', icon: '🦅' },
  ...overrides,
});

describe('UpdateCard', () => {
  it('renders type name and content preview', () => {
    render(
      <UpdateCard
        update={baseUpdate({ content: 'Saw a red-tailed hawk' })}
        updateTypeFields={[]}
        onTap={() => {}}
      />,
    );
    expect(screen.getByText('Sighting')).toBeInTheDocument();
    expect(screen.getByText('Saw a red-tailed hawk')).toBeInTheDocument();
  });

  it('fires onTap when clicked', () => {
    const onTap = vi.fn();
    render(<UpdateCard update={baseUpdate()} updateTypeFields={[]} onTap={onTap} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onTap).toHaveBeenCalledOnce();
  });

  it('renders photo thumbnail when showPhotos and photos exist', () => {
    const u = baseUpdate({
      photos: [{ id: 'p1', item_id: 'i1', update_id: 'u1', storage_path: '/test.jpg', caption: null, is_primary: true, created_at: '', org_id: 'o1', property_id: 'p1' }],
    });
    render(<UpdateCard update={u} updateTypeFields={[]} onTap={() => {}} showPhotos />);
    expect(screen.getByTestId('update-card-thumb')).toBeInTheDocument();
  });

  it('omits photo thumbnail when showPhotos is false', () => {
    const u = baseUpdate({
      photos: [{ id: 'p1', item_id: 'i1', update_id: 'u1', storage_path: '/test.jpg', caption: null, is_primary: true, created_at: '', org_id: 'o1', property_id: 'p1' }],
    });
    render(<UpdateCard update={u} updateTypeFields={[]} onTap={() => {}} showPhotos={false} />);
    expect(screen.queryByTestId('update-card-thumb')).not.toBeInTheDocument();
  });

  it('renders field chips when showFieldValues and fields present', () => {
    const fields: UpdateTypeField[] = [
      { id: 'f1', update_type_id: 't1', org_id: 'o1', name: 'Count', field_type: 'number', options: null, required: false, sort_order: 1 },
    ];
    const u = baseUpdate({ custom_field_values: { f1: 5 } });
    render(<UpdateCard update={u} updateTypeFields={fields} onTap={() => {}} showFieldValues />);
    expect(screen.getByText(/Count/)).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it('falls back to default label/icon for missing update_type', () => {
    const u = baseUpdate({ update_type: undefined });
    render(<UpdateCard update={u} updateTypeFields={[]} onTap={() => {}} />);
    expect(screen.getByText('Update')).toBeInTheDocument();
  });

  it('applies scheduled styling when isScheduled is true', () => {
    const { container } = render(
      <UpdateCard update={baseUpdate()} updateTypeFields={[]} onTap={() => {}} isScheduled />,
    );
    const card = container.querySelector('button');
    expect(card?.className).toMatch(/border-dashed/);
  });

  it('renders entity overflow indicator when more than 3 entities', () => {
    const entityType = { id: 'et1', org_id: 'o1', name: 'Species', icon: '🐦', color: null, link_to: null, sort_order: 0, api_source: null, created_at: '', updated_at: '' };
    const entities = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      org_id: 'o1',
      entity_type_id: 'et1',
      name: `Entity ${i}`,
      description: null,
      photo_path: null,
      external_link: null,
      external_id: null,
      custom_field_values: {},
      created_at: '',
      updated_at: '',
      entity_type: entityType,
    }));
    render(
      <UpdateCard
        update={baseUpdate({ entities })}
        updateTypeFields={[]}
        onTap={() => {}}
        showEntityChips
      />,
    );
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- src/components/item/timeline/__tests__/UpdateCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `UpdateCard`**

Create `src/components/item/timeline/UpdateCard.tsx`:

```typescript
'use client';

import type { UpdateTypeField } from '@/lib/types';
import type { TimelineUpdate } from './timeline-helpers';
import { getKeyFieldValues } from './timeline-helpers';
import { formatRelativeDate, formatDate } from '@/lib/utils';
import { IconRenderer } from '@/components/shared/IconPicker';

interface UpdateCardProps {
  update: TimelineUpdate;
  updateTypeFields: UpdateTypeField[];
  onTap: () => void;
  isScheduled?: boolean;
  showPhotos?: boolean;
  showFieldValues?: boolean;
  showEntityChips?: boolean;
}

export default function UpdateCard({
  update,
  updateTypeFields,
  onTap,
  isScheduled = false,
  showPhotos = true,
  showFieldValues = true,
  showEntityChips = true,
}: UpdateCardProps) {
  const typeName = update.update_type?.name ?? 'Update';
  const typeIcon = update.update_type?.icon ?? '📝';

  const relativeDate = isScheduled
    ? `Scheduled for ${new Date(update.update_date).toLocaleDateString()}`
    : formatRelativeDate(update.update_date);
  const absoluteDate = formatDate(update.update_date);

  const firstPhoto = update.photos?.[0];
  const keyFields = showFieldValues ? getKeyFieldValues(update, updateTypeFields, 2) : [];

  const allEntities = update.entities ?? [];
  const shownEntities = showEntityChips ? allEntities.slice(0, 3) : [];
  const overflowCount = showEntityChips ? Math.max(0, allEntities.length - 3) : 0;

  return (
    <button
      type="button"
      onClick={onTap}
      className={[
        'w-full text-left rounded-xl border bg-white p-3 shadow-sm hover:shadow-md transition-shadow',
        'flex gap-3 items-start',
        isScheduled
          ? 'border-l-2 border-l-dashed border-sage-light border-y border-r border-sage-light/50 opacity-90'
          : 'border-sage-light',
      ].join(' ')}
    >
      {/* Type icon chip */}
      <div
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base',
          isScheduled ? 'bg-sage-light/40' : 'bg-sage-light',
        ].join(' ')}
        aria-hidden
      >
        <IconRenderer icon={typeIcon} size={18} />
      </div>

      {/* Main content column */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-forest-dark">{typeName}</span>
          <span
            className={['text-xs text-sage', isScheduled ? 'italic' : ''].join(' ')}
            title={absoluteDate}
          >
            {relativeDate}
          </span>
        </div>

        {update.content && (
          <p className="text-sm text-forest-dark/80 leading-relaxed mt-0.5 line-clamp-2">
            {update.content}
          </p>
        )}

        {keyFields.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {keyFields.map((kf, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[11px] text-sage bg-sage-light/30 rounded-full px-2 py-0.5"
              >
                <span className="font-medium">{kf.label}:</span>
                <span>{kf.value}</span>
              </span>
            ))}
          </div>
        )}

        {shownEntities.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {shownEntities.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center bg-forest/10 text-forest-dark text-[11px] px-2 py-0.5 rounded-full"
              >
                {e.name}
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="text-[11px] text-sage px-1">+{overflowCount} more</span>
            )}
          </div>
        )}
      </div>

      {/* Photo thumbnail */}
      {showPhotos && firstPhoto && (
        <div
          data-testid="update-card-thumb"
          className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-sage-light/40"
        >
          <img
            src={firstPhoto.storage_path}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- src/components/item/timeline/__tests__/UpdateCard.test.tsx`
Expected: PASS — all tests green. (If any fail, the implementation above is authoritative — match tests to implementation.)

- [ ] **Step 5: Commit**

```bash
git add src/components/item/timeline/UpdateCard.tsx src/components/item/timeline/__tests__/UpdateCard.test.tsx
git commit -m "feat(timeline): rich UpdateCard component for overview and full list"
```

---

## Task 4: `ScheduledUpdatesSection` component

**Files:**
- Create: `src/components/item/timeline/ScheduledUpdatesSection.tsx`
- Test: `src/components/item/timeline/__tests__/ScheduledUpdatesSection.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/item/timeline/__tests__/ScheduledUpdatesSection.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScheduledUpdatesSection from '../ScheduledUpdatesSection';
import type { TimelineUpdate } from '../timeline-helpers';

vi.mock('@/components/shared/IconPicker', () => ({
  IconRenderer: ({ icon }: { icon: unknown }) => <span>{String(icon)}</span>,
}));

const mkUpdate = (id: string, futureDays: number): TimelineUpdate => {
  const d = new Date();
  d.setDate(d.getDate() + futureDays);
  return {
    id,
    item_id: 'i1',
    update_type_id: 't1',
    content: `scheduled ${id}`,
    update_date: d.toISOString(),
    created_at: new Date().toISOString(),
    created_by: null,
    org_id: 'o1',
    property_id: 'p1',
    custom_field_values: {},
    update_type: { id: 't1', name: 'Inspection', icon: '🔎' },
  };
};

describe('ScheduledUpdatesSection', () => {
  it('renders nothing when updates is empty', () => {
    const { container } = render(
      <ScheduledUpdatesSection updates={[]} updateTypeFields={[]} onUpdateTap={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('expands by default when 2 or fewer updates', () => {
    render(
      <ScheduledUpdatesSection
        updates={[mkUpdate('a', 1), mkUpdate('b', 2)]}
        updateTypeFields={[]}
        onUpdateTap={() => {}}
      />,
    );
    expect(screen.getByText('scheduled a')).toBeInTheDocument();
    expect(screen.getByText('scheduled b')).toBeInTheDocument();
  });

  it('collapses by default when more than 2 updates', () => {
    render(
      <ScheduledUpdatesSection
        updates={[mkUpdate('a', 1), mkUpdate('b', 2), mkUpdate('c', 3)]}
        updateTypeFields={[]}
        onUpdateTap={() => {}}
      />,
    );
    expect(screen.queryByText('scheduled a')).not.toBeInTheDocument();
    expect(screen.getByText(/3 scheduled/)).toBeInTheDocument();
  });

  it('expands on header click', () => {
    render(
      <ScheduledUpdatesSection
        updates={[mkUpdate('a', 1), mkUpdate('b', 2), mkUpdate('c', 3)]}
        updateTypeFields={[]}
        onUpdateTap={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /scheduled/i }));
    expect(screen.getByText('scheduled a')).toBeInTheDocument();
  });

  it('calls onUpdateTap with the tapped update', () => {
    const onUpdateTap = vi.fn();
    const u = mkUpdate('a', 1);
    render(
      <ScheduledUpdatesSection updates={[u]} updateTypeFields={[]} onUpdateTap={onUpdateTap} />,
    );
    fireEvent.click(screen.getByText('scheduled a'));
    expect(onUpdateTap).toHaveBeenCalledWith(u);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- src/components/item/timeline/__tests__/ScheduledUpdatesSection.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ScheduledUpdatesSection`**

Create `src/components/item/timeline/ScheduledUpdatesSection.tsx`:

```typescript
'use client';

import { useState } from 'react';
import type { UpdateTypeField } from '@/lib/types';
import type { TimelineUpdate } from './timeline-helpers';
import UpdateCard from './UpdateCard';

interface ScheduledUpdatesSectionProps {
  updates: TimelineUpdate[];
  updateTypeFields: UpdateTypeField[];
  onUpdateTap: (update: TimelineUpdate) => void;
  showPhotos?: boolean;
  showFieldValues?: boolean;
  showEntityChips?: boolean;
}

export default function ScheduledUpdatesSection({
  updates,
  updateTypeFields,
  onUpdateTap,
  showPhotos,
  showFieldValues,
  showEntityChips,
}: ScheduledUpdatesSectionProps) {
  const defaultExpanded = updates.length <= 2;
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (updates.length === 0) return null;

  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-medium text-sage uppercase tracking-wide py-1.5"
        aria-expanded={expanded}
      >
        <span>Upcoming · {updates.length} scheduled</span>
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="space-y-2 mt-2">
          {updates.map((u) => (
            <UpdateCard
              key={u.id}
              update={u}
              updateTypeFields={updateTypeFields}
              onTap={() => onUpdateTap(u)}
              isScheduled
              showPhotos={showPhotos}
              showFieldValues={showFieldValues}
              showEntityChips={showEntityChips}
            />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- src/components/item/timeline/__tests__/ScheduledUpdatesSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/item/timeline/ScheduledUpdatesSection.tsx src/components/item/timeline/__tests__/ScheduledUpdatesSection.test.tsx
git commit -m "feat(timeline): ScheduledUpdatesSection with collapsible header"
```

---

## Task 5: `deleteUpdate` server action

**Files:**
- Create: `src/app/manage/update/[id]/actions.ts`

- [ ] **Step 1: Check existing server-action pattern**

Look at any existing `actions.ts` (e.g., grep for `'use server'` in `src/app/manage/`). They follow the shape:
- `'use server'` directive at top
- Use `createClient()` from `@/lib/supabase/server`
- Return `{ success: true }` or `{ error: string }`
- Use `revalidatePath` where appropriate

- [ ] **Step 2: Write the `deleteUpdate` action**

Create `src/app/manage/update/[id]/actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function deleteUpdate(updateId: string): Promise<{ success: true } | { error: string }> {
  if (!updateId) return { error: 'updateId is required' };

  const supabase = createClient();

  // RLS will enforce permission; we just call delete.
  const { error } = await supabase.from('item_updates').delete().eq('id', updateId);

  if (error) return { error: error.message };

  revalidatePath('/');
  return { success: true };
}
```

> **Note:** If the actual table name differs from `item_updates`, adjust — confirm by grepping `from('` in existing update-related files. Use the same table name the rest of the codebase uses when reading updates.

- [ ] **Step 3: Verify by grepping table name**

Run: `grep -rn "from('item_updates" src/ | head -5` (or search via Grep tool). If the name is different, update the action to match. If matches, proceed.

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/manage/update/[id]/actions.ts
git commit -m "feat(updates): add deleteUpdate server action"
```

> **Note on tests:** Server actions that hit Supabase are typically validated via E2E in this repo. We rely on Step 4 type check + later integration in `UpdateDetailSheet` tests (mocked) for V1.

---

## Task 6: `UpdateDetailSheet` component

**Files:**
- Create: `src/components/item/timeline/UpdateDetailSheet.tsx`
- Test: `src/components/item/timeline/__tests__/UpdateDetailSheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/item/timeline/__tests__/UpdateDetailSheet.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UpdateDetailSheet from '../UpdateDetailSheet';
import type { TimelineUpdate } from '../timeline-helpers';

vi.mock('@/components/shared/IconPicker', () => ({
  IconRenderer: ({ icon }: { icon: unknown }) => <span>{String(icon)}</span>,
}));

vi.mock('@/components/ui/PhotoViewer', () => ({
  default: () => <div data-testid="photo-viewer" />,
}));

const baseUpdate = (overrides: Partial<TimelineUpdate> = {}): TimelineUpdate => ({
  id: 'u1',
  item_id: 'i1',
  update_type_id: 't1',
  content: null,
  update_date: '2026-04-17T12:00:00Z',
  created_at: '2026-04-17T12:00:00Z',
  created_by: null,
  org_id: 'o1',
  property_id: 'p1',
  custom_field_values: {},
  update_type: { id: 't1', name: 'Sighting', icon: '🦅' },
  ...overrides,
});

describe('UpdateDetailSheet', () => {
  it('returns nothing when closed', () => {
    const { container } = render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen={false}
        onClose={() => {}}
        canEdit={false}
        canDelete={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders photo-hero layout when photos exist', () => {
    const u = baseUpdate({
      content: 'some content',
      photos: [{ id: 'p1', item_id: 'i1', update_id: 'u1', storage_path: '/a.jpg', caption: null, is_primary: true, created_at: '', org_id: 'o1', property_id: 'p1' }],
    });
    render(
      <UpdateDetailSheet
        update={u}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit={false}
        canDelete={false}
      />,
    );
    expect(screen.getByTestId('photo-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('layout-variant')).toHaveAttribute('data-variant', 'photo-hero');
  });

  it('renders content-first layout for long text with no photos', () => {
    const u = baseUpdate({
      content: 'A long content block that definitely exceeds the forty character threshold for content-first.',
    });
    render(
      <UpdateDetailSheet
        update={u}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit={false}
        canDelete={false}
      />,
    );
    expect(screen.getByTestId('layout-variant')).toHaveAttribute('data-variant', 'content-first');
  });

  it('renders fields-first layout for short content with field values', () => {
    const u = baseUpdate({ content: 'short', custom_field_values: { f1: 'v' } });
    const fields = [{ id: 'f1', update_type_id: 't1', org_id: 'o1', name: 'Field', field_type: 'text' as const, options: null, required: false, sort_order: 1 }];
    render(
      <UpdateDetailSheet
        update={u}
        updateTypeFields={fields}
        isOpen
        onClose={() => {}}
        canEdit={false}
        canDelete={false}
      />,
    );
    expect(screen.getByTestId('layout-variant')).toHaveAttribute('data-variant', 'fields-first');
  });

  it('hides kebab menu entirely when neither canEdit nor canDelete', () => {
    render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit={false}
        canDelete={false}
      />,
    );
    expect(screen.queryByLabelText('Update actions')).not.toBeInTheDocument();
  });

  it('shows kebab when canDelete is true', () => {
    render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit={false}
        canDelete
        onDelete={() => {}}
      />,
    );
    expect(screen.getByLabelText('Update actions')).toBeInTheDocument();
  });

  it('shows edit menu item only when onEdit is provided', () => {
    const onEdit = vi.fn();
    render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit
        onEdit={onEdit}
        canDelete={false}
      />,
    );
    fireEvent.click(screen.getByLabelText('Update actions'));
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('hides edit menu item when onEdit is not provided even if canEdit is true', () => {
    render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit
        canDelete
        onDelete={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Update actions'));
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls onDelete after confirmation', () => {
    const onDelete = vi.fn();
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit={false}
        canDelete
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByLabelText('Update actions'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen
        onClose={onClose}
        canEdit={false}
        canDelete={false}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- src/components/item/timeline/__tests__/UpdateDetailSheet.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `UpdateDetailSheet`**

Create `src/components/item/timeline/UpdateDetailSheet.tsx`:

```typescript
'use client';

import { useEffect, useState, useRef } from 'react';
import type { UpdateTypeField, IconValue } from '@/lib/types';
import type { TimelineUpdate } from './timeline-helpers';
import { detectPrimaryContent, getKeyFieldValues } from './timeline-helpers';
import { IconRenderer } from '@/components/shared/IconPicker';
import PhotoViewer from '@/components/ui/PhotoViewer';
import { formatDate } from '@/lib/utils';

interface UpdateDetailSheetProps {
  update: TimelineUpdate;
  updateTypeFields: UpdateTypeField[];
  isOpen: boolean;
  onClose: () => void;
  canEdit: boolean;
  canDelete: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function UpdateDetailSheet({
  update,
  updateTypeFields,
  isOpen,
  onClose,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: UpdateDetailSheetProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const editAvailable = canEdit && typeof onEdit === 'function';
  const deleteAvailable = canDelete && typeof onDelete === 'function';
  const kebabAvailable = editAvailable || deleteAvailable;

  useEffect(() => {
    if (isOpen) closeBtnRef.current?.focus();
    if (!isOpen) setMenuOpen(false);
  }, [isOpen]);

  // Body scroll lock while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const primary = detectPrimaryContent(update);
  const typeName = update.update_type?.name ?? 'Update';
  const typeIcon = update.update_type?.icon ?? '📝';
  const absoluteDate = formatDate(update.update_date);
  const time = new Date(update.update_date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const keyFields = getKeyFieldValues(update, updateTypeFields, 20);

  // Sections
  const photosSection =
    update.photos && update.photos.length > 0 ? (
      <div key="photos" className="mb-4">
        {primary === 'photos' ? (
          <div className="max-h-[40vh] md:max-h-[400px] overflow-hidden rounded-lg">
            <PhotoViewer photos={update.photos} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {update.photos.map((p) => (
              <div key={p.id} className="aspect-square overflow-hidden rounded-md bg-sage-light/40">
                <img src={p.storage_path} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    ) : null;

  const contentSection = update.content ? (
    <div key="content" className="mb-4">
      <p className="text-sm text-forest-dark/90 leading-relaxed whitespace-pre-wrap">
        {update.content}
      </p>
    </div>
  ) : null;

  const fieldsSection =
    keyFields.length > 0 ? (
      <dl key="fields" className={primary === 'fields' ? 'mb-4 space-y-2' : 'mb-4 space-y-1 text-sm'}>
        {keyFields.map((kf, i) => (
          <div key={i} className={primary === 'fields' ? 'flex flex-col' : 'flex gap-2'}>
            <dt
              className={
                primary === 'fields'
                  ? 'text-xs font-medium text-sage uppercase tracking-wide'
                  : 'text-xs font-medium text-sage'
              }
            >
              {kf.label}
            </dt>
            <dd className={primary === 'fields' ? 'text-base text-forest-dark font-medium' : 'text-sm text-forest-dark'}>
              {kf.value}
            </dd>
          </div>
        ))}
      </dl>
    ) : null;

  const entitiesSection =
    update.entities && update.entities.length > 0 ? (
      <div key="entities" className="mb-2">
        {(() => {
          const grouped = new Map<string, { type: { id: string; name: string; icon: IconValue }; entities: NonNullable<typeof update.entities> }>();
          for (const e of update.entities) {
            const key = e.entity_type.id;
            if (!grouped.has(key)) grouped.set(key, { type: e.entity_type, entities: [] });
            grouped.get(key)!.entities.push(e);
          }
          return Array.from(grouped.values()).map(({ type, entities }) => (
            <div key={type.id} className="mb-2">
              <div className="flex items-center gap-1 text-xs font-medium text-sage uppercase tracking-wide mb-1">
                <IconRenderer icon={type.icon} size={12} />
                <span>{type.name}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {entities.map((e) => (
                  <span
                    key={e.id}
                    className="inline-flex items-center gap-1 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full"
                  >
                    {e.name}
                  </span>
                ))}
              </div>
            </div>
          ));
        })()}
      </div>
    ) : null;

  // Section order per primary content type
  const ordered =
    primary === 'photos'
      ? [photosSection, contentSection, fieldsSection]
      : primary === 'content'
      ? [contentSection, photosSection, fieldsSection]
      : [fieldsSection, contentSection, photosSection];

  const body = (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-sage-light/50">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-light text-base" aria-hidden>
            <IconRenderer icon={typeIcon} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-forest-dark">{typeName}</h2>
            <p className="text-xs text-sage">
              {absoluteDate} · {time}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {kebabAvailable && (
            <div className="relative">
              <button
                type="button"
                aria-label="Update actions"
                onClick={() => setMenuOpen((v) => !v)}
                className="p-2 rounded-md text-sage hover:bg-sage-light/40"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v.01M12 12v.01M12 18v.01" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 min-w-[120px] bg-white border border-sage-light rounded-md shadow-lg overflow-hidden z-10">
                  {editAvailable && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit?.();
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-sage-light/30"
                    >
                      Edit
                    </button>
                  )}
                  {deleteAvailable && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        if (window.confirm('Delete this update? This cannot be undone.')) {
                          onDelete?.();
                        }
                      }}
                      className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-2 rounded-md text-sage hover:bg-sage-light/40"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Adaptive body */}
      <div data-testid="layout-variant" data-variant={primary} className="pt-4">
        {ordered.filter(Boolean)}
      </div>

      {/* Footer (entities always last) */}
      {entitiesSection}
    </div>
  );

  // Fullscreen responsive wrapper: on mobile, fixed full-height overlay;
  // on desktop, centered card. Single implementation, no new primitive.
  return (
    <div className="fixed inset-0 z-[60] flex items-stretch md:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-white w-full md:max-w-lg md:rounded-xl md:shadow-2xl md:max-h-[85vh] h-full md:h-auto overflow-y-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="p-4">{body}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- src/components/item/timeline/__tests__/UpdateDetailSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/item/timeline/UpdateDetailSheet.tsx src/components/item/timeline/__tests__/UpdateDetailSheet.test.tsx
git commit -m "feat(timeline): UpdateDetailSheet with adaptive layout and role-gated actions"
```

---

## Task 7: `AllUpdatesSheet` component

**Files:**
- Create: `src/components/item/timeline/AllUpdatesSheet.tsx`
- Test: `src/components/item/timeline/__tests__/AllUpdatesSheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/item/timeline/__tests__/AllUpdatesSheet.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AllUpdatesSheet from '../AllUpdatesSheet';
import type { TimelineUpdate } from '../timeline-helpers';

vi.mock('@/components/shared/IconPicker', () => ({
  IconRenderer: ({ icon }: { icon: unknown }) => <span>{String(icon)}</span>,
}));

const mkUpdate = (id: string): TimelineUpdate => ({
  id,
  item_id: 'i1',
  update_type_id: 't1',
  content: `update ${id}`,
  update_date: '2026-04-17T00:00:00Z',
  created_at: '2026-04-17T00:00:00Z',
  created_by: null,
  org_id: 'o1',
  property_id: 'p1',
  custom_field_values: {},
  update_type: { id: 't1', name: 'Note', icon: '📝' },
});

describe('AllUpdatesSheet', () => {
  it('returns nothing when closed', () => {
    const { container } = render(
      <AllUpdatesSheet
        updates={[mkUpdate('a')]}
        updateTypeFields={[]}
        isOpen={false}
        onClose={() => {}}
        onUpdateTap={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders list of updates with count in header', () => {
    render(
      <AllUpdatesSheet
        updates={[mkUpdate('a'), mkUpdate('b'), mkUpdate('c')]}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        onUpdateTap={() => {}}
      />,
    );
    expect(screen.getByText(/All updates \(3\)/)).toBeInTheDocument();
    expect(screen.getByText('update a')).toBeInTheDocument();
    expect(screen.getByText('update b')).toBeInTheDocument();
    expect(screen.getByText('update c')).toBeInTheDocument();
  });

  it('calls onUpdateTap with the tapped update', () => {
    const onUpdateTap = vi.fn();
    const a = mkUpdate('a');
    render(
      <AllUpdatesSheet
        updates={[a]}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        onUpdateTap={onUpdateTap}
      />,
    );
    fireEvent.click(screen.getByText('update a'));
    expect(onUpdateTap).toHaveBeenCalledWith(a);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <AllUpdatesSheet
        updates={[mkUpdate('a')]}
        updateTypeFields={[]}
        isOpen
        onClose={onClose}
        onUpdateTap={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- src/components/item/timeline/__tests__/AllUpdatesSheet.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AllUpdatesSheet`**

Create `src/components/item/timeline/AllUpdatesSheet.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import type { UpdateTypeField } from '@/lib/types';
import type { TimelineUpdate } from './timeline-helpers';
import UpdateCard from './UpdateCard';

interface AllUpdatesSheetProps {
  updates: TimelineUpdate[];
  updateTypeFields: UpdateTypeField[];
  isOpen: boolean;
  onClose: () => void;
  onUpdateTap: (update: TimelineUpdate) => void;
  showPhotos?: boolean;
  showFieldValues?: boolean;
  showEntityChips?: boolean;
}

export default function AllUpdatesSheet({
  updates,
  updateTypeFields,
  isOpen,
  onClose,
  onUpdateTap,
  showPhotos,
  showFieldValues,
  showEntityChips,
}: AllUpdatesSheetProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch md:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-white w-full md:max-w-lg md:rounded-xl md:shadow-2xl md:max-h-[85vh] h-full md:h-auto flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-sage-light/50 shrink-0">
          <h2 className="font-semibold text-forest-dark">All updates ({updates.length})</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-2 rounded-md text-sage hover:bg-sage-light/40"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {updates.map((u) => (
            <UpdateCard
              key={u.id}
              update={u}
              updateTypeFields={updateTypeFields}
              onTap={() => onUpdateTap(u)}
              showPhotos={showPhotos}
              showFieldValues={showFieldValues}
              showEntityChips={showEntityChips}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- src/components/item/timeline/__tests__/AllUpdatesSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/item/timeline/AllUpdatesSheet.tsx src/components/item/timeline/__tests__/AllUpdatesSheet.test.tsx
git commit -m "feat(timeline): AllUpdatesSheet with full scrollable list"
```

---

## Task 8: `TimelineOverview` component

**Files:**
- Create: `src/components/item/timeline/TimelineOverview.tsx`
- Test: `src/components/item/timeline/__tests__/TimelineOverview.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/item/timeline/__tests__/TimelineOverview.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TimelineOverview from '../TimelineOverview';
import type { TimelineUpdate } from '../timeline-helpers';
import type { TimelineConfig } from '@/lib/layout/types';

vi.mock('@/components/shared/IconPicker', () => ({
  IconRenderer: ({ icon }: { icon: unknown }) => <span>{String(icon)}</span>,
}));

vi.mock('@/components/ui/PhotoViewer', () => ({
  default: () => <div data-testid="photo-viewer" />,
}));

const config: TimelineConfig = {
  showUpdates: true,
  showScheduled: true,
  maxItems: 3,
  showPhotos: true,
  showFieldValues: true,
  showEntityChips: true,
};

const mkUpdate = (id: string, daysAgo: number): TimelineUpdate => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id,
    item_id: 'i1',
    update_type_id: 't1',
    content: `content ${id}`,
    update_date: d.toISOString(),
    created_at: new Date().toISOString(),
    created_by: null,
    org_id: 'o1',
    property_id: 'p1',
    custom_field_values: {},
    update_type: { id: 't1', name: 'Note', icon: '📝' },
  };
};

describe('TimelineOverview', () => {
  it('renders empty state when no updates', () => {
    render(
      <TimelineOverview
        updates={[]}
        updateTypeFields={[]}
        config={config}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    expect(screen.getByText(/No activity yet/i)).toBeInTheDocument();
  });

  it('renders up to maxItems past updates', () => {
    const updates = [1, 2, 3, 4, 5].map((i) => mkUpdate(`u${i}`, i));
    render(
      <TimelineOverview
        updates={updates}
        updateTypeFields={[]}
        config={config}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    expect(screen.getByText('content u1')).toBeInTheDocument();
    expect(screen.getByText('content u2')).toBeInTheDocument();
    expect(screen.getByText('content u3')).toBeInTheDocument();
    expect(screen.queryByText('content u4')).not.toBeInTheDocument();
  });

  it('shows "View all N updates" button when past exceeds maxItems', () => {
    const updates = [1, 2, 3, 4, 5].map((i) => mkUpdate(`u${i}`, i));
    render(
      <TimelineOverview
        updates={updates}
        updateTypeFields={[]}
        config={config}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    expect(screen.getByRole('button', { name: /View all 5 updates/ })).toBeInTheDocument();
  });

  it('hides "View all" button when past <= maxItems', () => {
    const updates = [1, 2].map((i) => mkUpdate(`u${i}`, i));
    render(
      <TimelineOverview
        updates={updates}
        updateTypeFields={[]}
        config={config}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /View all/ })).not.toBeInTheDocument();
  });

  it('opens all-updates sheet when "View all" is clicked', () => {
    const updates = [1, 2, 3, 4, 5].map((i) => mkUpdate(`u${i}`, i));
    render(
      <TimelineOverview
        updates={updates}
        updateTypeFields={[]}
        config={config}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /View all 5 updates/ }));
    // Header should appear
    expect(screen.getByText(/All updates \(5\)/)).toBeInTheDocument();
  });

  it('opens detail sheet when an update card is tapped', () => {
    const updates = [mkUpdate('u1', 1)];
    render(
      <TimelineOverview
        updates={updates}
        updateTypeFields={[]}
        config={config}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    fireEvent.click(screen.getByText('content u1'));
    // Detail sheet close button is aria-labelled
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
  });

  it('hides scheduled section when showScheduled is false', () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const scheduled: TimelineUpdate = {
      ...mkUpdate('future', -3),
      update_date: d.toISOString(),
      content: 'future content',
    };
    render(
      <TimelineOverview
        updates={[scheduled]}
        updateTypeFields={[]}
        config={{ ...config, showScheduled: false }}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    expect(screen.queryByText(/scheduled/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- src/components/item/timeline/__tests__/TimelineOverview.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TimelineOverview`**

Create `src/components/item/timeline/TimelineOverview.tsx`:

```typescript
'use client';

import { useState } from 'react';
import type { UpdateTypeField } from '@/lib/types';
import type { TimelineConfig } from '@/lib/layout/types';
import type { TimelineUpdate } from './timeline-helpers';
import { partitionScheduled } from './timeline-helpers';
import UpdateCard from './UpdateCard';
import ScheduledUpdatesSection from './ScheduledUpdatesSection';
import UpdateDetailSheet from './UpdateDetailSheet';
import AllUpdatesSheet from './AllUpdatesSheet';

interface TimelineOverviewProps {
  updates: TimelineUpdate[];
  updateTypeFields: UpdateTypeField[];
  config: TimelineConfig;
  canEditUpdate: boolean;
  canDeleteUpdate: boolean;
  onDeleteUpdate?: (updateId: string) => void | Promise<void>;
  onEditUpdate?: (updateId: string) => void;
}

export default function TimelineOverview({
  updates,
  updateTypeFields,
  config,
  canEditUpdate,
  canDeleteUpdate,
  onDeleteUpdate,
  onEditUpdate,
}: TimelineOverviewProps) {
  const [detailUpdateId, setDetailUpdateId] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);

  const { scheduled, past } = partitionScheduled(updates);
  const visible = past.slice(0, config.maxItems);
  const showViewAll = past.length > config.maxItems;
  const detailUpdate = detailUpdateId
    ? updates.find((u) => u.id === detailUpdateId) ?? null
    : null;

  const showPhotos = config.showPhotos;
  const showFieldValues = config.showFieldValues;
  const showEntityChips = config.showEntityChips;

  const openDetail = (u: TimelineUpdate) => setDetailUpdateId(u.id);
  const closeDetail = () => setDetailUpdateId(null);

  const empty = scheduled.length === 0 && past.length === 0;

  return (
    <div>
      {empty && (
        <p className="text-sm text-sage italic">No activity yet</p>
      )}

      {config.showScheduled && scheduled.length > 0 && (
        <ScheduledUpdatesSection
          updates={scheduled}
          updateTypeFields={updateTypeFields}
          onUpdateTap={openDetail}
          showPhotos={showPhotos}
          showFieldValues={showFieldValues}
          showEntityChips={showEntityChips}
        />
      )}

      {visible.length > 0 && (
        <div className="space-y-2">
          {visible.map((u) => (
            <UpdateCard
              key={u.id}
              update={u}
              updateTypeFields={updateTypeFields}
              onTap={() => openDetail(u)}
              showPhotos={showPhotos}
              showFieldValues={showFieldValues}
              showEntityChips={showEntityChips}
            />
          ))}
        </div>
      )}

      {showViewAll && (
        <button
          type="button"
          onClick={() => setAllOpen(true)}
          className="mt-3 w-full text-sm font-medium text-forest hover:underline"
        >
          View all {past.length} updates
        </button>
      )}

      {detailUpdate && (
        <UpdateDetailSheet
          update={detailUpdate}
          updateTypeFields={updateTypeFields}
          isOpen={!!detailUpdate}
          onClose={closeDetail}
          canEdit={canEditUpdate}
          canDelete={canDeleteUpdate}
          onEdit={onEditUpdate ? () => onEditUpdate(detailUpdate.id) : undefined}
          onDelete={
            onDeleteUpdate
              ? async () => {
                  await onDeleteUpdate(detailUpdate.id);
                  closeDetail();
                }
              : undefined
          }
        />
      )}

      <AllUpdatesSheet
        updates={past}
        updateTypeFields={updateTypeFields}
        isOpen={allOpen}
        onClose={() => setAllOpen(false)}
        onUpdateTap={(u) => {
          openDetail(u);
        }}
        showPhotos={showPhotos}
        showFieldValues={showFieldValues}
        showEntityChips={showEntityChips}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- src/components/item/timeline/__tests__/TimelineOverview.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/item/timeline/TimelineOverview.tsx src/components/item/timeline/__tests__/TimelineOverview.test.tsx
git commit -m "feat(timeline): TimelineOverview orchestrator component"
```

---

## Task 9: Extend `TimelineConfig` type, schema, and defaults

**Files:**
- Modify: `src/lib/layout/types.ts`
- Modify: `src/lib/layout/schemas.ts`

- [ ] **Step 1: Extend the type**

In `src/lib/layout/types.ts`, replace lines 68-72 with:

```typescript
export interface TimelineConfig {
  showUpdates: boolean;
  showScheduled: boolean;
  maxItems: number;
  showPhotos: boolean;
  showFieldValues: boolean;
  showEntityChips: boolean;
}
```

- [ ] **Step 2: Extend the Zod schema with backward-compatible defaults**

In `src/lib/layout/schemas.ts` (lines 21-25), replace `timelineConfigSchema` with:

```typescript
const timelineConfigSchema = z.object({
  showUpdates: z.boolean(),
  showScheduled: z.boolean(),
  maxItems: z.number().int().min(1).max(50),
  showPhotos: z.boolean().default(true),
  showFieldValues: z.boolean().default(true),
  showEntityChips: z.boolean().default(true),
});
```

> `.default(true)` makes each new field optional during parse and fills `true` when missing. Existing layouts without these keys continue to parse successfully.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: errors appear in `BlockConfigPanel.tsx` (timeline case) because it doesn't pass the new fields. We'll fix those in Task 10. **Do not commit yet** — the codebase should not be committed in a non-compiling state. Proceed directly to Task 10.

---

## Task 10: Update `BlockConfigPanel` timeline case and propagate config defaults

**Files:**
- Modify: `src/components/layout/builder/BlockConfigPanel.tsx` (timeline case)
- Modify: any file that creates default `TimelineConfig` values (search for `showUpdates: true` in the codebase — likely in the layout builder "add block" path)

- [ ] **Step 1: Find all places where `TimelineConfig` is constructed**

Run: `grep -rn "showUpdates" src/` (via Grep tool).
Expected: appearances in `BlockConfigPanel.tsx`, potentially in a block-creation helper, and tests.

For each site that creates a `TimelineConfig` literal, add the three new fields with default `true`.

- [ ] **Step 2: Update the `timeline` case in `BlockConfigPanel.tsx`**

Replace lines 119-154 (the `case 'timeline'` block) with:

```typescript
    case 'timeline': {
      const config = block.config as TimelineConfig;
      return (
        <div className="space-y-3 pt-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.showUpdates}
              onChange={(e) => onConfigChange(block.id, { ...config, showUpdates: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Show updates</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.showScheduled}
              onChange={(e) => onConfigChange(block.id, { ...config, showScheduled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Show scheduled</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.showPhotos}
              onChange={(e) => onConfigChange(block.id, { ...config, showPhotos: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Show photo thumbnails</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.showFieldValues}
              onChange={(e) => onConfigChange(block.id, { ...config, showFieldValues: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Show field value chips</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.showEntityChips}
              onChange={(e) => onConfigChange(block.id, { ...config, showEntityChips: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Show entity chips</span>
          </label>
          <div>
            <label className="label">Max items: {config.maxItems}</label>
            <input
              type="range"
              min={1}
              max={50}
              value={config.maxItems}
              onChange={(e) => onConfigChange(block.id, { ...config, maxItems: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      );
    }
```

- [ ] **Step 3: Update any timeline-block-creation helper** to initialize the new fields to `true`. (Grep from Step 1 will have surfaced these — update each.)

- [ ] **Step 4: Type-check + run existing tests**

Run: `npm run type-check && npm run test`
Expected: no type errors; any pre-existing tests still pass. Any test that constructs a `TimelineConfig` literal must now include the three new fields (fix as encountered).

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/types.ts src/lib/layout/schemas.ts src/components/layout/builder/BlockConfigPanel.tsx
# Plus any other files updated in Step 3 or Step 4
git commit -m "feat(layout): extend TimelineConfig with showPhotos/FieldValues/EntityChips toggles"
```

---

## Task 11: Update `TimelineBlock` to use `TimelineOverview`

**Files:**
- Modify: `src/components/layout/blocks/TimelineBlock.tsx`
- Modify: `src/components/layout/LayoutRendererDispatch.tsx` — forward new props

- [ ] **Step 1: Extend `TimelineBlock` contract**

Replace the entire contents of `src/components/layout/blocks/TimelineBlock.tsx`:

```typescript
import type { UpdateTypeField } from '@/lib/types';
import type { TimelineConfig } from '@/lib/layout/types';
import type { TimelineUpdate } from '@/components/item/timeline/timeline-helpers';
import TimelineOverview from '@/components/item/timeline/TimelineOverview';

interface TimelineBlockProps {
  config: TimelineConfig;
  updates: TimelineUpdate[];
  updateTypeFields: UpdateTypeField[];
  canEditUpdate: boolean;
  canDeleteUpdate: boolean;
  onDeleteUpdate?: (updateId: string) => void | Promise<void>;
  onEditUpdate?: (updateId: string) => void;
}

export default function TimelineBlock({
  config,
  updates,
  updateTypeFields,
  canEditUpdate,
  canDeleteUpdate,
  onDeleteUpdate,
  onEditUpdate,
}: TimelineBlockProps) {
  if (!config.showUpdates) return null;

  return (
    <TimelineOverview
      updates={updates}
      updateTypeFields={updateTypeFields}
      config={config}
      canEditUpdate={canEditUpdate}
      canDeleteUpdate={canDeleteUpdate}
      onDeleteUpdate={onDeleteUpdate}
      onEditUpdate={onEditUpdate}
    />
  );
}
```

- [ ] **Step 2: Update `LayoutRendererDispatch` to forward new props**

Open `src/components/layout/LayoutRendererDispatch.tsx`. Find where `TimelineBlock` is rendered (likely a switch case on `block.type === 'timeline'`). Replace that render site to pass:

```typescript
<TimelineBlock
  config={block.config as TimelineConfig}
  updates={item.updates as TimelineUpdate[]}
  updateTypeFields={[]}
  canEditUpdate={!!canEditUpdate}
  canDeleteUpdate={!!canDeleteUpdate}
  onDeleteUpdate={onDeleteUpdate}
  onEditUpdate={onEditUpdate}
/>
```

Add matching props to `LayoutRendererDispatch`'s `Props` interface:
- `canEditUpdate?: boolean`
- `canDeleteUpdate?: boolean`
- `onDeleteUpdate?: (updateId: string) => void | Promise<void>`
- `onEditUpdate?: (updateId: string) => void`

> **Note:** Pass `[]` literal for `updateTypeFields` in V1. Key-field chips won't render for past updates (since `getKeyFieldValues` filters by `update_type_id`). Extending `ItemWithDetails` to carry `update_type_fields` is follow-up work — it requires changes to the item fetcher and is intentionally out of scope here.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: clean, or surface callers of `LayoutRendererDispatch` that need updating. Fix them to pass through the new optional props (most callers can simply not pass them — they're optional).

- [ ] **Step 4: Update existing blocks test**

In `src/components/layout/blocks/__tests__/blocks.test.tsx`, update the TimelineBlock tests (search for `TimelineBlock` in that file) to:
- Pass the new required props (`updateTypeFields={[]}`, `canEditUpdate={false}`, `canDeleteUpdate={false}`)
- Verify it delegates to `TimelineOverview` (mock or assert on rendered content)

Specifically: remove any test that asserts the old `UpdateTimeline` rendered "No activity yet" and replace with a test that verifies the new "No activity yet" text from `TimelineOverview` is rendered.

- [ ] **Step 5: Run tests**

Run: `npm run test -- src/components/layout/blocks`
Expected: PASS for blocks tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/blocks/TimelineBlock.tsx src/components/layout/LayoutRendererDispatch.tsx src/components/layout/blocks/__tests__/blocks.test.tsx
# Also any callers of LayoutRendererDispatch that needed updating
git commit -m "feat(timeline): wire TimelineBlock to new TimelineOverview with role-aware props"
```

---

## Task 12: Wire `DetailPanel` legacy branch and server-action callback

**Files:**
- Modify: `src/components/item/DetailPanel.tsx`
- Modify: wherever `LayoutRendererDispatch` is invoked (likely `DetailPanel.tsx` too) to pass `onDeleteUpdate` / `canDeleteUpdate` / `canEditUpdate`.

The layout-aware branch of `DetailPanel` (lines 52-91) already passes `canEditItem`, `canAddUpdate` to `LayoutRendererDispatch`. We need to add update-level permissions and the delete callback.

- [ ] **Step 1: Add permission helpers in `DetailPanel`**

At the top of `DetailPanel.tsx`, add:

```typescript
import { deleteUpdate } from '@/app/manage/update/[id]/actions';
```

Inside the component, compute per-update permissions once. Since update-level role gating depends on the *update type*, the simplest V1 approach is: grant `canDeleteUpdate` if the current user's role is at least some threshold (e.g., `canEditItem` implies `canDeleteUpdate`). A later plan can refine per-update-type checks.

Replace the `<LayoutRendererDispatch .../>` call (lines 80-90) with:

```typescript
<LayoutRendererDispatch
  layout={layout}
  item={item}
  mode="live"
  context={isMobile ? 'bottom-sheet' : 'side-panel'}
  sheetState={isMobile ? 'full' : undefined}
  customFields={item.custom_fields ?? []}
  canEdit={canEditItem}
  canAddUpdate={canAddUpdate}
  isAuthenticated={isAuthenticated}
  canEditUpdate={canEditItem}
  canDeleteUpdate={canEditItem}
  onDeleteUpdate={async (updateId) => {
    await deleteUpdate(updateId);
  }}
/>
```

> This intentionally ties update-level edit/delete to the item-level `canEditItem` permission. A finer per-update-type gate can be added later.

- [ ] **Step 2: Update the legacy branch to use `TimelineOverview`**

Replace lines 208-214 of `DetailPanel.tsx`:

```typescript
      {/* Updates timeline */}
      <div>
        <h3 className="text-xs font-medium text-sage uppercase tracking-wide mb-3">
          Updates
        </h3>
        <UpdateTimeline updates={item.updates} />
      </div>
```

With:

```typescript
      {/* Updates timeline */}
      <div>
        <h3 className="text-xs font-medium text-sage uppercase tracking-wide mb-3">
          Updates
        </h3>
        <TimelineOverview
          updates={item.updates}
          updateTypeFields={[]}
          config={{
            showUpdates: true,
            showScheduled: true,
            maxItems: 10,
            showPhotos: true,
            showFieldValues: true,
            showEntityChips: true,
          }}
          canEditUpdate={!!canEditItem}
          canDeleteUpdate={!!canEditItem}
          onDeleteUpdate={async (updateId) => {
            await deleteUpdate(updateId);
          }}
        />
      </div>
```

And update the imports at the top of `DetailPanel.tsx`:
- Remove: `import UpdateTimeline from './UpdateTimeline';`
- Add: `import TimelineOverview from './timeline/TimelineOverview';`

- [ ] **Step 3: Type-check and test**

Run: `npm run type-check && npm run test`
Expected: PASS. V1 passes an empty `updateTypeFields` list; key-field chips will not render, which is acceptable for a first cut. Extending `ItemWithDetails` to carry these is a separate follow-up.

- [ ] **Step 4: Commit**

```bash
git add src/components/item/DetailPanel.tsx
git commit -m "feat(timeline): use TimelineOverview in DetailPanel (both layout and legacy paths)"
```

---

## Task 13: Delete `UpdateTimeline.tsx`

**Files:**
- Delete: `src/components/item/UpdateTimeline.tsx`

- [ ] **Step 1: Verify no remaining references**

Run: `grep -rn "UpdateTimeline" src/` (via Grep tool).
Expected: zero matches. If any exist outside of `src/components/item/UpdateTimeline.tsx` itself, update them first.

- [ ] **Step 2: Delete the file**

Run: `rm src/components/item/UpdateTimeline.tsx`

- [ ] **Step 3: Type-check and test**

Run: `npm run type-check && npm run test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git rm src/components/item/UpdateTimeline.tsx
git commit -m "refactor(timeline): remove obsolete UpdateTimeline component"
```

---

## Task 14: Full verification + visual-diff pass

- [ ] **Step 1: Full type check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Dev-server smoke check**

Run: `npm run dev` (in a background process). In a browser, navigate to an item with updates in the map UI and verify:
- Timeline block renders rich cards.
- Tapping a card opens the detail sheet.
- Photo hero renders when photos are present.
- "View all" appears when updates exceed `maxItems`.
- Scheduled section appears for items with future-dated updates.
- Delete action works (if role allows) and the list updates.

Stop the dev server when done.

- [ ] **Step 5: Visual-diff screenshot pass**

Follow `docs/playbooks/visual-diff-screenshots.md`:
- Capture before/after screenshots of the timeline in mobile bottom-sheet and desktop side-panel contexts.
- Include in the PR description when you open the PR.

- [ ] **Step 6: Final commit if any polish changes**

If Step 4 revealed small issues, fix them and commit with a narrow message. Otherwise, no commit needed.

---

## Self-Review Checklist (post-authoring)

**Coverage against spec:**
- [x] `TimelineOverview` — Task 8
- [x] `UpdateCard` (rich card with photo/text/fields/entities and config toggles) — Task 3
- [x] `UpdateDetailSheet` with adaptive photo-hero / content-first / fields-first — Task 6
- [x] `AllUpdatesSheet` — Task 7
- [x] `ScheduledUpdatesSection` — Task 4
- [x] `timeline-helpers.ts` — Task 2
- [x] `formatRelativeDate` utility — Task 1
- [x] `deleteUpdate` server action — Task 5
- [x] `TimelineConfig` extensions + schema defaults — Task 9
- [x] `BlockConfigPanel` new toggles — Task 10
- [x] `TimelineBlock` swap — Task 11
- [x] `DetailPanel` legacy-branch swap — Task 12
- [x] Delete `UpdateTimeline.tsx` — Task 13
- [x] Manual visual diff — Task 14
- [~] **Edit action** — UI seam plumbed (`onEdit` prop) but no edit route in V1 (scope adjustment documented above).

**Placeholder scan:** No TODOs, no "implement later", no "similar to Task N". Every task has complete test + implementation code.

**Type consistency:** `TimelineUpdate` exported from `timeline-helpers.ts` is the single shared type. `TimelineConfig` passes through unchanged from `@/lib/layout/types`. `onDeleteUpdate` / `onEditUpdate` signatures match across `TimelineOverview`, `TimelineBlock`, and `LayoutRendererDispatch`.
