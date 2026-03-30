# Geo Layers Admin Entry Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose geo layers in the admin sidebar, add draft/published lifecycle, support dual import modes (manual + AI-assisted), and cross-link AI Context with Geo Layers.

**Architecture:** Add `status` and `source` columns to `geo_layers`. Extend `AdminSidebar` to render section headers. Modify the Geo Layers page to show status/source columns and two import buttons. Add a detection banner to the AI Context page that links to Geo Layers when geo features exist.

**Tech Stack:** Next.js 14, Supabase PostgreSQL, Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-30-geo-layers-admin-entry-points-design.md`

---

### Task 1: Database Migration — Add status and source columns

**Files:**
- Create: `supabase/migrations/022_geo_layer_status.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 022_geo_layer_status.sql — Add status and source columns to geo_layers

ALTER TABLE geo_layers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai'));

-- Migrate existing layers to published (they were explicitly created)
UPDATE geo_layers SET status = 'published' WHERE status = 'draft';
```

- [ ] **Step 2: Apply locally**

Run: `PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/migrations/022_geo_layer_status.sql`
Expected: ALTER TABLE, UPDATE N (or 0 if no existing layers)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/022_geo_layer_status.sql
git commit -m "feat: add status and source columns to geo_layers"
```

---

### Task 2: Update TypeScript types for status and source

**Files:**
- Modify: `src/lib/geo/types.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/geo/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { GeoLayer, GeoLayerSummary, GeoLayerStatus, GeoLayerSource } from '@/lib/geo/types';

describe('geo layer types', () => {
  it('GeoLayer includes status and source fields', () => {
    const layer: GeoLayer = {
      id: '1',
      org_id: '2',
      name: 'Test',
      description: null,
      color: '#3b82f6',
      opacity: 0.6,
      source_format: 'geojson',
      source_filename: 'test.geojson',
      geojson: { type: 'FeatureCollection', features: [] },
      feature_count: 0,
      bbox: null,
      is_property_boundary: false,
      created_at: '2026-01-01',
      created_by: null,
      status: 'draft',
      source: 'manual',
    };
    expect(layer.status).toBe('draft');
    expect(layer.source).toBe('manual');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/geo/types.test.ts`
Expected: FAIL — `status` and `source` don't exist on GeoLayer type

- [ ] **Step 3: Update types**

In `src/lib/geo/types.ts`, add the new type aliases and fields:

```typescript
// Add after the GeoSourceFormat type (line 3)
export type GeoLayerStatus = 'draft' | 'published';
export type GeoLayerSource = 'manual' | 'ai';
```

Add to the `GeoLayer` interface (after `created_by`):

```typescript
  status: GeoLayerStatus;
  source: GeoLayerSource;
```

Add to the `GeoLayerSummary` interface (after `created_by`):

```typescript
  status: GeoLayerStatus;
  source: GeoLayerSource;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/geo/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo/types.ts src/__tests__/geo/types.test.ts
git commit -m "feat: add status and source fields to geo layer types"
```

---

### Task 3: Update server actions to support status and source

**Files:**
- Modify: `src/app/admin/geo-layers/actions.ts`

- [ ] **Step 1: Update CreateGeoLayerInput interface**

Add to the `CreateGeoLayerInput` interface in `src/app/admin/geo-layers/actions.ts`:

```typescript
  status?: 'draft' | 'published';
  source?: 'manual' | 'ai';
```

- [ ] **Step 2: Update createGeoLayer to include status and source**

In the `.insert()` call inside `createGeoLayer`, add:

```typescript
      status: input.status ?? 'draft',
      source: input.source ?? 'manual',
```

- [ ] **Step 3: Update listGeoLayers select to include new columns**

In `listGeoLayers`, update the `.select()` string to include `status, source`:

```typescript
    .select('id, org_id, name, description, color, opacity, source_format, source_filename, feature_count, bbox, is_property_boundary, created_at, created_by, status, source')
```

- [ ] **Step 4: Add publishGeoLayer action**

Add a new server action at the end of the file:

```typescript
export async function publishGeoLayer(
  layerId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('geo_layers')
    .update({ status: 'published' })
    .eq('id', layerId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function unpublishGeoLayer(
  layerId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('geo_layers')
    .update({ status: 'draft' })
    .eq('id', layerId);

  if (error) return { error: error.message };
  return { success: true };
}
```

- [ ] **Step 5: Update MapView to filter by published status**

In `src/components/map/MapView.tsx`, where `geoLayers` are used, filter to only render layers with `status === 'published'`. Find the section that maps over `geoLayers` and add:

```typescript
const publishedLayers = (geoLayers ?? []).filter(l => l.status === 'published');
```

Use `publishedLayers` instead of `geoLayers` for rendering.

- [ ] **Step 6: Run type check**

Run: `npm run type-check`
Expected: Clean pass (some errors may appear from geo-layers page not yet updated — that's Task 5)

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/geo-layers/actions.ts src/components/map/MapView.tsx
git commit -m "feat: add status/source to geo layer actions, filter maps to published"
```

---

### Task 4: Admin Sidebar — Section headers and Geo Layers link

**Files:**
- Modify: `src/app/admin/AdminShell.tsx`
- Modify: `src/components/admin/AdminSidebar.tsx`
- Create: `src/__tests__/admin/AdminSidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/admin/AdminSidebar.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
}));

describe('AdminSidebar', () => {
  it('renders section headers as non-clickable labels', () => {
    const items = [
      { label: 'Dashboard', href: '/admin' },
      { type: 'section' as const, label: 'Data' },
      { label: 'AI Context', href: '/admin/ai-context' },
      { label: 'Geo Layers', href: '/admin/geo-layers' },
    ];

    render(<AdminSidebar title="Test Org" items={items} />);

    // Section header renders as text, not a link
    const sectionHeader = screen.getByText('Data');
    expect(sectionHeader.tagName).not.toBe('A');
    expect(sectionHeader.closest('a')).toBeNull();

    // Nav items render as links
    expect(screen.getByText('AI Context').closest('a')).toBeTruthy();
    expect(screen.getByText('Geo Layers').closest('a')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/admin/AdminSidebar.test.tsx`
Expected: FAIL — SidebarItem type doesn't support `type: 'section'`

- [ ] **Step 3: Update AdminSidebar to support section headers**

Replace the full content of `src/components/admin/AdminSidebar.tsx`:

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type SidebarItem =
  | { label: string; href: string }
  | { type: 'section'; label: string };

interface AdminSidebarProps {
  title: string;
  items: SidebarItem[];
  backLink?: { label: string; href: string };
  onNavClick?: () => void;
}

export function AdminSidebar({ title, items, backLink, onNavClick }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <nav className="w-56 bg-parchment border-r border-sage-light flex-shrink-0 h-full overflow-auto">
      {backLink && (
        <Link
          href={backLink.href}
          className="block px-4 py-2 text-xs text-golden hover:text-golden/80"
          onClick={onNavClick}
        >
          ← {backLink.label}
        </Link>
      )}
      <div className="px-4 py-3 font-bold text-forest-dark text-sm">
        {title}
      </div>
      {items.map((item, i) => {
        if ('type' in item && item.type === 'section') {
          return (
            <div
              key={`section-${i}`}
              className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sage"
            >
              {item.label}
            </div>
          );
        }

        const navItem = item as { label: string; href: string };
        const isActive =
          pathname === navItem.href ||
          (navItem.href !== '/admin' && pathname.startsWith(navItem.href));
        return (
          <Link
            key={navItem.href}
            href={navItem.href}
            className={`block px-4 py-2 text-sm ${
              isActive
                ? 'bg-sage-light/50 text-forest-dark font-semibold border-l-3 border-golden'
                : 'text-gray-600 hover:bg-sage-light/30'
            }`}
            onClick={onNavClick}
          >
            {navItem.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/admin/AdminSidebar.test.tsx`
Expected: PASS

- [ ] **Step 5: Update ORG_NAV_ITEMS with section headers and Geo Layers**

In `src/app/admin/AdminShell.tsx`, replace the `ORG_NAV_ITEMS` array (lines 16-25):

```typescript
const ORG_NAV_ITEMS: SidebarItem[] = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Properties', href: '/admin/properties' },
  { label: 'Members', href: '/admin/members' },
  { label: 'Roles', href: '/admin/roles' },
  { type: 'section', label: 'Data' },
  { label: 'AI Context', href: '/admin/ai-context' },
  { label: 'Geo Layers', href: '/admin/geo-layers' },
  { type: 'section', label: 'Settings' },
  { label: 'Domains', href: '/admin/domains' },
  { label: 'Access & Tokens', href: '/admin/access' },
  { label: 'Org Settings', href: '/admin/settings' },
];
```

Add the import at the top of `AdminShell.tsx`:

```typescript
import { AdminSidebar, type SidebarItem } from '@/components/admin/AdminSidebar';
```

- [ ] **Step 6: Run type check and tests**

Run: `npm run type-check && npm run test`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/AdminSidebar.tsx src/app/admin/AdminShell.tsx src/__tests__/admin/AdminSidebar.test.tsx
git commit -m "feat: add section headers to admin sidebar, expose Geo Layers link"
```

---

### Task 5: Geo Layers Page — Status badges, source column, dual import buttons

**Files:**
- Modify: `src/app/admin/geo-layers/page.tsx`

- [ ] **Step 1: Add status and source columns to the table**

In `src/app/admin/geo-layers/page.tsx`, update the table header row (around line 186-191). Replace the existing `<thead>`:

```tsx
<thead>
  <tr className="border-b border-gray-200 bg-gray-50">
    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
    <th className="text-left px-4 py-3 font-medium text-gray-600">Layer</th>
    <th className="text-left px-4 py-3 font-medium text-gray-600">Features</th>
    <th className="text-left px-4 py-3 font-medium text-gray-600">Format</th>
    <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
    <th className="px-4 py-3"></th>
  </tr>
</thead>
```

- [ ] **Step 2: Update table body with status badge, source, and publish action**

Replace the `<tbody>` content. For each layer row, add a status badge cell before the name cell, a source cell, and update the actions cell:

```tsx
<td className="px-4 py-3">
  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
    layer.status === 'published'
      ? 'bg-green-100 text-green-700'
      : 'bg-amber-100 text-amber-700'
  }`}>
    {layer.status === 'published' ? 'Published' : 'Draft'}
  </span>
</td>
```

For the source cell:

```tsx
<td className="px-4 py-3 text-gray-500">
  {layer.source === 'ai' ? (
    <span className="text-purple-600">✨ AI</span>
  ) : (
    <span>Manual</span>
  )}
</td>
```

For the actions cell, add a publish/unpublish button:

```tsx
<td className="px-4 py-3 text-right space-x-3">
  {layer.status === 'draft' ? (
    <button
      onClick={() => handlePublish(layer.id)}
      className="text-green-600 hover:text-green-800 text-sm"
    >
      Publish
    </button>
  ) : (
    <button
      onClick={() => handleUnpublish(layer.id)}
      className="text-amber-600 hover:text-amber-800 text-sm"
    >
      Unpublish
    </button>
  )}
  <button
    onClick={() => { setEditingId(layer.id); setEditName(layer.name); }}
    className="text-gray-500 hover:text-gray-700 text-sm"
  >
    Edit
  </button>
  <button
    onClick={() => handleDelete(layer)}
    className="text-red-500 hover:text-red-700 text-sm"
  >
    Delete
  </button>
</td>
```

- [ ] **Step 3: Add publish/unpublish handlers and import the actions**

Add to the imports at the top:

```typescript
import {
  createGeoLayer,
  listGeoLayers,
  updateGeoLayer,
  deleteGeoLayer,
  assignLayerToProperties,
  publishGeoLayer,
  unpublishGeoLayer,
} from './actions';
```

Add handler functions inside the component (after `handleSaveEdit`):

```typescript
const handlePublish = async (layerId: string) => {
  const result = await publishGeoLayer(layerId);
  if ('error' in result) {
    setMessage({ type: 'error', text: result.error });
  } else {
    setMessage({ type: 'success', text: 'Layer published — now visible on maps' });
    loadLayers();
  }
};

const handleUnpublish = async (layerId: string) => {
  const result = await unpublishGeoLayer(layerId);
  if ('error' in result) {
    setMessage({ type: 'error', text: result.error });
  } else {
    setMessage({ type: 'success', text: 'Layer unpublished — hidden from maps' });
    loadLayers();
  }
};
```

- [ ] **Step 4: Replace single import button with dual buttons**

Replace the existing import button (around line 163):

```tsx
<div className="flex gap-2">
  <button onClick={() => setShowImport(true)} className="btn-primary">
    Quick Import
  </button>
  <button
    onClick={() => setShowAiImport(true)}
    className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors"
  >
    ✨ AI-Assisted Import
  </button>
</div>
```

Add state for AI import: `const [showAiImport, setShowAiImport] = useState(false);`

For now, the AI-assisted button shows a placeholder modal. The full AI import pipeline will be implemented in a follow-up task:

```tsx
{showAiImport && (
  <div className="card p-6 text-center text-gray-500">
    <p className="text-lg mb-2">✨ AI-Assisted Import</p>
    <p className="text-sm">Upload a geo file and AI will analyze it, suggest layer names, and auto-configure properties.</p>
    <p className="text-sm mt-4 text-amber-600">Coming soon — use Quick Import for now.</p>
    <button onClick={() => setShowAiImport(false)} className="btn-secondary mt-4">Close</button>
  </div>
)}
```

- [ ] **Step 5: Run type check**

Run: `npm run type-check`
Expected: Pass

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/geo-layers/page.tsx
git commit -m "feat: add status badges, source column, and dual import buttons to geo layers page"
```

---

### Task 6: AI Context Page — Geo Layers Detection Banner

**Files:**
- Modify: `src/app/admin/ai-context/page.tsx`

- [ ] **Step 1: Add the geo layers banner**

In `src/app/admin/ai-context/page.tsx`, find the line that computes `totalGeoCount` (line 332):

```typescript
const totalGeoCount = items.reduce((sum, item) => sum + item.geo_count, 0);
```

After the processing progress section and before the items table, add the banner. Find the spot after the `{processingItems.length > 0 && (...)}` block and before the items table. Add:

```tsx
{totalGeoCount > 0 && (
  <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 flex items-center gap-3">
    <span className="text-xl">🗺️</span>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-purple-900">
        {totalGeoCount} geo feature{totalGeoCount !== 1 ? 's' : ''} detected in uploaded files
      </p>
      <p className="text-xs text-purple-700 truncate">
        {items.filter(i => i.geo_count > 0).map(i => `${i.name} (${i.geo_count})`).join(' · ')}
      </p>
    </div>
    <a
      href="/admin/geo-layers"
      className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors"
    >
      View in Geo Layers →
    </a>
  </div>
)}
```

- [ ] **Step 2: Run type check**

Run: `npm run type-check`
Expected: Pass

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/ai-context/page.tsx
git commit -m "feat: add geo layers detection banner to AI context page"
```

---

### Task 7: Seed Data — Update seed files for new columns

**Files:**
- Modify: `supabase/seed.sql` (if it references geo_layers)
- Modify: `supabase/scripts/seed-test-db.sql` (if it references geo_layers)

- [ ] **Step 1: Check if seed files reference geo_layers**

Run: `grep -l geo_layers supabase/seed.sql supabase/scripts/seed-test-db.sql 2>/dev/null`

If neither file references geo_layers, skip this task — the columns have defaults so existing inserts still work.

- [ ] **Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 3: Run type check**

Run: `npm run type-check`
Expected: Clean

- [ ] **Step 4: Final commit if any seed changes were needed**

```bash
git add -A
git commit -m "chore: update seed data for geo layer status columns"
```

---

### Task 8: Verification — End-to-end manual test

- [ ] **Step 1: Start local dev**

Run: `npm run dev:local`

- [ ] **Step 2: Verify sidebar**

Navigate to `/admin`. Confirm:
- "Data" section header appears above "AI Context" and "Geo Layers"
- "Settings" section header appears above "Domains", "Access & Tokens", "Org Settings"
- "Geo Layers" link navigates to `/admin/geo-layers`

- [ ] **Step 3: Verify Geo Layers page**

Navigate to `/admin/geo-layers`. Confirm:
- Table shows Status, Layer, Features, Format, Source columns
- "Quick Import" and "✨ AI-Assisted Import" buttons are visible
- Quick Import opens the existing ImportFlow wizard
- AI-Assisted Import shows the placeholder message
- Imported layers appear as "Draft" status
- "Publish" button transitions layer to "Published"
- "Unpublish" button transitions back to "Draft"

- [ ] **Step 4: Verify AI Context cross-link**

Navigate to `/admin/ai-context`. If there are items with geo features:
- Purple banner shows with geo feature count
- "View in Geo Layers →" navigates to `/admin/geo-layers`

- [ ] **Step 5: Verify maps only show published layers**

Navigate to a property map. Confirm:
- Draft layers do NOT appear on the map
- Published layers DO appear on the map
