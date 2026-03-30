# Geo Data Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable importing, displaying, and managing geographic data layers (Shapefiles, GeoJSON, KML/KMZ) with org-level ownership, property assignment, boundary-based spatial filtering, and AI onboarding integration.

**Architecture:** All geo formats convert to GeoJSON at import time and are stored as JSONB in PostgreSQL. Turf.js handles spatial operations (point-in-polygon, intersection). Leaflet's native `L.geoJSON()` renders layers. Schema is designed for a future PostGIS upgrade.

**Tech Stack:** Next.js 14, Supabase PostgreSQL, Leaflet/React-Leaflet, Turf.js, shpjs, @tmcw/togeojson, jszip, proj4

**Spec:** `docs/superpowers/specs/2026-03-29-geo-data-layers-design.md`

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install new packages**

Run:
```bash
npm install shpjs @tmcw/togeojson @turf/boolean-point-in-polygon @turf/intersect @turf/bbox @turf/helpers jszip
```

- [ ] **Step 2: Install type definitions**

Run:
```bash
npm install -D @types/shpjs @types/geojson
```

Note: `@types/geojson` may already be present as a transitive dep. If the install says "already satisfied", that's fine.

- [ ] **Step 3: Verify build still works**

Run: `npm run build`
Expected: Build succeeds with no new errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add geo parsing and spatial analysis dependencies"
```

---

### Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/021_geo_layers.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/021_geo_layers.sql`:

```sql
-- 021_geo_layers.sql — Geographic data layers

-- ======================
-- geo_layers table
-- ======================

CREATE TABLE IF NOT EXISTS geo_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#3b82f6',
  opacity float NOT NULL DEFAULT 0.6,
  source_format text NOT NULL,
  source_filename text NOT NULL,
  geojson jsonb NOT NULL,
  feature_count int NOT NULL DEFAULT 0,
  bbox jsonb,
  is_property_boundary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_geo_layers_org_id ON geo_layers(org_id);

-- ======================
-- geo_layer_properties join table
-- ======================

CREATE TABLE IF NOT EXISTS geo_layer_properties (
  geo_layer_id uuid NOT NULL REFERENCES geo_layers(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  visible_default boolean NOT NULL DEFAULT true,
  PRIMARY KEY (geo_layer_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_geo_layer_properties_property_id ON geo_layer_properties(property_id);
CREATE INDEX IF NOT EXISTS idx_geo_layer_properties_org_id ON geo_layer_properties(org_id);

-- ======================
-- Add boundary_layer_id to properties
-- ======================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS boundary_layer_id uuid REFERENCES geo_layers(id) ON DELETE SET NULL;

-- ======================
-- RLS for geo_layers
-- ======================

ALTER TABLE geo_layers ENABLE ROW LEVEL SECURITY;

-- Org members can read layers
DROP POLICY IF EXISTS "Org members can view geo_layers" ON geo_layers;
CREATE POLICY "Org members can view geo_layers"
  ON geo_layers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      WHERE om.org_id = geo_layers.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- Public can view layers (for public maps)
DROP POLICY IF EXISTS "Public can view geo_layers" ON geo_layers;
CREATE POLICY "Public can view geo_layers"
  ON geo_layers FOR SELECT
  TO anon
  USING (true);

-- Org admins and staff can insert
DROP POLICY IF EXISTS "Org admins can insert geo_layers" ON geo_layers;
CREATE POLICY "Org admins can insert geo_layers"
  ON geo_layers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = geo_layers.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role IN ('org_admin', 'org_staff')
    )
  );

-- Org admins and staff can update
DROP POLICY IF EXISTS "Org admins can update geo_layers" ON geo_layers;
CREATE POLICY "Org admins can update geo_layers"
  ON geo_layers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = geo_layers.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role IN ('org_admin', 'org_staff')
    )
  );

-- Org admins can delete
DROP POLICY IF EXISTS "Org admins can delete geo_layers" ON geo_layers;
CREATE POLICY "Org admins can delete geo_layers"
  ON geo_layers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = geo_layers.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role = 'org_admin'
    )
  );

-- ======================
-- RLS for geo_layer_properties
-- ======================

ALTER TABLE geo_layer_properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view geo_layer_properties" ON geo_layer_properties;
CREATE POLICY "Org members can view geo_layer_properties"
  ON geo_layer_properties FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      WHERE om.org_id = geo_layer_properties.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Public can view geo_layer_properties" ON geo_layer_properties;
CREATE POLICY "Public can view geo_layer_properties"
  ON geo_layer_properties FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Org admins can insert geo_layer_properties" ON geo_layer_properties;
CREATE POLICY "Org admins can insert geo_layer_properties"
  ON geo_layer_properties FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = geo_layer_properties.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role IN ('org_admin', 'org_staff')
    )
  );

DROP POLICY IF EXISTS "Org admins can update geo_layer_properties" ON geo_layer_properties;
CREATE POLICY "Org admins can update geo_layer_properties"
  ON geo_layer_properties FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = geo_layer_properties.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role IN ('org_admin', 'org_staff')
    )
  );

DROP POLICY IF EXISTS "Org admins can delete geo_layer_properties" ON geo_layer_properties;
CREATE POLICY "Org admins can delete geo_layer_properties"
  ON geo_layer_properties FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om
      JOIN roles rl ON rl.id = om.role_id
      WHERE om.org_id = geo_layer_properties.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND rl.base_role IN ('org_admin', 'org_staff')
    )
  );
```

- [ ] **Step 2: Verify migration SQL is valid**

Run: `npx supabase db lint --level warning` (if available) or visually verify the SQL is consistent with `020_qr_code_tracking.sql` patterns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/021_geo_layers.sql
git commit -m "feat: add geo_layers and geo_layer_properties tables with RLS"
```

---

### Task 3: TypeScript Types

**Files:**
- Create: `src/lib/geo/types.ts`

- [ ] **Step 1: Write the type definitions**

Create `src/lib/geo/types.ts`:

```typescript
import type { Feature, FeatureCollection, Geometry } from 'geojson';

export type GeoSourceFormat = 'geojson' | 'shapefile' | 'kml' | 'kmz';

export interface GeoLayer {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  color: string;
  opacity: number;
  source_format: GeoSourceFormat;
  source_filename: string;
  geojson: FeatureCollection;
  feature_count: number;
  bbox: [number, number, number, number] | null; // [minLng, minLat, maxLng, maxLat]
  is_property_boundary: boolean;
  created_at: string;
  created_by: string | null;
}

export interface GeoLayerProperty {
  geo_layer_id: string;
  property_id: string;
  org_id: string;
  visible_default: boolean;
}

/** Lightweight version of GeoLayer without the full geojson payload — used in list views */
export interface GeoLayerSummary {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  color: string;
  opacity: number;
  source_format: GeoSourceFormat;
  source_filename: string;
  feature_count: number;
  bbox: [number, number, number, number] | null;
  is_property_boundary: boolean;
  created_at: string;
  created_by: string | null;
}

/** Result of parsing an uploaded geo file, before storage */
export interface ParsedGeoLayer {
  name: string;
  sourceFormat: GeoSourceFormat;
  sourceFilename: string;
  geojson: FeatureCollection;
  featureCount: number;
  bbox: [number, number, number, number];
  geometryTypes: string[]; // unique geometry types found (e.g. ['Polygon', 'MultiPolygon'])
}

/** Validation result from geo file parsing */
export interface GeoValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  featureCount: number;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/geo/types.ts
git commit -m "feat: add TypeScript types for geo layers"
```

---

### Task 4: Geo File Parsers

**Files:**
- Create: `src/lib/geo/parsers.ts`
- Create: `src/__tests__/geo/parsers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/geo/parsers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseGeoFile, detectGeoFormat, validateGeoJSON } from '@/lib/geo/parsers';

describe('detectGeoFormat', () => {
  it('detects .geojson files', () => {
    expect(detectGeoFormat('zones.geojson', 'application/geo+json')).toBe('geojson');
  });

  it('detects .json files with geo content type', () => {
    expect(detectGeoFormat('data.json', 'application/geo+json')).toBe('geojson');
  });

  it('detects .kml files', () => {
    expect(detectGeoFormat('map.kml', 'application/vnd.google-earth.kml+xml')).toBe('kml');
  });

  it('detects .kmz files', () => {
    expect(detectGeoFormat('map.kmz', 'application/vnd.google-earth.kmz')).toBe('kmz');
  });

  it('detects .zip files as shapefile', () => {
    expect(detectGeoFormat('parcels.zip', 'application/zip')).toBe('shapefile');
  });

  it('returns null for non-geo files', () => {
    expect(detectGeoFormat('photo.jpg', 'image/jpeg')).toBeNull();
  });
});

describe('validateGeoJSON', () => {
  it('accepts a valid FeatureCollection', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-70.2, 43.5] },
        properties: { name: 'Test' },
      }],
    };
    const result = validateGeoJSON(fc as GeoJSON.FeatureCollection);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.featureCount).toBe(1);
  });

  it('rejects coordinates out of range', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [200, 43.5] },
        properties: {},
      }],
    };
    const result = validateGeoJSON(fc as GeoJSON.FeatureCollection);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('range');
  });

  it('warns on high feature count', () => {
    const features = Array.from({ length: 1001 }, (_, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [-70 + i * 0.001, 43.5] },
      properties: {},
    }));
    const fc = { type: 'FeatureCollection' as const, features };
    const result = validateGeoJSON(fc);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('1001');
  });

  it('rejects unsupported geometry types', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'GeometryCollection', geometries: [] },
        properties: {},
      }],
    };
    const result = validateGeoJSON(fc as GeoJSON.FeatureCollection);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('GeometryCollection');
  });
});

describe('parseGeoFile', () => {
  it('parses a GeoJSON file', async () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-70, 43], [-70, 44], [-69, 44], [-69, 43], [-70, 43]]] }, properties: { zone: 'wetland' } },
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-71, 43], [-71, 44], [-70, 44], [-70, 43], [-71, 43]]] }, properties: { zone: 'forest' } },
      ],
    });
    const file = new File([geojson], 'zones.geojson', { type: 'application/geo+json' });
    const result = await parseGeoFile(file);
    expect(result.name).toBe('zones');
    expect(result.sourceFormat).toBe('geojson');
    expect(result.featureCount).toBe(2);
    expect(result.geojson.features).toHaveLength(2);
    expect(result.bbox).toBeDefined();
    expect(result.geometryTypes).toContain('Polygon');
  });

  it('parses a KML file', async () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Test Point</name>
      <Point><coordinates>-70.2,43.5,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;
    const file = new File([kml], 'markers.kml', { type: 'application/vnd.google-earth.kml+xml' });
    const result = await parseGeoFile(file);
    expect(result.sourceFormat).toBe('kml');
    expect(result.featureCount).toBe(1);
    expect(result.geojson.features[0].geometry.type).toBe('Point');
  });

  it('parses a single Feature GeoJSON (wraps in FeatureCollection)', async () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-70.2, 43.5] },
      properties: { name: 'Single' },
    });
    const file = new File([geojson], 'single.geojson', { type: 'application/geo+json' });
    const result = await parseGeoFile(file);
    expect(result.geojson.type).toBe('FeatureCollection');
    expect(result.featureCount).toBe(1);
  });

  it('throws on unsupported format', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await expect(parseGeoFile(file)).rejects.toThrow('Unsupported');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/__tests__/geo/parsers.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the parser implementation**

Create `src/lib/geo/parsers.ts`:

```typescript
import type { FeatureCollection, Feature, Position } from 'geojson';
import type { GeoSourceFormat, ParsedGeoLayer, GeoValidationResult } from './types';
import bbox from '@turf/bbox';
import { featureCollection } from '@turf/helpers';

const VALID_GEOMETRY_TYPES = new Set([
  'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon',
]);

const FORMAT_BY_EXTENSION: Record<string, GeoSourceFormat> = {
  geojson: 'geojson',
  kml: 'kml',
  kmz: 'kmz',
  zip: 'shapefile',
};

const FORMAT_BY_MIME: Record<string, GeoSourceFormat> = {
  'application/geo+json': 'geojson',
  'application/vnd.google-earth.kml+xml': 'kml',
  'application/vnd.google-earth.kmz': 'kmz',
  'application/zip': 'shapefile',
  'application/x-zip-compressed': 'shapefile',
};

export function detectGeoFormat(fileName: string, mimeType: string): GeoSourceFormat | null {
  if (FORMAT_BY_MIME[mimeType]) return FORMAT_BY_MIME[mimeType];
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return FORMAT_BY_EXTENSION[ext] ?? null;
}

/** Extract all coordinate arrays from a geometry for validation */
function extractCoordinates(geometry: GeoJSON.Geometry): Position[] {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates];
    case 'MultiPoint':
    case 'LineString':
      return geometry.coordinates;
    case 'MultiLineString':
    case 'Polygon':
      return geometry.coordinates.flat();
    case 'MultiPolygon':
      return geometry.coordinates.flat(2);
    default:
      return [];
  }
}

export function validateGeoJSON(fc: FeatureCollection): GeoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < fc.features.length; i++) {
    const feature = fc.features[i];
    const geomType = feature.geometry?.type;

    if (!geomType || !VALID_GEOMETRY_TYPES.has(geomType)) {
      errors.push(`Feature ${i}: unsupported geometry type "${geomType}". Supported: ${[...VALID_GEOMETRY_TYPES].join(', ')}`);
      continue;
    }

    const coords = extractCoordinates(feature.geometry);
    for (const [lng, lat] of coords) {
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        errors.push(`Feature ${i}: coordinates out of range (lng: ${lng}, lat: ${lat}). Expected lng -180..180, lat -90..90`);
        break; // one error per feature is enough
      }
    }
  }

  if (fc.features.length > 1000) {
    warnings.push(`${fc.features.length} features detected. Large datasets may impact performance. Consider simplifying.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    featureCount: fc.features.length,
  };
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

async function parseGeoJSON(file: File): Promise<FeatureCollection> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (parsed.type === 'FeatureCollection') return parsed;
  if (parsed.type === 'Feature') {
    return { type: 'FeatureCollection', features: [parsed] };
  }
  // Bare geometry
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: parsed, properties: {} }] };
}

async function parseKML(file: File): Promise<FeatureCollection> {
  const { kml: kmlToGeoJSON } = await import('@tmcw/togeojson');
  const text = await file.text();
  const dom = new DOMParser().parseFromString(text, 'application/xml');
  return kmlToGeoJSON(dom) as FeatureCollection;
}

async function parseKMZ(file: File): Promise<FeatureCollection> {
  const JSZip = (await import('jszip')).default;
  const { kml: kmlToGeoJSON } = await import('@tmcw/togeojson');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const kmlFile = Object.keys(zip.files).find((name) => name.endsWith('.kml'));
  if (!kmlFile) throw new Error('KMZ archive does not contain a .kml file');
  const kmlText = await zip.files[kmlFile].async('string');
  const dom = new DOMParser().parseFromString(kmlText, 'application/xml');
  return kmlToGeoJSON(dom) as FeatureCollection;
}

async function parseShapefile(file: File): Promise<FeatureCollection> {
  const shp = await import('shpjs');
  const buffer = await file.arrayBuffer();
  const result = await shp.default(buffer);
  // shpjs can return a single FeatureCollection or an array of them (multiple layers in zip)
  if (Array.isArray(result)) {
    // Merge all features into one collection
    const allFeatures: Feature[] = result.flatMap((fc) => fc.features);
    return { type: 'FeatureCollection', features: allFeatures };
  }
  return result;
}

export async function parseGeoFile(file: File): Promise<ParsedGeoLayer> {
  const format = detectGeoFormat(file.name, file.type);
  if (!format) throw new Error(`Unsupported geo file format: ${file.name}`);

  let fc: FeatureCollection;
  switch (format) {
    case 'geojson':
      fc = await parseGeoJSON(file);
      break;
    case 'kml':
      fc = await parseKML(file);
      break;
    case 'kmz':
      fc = await parseKMZ(file);
      break;
    case 'shapefile':
      fc = await parseShapefile(file);
      break;
  }

  const geometryTypes = [...new Set(fc.features.map((f) => f.geometry?.type).filter(Boolean))];
  const computedBbox = bbox(featureCollection(fc.features)) as [number, number, number, number];

  return {
    name: stripExtension(file.name),
    sourceFormat: format,
    sourceFilename: file.name,
    geojson: fc,
    featureCount: fc.features.length,
    bbox: computedBbox,
    geometryTypes,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/geo/parsers.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo/parsers.ts src/__tests__/geo/parsers.test.ts
git commit -m "feat: add geo file parsers with GeoJSON, KML, KMZ, Shapefile support"
```

---

### Task 5: Spatial Utilities

**Files:**
- Create: `src/lib/geo/spatial.ts`
- Create: `src/__tests__/geo/spatial.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/geo/spatial.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { filterItemsByBoundary, clipLayerToBoundary } from '@/lib/geo/spatial';
import type { FeatureCollection } from 'geojson';

const boundary: FeatureCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[-71, 43], [-71, 44], [-70, 44], [-70, 43], [-71, 43]]],
    },
    properties: {},
  }],
};

describe('filterItemsByBoundary', () => {
  it('keeps items inside the boundary', () => {
    const items = [
      { id: '1', latitude: 43.5, longitude: -70.5 },
      { id: '2', latitude: 45.0, longitude: -70.5 }, // outside
      { id: '3', latitude: 43.8, longitude: -70.2 },
    ];
    const result = filterItemsByBoundary(items, boundary);
    expect(result.map((i) => i.id)).toEqual(['1', '3']);
  });

  it('returns all items if boundary has no polygon features', () => {
    const emptyBoundary: FeatureCollection = { type: 'FeatureCollection', features: [] };
    const items = [{ id: '1', latitude: 43.5, longitude: -70.5 }];
    const result = filterItemsByBoundary(items, emptyBoundary);
    expect(result).toHaveLength(1);
  });
});

describe('clipLayerToBoundary', () => {
  it('clips polygon features to the boundary', () => {
    const layer: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          // This polygon overlaps the boundary partially
          coordinates: [[[-70.5, 43.5], [-70.5, 44.5], [-69.5, 44.5], [-69.5, 43.5], [-70.5, 43.5]]],
        },
        properties: { zone: 'test' },
      }],
    };
    const result = clipLayerToBoundary(layer, boundary);
    // Should have one clipped feature
    expect(result.features.length).toBeGreaterThanOrEqual(1);
    // Properties should be preserved
    expect(result.features[0].properties?.zone).toBe('test');
  });

  it('passes through point features inside the boundary', () => {
    const layer: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-70.5, 43.5] }, properties: { name: 'inside' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-68, 43.5] }, properties: { name: 'outside' } },
      ],
    };
    const result = clipLayerToBoundary(layer, boundary);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties?.name).toBe('inside');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/__tests__/geo/spatial.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the spatial utilities**

Create `src/lib/geo/spatial.ts`:

```typescript
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import intersect from '@turf/intersect';
import { featureCollection } from '@turf/helpers';

interface ItemWithLocation {
  id: string;
  latitude: number;
  longitude: number;
  [key: string]: unknown;
}

/** Get the first Polygon or MultiPolygon from a FeatureCollection (used as boundary) */
function getBoundaryPolygon(boundary: FeatureCollection): Feature<Polygon | MultiPolygon> | null {
  for (const feature of boundary.features) {
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      return feature as Feature<Polygon | MultiPolygon>;
    }
  }
  return null;
}

/** Filter items to only those within the boundary polygon */
export function filterItemsByBoundary<T extends ItemWithLocation>(
  items: T[],
  boundary: FeatureCollection,
): T[] {
  const polygon = getBoundaryPolygon(boundary);
  if (!polygon) return items;

  return items.filter((item) =>
    booleanPointInPolygon([item.longitude, item.latitude], polygon)
  );
}

/** Clip a layer's features to a boundary polygon */
export function clipLayerToBoundary(
  layer: FeatureCollection,
  boundary: FeatureCollection,
): FeatureCollection {
  const polygon = getBoundaryPolygon(boundary);
  if (!polygon) return layer;

  const clippedFeatures: Feature[] = [];

  for (const feature of layer.features) {
    const geomType = feature.geometry.type;

    if (geomType === 'Point' || geomType === 'MultiPoint') {
      // Point-in-polygon check
      if (geomType === 'Point') {
        if (booleanPointInPolygon(feature.geometry.coordinates, polygon)) {
          clippedFeatures.push(feature);
        }
      } else {
        // MultiPoint — keep if any point is inside
        const coords = feature.geometry.coordinates;
        if (coords.some((c: number[]) => booleanPointInPolygon(c, polygon))) {
          clippedFeatures.push(feature);
        }
      }
    } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
      // Intersect polygons
      const clipped = intersect(featureCollection([feature as Feature<Polygon | MultiPolygon>, polygon]));
      if (clipped) {
        // Preserve original properties
        clipped.properties = { ...feature.properties };
        clippedFeatures.push(clipped);
      }
    } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
      // For lines, include if any vertex is inside the boundary
      // Full line clipping is complex; vertex check is a reasonable approximation
      const coords = geomType === 'LineString'
        ? feature.geometry.coordinates
        : feature.geometry.coordinates.flat();
      if (coords.some((c: number[]) => booleanPointInPolygon(c, polygon))) {
        clippedFeatures.push(feature);
      }
    }
  }

  return { type: 'FeatureCollection', features: clippedFeatures };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/geo/spatial.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo/spatial.ts src/__tests__/geo/spatial.test.ts
git commit -m "feat: add spatial utilities for boundary filtering and layer clipping"
```

---

### Task 6: Server Actions (CRUD)

**Files:**
- Create: `src/app/admin/geo-layers/actions.ts`
- Create: `src/app/admin/geo-layers/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/admin/geo-layers/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockUser: any = { id: 'user-1' };
let mockIsAdmin = true;
let mockInsertResult: any = { data: [{ id: 'layer-1' }], error: null };
let mockSelectResult: any = { data: [], error: null };
let mockUpdateResult: any = { data: null, error: null };
let mockDeleteResult: any = { data: null, error: null };

const mockFrom = vi.fn(() => ({
  insert: vi.fn(() => ({ select: vi.fn(() => Promise.resolve(mockInsertResult)) })),
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      order: vi.fn(() => Promise.resolve(mockSelectResult)),
      single: vi.fn(() => Promise.resolve(mockSelectResult)),
    })),
  })),
  update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve(mockUpdateResult)) })),
  delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve(mockDeleteResult)) })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: mockUser } }) },
    from: mockFrom,
  }),
  createServiceClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock('@/lib/auth/permissions', () => ({
  isOrgAdmin: () => Promise.resolve(mockIsAdmin),
}));

describe('geo layer actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-1' };
    mockIsAdmin = true;
    mockInsertResult = { data: [{ id: 'layer-1' }], error: null };
    mockSelectResult = { data: [], error: null };
  });

  it('rejects unauthenticated users on createGeoLayer', async () => {
    mockUser = null;
    const { createGeoLayer } = await import('../actions');
    const result = await createGeoLayer({
      orgId: 'org-1',
      name: 'Test Layer',
      geojson: { type: 'FeatureCollection', features: [] },
      sourceFormat: 'geojson',
      sourceFilename: 'test.geojson',
      color: '#3b82f6',
      opacity: 0.6,
      featureCount: 0,
      bbox: null,
      isPropertyBoundary: false,
    });
    expect(result).toEqual({ error: 'Not authenticated' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/app/admin/geo-layers/__tests__/actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the server actions**

Create `src/app/admin/geo-layers/actions.ts`:

```typescript
'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { GeoLayer, GeoLayerSummary, GeoLayerProperty, GeoSourceFormat } from '@/lib/geo/types';
import type { FeatureCollection } from 'geojson';

interface CreateGeoLayerInput {
  orgId: string;
  name: string;
  description?: string;
  geojson: FeatureCollection;
  sourceFormat: GeoSourceFormat;
  sourceFilename: string;
  color: string;
  opacity: number;
  featureCount: number;
  bbox: [number, number, number, number] | null;
  isPropertyBoundary: boolean;
}

export async function createGeoLayer(
  input: CreateGeoLayerInput
): Promise<{ success: true; layerId: string } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('geo_layers')
    .insert({
      org_id: input.orgId,
      name: input.name,
      description: input.description ?? null,
      color: input.color,
      opacity: input.opacity,
      source_format: input.sourceFormat,
      source_filename: input.sourceFilename,
      geojson: input.geojson,
      feature_count: input.featureCount,
      bbox: input.bbox,
      is_property_boundary: input.isPropertyBoundary,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { success: true, layerId: data.id };
}

export async function listGeoLayers(
  orgId: string
): Promise<{ success: true; layers: GeoLayerSummary[] } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('geo_layers')
    .select('id, org_id, name, description, color, opacity, source_format, source_filename, feature_count, bbox, is_property_boundary, created_at, created_by')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };
  return { success: true, layers: data as GeoLayerSummary[] };
}

export async function getGeoLayer(
  layerId: string
): Promise<{ success: true; layer: GeoLayer } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('geo_layers')
    .select('*')
    .eq('id', layerId)
    .single();

  if (error) return { error: error.message };
  return { success: true, layer: data as GeoLayer };
}

export async function updateGeoLayer(
  layerId: string,
  updates: { name?: string; description?: string; color?: string; opacity?: number; is_property_boundary?: boolean }
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('geo_layers')
    .update(updates)
    .eq('id', layerId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteGeoLayer(
  layerId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Clear boundary_layer_id on any properties using this layer
  const serviceClient = createServiceClient();
  await serviceClient
    .from('properties')
    .update({ boundary_layer_id: null })
    .eq('boundary_layer_id', layerId);

  const { error } = await supabase
    .from('geo_layers')
    .delete()
    .eq('id', layerId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function assignLayerToProperties(
  layerId: string,
  orgId: string,
  propertyIds: string[],
  visibleDefault: boolean = true
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Remove existing assignments for this layer
  await supabase
    .from('geo_layer_properties')
    .delete()
    .eq('geo_layer_id', layerId);

  if (propertyIds.length === 0) return { success: true };

  const rows = propertyIds.map((propertyId) => ({
    geo_layer_id: layerId,
    property_id: propertyId,
    org_id: orgId,
    visible_default: visibleDefault,
  }));

  const { error } = await supabase
    .from('geo_layer_properties')
    .insert(rows);

  if (error) return { error: error.message };
  return { success: true };
}

export async function getPropertyGeoLayers(
  propertyId: string
): Promise<{ success: true; layers: GeoLayerSummary[]; assignments: GeoLayerProperty[] } | { error: string }> {
  const supabase = createClient();

  // Get assignments for this property
  const { data: assignments, error: assignError } = await supabase
    .from('geo_layer_properties')
    .select('*')
    .eq('property_id', propertyId);

  if (assignError) return { error: assignError.message };
  if (!assignments || assignments.length === 0) {
    return { success: true, layers: [], assignments: [] };
  }

  const layerIds = assignments.map((a: GeoLayerProperty) => a.geo_layer_id);

  const { data: layers, error: layerError } = await supabase
    .from('geo_layers')
    .select('id, org_id, name, description, color, opacity, source_format, source_filename, feature_count, bbox, is_property_boundary, created_at, created_by')
    .in('id', layerIds);

  if (layerError) return { error: layerError.message };
  return { success: true, layers: layers as GeoLayerSummary[], assignments: assignments as GeoLayerProperty[] };
}

export async function setPropertyBoundary(
  propertyId: string,
  boundaryLayerId: string | null
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('properties')
    .update({ boundary_layer_id: boundaryLayerId })
    .eq('id', propertyId);

  if (error) return { error: error.message };
  return { success: true };
}

/** Create a geo layer using the service client (bypasses RLS — used during onboarding) */
export async function createGeoLayerService(
  input: CreateGeoLayerInput & { createdBy: string }
): Promise<{ success: true; layerId: string } | { error: string }> {
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from('geo_layers')
    .insert({
      org_id: input.orgId,
      name: input.name,
      description: input.description ?? null,
      color: input.color,
      opacity: input.opacity,
      source_format: input.sourceFormat,
      source_filename: input.sourceFilename,
      geojson: input.geojson,
      feature_count: input.featureCount,
      bbox: input.bbox,
      is_property_boundary: input.isPropertyBoundary,
      created_by: input.createdBy,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { success: true, layerId: data.id };
}

/** Assign layer to property using service client (bypasses RLS — used during onboarding) */
export async function assignLayerToPropertyService(
  layerId: string,
  propertyId: string,
  orgId: string,
  visibleDefault: boolean = true
): Promise<{ success: true } | { error: string }> {
  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from('geo_layer_properties')
    .insert({
      geo_layer_id: layerId,
      property_id: propertyId,
      org_id: orgId,
      visible_default: visibleDefault,
    });

  if (error) return { error: error.message };
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/app/admin/geo-layers/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/geo-layers/actions.ts src/app/admin/geo-layers/__tests__/actions.test.ts
git commit -m "feat: add geo layer CRUD server actions"
```

---

### Task 7: Map Rendering Components

**Files:**
- Create: `src/components/geo/GeoLayerRenderer.tsx`
- Create: `src/components/geo/PropertyBoundary.tsx`
- Create: `src/components/geo/FeaturePopup.tsx`
- Create: `src/components/geo/LayerControlPanel.tsx`

- [ ] **Step 1: Create GeoLayerRenderer**

Create `src/components/geo/GeoLayerRenderer.tsx`:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoLayerSummary } from '@/lib/geo/types';
import type { FeatureCollection } from 'geojson';

interface GeoLayerRendererProps {
  geojson: FeatureCollection;
  layer: GeoLayerSummary;
  onFeatureClick?: (feature: GeoJSON.Feature, layerName: string) => void;
}

export default function GeoLayerRenderer({ geojson, layer, onFeatureClick }: GeoLayerRendererProps) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const geoJsonLayer = L.geoJSON(geojson, {
      style: () => ({
        color: layer.color,
        weight: 2,
        opacity: layer.opacity,
        fillColor: layer.color,
        fillOpacity: layer.opacity * 0.4,
      }),
      pointToLayer: (_feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 6,
          color: layer.color,
          weight: 2,
          opacity: layer.opacity,
          fillColor: layer.color,
          fillOpacity: layer.opacity * 0.6,
        });
      },
      onEachFeature: (feature, leafletLayer) => {
        if (onFeatureClick) {
          leafletLayer.on('click', () => onFeatureClick(feature, layer.name));
        }
      },
    });

    geoJsonLayer.addTo(map);
    layerRef.current = geoJsonLayer;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, geojson, layer.color, layer.opacity, layer.name, onFeatureClick]);

  return null;
}
```

- [ ] **Step 2: Create PropertyBoundary**

Create `src/components/geo/PropertyBoundary.tsx`:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection } from 'geojson';

interface PropertyBoundaryProps {
  geojson: FeatureCollection;
  color?: string;
}

export default function PropertyBoundary({ geojson, color = '#3b82f6' }: PropertyBoundaryProps) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const boundaryLayer = L.geoJSON(geojson, {
      style: () => ({
        color,
        weight: 3,
        opacity: 0.8,
        dashArray: '8, 6',
        fillColor: color,
        fillOpacity: 0.05,
      }),
      interactive: false,
    });

    boundaryLayer.addTo(map);
    layerRef.current = boundaryLayer;

    // Fit map to boundary bounds
    const bounds = boundaryLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, geojson, color]);

  return null;
}
```

- [ ] **Step 3: Create FeaturePopup**

Create `src/components/geo/FeaturePopup.tsx`:

```typescript
'use client';

import type { Feature } from 'geojson';

interface FeaturePopupProps {
  feature: Feature;
  layerName: string;
  onClose: () => void;
}

export default function FeaturePopup({ feature, layerName, onClose }: FeaturePopupProps) {
  const properties = feature.properties ?? {};
  const entries = Object.entries(properties).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[1100] bg-white rounded-t-2xl shadow-2xl max-h-[60vh] overflow-y-auto md:fixed md:bottom-auto md:left-auto md:right-4 md:top-4 md:rounded-2xl md:w-80 md:max-h-[80vh]">
      {/* Drag handle (mobile) */}
      <div className="flex justify-center pt-2 md:hidden">
        <div className="w-8 h-1 bg-gray-300 rounded-full" />
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-forest-dark text-sm">{layerName}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-gray-500">No attributes</p>
        ) : (
          <dl className="space-y-2">
            {entries.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">{key}</dt>
                <dd className="text-sm text-gray-800">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create LayerControlPanel**

Create `src/components/geo/LayerControlPanel.tsx`:

```typescript
'use client';

import { useState } from 'react';
import type { GeoLayerSummary } from '@/lib/geo/types';

interface LayerControlPanelProps {
  layers: GeoLayerSummary[];
  visibleLayerIds: Set<string>;
  onToggleLayer: (layerId: string) => void;
}

export default function LayerControlPanel({ layers, visibleLayerIds, onToggleLayer }: LayerControlPanelProps) {
  const [open, setOpen] = useState(false);

  if (layers.length === 0) return null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="absolute top-3 right-3 z-[1000] bg-white rounded-lg shadow-lg border border-sage-light p-3 min-w-[44px] min-h-[44px] text-forest-dark hover:bg-sage-light transition-colors"
        aria-label="Toggle layers"
        title="Geo Layers"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute top-16 right-3 z-[1000] bg-white rounded-xl shadow-xl border border-sage-light w-64 max-h-[50vh] overflow-y-auto md:w-72">
          <div className="p-3 border-b border-gray-100">
            <h3 className="font-semibold text-sm text-forest-dark">Layers</h3>
          </div>
          <div className="p-2">
            {layers.map((layer) => (
              <label
                key={layer.id}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer min-h-[44px]"
              >
                <input
                  type="checkbox"
                  checked={visibleLayerIds.has(layer.id)}
                  onChange={() => onToggleLayer(layer.id)}
                  className="w-4 h-4 rounded accent-current"
                  style={{ accentColor: layer.color }}
                />
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: layer.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 truncate">{layer.name}</div>
                  <div className="text-xs text-gray-500">{layer.feature_count} features</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/geo/GeoLayerRenderer.tsx src/components/geo/PropertyBoundary.tsx src/components/geo/FeaturePopup.tsx src/components/geo/LayerControlPanel.tsx
git commit -m "feat: add map rendering components for geo layers"
```

---

### Task 8: Integrate Geo Layers into MapView

**Files:**
- Modify: `src/components/map/MapView.tsx`

This task wires the new geo components into the existing map. The MapView needs to:
1. Accept geo layer data as props
2. Manage which layers are visible (toggled on/off)
3. Fetch full GeoJSON for visible layers on demand
4. Render boundary, toggleable layers, feature popup, and layer control panel

- [ ] **Step 1: Update MapView props and add state**

In `src/components/map/MapView.tsx`, add the new imports and update the props interface. Add after the existing imports at the top of the file:

```typescript
import GeoLayerRenderer from "@/components/geo/GeoLayerRenderer";
import PropertyBoundary from "@/components/geo/PropertyBoundary";
import FeaturePopup from "@/components/geo/FeaturePopup";
import LayerControlPanel from "@/components/geo/LayerControlPanel";
import type { GeoLayerSummary } from "@/lib/geo/types";
import type { FeatureCollection, Feature } from "geojson";
```

Update the `MapViewProps` interface:

```typescript
interface MapViewProps {
  items: Item[];
  itemTypes: ItemType[];
  onMarkerClick: (item: Item) => void;
  geoLayers?: GeoLayerSummary[];
  geoLayerData?: Map<string, FeatureCollection>; // layerId -> geojson, loaded on demand
  boundaryGeoJSON?: FeatureCollection | null;
  onToggleGeoLayer?: (layerId: string) => void;
  visibleGeoLayerIds?: Set<string>;
}
```

- [ ] **Step 2: Add feature popup state and render geo components**

Inside the `MapView` component function, add state for the feature popup:

```typescript
const [selectedFeature, setSelectedFeature] = useState<{ feature: Feature; layerName: string } | null>(null);
```

Then inside the `<MapContainer>`, after the existing `<GoToFieldButton />`, add:

```typescript
{/* Property boundary */}
{boundaryGeoJSON && <PropertyBoundary geojson={boundaryGeoJSON} />}

{/* Toggleable geo layers */}
{geoLayers?.filter((l) => visibleGeoLayerIds?.has(l.id)).map((l) => {
  const data = geoLayerData?.get(l.id);
  if (!data) return null;
  return (
    <GeoLayerRenderer
      key={l.id}
      geojson={data}
      layer={l}
      onFeatureClick={(feature, layerName) => setSelectedFeature({ feature, layerName })}
    />
  );
})}
```

After the `</MapContainer>` closing tag, before the fullscreen toggle button, add:

```typescript
{/* Layer control panel */}
{geoLayers && geoLayers.length > 0 && (
  <LayerControlPanel
    layers={geoLayers}
    visibleLayerIds={visibleGeoLayerIds ?? new Set()}
    onToggleLayer={onToggleGeoLayer ?? (() => {})}
  />
)}

{/* Feature attribute popup */}
{selectedFeature && (
  <FeaturePopup
    feature={selectedFeature.feature}
    layerName={selectedFeature.layerName}
    onClose={() => setSelectedFeature(null)}
  />
)}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds. The new props are optional, so existing callers are unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/components/map/MapView.tsx
git commit -m "feat: integrate geo layer rendering into MapView"
```

---

### Task 9: Import Flow Component

**Files:**
- Create: `src/components/geo/LayerStylePicker.tsx`
- Create: `src/components/geo/ImportFlow.tsx`

- [ ] **Step 1: Create LayerStylePicker**

Create `src/components/geo/LayerStylePicker.tsx`:

```typescript
'use client';

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];

interface LayerStylePickerProps {
  color: string;
  opacity: number;
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
}

export default function LayerStylePicker({ color, opacity, onColorChange, onOpacityChange }: LayerStylePickerProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Color</label>
        <div className="flex gap-2 mt-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onColorChange(c)}
              className="w-8 h-8 rounded-lg border-2 transition-all min-w-[32px] min-h-[32px]"
              style={{
                backgroundColor: c,
                borderColor: c === color ? '#fff' : 'transparent',
                boxShadow: c === color ? `0 0 0 2px ${c}` : 'none',
              }}
              aria-label={`Select color ${c}`}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="label">Opacity: {Math.round(opacity * 100)}%</label>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.1}
          value={opacity}
          onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
          className="w-full mt-1"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ImportFlow**

Create `src/components/geo/ImportFlow.tsx`:

```typescript
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { MapContainer, TileLayer } from 'react-leaflet';
import { parseGeoFile, validateGeoJSON } from '@/lib/geo/parsers';
import type { ParsedGeoLayer, GeoValidationResult } from '@/lib/geo/types';
import LayerStylePicker from './LayerStylePicker';
import GeoLayerRenderer from './GeoLayerRenderer';
import 'leaflet/dist/leaflet.css';

type ImportStep = 'upload' | 'preview' | 'confirm';

interface ImportFlowProps {
  orgId: string;
  properties: Array<{ id: string; name: string }>;
  onImport: (data: {
    name: string;
    description: string;
    color: string;
    opacity: number;
    geojson: GeoJSON.FeatureCollection;
    sourceFormat: string;
    sourceFilename: string;
    featureCount: number;
    bbox: [number, number, number, number];
    isPropertyBoundary: boolean;
    assignedPropertyIds: string[];
  }) => Promise<void>;
  onCancel: () => void;
}

const ACCEPT = {
  'application/geo+json': ['.geojson'],
  'application/json': ['.json'],
  'application/vnd.google-earth.kml+xml': ['.kml'],
  'application/vnd.google-earth.kmz': ['.kmz'],
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
};

export default function ImportFlow({ orgId, properties, onImport, onCancel }: ImportFlowProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [validation, setValidation] = useState<GeoValidationResult | null>(null);
  const [parsed, setParsed] = useState<ParsedGeoLayer | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [opacity, setOpacity] = useState(0.6);
  const [isPropertyBoundary, setIsPropertyBoundary] = useState(false);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    setParsing(true);
    setParseError(null);

    try {
      const result = await parseGeoFile(file);
      const validationResult = validateGeoJSON(result.geojson);
      if (!validationResult.valid) {
        setParseError(validationResult.errors.join('; '));
        setParsing(false);
        return;
      }
      setParsed(result);
      setValidation(validationResult);
      setName(result.name);
      setStep('preview');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setParsing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const handleSubmit = async () => {
    if (!parsed) return;
    setSubmitting(true);
    try {
      await onImport({
        name,
        description,
        color,
        opacity,
        geojson: parsed.geojson,
        sourceFormat: parsed.sourceFormat,
        sourceFilename: parsed.sourceFilename,
        featureCount: parsed.featureCount,
        bbox: parsed.bbox,
        isPropertyBoundary,
        assignedPropertyIds: [...selectedPropertyIds],
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleProperty = (propertyId: string) => {
    setSelectedPropertyIds((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  };

  // ── Upload Step ──
  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Import Geo Layer</h2>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input {...getInputProps()} />
          <p className="text-gray-600 mb-2">
            {isDragActive ? 'Drop file here' : 'Drop a file here or tap to browse'}
          </p>
          <p className="text-sm text-gray-400">.geojson, .json, .kml, .kmz, .zip (shapefile)</p>
          <p className="text-xs text-gray-400 mt-2">Max 50MB</p>
        </div>
        {parsing && <p className="text-sm text-blue-600">Parsing file...</p>}
        {parseError && <p className="text-sm text-red-600">{parseError}</p>}
        <div className="flex justify-end">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
        </div>
      </div>
    );
  }

  // ── Preview Step ──
  if (step === 'preview' && parsed) {
    const center: [number, number] = [
      (parsed.bbox[1] + parsed.bbox[3]) / 2,
      (parsed.bbox[0] + parsed.bbox[2]) / 2,
    ];

    // Get sample attributes from first feature
    const sampleFeature = parsed.geojson.features[0];
    const sampleProps = sampleFeature?.properties ?? {};
    const attrKeys = Object.keys(sampleProps).slice(0, 6);

    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Preview & Configure</h2>

        {/* Map preview */}
        <div className="h-48 rounded-lg overflow-hidden border border-gray-200">
          <MapContainer center={center} zoom={10} className="w-full h-full" zoomControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <GeoLayerRenderer
              geojson={parsed.geojson}
              layer={{ id: 'preview', name, color, opacity, feature_count: parsed.featureCount } as any}
            />
          </MapContainer>
        </div>

        <div className="text-sm text-gray-500">
          {parsed.featureCount} {parsed.geometryTypes.join(', ')} features from {parsed.sourceFilename}
        </div>

        {validation?.warnings.map((w, i) => (
          <p key={i} className="text-sm text-amber-600">{w}</p>
        ))}

        {/* Name */}
        <div>
          <label className="label">Layer Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
          />
        </div>

        {/* Description */}
        <div>
          <label className="label">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field"
          />
        </div>

        {/* Style */}
        <LayerStylePicker
          color={color}
          opacity={opacity}
          onColorChange={setColor}
          onOpacityChange={setOpacity}
        />

        {/* Attribute preview */}
        {attrKeys.length > 0 && (
          <div>
            <label className="label">Attributes (sample)</label>
            <div className="overflow-x-auto mt-1">
              <table className="text-sm w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    {attrKeys.map((k) => (
                      <th key={k} className="text-left px-2 py-1 text-gray-500 font-medium">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.geojson.features.slice(0, 3).map((f, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {attrKeys.map((k) => (
                        <td key={k} className="px-2 py-1 text-gray-700">{String(f.properties?.[k] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <button onClick={() => setStep('upload')} className="btn-secondary">Back</button>
          <button onClick={() => setStep('confirm')} className="btn-primary" disabled={!name.trim()}>
            Next
          </button>
        </div>
      </div>
    );
  }

  // ── Confirm Step ──
  if (step === 'confirm' && parsed) {
    const hasPolygons = parsed.geometryTypes.some((t) => t.includes('Polygon'));

    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Confirm & Assign</h2>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
            <div>
              <div className="font-medium">{name}</div>
              <div className="text-sm text-gray-500">
                {parsed.featureCount} {parsed.geometryTypes.join(', ')} features from {parsed.sourceFilename}
              </div>
            </div>
          </div>
        </div>

        {/* Property assignment */}
        {properties.length > 0 && (
          <div>
            <label className="label">Assign to Properties (optional)</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {properties.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProperty(p.id)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    selectedPropertyIds.has(p.id)
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {selectedPropertyIds.has(p.id) && '✓ '}{p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Property boundary option */}
        {hasPolygons && selectedPropertyIds.size > 0 && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPropertyBoundary}
              onChange={(e) => setIsPropertyBoundary(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">Use as property boundary for assigned properties</span>
          </label>
        )}

        <div className="flex justify-between">
          <button onClick={() => setStep('preview')} className="btn-secondary">Back</button>
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn-secondary">Cancel</button>
            <button onClick={handleSubmit} className="btn-primary" disabled={submitting}>
              {submitting ? 'Importing...' : 'Import Layer'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/geo/LayerStylePicker.tsx src/components/geo/ImportFlow.tsx
git commit -m "feat: add geo layer import flow with upload, preview, and confirm steps"
```

---

### Task 10: Admin Geo Layers Page

**Files:**
- Create: `src/app/admin/geo-layers/page.tsx`

- [ ] **Step 1: Create the admin page**

Create `src/app/admin/geo-layers/page.tsx`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConfig } from '@/lib/config/client';
import ImportFlow from '@/components/geo/ImportFlow';
import {
  createGeoLayer,
  listGeoLayers,
  updateGeoLayer,
  deleteGeoLayer,
  assignLayerToProperties,
} from './actions';
import type { GeoLayerSummary } from '@/lib/geo/types';

export default function GeoLayersAdminPage() {
  const config = useConfig();
  const orgId = config.orgId;
  const [layers, setLayers] = useState<GeoLayerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);

  const loadLayers = useCallback(async () => {
    if (!orgId) return;
    const result = await listGeoLayers(orgId);
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setLayers(result.layers);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    loadLayers();
  }, [loadLayers]);

  // Load properties list for assignment
  useEffect(() => {
    if (!orgId) return;
    // Properties are available from config context
    // For now, use config properties if available, or fetch separately
    if (config.properties) {
      setProperties(config.properties.map((p: any) => ({ id: p.id, name: p.name || p.slug })));
    }
  }, [orgId, config.properties]);

  const handleImport = async (data: {
    name: string;
    description: string;
    color: string;
    opacity: number;
    geojson: GeoJSON.FeatureCollection;
    sourceFormat: string;
    sourceFilename: string;
    featureCount: number;
    bbox: [number, number, number, number];
    isPropertyBoundary: boolean;
    assignedPropertyIds: string[];
  }) => {
    const result = await createGeoLayer({
      orgId: orgId!,
      name: data.name,
      description: data.description || undefined,
      geojson: data.geojson,
      sourceFormat: data.sourceFormat as any,
      sourceFilename: data.sourceFilename,
      color: data.color,
      opacity: data.opacity,
      featureCount: data.featureCount,
      bbox: data.bbox,
      isPropertyBoundary: data.isPropertyBoundary,
    });

    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
      return;
    }

    // Assign to properties if any selected
    if (data.assignedPropertyIds.length > 0) {
      await assignLayerToProperties(result.layerId, orgId!, data.assignedPropertyIds);
    }

    setMessage({ type: 'success', text: `Layer "${data.name}" imported successfully` });
    setShowImport(false);
    loadLayers();
  };

  const handleDelete = async (layer: GeoLayerSummary) => {
    if (!confirm(`Delete "${layer.name}"? This cannot be undone.`)) return;
    const result = await deleteGeoLayer(layer.id);
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setMessage({ type: 'success', text: `Layer "${layer.name}" deleted` });
      loadLayers();
    }
  };

  const handleSaveEdit = async (layerId: string) => {
    if (!editName.trim()) return;
    const result = await updateGeoLayer(layerId, { name: editName });
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setEditingId(null);
      loadLayers();
    }
  };

  const geometryLabel = (layer: GeoLayerSummary) => {
    // Infer from feature_count and source_format; we don't store geometry type on summary
    return layer.is_property_boundary ? 'Boundary' : 'Layer';
  };

  if (showImport) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <ImportFlow
          orgId={orgId!}
          properties={properties}
          onImport={handleImport}
          onCancel={() => setShowImport(false)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Geo Layers</h1>
          <p className="text-sm text-gray-500">
            {layers.length} layer{layers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowImport(true)} className="btn-primary">
          + Import Layer
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-2 font-medium">×</button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading layers...</p>
      ) : layers.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          <p>No geo layers yet.</p>
          <p className="text-sm mt-1">Import a GeoJSON, Shapefile, or KML file to get started.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Layer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Features</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {layers.map((layer) => (
                <tr key={layer.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: layer.color }} />
                      {editingId === layer.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="input-field text-sm py-1"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(layer.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button onClick={() => handleSaveEdit(layer.id)} className="text-blue-600 text-xs">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-gray-400 text-xs">Cancel</button>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-gray-800">{layer.name}</div>
                          {layer.is_property_boundary && (
                            <div className="text-xs text-blue-600">Property boundary</div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{layer.feature_count}</td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{layer.source_format}</td>
                  <td className="px-4 py-3 text-gray-500">{geometryLabel(layer)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setEditingId(layer.id); setEditName(layer.name); }}
                      className="text-gray-500 hover:text-gray-700 text-sm mr-3"
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

- [ ] **Step 2: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/geo-layers/page.tsx
git commit -m "feat: add admin geo layers management page"
```

---

### Task 11: Add Shapefile Detection to AI Context Parsers

**Files:**
- Modify: `src/lib/ai-context/parsers.ts`
- Modify: `src/__tests__/ai-context/parsers.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/ai-context/parsers.test.ts` in the `isGeoFile` describe block:

```typescript
it('identifies zip files as potential geo files (shapefiles)', () => {
  expect(isGeoFile('parcels.zip', 'application/zip')).toBe(true);
});
it('identifies zip files with x-zip MIME type', () => {
  expect(isGeoFile('parcels.zip', 'application/x-zip-compressed')).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify the new tests fail**

Run: `npm run test -- src/__tests__/ai-context/parsers.test.ts`
Expected: The two new tests FAIL.

- [ ] **Step 3: Add shapefile detection to parsers.ts**

In `src/lib/ai-context/parsers.ts`, add to the `GEO_MIME_TYPES` set:

```typescript
'application/zip',
'application/x-zip-compressed',
```

Add to the `GEO_EXTENSIONS` set:

```typescript
'zip',
```

Also add to `SUPPORTED_EXTENSIONS`:

```typescript
zip: 'application/zip',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/ai-context/parsers.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-context/parsers.ts src/__tests__/ai-context/parsers.test.ts
git commit -m "feat: add shapefile (.zip) detection to AI context parsers"
```

---

### Task 12: AI Onboarding Geo Review Step

**Files:**
- Modify: `src/app/onboard/page.tsx`
- Modify: `src/app/onboard/actions.ts`

This task extends the AI onboarding flow to detect geo files, show a review step for them, and create geo layers during org setup.

- [ ] **Step 1: Add 'ai-geo-review' step to onboard page**

In `src/app/onboard/page.tsx`, update the `Step` type and `AI_STEPS` array:

```typescript
type Step = 'welcome' | 'ai-upload' | 'ai-progress' | 'ai-geo-review' | 'ai-review' | 'name' | 'theme' | 'custommap' | 'items' | 'entities' | 'about' | 'review';
const AI_STEPS: Step[] = ['welcome', 'ai-upload', 'ai-progress', 'ai-geo-review', 'ai-review'];
```

- [ ] **Step 2: Add geo layer state to the onboard page**

Add state for detected geo layers near the top of the component:

```typescript
const [detectedGeoLayers, setDetectedGeoLayers] = useState<Array<{
  name: string;
  color: string;
  opacity: number;
  geojson: GeoJSON.FeatureCollection;
  sourceFormat: string;
  sourceFilename: string;
  featureCount: number;
  bbox: [number, number, number, number];
  isPropertyBoundary: boolean;
  enabled: boolean;
}>>([]);
```

- [ ] **Step 3: Detect geo files during AI analysis**

In the AI analysis flow (where files are parsed and `analyzeFilesForOnboarding` is called), after parsing files, detect geo files and parse them:

```typescript
// After existing file parsing, detect geo layers
import { parseGeoFile, detectGeoFormat } from '@/lib/geo/parsers';

// Inside the analysis flow, after parsing:
const geoLayers = [];
for (const file of files) {
  const format = detectGeoFormat(file.name, file.type);
  if (format) {
    try {
      const parsed = await parseGeoFile(file);
      geoLayers.push({
        name: parsed.name,
        color: '#3b82f6',
        opacity: 0.6,
        geojson: parsed.geojson,
        sourceFormat: parsed.sourceFormat,
        sourceFilename: parsed.sourceFilename,
        featureCount: parsed.featureCount,
        bbox: parsed.bbox,
        isPropertyBoundary: false,
        enabled: true,
      });
    } catch {
      // Non-fatal — skip files that fail to parse as geo
    }
  }
}
setDetectedGeoLayers(geoLayers);
```

- [ ] **Step 4: Add conditional step skip**

When advancing from `ai-progress`, skip `ai-geo-review` if no geo layers were detected:

```typescript
// In the step advancement logic:
if (step === 'ai-progress' && detectedGeoLayers.length === 0) {
  setStep('ai-review'); // skip geo review
} else {
  setStep('ai-geo-review');
}
```

- [ ] **Step 5: Render the ai-geo-review step**

Add the render block for this step. It should show a list of detected geo layers with toggles, name editing, color/boundary controls:

```typescript
{step === 'ai-geo-review' && (
  <div className="space-y-4">
    <h2 className="text-xl font-semibold">Geographic Layers Detected</h2>
    <p className="text-gray-600">We found geographic data in your uploaded files. Review and configure these layers.</p>

    {detectedGeoLayers.map((layer, index) => (
      <div key={index} className="card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={layer.enabled}
            onChange={() => {
              setDetectedGeoLayers((prev) =>
                prev.map((l, i) => i === index ? { ...l, enabled: !l.enabled } : l)
              );
            }}
            className="w-4 h-4"
          />
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: layer.color }} />
          <input
            type="text"
            value={layer.name}
            onChange={(e) => {
              setDetectedGeoLayers((prev) =>
                prev.map((l, i) => i === index ? { ...l, name: e.target.value } : l)
              );
            }}
            className="input-field flex-1"
          />
        </div>
        <div className="text-sm text-gray-500">
          {layer.featureCount} features from {layer.sourceFilename}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={layer.isPropertyBoundary}
            onChange={() => {
              setDetectedGeoLayers((prev) =>
                prev.map((l, i) => i === index ? { ...l, isPropertyBoundary: !l.isPropertyBoundary } : l)
              );
            }}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-700">Use as property boundary</span>
        </label>
      </div>
    ))}

    <div className="flex justify-between">
      <button onClick={() => setStep('ai-progress')} className="btn-secondary">Back</button>
      <button onClick={() => setStep('ai-review')} className="btn-primary">Next</button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Extend onboardCreateOrg to accept geo layers**

In `src/app/onboard/actions.ts`, extend the config parameter of `onboardCreateOrg` to accept geo layers:

```typescript
// Add to the config type:
geoLayers?: Array<{
  name: string;
  color: string;
  opacity: number;
  geojson: GeoJSON.FeatureCollection;
  sourceFormat: string;
  sourceFilename: string;
  featureCount: number;
  bbox: [number, number, number, number];
  isPropertyBoundary: boolean;
}>;
```

After the existing steps in `onboardCreateOrg` (after item types and entity types are created), add:

```typescript
// Create geo layers
if (config.geoLayers && config.geoLayers.length > 0) {
  const { createGeoLayerService, assignLayerToPropertyService } = await import('@/app/admin/geo-layers/actions');

  for (const layer of config.geoLayers) {
    const layerResult = await createGeoLayerService({
      orgId: org.id,
      name: layer.name,
      color: layer.color,
      opacity: layer.opacity,
      geojson: layer.geojson,
      sourceFormat: layer.sourceFormat as any,
      sourceFilename: layer.sourceFilename,
      featureCount: layer.featureCount,
      bbox: layer.bbox,
      isPropertyBoundary: layer.isPropertyBoundary,
      createdBy: user.id,
    });

    if ('success' in layerResult) {
      // Assign to default property
      await assignLayerToPropertyService(layerResult.layerId, defaultProperty.id, org.id);

      // Set as boundary if flagged
      if (layer.isPropertyBoundary) {
        await serviceClient
          .from('properties')
          .update({ boundary_layer_id: layerResult.layerId })
          .eq('id', defaultProperty.id);
      }
    }
  }
}
```

- [ ] **Step 7: Pass geo layers to onboardCreateOrg from the page**

In `src/app/onboard/page.tsx`, in the `handleLaunch` function, pass the enabled geo layers:

```typescript
const enabledGeoLayers = detectedGeoLayers.filter((l) => l.enabled);
const result = await onboardCreateOrg({
  ...config,
  geoLayers: enabledGeoLayers.length > 0 ? enabledGeoLayers : undefined,
});
```

- [ ] **Step 8: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 9: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/app/onboard/page.tsx src/app/onboard/actions.ts
git commit -m "feat: integrate geo layer detection and creation into AI onboarding flow"
```

---

### Task 13: Property Settings — Geo Layers Section

**Files:**
- Modify: `src/app/admin/properties/[slug]/settings/page.tsx`

- [ ] **Step 1: Add 'geo-layers' tab**

In the property settings page, add `'geo-layers'` to the `SettingsTab` type and the tabs array:

```typescript
type SettingsTab = 'general' | 'appearance' | 'custommap' | 'geo-layers' | 'about' | 'footer';
```

Add to the tabs array:

```typescript
{ key: 'geo-layers', label: 'Geo Layers' },
```

- [ ] **Step 2: Add geo layers tab content**

Add state and render the geo layers section when the tab is selected. This section shows layers assigned to the property, visibility toggles, and the boundary selector:

```typescript
import { getPropertyGeoLayers, setPropertyBoundary } from '@/app/admin/geo-layers/actions';
import type { GeoLayerSummary, GeoLayerProperty } from '@/lib/geo/types';

// State:
const [propertyGeoLayers, setPropertyGeoLayers] = useState<GeoLayerSummary[]>([]);
const [layerAssignments, setLayerAssignments] = useState<GeoLayerProperty[]>([]);
const [boundaryLayerId, setBoundaryLayerId] = useState<string | null>(null);

// Load on tab switch:
useEffect(() => {
  if (activeTab === 'geo-layers' && propertyId) {
    getPropertyGeoLayers(propertyId).then((result) => {
      if ('success' in result) {
        setPropertyGeoLayers(result.layers);
        setLayerAssignments(result.assignments);
      }
    });
    // Also load current boundary from property data
  }
}, [activeTab, propertyId]);
```

Render the tab content:

```typescript
{activeTab === 'geo-layers' && (
  <div className="space-y-6">
    {/* Boundary selector */}
    <div className="card p-4 space-y-2">
      <h3 className="font-medium">Property Boundary</h3>
      <p className="text-sm text-gray-500">Select a polygon layer to use as this property's boundary. Items and layers will be filtered to this area.</p>
      <select
        value={boundaryLayerId ?? ''}
        onChange={async (e) => {
          const value = e.target.value || null;
          setBoundaryLayerId(value);
          await setPropertyBoundary(propertyId, value);
        }}
        className="input-field"
      >
        <option value="">None</option>
        {propertyGeoLayers
          .filter((l) => l.is_property_boundary)
          .map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
      </select>
    </div>

    {/* Assigned layers */}
    <div>
      <h3 className="font-medium mb-2">Assigned Layers</h3>
      {propertyGeoLayers.length === 0 ? (
        <p className="text-sm text-gray-500">No layers assigned to this property. Manage layers in <a href="../geo-layers" className="text-blue-600 hover:underline">Geo Layers</a>.</p>
      ) : (
        <div className="space-y-2">
          {propertyGeoLayers.map((layer) => (
            <div key={layer.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: layer.color }} />
                <div>
                  <div className="text-sm font-medium">{layer.name}</div>
                  <div className="text-xs text-gray-500">{layer.feature_count} features</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    <a href="../geo-layers" className="text-sm text-blue-600 hover:underline">Manage all layers →</a>
  </div>
)}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/properties/[slug]/settings/page.tsx
git commit -m "feat: add geo layers section to property settings"
```

---

### Task 14: Wire Up Geo Layers in Home/Map Page

**Files:**
- Modify: The page component that renders `MapView` (likely `src/app/(public)/[slug]/page.tsx` or similar — the home/map page)

This task connects the stored geo layers to the MapView so they actually render on the public property map.

- [ ] **Step 1: Identify the home page that renders MapView**

Run: `grep -r "MapView" src/app --include="*.tsx" -l` to find which page renders MapView.

- [ ] **Step 2: Add geo layer data fetching**

In the page or parent component that renders MapView, add:

```typescript
import { getPropertyGeoLayers, getGeoLayer } from '@/app/admin/geo-layers/actions';
import type { GeoLayerSummary } from '@/lib/geo/types';
import type { FeatureCollection } from 'geojson';

// State:
const [geoLayers, setGeoLayers] = useState<GeoLayerSummary[]>([]);
const [visibleGeoLayerIds, setVisibleGeoLayerIds] = useState<Set<string>>(new Set());
const [geoLayerData, setGeoLayerData] = useState<Map<string, FeatureCollection>>(new Map());
const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<FeatureCollection | null>(null);
```

- [ ] **Step 3: Fetch layers on mount**

```typescript
useEffect(() => {
  if (!propertyId) return;
  getPropertyGeoLayers(propertyId).then(async (result) => {
    if (!('success' in result)) return;
    setGeoLayers(result.layers);

    // Set default visible layers
    const defaultVisible = new Set(
      result.assignments
        .filter((a: any) => a.visible_default)
        .map((a: any) => a.geo_layer_id)
    );
    setVisibleGeoLayerIds(defaultVisible);

    // Load GeoJSON for default visible layers
    for (const layerId of defaultVisible) {
      const layerResult = await getGeoLayer(layerId);
      if ('success' in layerResult) {
        setGeoLayerData((prev) => new Map(prev).set(layerId, layerResult.layer.geojson));
      }
    }

    // Load boundary if set
    if (property?.boundary_layer_id) {
      const boundaryResult = await getGeoLayer(property.boundary_layer_id);
      if ('success' in boundaryResult) {
        setBoundaryGeoJSON(boundaryResult.layer.geojson);
      }
    }
  });
}, [propertyId]);
```

- [ ] **Step 4: Add toggle handler that fetches on demand, with boundary clipping**

```typescript
import { clipLayerToBoundary } from '@/lib/geo/spatial';

const handleToggleGeoLayer = async (layerId: string) => {
  setVisibleGeoLayerIds((prev) => {
    const next = new Set(prev);
    if (next.has(layerId)) {
      next.delete(layerId);
    } else {
      next.add(layerId);
      // Fetch GeoJSON if not already loaded
      if (!geoLayerData.has(layerId)) {
        getGeoLayer(layerId).then((result) => {
          if ('success' in result) {
            // Clip to boundary if one is set
            const geojson = boundaryGeoJSON
              ? clipLayerToBoundary(result.layer.geojson, boundaryGeoJSON)
              : result.layer.geojson;
            setGeoLayerData((prev) => new Map(prev).set(layerId, geojson));
          }
        });
      }
    }
    return next;
  });
};
```

- [ ] **Step 5: Pass props to MapView**

```typescript
<MapView
  items={items}
  itemTypes={itemTypes}
  onMarkerClick={handleMarkerClick}
  geoLayers={geoLayers}
  geoLayerData={geoLayerData}
  boundaryGeoJSON={boundaryGeoJSON}
  visibleGeoLayerIds={visibleGeoLayerIds}
  onToggleGeoLayer={handleToggleGeoLayer}
/>
```

- [ ] **Step 6: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: wire up geo layer rendering on public property maps"
```

---

### Task 15: Spatial Filtering of Items by Boundary

**Files:**
- Modify: The page/component that fetches items for the map view

When a property has a boundary set, items should be filtered to only those within the boundary polygon.

- [ ] **Step 1: Add boundary filtering to item fetching**

In the page that fetches items for the map, after fetching items and the boundary:

```typescript
import { filterItemsByBoundary } from '@/lib/geo/spatial';

// After fetching items and boundaryGeoJSON:
const filteredItems = boundaryGeoJSON
  ? filterItemsByBoundary(items, boundaryGeoJSON)
  : items;
```

Pass `filteredItems` to MapView instead of `items`.

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: filter map items to property boundary when boundary is set"
```

---

### Task 16: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 2: Run type check**

Run: `npm run type-check`
Expected: No errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Run smoke tests if available**

Run: `npm run test:e2e:smoke`
Expected: Smoke tests pass (existing functionality unbroken).

- [ ] **Step 5: Final commit if any remaining changes**

```bash
git status
# If any uncommitted changes:
git add -A
git commit -m "chore: final cleanup for geo layers feature"
```
