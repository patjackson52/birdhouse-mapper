# Map Display Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make map controls (legend, layer selector, locate me, view as list, quick add) and legend content configurable per property/org with cascade inheritance.

**Architecture:** New `map_display_config` JSONB column on `orgs` and `properties` tables. `buildSiteConfig` merges org → property config with per-key control toggle fallback and full-replacement legend lists. Components read resolved config via `useConfig().mapDisplayConfig`. Admin UI uses card-per-control layout with toggle switches in both org and property settings.

**Tech Stack:** Next.js 14, Supabase PostgreSQL, TypeScript, React, Tailwind CSS, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/034_map_display_config.sql` | Create | Add JSONB column to orgs + properties |
| `src/lib/config/map-display.ts` | Create | `MapDisplayConfig` type + `resolveMapDisplayConfig` merge function |
| `src/lib/config/__tests__/map-display.test.ts` | Create | Tests for resolve/merge logic |
| `src/lib/config/types.ts` | Modify | Add `mapDisplayConfig` to `SiteConfig`, update `buildSiteConfig` signature + body |
| `src/lib/config/__tests__/config.test.ts` | Modify | Update existing tests for new field |
| `src/lib/config/defaults.ts` | Modify | Add `mapDisplayConfig` to `DEFAULT_CONFIG` |
| `src/lib/config/server.ts` | Modify | Add `map_display_config` to org + property select queries |
| `src/lib/types.ts` | Modify | Add `map_display_config` to `Property` and `Org` interfaces |
| `src/components/map/MapView.tsx` | Modify | Conditionally render legend, locate, layers, quick add |
| `src/components/map/HomeMapView.tsx` | Modify | Conditionally render "View as List" link |
| `src/components/map/MapLegend.tsx` | Modify | Filter statuses and item types based on legend config |
| `src/components/admin/MapDisplayConfigEditor.tsx` | Create | Shared card-per-control toggle UI component |
| `src/app/admin/settings/page.tsx` | Modify | Add Map Display section to org settings |
| `src/app/admin/settings/actions.ts` | Modify | Add `map_display_config` to OrgSettings + update action |
| `src/app/admin/properties/[slug]/settings/page.tsx` | Modify | Add Map Display section to Appearance tab |
| `src/app/admin/properties/[slug]/settings/actions.ts` | Modify | Add `map_display_config` to PROPERTY_KEY_TO_COLUMN |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/034_map_display_config.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add map display configuration to orgs and properties
-- Stores control visibility toggles and legend content filters as JSONB
-- null = use all defaults (everything visible)

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS map_display_config JSONB DEFAULT NULL;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS map_display_config JSONB DEFAULT NULL;
```

- [ ] **Step 2: Verify migration applies cleanly**

Run: `cd /Users/patrick/birdhousemapper && npx supabase db reset 2>&1 | tail -5`
Expected: Migration applies without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/034_map_display_config.sql
git commit -m "feat: add map_display_config column to orgs and properties"
```

---

### Task 2: MapDisplayConfig Type and Resolve Function

**Files:**
- Create: `src/lib/config/map-display.ts`
- Create: `src/lib/config/__tests__/map-display.test.ts`

- [ ] **Step 1: Write tests for resolveMapDisplayConfig**

File: `src/lib/config/__tests__/map-display.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { resolveMapDisplayConfig } from '../map-display';
import type { MapDisplayConfig, ResolvedMapDisplayConfig } from '../map-display';

describe('resolveMapDisplayConfig', () => {
  it('returns all-true defaults when both org and property are null', () => {
    const result = resolveMapDisplayConfig(null, null);
    expect(result.controls.legend).toBe(true);
    expect(result.controls.layerSelector).toBe(true);
    expect(result.controls.locateMe).toBe(true);
    expect(result.controls.viewAsList).toBe(true);
    expect(result.controls.quickAdd).toBe(true);
    expect(result.legend.statuses).toBeUndefined();
    expect(result.legend.itemTypeIds).toBeUndefined();
  });

  it('uses org config when property is null', () => {
    const org: MapDisplayConfig = {
      controls: { legend: false, quickAdd: false },
      legend: { statuses: ['active', 'planned'] },
    };
    const result = resolveMapDisplayConfig(org, null);
    expect(result.controls.legend).toBe(false);
    expect(result.controls.layerSelector).toBe(true);
    expect(result.controls.quickAdd).toBe(false);
    expect(result.legend.statuses).toEqual(['active', 'planned']);
  });

  it('property controls override org controls per-key', () => {
    const org: MapDisplayConfig = {
      controls: { legend: false, locateMe: false },
    };
    const property: MapDisplayConfig = {
      controls: { legend: true },
    };
    const result = resolveMapDisplayConfig(org, property);
    expect(result.controls.legend).toBe(true);    // property overrides
    expect(result.controls.locateMe).toBe(false);  // falls through to org
    expect(result.controls.layerSelector).toBe(true); // default
  });

  it('property legend statuses fully replace org legend statuses', () => {
    const org: MapDisplayConfig = {
      legend: { statuses: ['active', 'planned'] },
    };
    const property: MapDisplayConfig = {
      legend: { statuses: ['active', 'damaged'] },
    };
    const result = resolveMapDisplayConfig(org, property);
    expect(result.legend.statuses).toEqual(['active', 'damaged']);
  });

  it('property legend itemTypeIds fully replace org itemTypeIds', () => {
    const org: MapDisplayConfig = {
      legend: { itemTypeIds: ['id-1', 'id-2'] },
    };
    const property: MapDisplayConfig = {
      legend: { itemTypeIds: ['id-3'] },
    };
    const result = resolveMapDisplayConfig(org, property);
    expect(result.legend.itemTypeIds).toEqual(['id-3']);
  });

  it('falls through to org legend when property legend is undefined', () => {
    const org: MapDisplayConfig = {
      legend: { statuses: ['active'], itemTypeIds: ['id-1'] },
    };
    const property: MapDisplayConfig = {
      controls: { quickAdd: false },
    };
    const result = resolveMapDisplayConfig(org, property);
    expect(result.legend.statuses).toEqual(['active']);
    expect(result.legend.itemTypeIds).toEqual(['id-1']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/config/__tests__/map-display.test.ts 2>&1 | tail -10`
Expected: FAIL — module `../map-display` not found.

- [ ] **Step 3: Write the type and resolve function**

File: `src/lib/config/map-display.ts`

```typescript
export interface MapDisplayConfig {
  controls?: {
    legend?: boolean;
    layerSelector?: boolean;
    locateMe?: boolean;
    viewAsList?: boolean;
    quickAdd?: boolean;
  };
  legend?: {
    statuses?: string[];
    itemTypeIds?: string[];
  };
}

export interface ResolvedMapDisplayConfig {
  controls: {
    legend: boolean;
    layerSelector: boolean;
    locateMe: boolean;
    viewAsList: boolean;
    quickAdd: boolean;
  };
  legend: {
    statuses?: string[];
    itemTypeIds?: string[];
  };
}

/**
 * Merge org and property map display configs with cascade logic.
 * Controls: property per-key overrides org per-key, unset defaults to true.
 * Legend lists: property fully replaces org if set, otherwise falls through.
 */
export function resolveMapDisplayConfig(
  orgConfig: MapDisplayConfig | null | undefined,
  propertyConfig: MapDisplayConfig | null | undefined,
): ResolvedMapDisplayConfig {
  const orgControls = orgConfig?.controls;
  const propControls = propertyConfig?.controls;

  return {
    controls: {
      legend: propControls?.legend ?? orgControls?.legend ?? true,
      layerSelector: propControls?.layerSelector ?? orgControls?.layerSelector ?? true,
      locateMe: propControls?.locateMe ?? orgControls?.locateMe ?? true,
      viewAsList: propControls?.viewAsList ?? orgControls?.viewAsList ?? true,
      quickAdd: propControls?.quickAdd ?? orgControls?.quickAdd ?? true,
    },
    legend: {
      statuses: propertyConfig?.legend?.statuses ?? orgConfig?.legend?.statuses,
      itemTypeIds: propertyConfig?.legend?.itemTypeIds ?? orgConfig?.legend?.itemTypeIds,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/config/__tests__/map-display.test.ts 2>&1 | tail -10`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/config/map-display.ts src/lib/config/__tests__/map-display.test.ts
git commit -m "feat: add MapDisplayConfig type and resolve function with tests"
```

---

### Task 3: Integrate into SiteConfig and buildSiteConfig

**Files:**
- Modify: `src/lib/config/types.ts`
- Modify: `src/lib/config/defaults.ts`
- Modify: `src/lib/config/__tests__/config.test.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Write the failing test for mapDisplayConfig in buildSiteConfig**

Add to the end of the `buildSiteConfig` describe block in `src/lib/config/__tests__/config.test.ts`, before the closing `});` of the describe:

```typescript
  it('resolves mapDisplayConfig from org and property', () => {
    const org = {
      name: 'Test',
      tagline: null,
      logo_url: null,
      favicon_url: null,
      theme: null,
      setup_complete: false,
      map_display_config: { controls: { legend: false, quickAdd: false } },
    };
    const property = {
      description: null,
      map_default_lat: null,
      map_default_lng: null,
      map_default_zoom: null,
      map_style: null,
      custom_map: null,
      about_content: null,
      about_page_enabled: null,
      footer_text: null,
      footer_links: null,
      custom_nav_items: null,
      landing_page: null,
      logo_url: null,
      puck_pages: null,
      puck_root: null,
      puck_template: null,
      puck_pages_draft: null,
      puck_root_draft: null,
      puck_page_meta: null,
      map_display_config: { controls: { legend: true } },
    };

    const config = buildSiteConfig(org, property);

    expect(config.mapDisplayConfig.controls.legend).toBe(true);     // property overrides
    expect(config.mapDisplayConfig.controls.quickAdd).toBe(false);  // org value
    expect(config.mapDisplayConfig.controls.locateMe).toBe(true);   // default
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/config/__tests__/config.test.ts 2>&1 | tail -15`
Expected: FAIL — `map_display_config` not recognized in org/property type, or `mapDisplayConfig` not on SiteConfig.

- [ ] **Step 3: Add map_display_config to Org and Property interfaces**

In `src/lib/types.ts`, add to the `Org` interface (after `updated_at: string;`):

```typescript
  map_display_config: unknown | null;
```

Add to the `Property` interface (after `deleted_at: string | null;`):

```typescript
  map_display_config: unknown | null;
```

- [ ] **Step 4: Add mapDisplayConfig to SiteConfig and buildSiteConfig**

In `src/lib/config/types.ts`:

1. Add import at top:

```typescript
import { resolveMapDisplayConfig, type ResolvedMapDisplayConfig } from './map-display';
```

2. Add to the `SiteConfig` interface (after `puckPageMeta`):

```typescript
  mapDisplayConfig: ResolvedMapDisplayConfig;
```

3. Add `map_display_config` to the `org` parameter type in `buildSiteConfig`:

```typescript
    map_display_config?: unknown | null;
```

4. Add `map_display_config` to the `property` parameter type in `buildSiteConfig`:

```typescript
    map_display_config?: unknown | null;
```

5. Add to the return object in `buildSiteConfig` (at the end, before the closing `};`):

```typescript
    mapDisplayConfig: resolveMapDisplayConfig(
      org.map_display_config as import('./map-display').MapDisplayConfig | null,
      property.map_display_config as import('./map-display').MapDisplayConfig | null,
    ),
```

- [ ] **Step 5: Add mapDisplayConfig to DEFAULT_CONFIG**

In `src/lib/config/defaults.ts`, add the import:

```typescript
import { resolveMapDisplayConfig } from './map-display';
```

Add to the DEFAULT_CONFIG object:

```typescript
  mapDisplayConfig: resolveMapDisplayConfig(null, null),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/config/__tests__/config.test.ts 2>&1 | tail -15`
Expected: All tests PASS (existing + new).

- [ ] **Step 7: Update the config server query to include map_display_config**

In `src/lib/config/server.ts`, update the org select query (line 32) to add `map_display_config`:

Change:
```typescript
      .select('name, pwa_name, tagline, logo_url, favicon_url, theme, setup_complete, default_property_id')
```
To:
```typescript
      .select('name, pwa_name, tagline, logo_url, favicon_url, theme, setup_complete, default_property_id, map_display_config')
```

Update the property select query (line 49) to add `map_display_config`:

Change:
```typescript
      .select('id, name, pwa_name, description, map_default_lat, map_default_lng, map_default_zoom, map_style, custom_map, about_content, about_page_enabled, footer_text, footer_links, custom_nav_items, landing_page, logo_url, puck_pages, puck_root, puck_template, puck_pages_draft, puck_root_draft, puck_page_meta')
```
To:
```typescript
      .select('id, name, pwa_name, description, map_default_lat, map_default_lng, map_default_zoom, map_style, custom_map, about_content, about_page_enabled, footer_text, footer_links, custom_nav_items, landing_page, logo_url, puck_pages, puck_root, puck_template, puck_pages_draft, puck_root_draft, puck_page_meta, map_display_config')
```

- [ ] **Step 8: Run full test suite to verify nothing is broken**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run 2>&1 | tail -15`
Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/types.ts src/lib/config/types.ts src/lib/config/defaults.ts src/lib/config/server.ts src/lib/config/__tests__/config.test.ts
git commit -m "feat: integrate mapDisplayConfig into SiteConfig and buildSiteConfig"
```

---

### Task 4: Conditional Rendering in Map Components

**Files:**
- Modify: `src/components/map/MapView.tsx`
- Modify: `src/components/map/HomeMapView.tsx`
- Modify: `src/components/map/MapLegend.tsx`

- [ ] **Step 1: Conditionally render controls in MapView.tsx**

In `src/components/map/MapView.tsx`:

1. Read `mapDisplayConfig` from config (after line 68 where `config` is already destructured):

```typescript
  const { controls: mapControls } = config.mapDisplayConfig;
```

2. Wrap `<LocateButton>` (line 208) in a controls check:

Change:
```tsx
      <LocateButton onLocate={() => setFlyToUserTrigger((n) => n + 1)} />
```
To:
```tsx
      {mapControls.locateMe && (
        <LocateButton onLocate={() => setFlyToUserTrigger((n) => n + 1)} />
      )}
```

3. Wrap `<MapLegend>` (line 209) in a controls check:

Change:
```tsx
      <MapLegend itemTypes={itemTypes} />
```
To:
```tsx
      {mapControls.legend && (
        <MapLegend itemTypes={itemTypes} legendConfig={config.mapDisplayConfig.legend} />
      )}
```

4. Wrap the `LayerControlPanel` block (lines 154-159) in a controls check:

Change:
```tsx
      {geoLayers && geoLayers.length > 0 && (
        <LayerControlPanel
```
To:
```tsx
      {mapControls.layerSelector && geoLayers && geoLayers.length > 0 && (
        <LayerControlPanel
```

5. Wrap the Quick Add FAB block (lines 212-221) in a controls check:

Change:
```tsx
      {sheetState !== 'half' && sheetState !== 'full' && (
```
To:
```tsx
      {mapControls.quickAdd && sheetState !== 'half' && sheetState !== 'full' && (
```

- [ ] **Step 2: Conditionally render "View as List" in HomeMapView.tsx**

In `src/components/map/HomeMapView.tsx`:

1. The `config` is already available (line 62). Add after it:

```typescript
  const { controls: mapControls } = config.mapDisplayConfig;
```

2. Wrap the "List view link" block (lines 295-301) in a controls check:

Change:
```tsx
      {/* List view link */}
      <Link
        href="/list"
        className="absolute top-4 right-4 z-10 bg-white backdrop-blur-sm rounded-lg shadow-lg border border-sage-light px-3 py-2 text-xs font-medium text-forest-dark hover:bg-sage-light transition-colors"
      >
        View as List
      </Link>
```
To:
```tsx
      {/* List view link */}
      {mapControls.viewAsList && (
        <Link
          href="/list"
          className="absolute top-4 right-4 z-10 bg-white backdrop-blur-sm rounded-lg shadow-lg border border-sage-light px-3 py-2 text-xs font-medium text-forest-dark hover:bg-sage-light transition-colors"
        >
          View as List
        </Link>
      )}
```

- [ ] **Step 3: Filter legend content in MapLegend.tsx**

In `src/components/map/MapLegend.tsx`:

1. Update the interface to accept legend config:

Change:
```typescript
interface MapLegendProps {
  itemTypes: ItemType[];
}
```
To:
```typescript
interface MapLegendProps {
  itemTypes: ItemType[];
  legendConfig?: {
    statuses?: string[];
    itemTypeIds?: string[];
  };
}
```

2. Update the function signature:

Change:
```typescript
export default function MapLegend({ itemTypes }: MapLegendProps) {
```
To:
```typescript
export default function MapLegend({ itemTypes, legendConfig }: MapLegendProps) {
```

3. Add import for `ItemStatus` type and `statusLabels` at top:

```typescript
import type { ItemType, ItemStatus } from '@/lib/types';
import { statusColors, statusLabels } from '@/lib/utils';
```

(Remove the existing `import { statusColors } from '@/lib/utils';` line.)

4. Replace the hardcoded `statusItems` array (lines 14-18):

Change:
```typescript
  const statusItems = [
    { color: statusColors.active, label: 'Active' },
    { color: statusColors.planned, label: 'Planned' },
    { color: statusColors.damaged, label: 'Needs Repair' },
  ];
```
To:
```typescript
  const allStatuses: ItemStatus[] = ['active', 'planned', 'damaged', 'removed'];
  const visibleStatuses = legendConfig?.statuses
    ? allStatuses.filter((s) => legendConfig.statuses!.includes(s))
    : allStatuses.filter((s) => s !== 'removed'); // preserve existing default: hide 'removed'

  const statusItems = visibleStatuses.map((s) => ({
    color: statusColors[s],
    label: statusLabels[s],
  }));
```

5. Filter item types by config. Change the itemTypes rendering block (lines 59-72):

Change:
```tsx
          {itemTypes.length > 1 && (
            <>
              <h4 className="text-[10px] font-medium text-sage uppercase tracking-wider mt-2 mb-1.5">
                Types
              </h4>
              <div className="space-y-1">
                {itemTypes.map((type) => (
```
To:
```tsx
          {(() => {
            const visibleTypes = legendConfig?.itemTypeIds
              ? itemTypes.filter((t) => legendConfig.itemTypeIds!.includes(t.id))
              : itemTypes;
            return visibleTypes.length > 1 ? (
              <>
                <h4 className="text-[10px] font-medium text-sage uppercase tracking-wider mt-2 mb-1.5">
                  Types
                </h4>
                <div className="space-y-1">
                  {visibleTypes.map((type) => (
```

And close the IIFE after the existing closing tags:

Change:
```tsx
              </div>
            </>
          )}
```
To:
```tsx
                  </div>
                </>
              ) : null;
          })()}
```

- [ ] **Step 4: Run type check**

Run: `cd /Users/patrick/birdhousemapper && npx tsc --noEmit 2>&1 | tail -20`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/map/MapView.tsx src/components/map/HomeMapView.tsx src/components/map/MapLegend.tsx
git commit -m "feat: conditionally render map controls based on mapDisplayConfig"
```

---

### Task 5: MapDisplayConfigEditor Component

**Files:**
- Create: `src/components/admin/MapDisplayConfigEditor.tsx`

- [ ] **Step 1: Create the shared editor component**

File: `src/components/admin/MapDisplayConfigEditor.tsx`

```tsx
'use client';

import { useState, useEffect } from 'react';
import type { MapDisplayConfig } from '@/lib/config/map-display';
import type { ItemType, ItemStatus } from '@/lib/types';
import { statusColors, statusLabels } from '@/lib/utils';

interface ControlDef {
  key: keyof NonNullable<MapDisplayConfig['controls']>;
  label: string;
  description: string;
  icon: string;
}

const CONTROLS: ControlDef[] = [
  { key: 'legend', label: 'Legend', description: 'Status colors & item types', icon: '🗺️' },
  { key: 'locateMe', label: 'Current Position', description: 'Center map on user location', icon: '📍' },
  { key: 'viewAsList', label: 'View as List', description: 'Link to list view', icon: '📋' },
  { key: 'layerSelector', label: 'Layer Selector', description: 'Toggle geo layer visibility', icon: '🗂️' },
  { key: 'quickAdd', label: 'Quick Add', description: 'Floating add button', icon: '➕' },
];

const ALL_STATUSES: ItemStatus[] = ['active', 'planned', 'damaged', 'removed'];

interface Props {
  value: MapDisplayConfig | null;
  onChange: (config: MapDisplayConfig | null) => void;
  itemTypes: ItemType[];
  /** Org-level config for showing defaults on property page. Omit for org-level editing. */
  orgDefaults?: MapDisplayConfig | null;
}

export default function MapDisplayConfigEditor({ value, onChange, itemTypes, orgDefaults }: Props) {
  const config = value ?? {};
  const isPropertyLevel = orgDefaults !== undefined;

  function getControlValue(key: keyof NonNullable<MapDisplayConfig['controls']>): boolean {
    return config.controls?.[key] ?? (isPropertyLevel ? (orgDefaults?.controls?.[key] ?? true) : true);
  }

  function isControlOverridden(key: keyof NonNullable<MapDisplayConfig['controls']>): boolean {
    if (!isPropertyLevel) return false;
    return config.controls?.[key] !== undefined;
  }

  function getOrgDefault(key: keyof NonNullable<MapDisplayConfig['controls']>): boolean {
    return orgDefaults?.controls?.[key] ?? true;
  }

  function setControl(key: keyof NonNullable<MapDisplayConfig['controls']>, val: boolean) {
    const newControls = { ...config.controls, [key]: val };
    onChange({ ...config, controls: newControls });
  }

  function resetControl(key: keyof NonNullable<MapDisplayConfig['controls']>) {
    if (!config.controls) return;
    const newControls = { ...config.controls };
    delete newControls[key];
    const hasKeys = Object.keys(newControls).length > 0;
    onChange({ ...config, controls: hasKeys ? newControls : undefined });
  }

  function getLegendStatuses(): string[] | undefined {
    return config.legend?.statuses ?? (isPropertyLevel ? orgDefaults?.legend?.statuses : undefined);
  }

  function getLegendItemTypeIds(): string[] | undefined {
    return config.legend?.itemTypeIds ?? (isPropertyLevel ? orgDefaults?.legend?.itemTypeIds : undefined);
  }

  function setLegendStatuses(statuses: string[] | undefined) {
    const newLegend = { ...config.legend, statuses };
    if (!statuses) delete newLegend.statuses;
    const hasKeys = Object.keys(newLegend).length > 0;
    onChange({ ...config, legend: hasKeys ? newLegend : undefined });
  }

  function setLegendItemTypeIds(ids: string[] | undefined) {
    const newLegend = { ...config.legend, itemTypeIds: ids };
    if (!ids) delete newLegend.itemTypeIds;
    const hasKeys = Object.keys(newLegend).length > 0;
    onChange({ ...config, legend: hasKeys ? newLegend : undefined });
  }

  function toggleStatus(status: string) {
    const current = getLegendStatuses();
    if (!current) {
      // Currently showing all — toggling one off means explicitly list the rest
      setLegendStatuses(ALL_STATUSES.filter((s) => s !== status));
    } else if (current.includes(status)) {
      const next = current.filter((s) => s !== status);
      setLegendStatuses(next.length > 0 ? next : undefined);
    } else {
      setLegendStatuses([...current, status]);
    }
  }

  function toggleItemType(typeId: string) {
    const current = getLegendItemTypeIds();
    if (!current) {
      // Currently showing all — toggling one off means explicitly list the rest
      setLegendItemTypeIds(itemTypes.filter((t) => t.id !== typeId).map((t) => t.id));
    } else if (current.includes(typeId)) {
      const next = current.filter((id) => id !== typeId);
      setLegendItemTypeIds(next.length > 0 ? next : undefined);
    } else {
      setLegendItemTypeIds([...current, typeId]);
    }
  }

  function isStatusChecked(status: string): boolean {
    const statuses = getLegendStatuses();
    return !statuses || statuses.includes(status);
  }

  function isItemTypeChecked(typeId: string): boolean {
    const ids = getLegendItemTypeIds();
    return !ids || ids.includes(typeId);
  }

  const legendEnabled = getControlValue('legend');

  return (
    <div className="space-y-2">
      {CONTROLS.map((ctrl) => {
        const enabled = getControlValue(ctrl.key);
        const overridden = isControlOverridden(ctrl.key);
        const orgDefault = isPropertyLevel ? getOrgDefault(ctrl.key) : null;

        return (
          <div key={ctrl.key}>
            <div
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                overridden
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-sage-light/30 border-sage-light'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">{ctrl.icon}</span>
                <div>
                  <div className="text-sm font-medium text-forest-dark">{ctrl.label}</div>
                  {isPropertyLevel && (
                    <div className={`text-[10px] ${overridden ? 'text-amber-700' : 'text-sage'}`}>
                      Org default: {orgDefault ? 'On' : 'Off'}
                      {overridden && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            onClick={() => resetControl(ctrl.key)}
                            className="underline hover:no-underline"
                          >
                            Reset
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {!isPropertyLevel && (
                    <div className="text-[10px] text-sage">{ctrl.description}</div>
                  )}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setControl(ctrl.key, !enabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  enabled ? 'bg-forest' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                    enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Legend detail section — only shown when legend control card is expanded */}
            {ctrl.key === 'legend' && legendEnabled && (
              <div className="ml-3 mt-2 p-3 rounded-lg border border-sage-light bg-white space-y-3">
                <div>
                  <div className="text-xs font-medium text-sage uppercase tracking-wider mb-2">Statuses</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_STATUSES.map((status) => {
                      const checked = isStatusChecked(status);
                      return (
                        <label
                          key={status}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer border transition-colors ${
                            checked
                              ? 'bg-green-50 border-green-300 text-forest-dark'
                              : 'bg-gray-50 border-gray-200 text-gray-400 line-through'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStatus(status)}
                            className="sr-only"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: statusColors[status as ItemStatus] }}
                          />
                          {statusLabels[status as ItemStatus]}
                        </label>
                      );
                    })}
                  </div>
                </div>
                {itemTypes.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-sage uppercase tracking-wider mb-2">Item Types</div>
                    <div className="flex flex-wrap gap-1.5">
                      {itemTypes.map((type) => {
                        const checked = isItemTypeChecked(type.id);
                        return (
                          <label
                            key={type.id}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer border transition-colors ${
                              checked
                                ? 'bg-green-50 border-green-300 text-forest-dark'
                                : 'bg-gray-50 border-gray-200 text-gray-400 line-through'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleItemType(type.id)}
                              className="sr-only"
                            />
                            <span>{type.icon}</span>
                            {type.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {isPropertyLevel && (config.legend?.statuses || config.legend?.itemTypeIds) && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...config, legend: undefined })}
                    className="text-[10px] text-amber-700 underline hover:no-underline"
                  >
                    Reset legend to org default
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper && npx tsc --noEmit 2>&1 | tail -10`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/MapDisplayConfigEditor.tsx
git commit -m "feat: add MapDisplayConfigEditor admin component"
```

---

### Task 6: Add Map Display Config to Org Settings

**Files:**
- Modify: `src/app/admin/settings/actions.ts`
- Modify: `src/app/admin/settings/page.tsx`

- [ ] **Step 1: Add map_display_config to org settings actions**

In `src/app/admin/settings/actions.ts`:

1. Add to the `OrgSettings` interface:

```typescript
  map_display_config: unknown | null;
```

2. Add `map_display_config` to the select query in `getOrgSettings` (line 28):

Change:
```typescript
    .select('id, name, slug, tagline, pwa_name, logo_url, favicon_url, theme, subscription_tier, subscription_status')
```
To:
```typescript
    .select('id, name, slug, tagline, pwa_name, logo_url, favicon_url, theme, subscription_tier, subscription_status, map_display_config')
```

3. Add `map_display_config` to the return data object:

```typescript
      map_display_config: data.map_display_config,
```

4. Add to the `OrgSettingsUpdates` interface:

```typescript
  map_display_config?: unknown;
```

5. Add to the payload building in `updateOrgSettings`:

```typescript
  if (updates.map_display_config !== undefined) payload.map_display_config = updates.map_display_config;
```

- [ ] **Step 2: Add Map Display section to org settings page**

In `src/app/admin/settings/page.tsx`:

1. Add imports at top:

```typescript
import MapDisplayConfigEditor from '@/components/admin/MapDisplayConfigEditor';
import type { MapDisplayConfig } from '@/lib/config/map-display';
import type { ItemType } from '@/lib/types';
```

2. Add state for map display config and item types (after existing state declarations around line 60):

```typescript
  const [mapDisplayConfig, setMapDisplayConfig] = useState<MapDisplayConfig | null>(null);
```

3. Add a query to fetch item types for the legend editor (after the existing settings query):

```typescript
  const { data: itemTypes = [] } = useQuery({
    queryKey: ['admin', 'itemTypes'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: org } = await supabase.from('orgs').select('id').limit(1).single();
      if (!org) return [];
      const { data } = await supabase.from('item_types').select('*').eq('org_id', org.id).order('name');
      return (data ?? []) as ItemType[];
    },
  });
```

4. Add import for createClient at top (if not already):

```typescript
import { createClient } from '@/lib/supabase/client';
```

5. Initialize mapDisplayConfig from settings (add to the existing `useEffect` that initializes form state, after `setThemeJson(...)`):

```typescript
      setMapDisplayConfig(settings.map_display_config as MapDisplayConfig | null);
```

6. Include mapDisplayConfig in the save handler (in `handleSave`, add to the `updates` object building, before `setSaving(true)`):

```typescript
    const currentMapConfig = JSON.stringify(settings?.map_display_config ?? null);
    const newMapConfig = JSON.stringify(mapDisplayConfig);
    if (newMapConfig !== currentMapConfig) updates.map_display_config = mapDisplayConfig;
```

7. Add the Map Display section in the form, between the Appearance section and the Subscription section:

```tsx
        {/* Map Display section */}
        <section className="card space-y-5">
          <h2 className="font-heading text-lg font-semibold text-forest-dark">
            Map Display
          </h2>
          <p className="text-xs text-sage">
            Configure which controls appear on the map. These defaults apply to all properties unless overridden.
          </p>
          <MapDisplayConfigEditor
            value={mapDisplayConfig}
            onChange={setMapDisplayConfig}
            itemTypes={itemTypes}
          />
        </section>
```

- [ ] **Step 3: Run type check**

Run: `cd /Users/patrick/birdhousemapper && npx tsc --noEmit 2>&1 | tail -10`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/settings/actions.ts src/app/admin/settings/page.tsx
git commit -m "feat: add map display config to org settings admin"
```

---

### Task 7: Add Map Display Config to Property Settings

**Files:**
- Modify: `src/app/admin/properties/[slug]/settings/actions.ts`
- Modify: `src/app/admin/properties/[slug]/settings/page.tsx`

- [ ] **Step 1: Add map_display_config to property settings actions**

In `src/app/admin/properties/[slug]/settings/actions.ts`, add `map_display_config` to `PROPERTY_KEY_TO_COLUMN`:

```typescript
  map_display_config: 'map_display_config',
```

- [ ] **Step 2: Add Map Display section to the Appearance tab**

In `src/app/admin/properties/[slug]/settings/page.tsx`:

1. Add imports at top:

```typescript
import MapDisplayConfigEditor from '@/components/admin/MapDisplayConfigEditor';
import type { MapDisplayConfig } from '@/lib/config/map-display';
import type { ItemType } from '@/lib/types';
```

2. Add a query to fetch item types (inside `SettingsPage`, after the existing `orgId` query):

```typescript
  const { data: itemTypes = [] } = useQuery({
    queryKey: ['admin', 'itemTypes', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const supabase = createClient();
      const { data } = await supabase.from('item_types').select('*').eq('org_id', orgId).order('name');
      return (data ?? []) as ItemType[];
    },
    enabled: !!orgId,
  });
```

3. Add queries for org and property map_display_config (after the itemTypes query):

```typescript
  const { data: orgMapDisplayConfig } = useQuery({
    queryKey: ['admin', 'orgMapDisplayConfig'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: org } = await supabase.from('orgs').select('map_display_config').limit(1).single();
      return (org?.map_display_config as MapDisplayConfig | null) ?? null;
    },
  });

  const { data: propertyMapDisplayConfig, refetch: refetchPropertyConfig } = useQuery({
    queryKey: ['admin', 'property', slug, 'mapDisplayConfig'],
    queryFn: async () => {
      if (!propertyId) return null;
      const supabase = createClient();
      const { data } = await supabase.from('properties').select('map_display_config').eq('id', propertyId).single();
      return (data?.map_display_config as MapDisplayConfig | null) ?? null;
    },
    enabled: !!propertyId,
  });
```

4. Add state for the editor (after existing state declarations):

```typescript
  const [mapDisplayConfig, setMapDisplayConfig] = useState<MapDisplayConfig | null>(null);
  const [mapDisplayInitialized, setMapDisplayInitialized] = useState(false);
```

5. Sync the property config into local state:

```typescript
  useEffect(() => {
    if (propertyMapDisplayConfig !== undefined && !mapDisplayInitialized) {
      setMapDisplayConfig(propertyMapDisplayConfig);
      setMapDisplayInitialized(true);
    }
  }, [propertyMapDisplayConfig, mapDisplayInitialized]);
```

6. In the `{activeTab === 'appearance' && (...)}` block, add the Map Display section after the existing `<AppearanceTab>` and logo uploader, but still inside the `<div className="space-y-8">`:

```tsx
          <section className="card space-y-5">
            <h2 className="font-heading text-lg font-semibold text-forest-dark">
              Map Display
            </h2>
            <MapDisplayConfigEditor
              value={mapDisplayConfig}
              onChange={setMapDisplayConfig}
              itemTypes={itemTypes}
              orgDefaults={orgMapDisplayConfig}
            />
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                await handleSave([{ key: 'map_display_config', value: mapDisplayConfig }]);
                refetchPropertyConfig();
              }}
              className="btn-primary"
            >
              {saving ? 'Saving...' : 'Save Map Display'}
            </button>
          </section>
```

- [ ] **Step 3: Run type check**

Run: `cd /Users/patrick/birdhousemapper && npx tsc --noEmit 2>&1 | tail -10`
Expected: No type errors.

- [ ] **Step 4: Run full test suite**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run 2>&1 | tail -15`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/properties/[slug]/settings/actions.ts src/app/admin/properties/[slug]/settings/page.tsx
git commit -m "feat: add map display config to property settings admin"
```

---

### Task 8: Manual Verification

- [ ] **Step 1: Start dev server and verify**

Run: `cd /Users/patrick/birdhousemapper && npm run dev`

Verify manually:
1. Visit org settings (`/admin/settings`) — see new Map Display section with 5 toggle cards
2. Toggle legend off → save → visit map page → legend should be hidden
3. Toggle back on, expand legend config, uncheck a status → save → legend should filter
4. Visit property settings (`/admin/properties/[slug]/settings`) → Appearance tab → see Map Display with "Org default" labels
5. Override a control at property level → see yellow highlight + "Reset" link
6. Click Reset → value reverts to org default

- [ ] **Step 2: Run build to check for issues**

Run: `cd /Users/patrick/birdhousemapper && npm run build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 3: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: map display config cleanup"
```
