# Bounding Feature Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a wizard that lets users find geodata features from org-wide layers that overlap a property's bounding area, preview them on a map, select features, and create a new layer from the selection.

**Architecture:** Full-page 4-step wizard at `/admin/properties/[slug]/geo-layers/discover`. Server-side bbox filtering narrows candidates, client-side Turf.js does precise intersection. Selected features are extracted into a new `geo_layers` record with `source: 'discovered'` and per-feature provenance in GeoJSON properties. A `leaflet-draw` control handles the bounding area definition.

**Tech Stack:** Next.js 14, Supabase, React-Leaflet, leaflet-draw, Turf.js, Tailwind CSS, Vitest

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/023_geo_layer_source_discovered.sql` | Add `'discovered'` to source CHECK constraint |
| `src/lib/geo/discovery.ts` | Pure spatial helpers: bbox overlap, feature intersection, provenance injection |
| `src/__tests__/geo/discovery.test.ts` | Unit tests for discovery helpers |
| `src/app/admin/properties/[slug]/geo-layers/discover/actions.ts` | Server actions: `findCandidateLayers`, `createDiscoveredLayer` |
| `src/app/admin/properties/[slug]/geo-layers/discover/__tests__/actions.test.ts` | Server action tests |
| `src/components/geo/DrawAreaControl.tsx` | Leaflet draw rectangle/polygon control |
| `src/components/geo/FeatureListPanel.tsx` | Grouped feature list with bidirectional selection |
| `src/components/geo/DiscoverWizard.tsx` | 4-step wizard orchestrator (client component) |
| `src/app/admin/properties/[slug]/geo-layers/discover/page.tsx` | Page route mounting the wizard |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/geo/types.ts` | Add `DiscoveredFeature`, `FeatureGroup`, `GeoLayerSource` update |
| `src/lib/geo/constants.ts` | Add `DISCOVERY_COLOR_PALETTE` and `MAX_CANDIDATE_LAYERS` |
| `src/app/admin/geo-layers/page.tsx` | Add "Assign by Area" action on layer rows |
| `src/app/admin/properties/[slug]/layout.tsx` | Add "Geo Layers" nav item |
| `package.json` | Add `leaflet-draw` + `@types/leaflet-draw` dependencies |

---

### Task 1: Install leaflet-draw and add types/constants

**Files:**
- Modify: `package.json`
- Modify: `src/lib/geo/types.ts:1-71`
- Modify: `src/lib/geo/constants.ts:1-2`

- [ ] **Step 1: Install leaflet-draw**

Run:
```bash
npm install leaflet-draw @types/leaflet-draw
```

- [ ] **Step 2: Add discovery types to `src/lib/geo/types.ts`**

Add after line 70 (after `GeoValidationResult`):

```typescript
/** A single feature tagged with its source layer info, used during discovery */
export interface DiscoveredFeature {
  feature: GeoJSON.Feature;
  sourceLayerId: string;
  sourceLayerName: string;
  sourceLayerColor: string;
}

/** A group of discovered features from a single source layer */
export interface FeatureGroup {
  layerId: string;
  layerName: string;
  layerColor: string;
  sourceFormat: GeoSourceFormat;
  features: DiscoveredFeature[];
}
```

Also update the `GeoLayerSource` type on line 6:

```typescript
export type GeoLayerSource = 'manual' | 'ai' | 'discovered';
```

- [ ] **Step 3: Update `CreateGeoLayerInput` in `src/app/admin/geo-layers/actions.ts`**

On line 20, update the `source` type:

```typescript
  source?: 'manual' | 'ai' | 'discovered';
```

- [ ] **Step 4: Add discovery constants to `src/lib/geo/constants.ts`**

Append to existing file:

```typescript
/** Color palette for distinguishing source layers during discovery */
export const DISCOVERY_COLOR_PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // amber
];

/** Maximum number of candidate layers to fetch during discovery */
export const MAX_CANDIDATE_LAYERS = 20;

/** Feature count thresholds for warnings */
export const CANDIDATE_FEATURE_WARNING = 5000;
export const SELECTION_FEATURE_WARNING = 1000;
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to the new types.

- [ ] **Step 6: Commit**

```bash
git add src/lib/geo/types.ts src/lib/geo/constants.ts src/app/admin/geo-layers/actions.ts package.json package-lock.json
git commit -m "feat(discovery): add leaflet-draw, discovery types, and constants (#209)"
```

---

### Task 2: Database migration for 'discovered' source value

**Files:**
- Create: `supabase/migrations/023_geo_layer_source_discovered.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 023_geo_layer_source_discovered.sql — Allow 'discovered' as a geo_layers source value

-- Drop the existing CHECK constraint and re-add with 'discovered' included.
-- The constraint was added in 022_geo_layer_status.sql as an inline CHECK on the column.
-- PostgreSQL names inline CHECK constraints as "<table>_<column>_check".
ALTER TABLE geo_layers DROP CONSTRAINT IF EXISTS geo_layers_source_check;
ALTER TABLE geo_layers ADD CONSTRAINT geo_layers_source_check CHECK (source IN ('manual', 'ai', 'discovered'));
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` (or `npx supabase migration up` depending on local setup)
Expected: Migration applies without error.

- [ ] **Step 3: Verify the constraint**

Run:
```bash
npx supabase db reset --dry-run 2>&1 | tail -5
```
Expected: No migration errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/023_geo_layer_source_discovered.sql
git commit -m "migration: add 'discovered' to geo_layers source CHECK constraint (#209)"
```

---

### Task 3: Spatial discovery helpers (TDD)

**Files:**
- Create: `src/lib/geo/discovery.ts`
- Create: `src/__tests__/geo/discovery.test.ts`

- [ ] **Step 1: Write failing tests for `bboxOverlaps`**

Create `src/__tests__/geo/discovery.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { bboxOverlaps, intersectFeaturesWithArea, injectProvenance } from '@/lib/geo/discovery';
import type { Feature, FeatureCollection, Polygon } from 'geojson';

// Helper: create a simple polygon from bbox [minLng, minLat, maxLng, maxLat]
function bboxToPolygon(bbox: [number, number, number, number]): Feature<Polygon> {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ]],
    },
  };
}

function makeFC(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

describe('bboxOverlaps', () => {
  it('returns true for overlapping bboxes', () => {
    const a: [number, number, number, number] = [-71, 43, -70, 44];
    const b: [number, number, number, number] = [-70.5, 43.5, -69.5, 44.5];
    expect(bboxOverlaps(a, b)).toBe(true);
  });

  it('returns false for non-overlapping bboxes', () => {
    const a: [number, number, number, number] = [-71, 43, -70, 44];
    const b: [number, number, number, number] = [-69, 45, -68, 46];
    expect(bboxOverlaps(a, b)).toBe(false);
  });

  it('returns true for touching bboxes (shared edge)', () => {
    const a: [number, number, number, number] = [-71, 43, -70, 44];
    const b: [number, number, number, number] = [-70, 44, -69, 45];
    expect(bboxOverlaps(a, b)).toBe(true);
  });

  it('returns true when one bbox is fully inside the other', () => {
    const outer: [number, number, number, number] = [-72, 42, -68, 46];
    const inner: [number, number, number, number] = [-71, 43, -69, 45];
    expect(bboxOverlaps(outer, inner)).toBe(true);
    expect(bboxOverlaps(inner, outer)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/geo/discovery.test.ts`
Expected: FAIL — module `@/lib/geo/discovery` not found.

- [ ] **Step 3: Implement `bboxOverlaps` in `src/lib/geo/discovery.ts`**

```typescript
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import intersect from '@turf/intersect';
import { featureCollection } from '@turf/helpers';

type Bbox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

/**
 * Check if two bounding boxes overlap.
 * Bbox format: [minLng, minLat, maxLng, maxLat]
 */
export function bboxOverlaps(a: Bbox, b: Bbox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
```

- [ ] **Step 4: Run test to verify `bboxOverlaps` passes**

Run: `npx vitest run src/__tests__/geo/discovery.test.ts`
Expected: All `bboxOverlaps` tests pass.

- [ ] **Step 5: Write failing tests for `intersectFeaturesWithArea`**

Append to `src/__tests__/geo/discovery.test.ts`:

```typescript
describe('intersectFeaturesWithArea', () => {
  const searchArea = bboxToPolygon([-71, 43, -70, 44]);

  it('includes points inside the search area', () => {
    const point: Feature = {
      type: 'Feature',
      properties: { name: 'Inside Point' },
      geometry: { type: 'Point', coordinates: [-70.5, 43.5] },
    };
    const fc = makeFC([point]);
    const result = intersectFeaturesWithArea(fc, searchArea);
    expect(result).toHaveLength(1);
    expect(result[0].properties?.name).toBe('Inside Point');
  });

  it('excludes points outside the search area', () => {
    const point: Feature = {
      type: 'Feature',
      properties: { name: 'Outside Point' },
      geometry: { type: 'Point', coordinates: [-68, 46] },
    };
    const fc = makeFC([point]);
    const result = intersectFeaturesWithArea(fc, searchArea);
    expect(result).toHaveLength(0);
  });

  it('clips polygons to the search area', () => {
    // Polygon that partially overlaps the search area
    const polygon: Feature<Polygon> = {
      type: 'Feature',
      properties: { name: 'Partial Polygon' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-70.5, 43.5],
          [-69.5, 43.5],
          [-69.5, 44.5],
          [-70.5, 44.5],
          [-70.5, 43.5],
        ]],
      },
    };
    const fc = makeFC([polygon]);
    const result = intersectFeaturesWithArea(fc, searchArea);
    expect(result).toHaveLength(1);
    expect(result[0].properties?.name).toBe('Partial Polygon');
  });

  it('excludes polygons fully outside the search area', () => {
    const polygon: Feature<Polygon> = {
      type: 'Feature',
      properties: { name: 'Far Away' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-60, 50], [-59, 50], [-59, 51], [-60, 51], [-60, 50]]],
      },
    };
    const fc = makeFC([polygon]);
    const result = intersectFeaturesWithArea(fc, searchArea);
    expect(result).toHaveLength(0);
  });

  it('includes lines with at least one vertex inside the search area', () => {
    const line: Feature = {
      type: 'Feature',
      properties: { name: 'Crossing Line' },
      geometry: {
        type: 'LineString',
        coordinates: [[-70.5, 43.5], [-69.5, 44.5]],
      },
    };
    const fc = makeFC([line]);
    const result = intersectFeaturesWithArea(fc, searchArea);
    expect(result).toHaveLength(1);
  });

  it('handles mixed geometry types', () => {
    const inside: Feature = {
      type: 'Feature',
      properties: { name: 'In' },
      geometry: { type: 'Point', coordinates: [-70.5, 43.5] },
    };
    const outside: Feature = {
      type: 'Feature',
      properties: { name: 'Out' },
      geometry: { type: 'Point', coordinates: [-68, 46] },
    };
    const fc = makeFC([inside, outside]);
    const result = intersectFeaturesWithArea(fc, searchArea);
    expect(result).toHaveLength(1);
    expect(result[0].properties?.name).toBe('In');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/__tests__/geo/discovery.test.ts`
Expected: FAIL — `intersectFeaturesWithArea` is not exported.

- [ ] **Step 7: Implement `intersectFeaturesWithArea`**

Append to `src/lib/geo/discovery.ts`:

```typescript
/**
 * Return features from `layer` that intersect the search area polygon.
 * Points: point-in-polygon. Polygons: turf intersect (clips). Lines: vertex-in-polygon.
 * Follows the same pattern as clipLayerToBoundary in spatial.ts.
 */
export function intersectFeaturesWithArea(
  layer: FeatureCollection,
  searchArea: Feature<Polygon | MultiPolygon>,
): Feature[] {
  const result: Feature[] = [];

  for (const feature of layer.features) {
    const geomType = feature.geometry.type;

    if (geomType === 'Point') {
      if (booleanPointInPolygon(feature.geometry.coordinates, searchArea)) {
        result.push(feature);
      }
    } else if (geomType === 'MultiPoint') {
      const coords = feature.geometry.coordinates;
      if (coords.some((c: number[]) => booleanPointInPolygon(c, searchArea))) {
        result.push(feature);
      }
    } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
      const clipped = intersect(
        featureCollection([feature as Feature<Polygon | MultiPolygon>, searchArea])
      );
      if (clipped) {
        clipped.properties = { ...feature.properties };
        result.push(clipped);
      }
    } else if (geomType === 'LineString') {
      const coords = feature.geometry.coordinates;
      if (coords.some((c: number[]) => booleanPointInPolygon(c, searchArea))) {
        result.push(feature);
      }
    } else if (geomType === 'MultiLineString') {
      const coords = feature.geometry.coordinates.flat();
      if (coords.some((c: number[]) => booleanPointInPolygon(c, searchArea))) {
        result.push(feature);
      }
    }
  }

  return result;
}
```

- [ ] **Step 8: Run test to verify `intersectFeaturesWithArea` passes**

Run: `npx vitest run src/__tests__/geo/discovery.test.ts`
Expected: All tests pass.

- [ ] **Step 9: Write failing tests for `injectProvenance`**

Append to `src/__tests__/geo/discovery.test.ts`:

```typescript
describe('injectProvenance', () => {
  it('adds _source_layer_id and _source_layer_name to feature properties', () => {
    const feature: Feature = {
      type: 'Feature',
      properties: { name: 'Trail A' },
      geometry: { type: 'Point', coordinates: [-70.5, 43.5] },
    };

    const result = injectProvenance(feature, 'layer-123', 'Parks Department');
    expect(result.properties?._source_layer_id).toBe('layer-123');
    expect(result.properties?._source_layer_name).toBe('Parks Department');
    // Original properties preserved
    expect(result.properties?.name).toBe('Trail A');
  });

  it('does not mutate the original feature', () => {
    const feature: Feature = {
      type: 'Feature',
      properties: { name: 'Original' },
      geometry: { type: 'Point', coordinates: [-70.5, 43.5] },
    };

    const result = injectProvenance(feature, 'layer-1', 'Source');
    expect(feature.properties?._source_layer_id).toBeUndefined();
    expect(result).not.toBe(feature);
  });

  it('handles features with null properties', () => {
    const feature: Feature = {
      type: 'Feature',
      properties: null,
      geometry: { type: 'Point', coordinates: [-70.5, 43.5] },
    };

    const result = injectProvenance(feature, 'layer-1', 'Source');
    expect(result.properties?._source_layer_id).toBe('layer-1');
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx vitest run src/__tests__/geo/discovery.test.ts`
Expected: FAIL — `injectProvenance` is not exported.

- [ ] **Step 11: Implement `injectProvenance`**

Append to `src/lib/geo/discovery.ts`:

```typescript
/**
 * Return a copy of the feature with source provenance injected into properties.
 * Does not mutate the original.
 */
export function injectProvenance(
  feature: Feature,
  sourceLayerId: string,
  sourceLayerName: string,
): Feature {
  return {
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      _source_layer_id: sourceLayerId,
      _source_layer_name: sourceLayerName,
    },
  };
}
```

- [ ] **Step 12: Run all tests to verify everything passes**

Run: `npx vitest run src/__tests__/geo/discovery.test.ts`
Expected: All tests pass (bboxOverlaps, intersectFeaturesWithArea, injectProvenance).

- [ ] **Step 13: Commit**

```bash
git add src/lib/geo/discovery.ts src/__tests__/geo/discovery.test.ts
git commit -m "feat(discovery): add spatial helpers — bboxOverlaps, intersectFeaturesWithArea, injectProvenance (#209)"
```

---

### Task 4: Server actions — findCandidateLayers and createDiscoveredLayer (TDD)

**Files:**
- Create: `src/app/admin/properties/[slug]/geo-layers/discover/actions.ts`
- Create: `src/app/admin/properties/[slug]/geo-layers/discover/__tests__/actions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/admin/properties/[slug]/geo-layers/discover/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeatureCollection } from 'geojson';

// --- Supabase mock setup (matches existing pattern from geo-layers/__tests__/actions.test.ts) ---

let mockUser: any = { id: 'user-1' };
const mockFrom = vi.fn();

function mockQueryResult(resultFn: () => any) {
  const obj: any = {
    eq: vi.fn(() => obj),
    neq: vi.fn(() => obj),
    in: vi.fn(() => obj),
    not: vi.fn(() => obj),
    select: vi.fn(() => obj),
    insert: vi.fn(() => obj),
    order: vi.fn(() => Promise.resolve(resultFn())),
    single: vi.fn(() => Promise.resolve(resultFn())),
    then: (resolve: any) => Promise.resolve(resultFn()).then(resolve),
  };
  return obj;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: mockUser } }) },
    from: mockFrom,
  }),
  createServiceClient: () => ({ from: mockFrom }),
}));

const sampleFC: FeatureCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: 'Test', _source_layer_id: 'src-1', _source_layer_name: 'Source Layer' },
    geometry: { type: 'Point', coordinates: [-70.5, 43.5] },
  }],
};

describe('findCandidateLayers', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    vi.clearAllMocks();
  });

  it('rejects unauthenticated users', async () => {
    mockUser = null;
    const { findCandidateLayers } = await import('../actions');
    const result = await findCandidateLayers('org-1', 'prop-1', [-71, 43, -70, 44]);
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('returns layers on success', async () => {
    const layers = [
      { id: 'layer-1', name: 'Test Layer', bbox: [-71, 43, -70, 44], feature_count: 5 },
    ];

    // Mock geo_layers query
    mockFrom.mockImplementation((table: string) => {
      if (table === 'geo_layer_properties') {
        return mockQueryResult(() => ({ data: [{ geo_layer_id: 'already-assigned' }], error: null }));
      }
      if (table === 'geo_layers') {
        return mockQueryResult(() => ({ data: layers, error: null }));
      }
      return mockQueryResult(() => ({ data: [], error: null }));
    });

    const { findCandidateLayers } = await import('../actions');
    const result = await findCandidateLayers('org-1', 'prop-1', [-71, 43, -70, 44]);
    expect('success' in result && result.success).toBe(true);
  });
});

describe('createDiscoveredLayer', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    vi.clearAllMocks();
  });

  it('rejects unauthenticated users', async () => {
    mockUser = null;
    const { createDiscoveredLayer } = await import('../actions');
    const result = await createDiscoveredLayer({
      orgId: 'org-1',
      propertyId: 'prop-1',
      name: 'Discovered Layer',
      features: sampleFC.features,
    });
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('creates a layer and assigns to property on success', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'geo_layers') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { id: 'new-layer-id' }, error: null })),
            })),
          })),
        };
      }
      if (table === 'geo_layer_properties') {
        return {
          insert: vi.fn(() => Promise.resolve({ error: null })),
        };
      }
      return mockQueryResult(() => ({ data: null, error: null }));
    });

    const { createDiscoveredLayer } = await import('../actions');
    const result = await createDiscoveredLayer({
      orgId: 'org-1',
      propertyId: 'prop-1',
      name: 'Discovered',
      features: sampleFC.features,
    });
    expect('success' in result && result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/admin/properties/\\[slug\\]/geo-layers/discover/__tests__/actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement server actions**

Create `src/app/admin/properties/[slug]/geo-layers/discover/actions.ts`:

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import type { GeoLayer, GeoLayerSummary } from '@/lib/geo/types';
import type { Feature, FeatureCollection } from 'geojson';
import { MAX_CANDIDATE_LAYERS } from '@/lib/geo/constants';

type Bbox = [number, number, number, number];

/**
 * Find org layers whose bbox overlaps the search area, excluding layers already assigned to the property.
 * Returns full GeoLayer records (including geojson) for client-side intersection.
 */
export async function findCandidateLayers(
  orgId: string,
  propertyId: string,
  searchBbox: Bbox,
): Promise<{ success: true; layers: GeoLayer[] } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Get IDs of layers already assigned to this property
  const { data: existing } = await supabase
    .from('geo_layer_properties')
    .select('geo_layer_id')
    .eq('property_id', propertyId);

  const excludeIds = (existing ?? []).map((r: { geo_layer_id: string }) => r.geo_layer_id);

  // Fetch all org layers (we filter by bbox client-side since JSONB bbox isn't indexable via SQL operators easily)
  // Limit to a reasonable count
  let query = supabase
    .from('geo_layers')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: allLayers, error } = await query;
  if (error) return { error: error.message };

  // Filter by bbox overlap and exclude already-assigned, then limit
  const candidates = (allLayers as GeoLayer[])
    .filter((layer) => {
      if (!layer.bbox) return false;
      if (excludeIds.includes(layer.id)) return false;
      // Bbox overlap check
      return (
        layer.bbox[0] <= searchBbox[2] &&
        layer.bbox[2] >= searchBbox[0] &&
        layer.bbox[1] <= searchBbox[3] &&
        layer.bbox[3] >= searchBbox[1]
      );
    })
    .slice(0, MAX_CANDIDATE_LAYERS);

  return { success: true, layers: candidates };
}

interface CreateDiscoveredLayerInput {
  orgId: string;
  propertyId: string;
  name: string;
  features: Feature[];
}

/**
 * Create a new geo_layers record from selected features and assign it to the property.
 * Features should already have _source_layer_id/_source_layer_name in their properties.
 */
export async function createDiscoveredLayer(
  input: CreateDiscoveredLayerInput,
): Promise<{ success: true; layerId: string } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const fc: FeatureCollection = {
    type: 'FeatureCollection',
    features: input.features,
  };

  // Compute bbox from features
  const { default: turfBbox } = await import('@turf/bbox');
  const bbox = turfBbox(fc) as Bbox;

  // Collect unique source formats from provenance
  const sourceFormats = new Set(
    input.features
      .map((f) => f.properties?._source_layer_name)
      .filter(Boolean)
  );

  const { data, error: insertError } = await supabase
    .from('geo_layers')
    .insert({
      org_id: input.orgId,
      name: input.name,
      description: `Discovered from ${sourceFormats.size} source layer(s)`,
      color: '#3b82f6',
      opacity: 0.6,
      source_format: 'geojson',
      source_filename: 'discovered',
      geojson: fc,
      feature_count: input.features.length,
      bbox,
      is_property_boundary: false,
      created_by: user.id,
      status: 'published',
      source: 'discovered',
    })
    .select('id')
    .single();

  if (insertError) return { error: insertError.message };

  // Assign to property
  const { error: assignError } = await supabase
    .from('geo_layer_properties')
    .insert({
      geo_layer_id: data.id,
      property_id: input.propertyId,
      org_id: input.orgId,
      visible_default: true,
    });

  if (assignError) return { error: assignError.message };

  return { success: true, layerId: data.id };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/admin/properties/\\[slug\\]/geo-layers/discover/__tests__/actions.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/properties/\[slug\]/geo-layers/discover/actions.ts src/app/admin/properties/\[slug\]/geo-layers/discover/__tests__/actions.test.ts
git commit -m "feat(discovery): add findCandidateLayers and createDiscoveredLayer server actions (#209)"
```

---

### Task 5: DrawAreaControl component

**Files:**
- Create: `src/components/geo/DrawAreaControl.tsx`

This component integrates `leaflet-draw` into a `react-leaflet` map to let users draw a rectangle or polygon.

- [ ] **Step 1: Create `src/components/geo/DrawAreaControl.tsx`**

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import type { Feature, Polygon } from 'geojson';

interface DrawAreaControlProps {
  /** Called when user completes drawing a shape */
  onAreaDrawn: (area: Feature<Polygon>) => void;
  /** If true, show polygon tool in addition to rectangle */
  allowPolygon?: boolean;
}

export default function DrawAreaControl({ onAreaDrawn, allowPolygon = false }: DrawAreaControlProps) {
  const map = useMap();
  const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const controlRef = useRef<L.Control.Draw | null>(null);

  useEffect(() => {
    const drawnItems = drawnItemsRef.current;
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        rectangle: {
          shapeOptions: {
            color: '#6b7280',
            weight: 2,
            fillOpacity: 0.1,
            dashArray: '8, 6',
          },
        },
        polygon: allowPolygon ? {
          shapeOptions: {
            color: '#6b7280',
            weight: 2,
            fillOpacity: 0.1,
            dashArray: '8, 6',
          },
        } : false,
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });

    controlRef.current = drawControl;
    map.addControl(drawControl);

    const handleCreated = (e: any) => {
      drawnItems.clearLayers();
      const layer = e.layer;
      drawnItems.addLayer(layer);
      const geojson = layer.toGeoJSON() as Feature<Polygon>;
      onAreaDrawn(geojson);
    };

    const handleEdited = (e: any) => {
      const layers = e.layers;
      layers.eachLayer((layer: any) => {
        const geojson = layer.toGeoJSON() as Feature<Polygon>;
        onAreaDrawn(geojson);
      });
    };

    const handleDeleted = () => {
      // When all drawn shapes are removed, pass a signal to clear
      if (drawnItems.getLayers().length === 0) {
        onAreaDrawn(null as any);
      }
    };

    map.on(L.Draw.Event.CREATED, handleCreated);
    map.on(L.Draw.Event.EDITED, handleEdited);
    map.on(L.Draw.Event.DELETED, handleDeleted);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.off(L.Draw.Event.EDITED, handleEdited);
      map.off(L.Draw.Event.DELETED, handleDeleted);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, onAreaDrawn, allowPolygon]);

  return null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors. (leaflet-draw types should resolve from the installed `@types/leaflet-draw`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/geo/DrawAreaControl.tsx
git commit -m "feat(discovery): add DrawAreaControl component for leaflet-draw integration (#209)"
```

---

### Task 6: FeatureListPanel component

**Files:**
- Create: `src/components/geo/FeatureListPanel.tsx`

- [ ] **Step 1: Create `src/components/geo/FeatureListPanel.tsx`**

```typescript
'use client';

import { useState } from 'react';
import type { FeatureGroup, DiscoveredFeature } from '@/lib/geo/types';

interface FeatureListPanelProps {
  groups: FeatureGroup[];
  selectedIds: Set<string>;
  onToggleFeature: (featureKey: string) => void;
  onToggleGroup: (layerId: string, selectAll: boolean) => void;
}

/** Stable key for a discovered feature: sourceLayerId + feature index within that group */
export function featureKey(layerId: string, index: number): string {
  return `${layerId}::${index}`;
}

function getFeatureName(feature: GeoJSON.Feature, index: number): string {
  const props = feature.properties;
  if (props?.name) return props.name;
  if (props?.NAME) return props.NAME;
  if (props?.title) return props.title;
  return `${feature.geometry.type} #${index + 1}`;
}

function geometryIcon(type: string): string {
  switch (type) {
    case 'Point':
    case 'MultiPoint':
      return '\u25CF'; // ●
    case 'LineString':
    case 'MultiLineString':
      return '\u2500'; // ─
    case 'Polygon':
    case 'MultiPolygon':
      return '\u25A0'; // ■
    default:
      return '\u25CB'; // ○
  }
}

export default function FeatureListPanel({
  groups,
  selectedIds,
  onToggleFeature,
  onToggleGroup,
}: FeatureListPanelProps) {
  const [filter, setFilter] = useState('');
  const totalSelected = selectedIds.size;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-gray-200">
        <div className="text-sm font-medium text-gray-700">
          {totalSelected} feature{totalSelected !== 1 ? 's' : ''} selected
        </div>
        <input
          type="text"
          placeholder="Filter features..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input-field mt-2 text-sm"
        />
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
        {groups.map((group) => {
          const groupKeys = group.features.map((_, i) => featureKey(group.layerId, i));
          const allSelected = groupKeys.every((k) => selectedIds.has(k));
          const someSelected = groupKeys.some((k) => selectedIds.has(k));

          return (
            <div key={group.layerId}>
              {/* Group header — sticky */}
              <div className="sticky top-0 bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center justify-between z-10">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: group.layerColor }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{group.layerName}</div>
                    <div className="text-xs text-gray-500">
                      {group.sourceFormat.toUpperCase()} · {group.features.length} features
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onToggleGroup(group.layerId, !allSelected)}
                  className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap ml-2"
                >
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Feature rows */}
              {group.features.map((df, i) => {
                const key = featureKey(group.layerId, i);
                const name = getFeatureName(df.feature, i);
                const matchesFilter = !filter || name.toLowerCase().includes(filter.toLowerCase());
                if (!matchesFilter) return null;

                const isSelected = selectedIds.has(key);

                return (
                  <label
                    key={key}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-blue-50' : ''
                    }`}
                    style={isSelected ? { borderLeft: `3px solid ${group.layerColor}` } : { borderLeft: '3px solid transparent' }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleFeature(key)}
                      className="w-4 h-4 rounded flex-shrink-0"
                      style={{ accentColor: group.layerColor }}
                    />
                    <span className="text-gray-400 text-xs flex-shrink-0">
                      {geometryIcon(df.feature.geometry.type)}
                    </span>
                    <span className="text-sm text-gray-700 truncate">{name}</span>
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/geo/FeatureListPanel.tsx
git commit -m "feat(discovery): add FeatureListPanel with grouped selection and filtering (#209)"
```

---

### Task 7: DiscoverWizard component (main 4-step wizard)

**Files:**
- Create: `src/components/geo/DiscoverWizard.tsx`

This is the largest component — it orchestrates all four steps. It's a client component using `useState` for wizard state, matching the `ImportFlow` pattern.

- [ ] **Step 1: Create `src/components/geo/DiscoverWizard.tsx`**

```typescript
'use client';

import { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { MapContainer, TileLayer } from 'react-leaflet';
import GeoLayerRenderer from './GeoLayerRenderer';
import PropertyBoundary from './PropertyBoundary';
import FeatureListPanel, { featureKey } from './FeatureListPanel';
import { intersectFeaturesWithArea, injectProvenance } from '@/lib/geo/discovery';
import { findCandidateLayers, createDiscoveredLayer } from '@/app/admin/properties/[slug]/geo-layers/discover/actions';
import { DISCOVERY_COLOR_PALETTE, CANDIDATE_FEATURE_WARNING, SELECTION_FEATURE_WARNING } from '@/lib/geo/constants';
import type { GeoLayer, FeatureGroup, DiscoveredFeature } from '@/lib/geo/types';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import bbox from '@turf/bbox';
import 'leaflet/dist/leaflet.css';

const DrawAreaControl = dynamic(() => import('./DrawAreaControl'), { ssr: false });

type WizardStep = 'define-area' | 'review' | 'select' | 'confirm';
const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'define-area', label: 'Define Area' },
  { key: 'review', label: 'Review Matches' },
  { key: 'select', label: 'Select Features' },
  { key: 'confirm', label: 'Confirm' },
];

interface DiscoverWizardProps {
  orgId: string;
  propertyId: string;
  propertyName: string;
  propertySlug: string;
  boundaryGeoJSON: FeatureCollection | null;
  mapCenter: [number, number];
  mapZoom: number;
}

export default function DiscoverWizard({
  orgId,
  propertyId,
  propertyName,
  propertySlug,
  boundaryGeoJSON,
  mapCenter,
  mapZoom,
}: DiscoverWizardProps) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>('define-area');
  const [searchArea, setSearchArea] = useState<Feature<Polygon | MultiPolygon> | null>(null);
  const [useBoundary, setUseBoundary] = useState(!!boundaryGeoJSON);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Discovery results
  const [featureGroups, setFeatureGroups] = useState<FeatureGroup[]>([]);
  const [totalCandidateFeatures, setTotalCandidateFeatures] = useState(0);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [layerName, setLayerName] = useState(`${propertyName} — Discovered Features`);
  const [submitting, setSubmitting] = useState(false);
  const [createdLayerId, setCreatedLayerId] = useState<string | null>(null);

  // Derive the active search area (boundary or drawn)
  const activeSearchArea = useMemo(() => {
    if (useBoundary && boundaryGeoJSON) {
      const poly = boundaryGeoJSON.features.find(
        (f) => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
      );
      return (poly as Feature<Polygon | MultiPolygon>) ?? null;
    }
    return searchArea;
  }, [useBoundary, boundaryGeoJSON, searchArea]);

  // Map center for the search area
  const searchMapCenter = useMemo<[number, number]>(() => {
    if (activeSearchArea) {
      const b = bbox(activeSearchArea);
      return [(b[1] + b[3]) / 2, (b[0] + b[2]) / 2];
    }
    return mapCenter;
  }, [activeSearchArea, mapCenter]);

  const handleAreaDrawn = useCallback((area: Feature<Polygon> | null) => {
    if (area) {
      setSearchArea(area);
      setUseBoundary(false);
    } else {
      setSearchArea(null);
    }
  }, []);

  // --- Step 2: Find candidates ---
  const handleFindCandidates = useCallback(async () => {
    if (!activeSearchArea) return;
    setLoading(true);
    setError(null);

    const searchBbox = bbox(activeSearchArea) as [number, number, number, number];
    const result = await findCandidateLayers(orgId, propertyId, searchBbox);

    if ('error' in result) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Client-side intersection
    const groups: FeatureGroup[] = [];
    let totalFeatures = 0;

    result.layers.forEach((layer, layerIndex) => {
      const color = DISCOVERY_COLOR_PALETTE[layerIndex % DISCOVERY_COLOR_PALETTE.length];
      const matched = intersectFeaturesWithArea(layer.geojson, activeSearchArea);
      totalFeatures += matched.length;

      if (matched.length > 0) {
        const discoveredFeatures: DiscoveredFeature[] = matched.map((f) => ({
          feature: f,
          sourceLayerId: layer.id,
          sourceLayerName: layer.name,
          sourceLayerColor: color,
        }));

        groups.push({
          layerId: layer.id,
          layerName: layer.name,
          layerColor: color,
          sourceFormat: layer.source_format,
          features: discoveredFeatures,
        });
      }
    });

    setFeatureGroups(groups);
    setTotalCandidateFeatures(totalFeatures);
    setLoading(false);

    if (groups.length > 0) {
      // Auto-select all features
      const allKeys = new Set<string>();
      groups.forEach((g) =>
        g.features.forEach((_, i) => allKeys.add(featureKey(g.layerId, i)))
      );
      setSelectedIds(allKeys);
      setStep('review');
    }
  }, [activeSearchArea, orgId, propertyId]);

  // --- Selection handlers ---
  const toggleFeature = useCallback((key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((layerId: string, selectAll: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const group = featureGroups.find((g) => g.layerId === layerId);
      if (!group) return prev;
      group.features.forEach((_, i) => {
        const key = featureKey(layerId, i);
        if (selectAll) next.add(key);
        else next.delete(key);
      });
      return next;
    });
  }, [featureGroups]);

  // --- Collect selected features ---
  const selectedFeatures = useMemo(() => {
    const features: Feature[] = [];
    featureGroups.forEach((group) => {
      group.features.forEach((df, i) => {
        const key = featureKey(group.layerId, i);
        if (selectedIds.has(key)) {
          features.push(injectProvenance(df.feature, df.sourceLayerId, df.sourceLayerName));
        }
      });
    });
    return features;
  }, [featureGroups, selectedIds]);

  // --- Step 4: Create layer ---
  const handleCreate = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    const result = await createDiscoveredLayer({
      orgId,
      propertyId,
      name: layerName,
      features: selectedFeatures,
    });

    if ('error' in result) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setCreatedLayerId(result.layerId);
    setSubmitting(false);
    setStep('confirm');
  }, [orgId, propertyId, layerName, selectedFeatures]);

  // --- Step indicator ---
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const stepIndicator = (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
              i <= stepIndex
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {i + 1}
          </div>
          <span className={`text-sm hidden md:inline ${i <= stepIndex ? 'text-gray-800' : 'text-gray-400'}`}>
            {s.label}
          </span>
          {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-300" />}
        </div>
      ))}
    </div>
  );

  // =========================
  // STEP 1: Define Area
  // =========================
  if (step === 'define-area') {
    return (
      <div className="max-w-3xl mx-auto p-4">
        {stepIndicator}
        <h2 className="text-lg font-semibold mb-4">Define Search Area</h2>

        {boundaryGeoJSON && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setUseBoundary(true); setSearchArea(null); }}
              className={useBoundary ? 'btn-primary' : 'btn-secondary'}
            >
              Use Property Boundary
            </button>
            <button
              onClick={() => setUseBoundary(false)}
              className={!useBoundary ? 'btn-primary' : 'btn-secondary'}
            >
              Draw Custom Area
            </button>
          </div>
        )}

        {!boundaryGeoJSON && (
          <p className="text-sm text-gray-600 mb-4">
            This property doesn&apos;t have a boundary set. Draw an area to search for features.
          </p>
        )}

        <div className="h-96 rounded-lg overflow-hidden border border-gray-200 mb-4">
          <MapContainer center={searchMapCenter} zoom={mapZoom} className="w-full h-full" zoomControl={true}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {useBoundary && boundaryGeoJSON && (
              <PropertyBoundary geojson={boundaryGeoJSON} />
            )}
            {!useBoundary && (
              <DrawAreaControl onAreaDrawn={handleAreaDrawn} allowPolygon={true} />
            )}
          </MapContainer>
        </div>

        <div className="flex justify-between">
          <a href={`/admin/properties/${propertySlug}/data`} className="btn-secondary">
            Cancel
          </a>
          <button
            onClick={handleFindCandidates}
            className="btn-primary"
            disabled={!activeSearchArea || loading}
          >
            {loading ? 'Searching...' : 'Find Features'}
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
    );
  }

  // =========================
  // STEP 2: Review Matches
  // =========================
  if (step === 'review') {
    if (featureGroups.length === 0) {
      return (
        <div className="max-w-3xl mx-auto p-4">
          {stepIndicator}
          <h2 className="text-lg font-semibold mb-4">No Features Found</h2>
          <p className="text-gray-600 mb-4">No features were found in this area. Try expanding your search area.</p>
          <button onClick={() => setStep('define-area')} className="btn-secondary">Back</button>
        </div>
      );
    }

    const totalMatched = featureGroups.reduce((sum, g) => sum + g.features.length, 0);

    return (
      <div className="p-4">
        {stepIndicator}
        <h2 className="text-lg font-semibold mb-2">Review Matches</h2>
        <p className="text-sm text-gray-600 mb-4">
          Found {totalMatched} features from {featureGroups.length} layer{featureGroups.length !== 1 ? 's' : ''}.
        </p>

        {totalCandidateFeatures > CANDIDATE_FEATURE_WARNING && (
          <p className="text-sm text-amber-600 mb-4">
            Large dataset ({totalCandidateFeatures} features). Consider narrowing your search area for better performance.
          </p>
        )}

        <div className="flex flex-col md:flex-row gap-4" style={{ height: 'calc(100vh - 240px)' }}>
          {/* Map */}
          <div className="flex-[2] rounded-lg overflow-hidden border border-gray-200">
            <MapContainer center={searchMapCenter} zoom={mapZoom} className="w-full h-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {featureGroups.map((group) => {
                const fc: FeatureCollection = {
                  type: 'FeatureCollection',
                  features: group.features.map((df) => df.feature),
                };
                return (
                  <GeoLayerRenderer
                    key={group.layerId}
                    geojson={fc}
                    layer={{
                      id: group.layerId,
                      name: group.layerName,
                      color: group.layerColor,
                      opacity: 0.6,
                      feature_count: group.features.length,
                    } as any}
                  />
                );
              })}
            </MapContainer>
          </div>

          {/* List panel */}
          <div className="flex-1 min-w-[280px] border border-gray-200 rounded-lg overflow-hidden md:max-h-full max-h-[40vh]">
            <FeatureListPanel
              groups={featureGroups}
              selectedIds={selectedIds}
              onToggleFeature={toggleFeature}
              onToggleGroup={toggleGroup}
            />
          </div>
        </div>

        <div className="flex justify-between mt-4">
          <button onClick={() => setStep('define-area')} className="btn-secondary">Back</button>
          <button onClick={() => setStep('select')} className="btn-primary">
            Continue to Selection
          </button>
        </div>
      </div>
    );
  }

  // =========================
  // STEP 3: Select Features
  // =========================
  if (step === 'select') {
    return (
      <div className="p-4">
        {stepIndicator}
        <h2 className="text-lg font-semibold mb-2">Select Features</h2>
        <p className="text-sm text-gray-600 mb-4">
          Choose which features to include in the new layer. {selectedIds.size} selected.
        </p>

        <div className="flex flex-col md:flex-row gap-4" style={{ height: 'calc(100vh - 300px)' }}>
          {/* Map with selection-aware styling */}
          <div className="flex-[2] rounded-lg overflow-hidden border border-gray-200">
            <MapContainer center={searchMapCenter} zoom={mapZoom} className="w-full h-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {featureGroups.map((group) => {
                // Render selected features with full opacity
                const selectedFeats = group.features.filter((_, i) =>
                  selectedIds.has(featureKey(group.layerId, i))
                );
                const unselectedFeats = group.features.filter((_, i) =>
                  !selectedIds.has(featureKey(group.layerId, i))
                );

                return (
                  <div key={group.layerId}>
                    {unselectedFeats.length > 0 && (
                      <GeoLayerRenderer
                        geojson={makeFC(unselectedFeats.map((df) => df.feature))}
                        layer={{
                          id: `${group.layerId}-unselected`,
                          name: group.layerName,
                          color: group.layerColor,
                          opacity: 0.3,
                          feature_count: unselectedFeats.length,
                        } as any}
                        onFeatureClick={(feature) => {
                          const idx = group.features.findIndex((df) => df.feature === feature);
                          if (idx >= 0) toggleFeature(featureKey(group.layerId, idx));
                        }}
                      />
                    )}
                    {selectedFeats.length > 0 && (
                      <GeoLayerRenderer
                        geojson={makeFC(selectedFeats.map((df) => df.feature))}
                        layer={{
                          id: `${group.layerId}-selected`,
                          name: group.layerName,
                          color: group.layerColor,
                          opacity: 0.8,
                          feature_count: selectedFeats.length,
                        } as any}
                        onFeatureClick={(feature) => {
                          const idx = group.features.findIndex((df) => df.feature === feature);
                          if (idx >= 0) toggleFeature(featureKey(group.layerId, idx));
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </MapContainer>
          </div>

          {/* List panel */}
          <div className="flex-1 min-w-[280px] border border-gray-200 rounded-lg overflow-hidden md:max-h-full max-h-[40vh]">
            <FeatureListPanel
              groups={featureGroups}
              selectedIds={selectedIds}
              onToggleFeature={toggleFeature}
              onToggleGroup={toggleGroup}
            />
          </div>
        </div>

        {/* Layer name input */}
        <div className="mt-4 max-w-md">
          <label className="label">Layer Name</label>
          <input
            type="text"
            value={layerName}
            onChange={(e) => setLayerName(e.target.value)}
            className="input-field"
          />
        </div>

        {selectedIds.size > SELECTION_FEATURE_WARNING && (
          <p className="text-sm text-amber-600 mt-2">
            {selectedIds.size} features selected. Large layers may affect map performance.
          </p>
        )}

        <div className="flex justify-between mt-4">
          <button onClick={() => setStep('review')} className="btn-secondary">Back</button>
          <button
            onClick={handleCreate}
            className="btn-primary"
            disabled={selectedIds.size === 0 || !layerName.trim() || submitting}
          >
            {submitting ? 'Creating...' : 'Create Layer'}
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
    );
  }

  // =========================
  // STEP 4: Confirm
  // =========================
  if (step === 'confirm' && createdLayerId) {
    // Source breakdown
    const sourceBreakdown = featureGroups
      .map((g) => {
        const count = g.features.filter((_, i) => selectedIds.has(featureKey(g.layerId, i))).length;
        return count > 0 ? `${g.layerName}: ${count}` : null;
      })
      .filter(Boolean);

    return (
      <div className="max-w-2xl mx-auto p-4">
        {stepIndicator}
        <h2 className="text-lg font-semibold mb-4">Layer Created</h2>

        <div className="card p-4 space-y-2">
          <div className="font-medium">{layerName}</div>
          <div className="text-sm text-gray-600">{selectedFeatures.length} features</div>
          <div className="text-sm text-gray-500">
            <div className="font-medium text-gray-700 mb-1">Sources:</div>
            {sourceBreakdown.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <a
            href={`/admin/properties/${propertySlug}/data`}
            className="btn-primary"
          >
            Done
          </a>
        </div>
      </div>
    );
  }

  return null;
}

// Helper to build a FeatureCollection
function makeFC(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/geo/DiscoverWizard.tsx
git commit -m "feat(discovery): add DiscoverWizard — 4-step wizard with map, selection, and creation (#209)"
```

---

### Task 8: Page route and entry points

**Files:**
- Create: `src/app/admin/properties/[slug]/geo-layers/discover/page.tsx`
- Modify: `src/app/admin/properties/[slug]/layout.tsx:34-50`
- Modify: `src/app/admin/geo-layers/page.tsx`

- [ ] **Step 1: Create the discover page route**

Create `src/app/admin/properties/[slug]/geo-layers/discover/page.tsx`:

```typescript
'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import dynamic from 'next/dynamic';
import type { FeatureCollection } from 'geojson';

const DiscoverWizard = dynamic(() => import('@/components/geo/DiscoverWizard'), {
  ssr: false,
  loading: () => <p className="text-gray-500 p-4">Loading discovery wizard...</p>,
});

interface PropertyData {
  id: string;
  name: string;
  slug: string;
  org_id: string;
  map_default_lat: number;
  map_default_lng: number;
  map_default_zoom: number;
  boundary_layer_id: string | null;
}

export default function DiscoverPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      // Fetch property
      const { data: prop } = await supabase
        .from('properties')
        .select('id, name, slug, org_id, map_default_lat, map_default_lng, map_default_zoom, boundary_layer_id')
        .eq('slug', slug)
        .single();

      if (!prop) {
        setLoading(false);
        return;
      }

      setProperty(prop);

      // Fetch boundary layer geojson if it exists
      if (prop.boundary_layer_id) {
        const { data: layer } = await supabase
          .from('geo_layers')
          .select('geojson')
          .eq('id', prop.boundary_layer_id)
          .single();

        if (layer) {
          setBoundaryGeoJSON(layer.geojson as FeatureCollection);
        }
      }

      setLoading(false);
    }

    load();
  }, [slug]);

  if (loading) {
    return <p className="text-gray-500 p-4">Loading...</p>;
  }

  if (!property) {
    return <p className="text-red-600 p-4">Property not found.</p>;
  }

  return (
    <DiscoverWizard
      orgId={property.org_id}
      propertyId={property.id}
      propertyName={property.name}
      propertySlug={property.slug}
      boundaryGeoJSON={boundaryGeoJSON}
      mapCenter={[property.map_default_lat, property.map_default_lng]}
      mapZoom={property.map_default_zoom}
    />
  );
}
```

- [ ] **Step 2: Add "Geo Layers" nav item to property admin layout**

In `src/app/admin/properties/[slug]/layout.tsx`, add to the `items` array (after the `Data` entry on line 35):

```typescript
    { label: 'Geo Layers', href: `${base}/geo-layers/discover` },
```

- [ ] **Step 3: Add "Assign by Area" action to org geo layers page**

In `src/app/admin/geo-layers/page.tsx`, find the action buttons section for each layer row. Add a link button that navigates to the discover page. Look for the delete/edit action buttons area and add:

```tsx
<a
  href={`/admin/properties`}
  className="text-xs text-blue-600 hover:text-blue-800"
  title="Assign features from this layer to a property by area"
>
  Assign by Area
</a>
```

Note: The org-level "Assign by Area" links to the properties list since the user needs to pick a property first. The property-level entry point is the primary flow.

- [ ] **Step 4: Verify the app builds**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/properties/\[slug\]/geo-layers/discover/page.tsx src/app/admin/properties/\[slug\]/layout.tsx src/app/admin/geo-layers/page.tsx
git commit -m "feat(discovery): add discover page route and navigation entry points (#209)"
```

---

### Task 9: Manual smoke test and E2E test

**Files:**
- No new files for smoke test; E2E test is stretch goal

- [ ] **Step 1: Manual smoke test**

Run: `npm run dev`

1. Navigate to a property admin page → verify "Geo Layers" nav item appears
2. Click it → verify the discover page loads
3. If the property has a boundary, verify it shows on the map with "Use Property Boundary" selected
4. Draw a custom rectangle → verify "Find Features" button enables
5. Click "Find Features" → verify matching features appear grouped in the list panel
6. Toggle individual features and "Select All" → verify map updates
7. Name the layer and click "Create Layer" → verify success and redirect

- [ ] **Step 2: Run existing tests to ensure no regressions**

Run: `npm run test`
Expected: Existing tests pass (or same failures as before, no new failures).

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(discovery): address smoke test issues (#209)"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Types, constants, leaflet-draw | `types.ts`, `constants.ts`, `package.json` |
| 2 | DB migration for 'discovered' source | `023_geo_layer_source_discovered.sql` |
| 3 | Spatial helpers (TDD) | `discovery.ts`, `discovery.test.ts` |
| 4 | Server actions (TDD) | `discover/actions.ts`, `actions.test.ts` |
| 5 | DrawAreaControl component | `DrawAreaControl.tsx` |
| 6 | FeatureListPanel component | `FeatureListPanel.tsx` |
| 7 | DiscoverWizard (4-step orchestrator) | `DiscoverWizard.tsx` |
| 8 | Page route + navigation entry points | `discover/page.tsx`, `layout.tsx`, `geo-layers/page.tsx` |
| 9 | Smoke test + regression check | Manual + `npm test` |
