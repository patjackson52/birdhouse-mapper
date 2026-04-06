# Parcel Boundary Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically look up US parcel boundaries from public ArcGIS sources given an address, and save results as geo layers.

**Architecture:** Server-side pipeline: Census Geocoder → TIGERweb FIPS → ArcGIS auto-discovery → parcel query → GeoJSON results stored as geo layers via existing `createGeoLayer()`. A global `county_gis_registry` table caches discovered ArcGIS endpoints. The UI is a state-machine component (idle → searching → found → confirmed).

**Tech Stack:** Next.js 14 server actions, Supabase PostgreSQL, Leaflet/react-leaflet, Turf.js, Census Geocoder API, ArcGIS REST API.

**Spec:** `docs/superpowers/specs/2026-04-05-parcel-lookup-design.md`

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `src/lib/geo/census-client.ts` | Census Geocoder (address→lat/lng) and TIGERweb (lat/lng→FIPS) API clients |
| `src/lib/geo/field-matcher.ts` | Heuristic matching of ArcGIS field names to canonical parcel fields |
| `src/lib/geo/arcgis-client.ts` | ArcGIS Hub search, FeatureServer metadata, and parcel queries |
| `src/lib/geo/parcel-lookup.ts` | Orchestrator: chains census→FIPS→discovery→query into one pipeline |
| `src/app/admin/properties/[slug]/parcel-lookup/actions.ts` | Server actions: `lookupParcel`, `confirmParcelSelection` |
| `src/app/admin/properties/[slug]/parcel-lookup/page.tsx` | Page wrapper for parcel lookup |
| `src/components/geo/ParcelLookup.tsx` | Main UI component (state machine) |
| `src/components/geo/ParcelPreviewMap.tsx` | Leaflet map showing parcel candidates |
| `supabase/migrations/034_county_gis_registry.sql` | `county_gis_registry` table |
| `supabase/migrations/035_parcel_lookups.sql` | `parcel_lookups` audit table |
| `supabase/migrations/036_geo_layer_source_parcel.sql` | Add `'parcel_lookup'` to source check constraint |
| `src/__tests__/geo/census-client.test.ts` | Census client unit tests |
| `src/__tests__/geo/field-matcher.test.ts` | Field matcher unit tests |
| `src/__tests__/geo/arcgis-client.test.ts` | ArcGIS client unit tests |
| `src/__tests__/geo/parcel-lookup.test.ts` | Pipeline orchestrator unit tests |

### Modified files

| File | Change |
|---|---|
| `src/lib/geo/types.ts` | Add `ParcelCandidate`, `ParcelLookupResult`, `CountyGISConfig`, `FieldMap` types; add `'parcel_lookup'` to `GeoLayerSource` |
| `src/app/admin/properties/[slug]/layout.tsx` | Add "Parcel Lookup" nav item |
| `src/app/admin/geo-layers/actions.ts` | Update `CreateGeoLayerInput.source` type to include `'parcel_lookup'` |

---

## Task 1: Database Migrations

**Files:**
- Create: `supabase/migrations/034_county_gis_registry.sql`
- Create: `supabase/migrations/035_parcel_lookups.sql`
- Create: `supabase/migrations/036_geo_layer_source_parcel.sql`

- [ ] **Step 1: Create county_gis_registry migration**

```sql
-- supabase/migrations/034_county_gis_registry.sql
CREATE TABLE county_gis_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fips text UNIQUE NOT NULL,
  county_name text NOT NULL,
  state text NOT NULL,
  parcel_layer_url text NOT NULL,
  address_layer_url text,
  field_map jsonb NOT NULL DEFAULT '{}',
  discovery_method text NOT NULL DEFAULT 'auto' CHECK (discovery_method IN ('manual', 'auto')),
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('high', 'medium', 'low')),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_county_gis_registry_fips ON county_gis_registry (fips);
CREATE INDEX idx_county_gis_registry_state ON county_gis_registry (state);
```

- [ ] **Step 2: Create parcel_lookups migration**

```sql
-- supabase/migrations/035_parcel_lookups.sql
CREATE TABLE parcel_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  input_address text,
  input_lat numeric,
  input_lng numeric,
  county_fips text,
  source text NOT NULL DEFAULT 'county_arcgis',
  status text NOT NULL CHECK (status IN ('success', 'partial', 'not_found', 'error')),
  parcels_found integer NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  result_geo_layer_id uuid REFERENCES geo_layers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_parcel_lookups_org_id ON parcel_lookups (org_id);
CREATE INDEX idx_parcel_lookups_property_id ON parcel_lookups (property_id);

ALTER TABLE parcel_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view parcel lookups"
  ON parcel_lookups FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM org_memberships WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Org admins can insert parcel lookups"
  ON parcel_lookups FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (
    SELECT om.org_id FROM org_memberships om
    JOIN roles r ON r.id = om.role_id
    WHERE om.user_id = auth.uid() AND om.status = 'active'
    AND r.base_role IN ('owner', 'admin', 'staff')
  ));
```

- [ ] **Step 3: Create source constraint migration**

```sql
-- supabase/migrations/036_geo_layer_source_parcel.sql
ALTER TABLE geo_layers DROP CONSTRAINT IF EXISTS geo_layers_source_check;
ALTER TABLE geo_layers ADD CONSTRAINT geo_layers_source_check
  CHECK (source IN ('manual', 'ai', 'discovered', 'parcel_lookup'));
```

- [ ] **Step 4: Run migrations**

Run: `npx supabase db push` (or apply via your local Supabase workflow)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/034_county_gis_registry.sql supabase/migrations/035_parcel_lookups.sql supabase/migrations/036_geo_layer_source_parcel.sql
git commit -m "feat(parcel-lookup): add county_gis_registry and parcel_lookups tables (#205)"
```

---

## Task 2: Types

**Files:**
- Modify: `src/lib/geo/types.ts`
- Modify: `src/app/admin/geo-layers/actions.ts:20` (source type)

- [ ] **Step 1: Add parcel lookup types to `src/lib/geo/types.ts`**

Add at the end of the file, after the `FeatureGroup` interface (after line 89):

```typescript
// --- Parcel Lookup Types ---

export type GeoLayerSource = 'manual' | 'ai' | 'discovered' | 'parcel_lookup';

export interface FieldMap {
  parcel_id: string;
  owner_name?: string;
  site_address?: string;
  house_number?: string;
  street_name?: string;
  acres?: string;
  address_link_field?: string;
}

export interface CountyGISConfig {
  id: string;
  fips: string;
  county_name: string;
  state: string;
  parcel_layer_url: string;
  address_layer_url: string | null;
  field_map: FieldMap;
  discovery_method: 'manual' | 'auto';
  confidence: 'high' | 'medium' | 'low';
  last_verified_at: string | null;
}

export interface ParcelCandidate {
  apn: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  acres: number | null;
  owner_of_record: string | null;
  site_address: string | null;
  source_url: string;
}

export type ParcelLookupStatus = 'found' | 'multiple' | 'not_found' | 'error';

export interface ParcelLookupResult {
  status: ParcelLookupStatus;
  parcels: ParcelCandidate[];
  source: 'county_arcgis' | null;
  county_fips: string | null;
  county_name: string | null;
  error_message?: string;
}
```

Note: this redefines `GeoLayerSource` — update the existing definition on line 6 to include `'parcel_lookup'`:

Change line 6 from:
```typescript
export type GeoLayerSource = 'manual' | 'ai' | 'discovered';
```
to:
```typescript
export type GeoLayerSource = 'manual' | 'ai' | 'discovered' | 'parcel_lookup';
```

And do NOT add the duplicate `GeoLayerSource` in the new types block — just add `FieldMap`, `CountyGISConfig`, `ParcelCandidate`, `ParcelLookupStatus`, and `ParcelLookupResult`.

- [ ] **Step 2: Update CreateGeoLayerInput source type in `src/app/admin/geo-layers/actions.ts`**

Change line 20 from:
```typescript
  source?: 'manual' | 'ai' | 'discovered';
```
to:
```typescript
  source?: 'manual' | 'ai' | 'discovered' | 'parcel_lookup';
```

- [ ] **Step 3: Run type check**

Run: `npm run type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/geo/types.ts src/app/admin/geo-layers/actions.ts
git commit -m "feat(parcel-lookup): add parcel lookup types and extend GeoLayerSource (#205)"
```

---

## Task 3: Census Client (Geocoder + FIPS)

**Files:**
- Create: `src/lib/geo/census-client.ts`
- Create: `src/__tests__/geo/census-client.test.ts`

- [ ] **Step 1: Write failing tests for census client**

Create `src/__tests__/geo/census-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocodeAddress, resolveCountyFips } from '@/lib/geo/census-client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('geocodeAddress', () => {
  it('returns lat/lng for a valid address', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          addressMatches: [
            {
              coordinates: { x: -122.555, y: 47.634 },
              matchedAddress: '7550 FLETCHER BAY RD NE, BAINBRIDGE ISLAND, WA, 98110',
            },
          ],
        },
      }),
    });

    const result = await geocodeAddress('7550 Fletcher Bay Rd NE, Bainbridge Island, WA');
    expect(result).toEqual({
      lat: 47.634,
      lng: -122.555,
      matchedAddress: '7550 FLETCHER BAY RD NE, BAINBRIDGE ISLAND, WA, 98110',
    });
  });

  it('returns null when no matches found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { addressMatches: [] },
      }),
    });

    const result = await geocodeAddress('nonexistent address');
    expect(result).toBeNull();
  });

  it('returns null on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await geocodeAddress('some address');
    expect(result).toBeNull();
  });
});

describe('resolveCountyFips', () => {
  it('returns county FIPS and name for valid coordinates', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          geographies: {
            Counties: [
              { GEOID: '53035', NAME: 'Kitsap', STATE: '53', COUNTY: '035' },
            ],
          },
        },
      }),
    });

    const result = await resolveCountyFips(47.634, -122.555);
    expect(result).toEqual({
      fips: '53035',
      county_name: 'Kitsap',
      state_fips: '53',
    });
  });

  it('returns null when no county found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { geographies: { Counties: [] } },
      }),
    });

    const result = await resolveCountyFips(0, 0);
    expect(result).toBeNull();
  });

  it('returns null on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await resolveCountyFips(47.634, -122.555);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/__tests__/geo/census-client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement census client**

Create `src/lib/geo/census-client.ts`:

```typescript
const CENSUS_GEOCODER_BASE = 'https://geocoding.geo.census.gov/geocoder';

export interface GeocodeResult {
  lat: number;
  lng: number;
  matchedAddress: string;
}

export interface CountyFipsResult {
  fips: string;
  county_name: string;
  state_fips: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    const params = new URLSearchParams({
      address,
      benchmark: 'Public_AR_Current',
      format: 'json',
    });
    const res = await fetch(`${CENSUS_GEOCODER_BASE}/locations/onelineaddress?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    const matches = data?.result?.addressMatches;
    if (!matches || matches.length === 0) return null;

    const match = matches[0];
    return {
      lat: match.coordinates.y,
      lng: match.coordinates.x,
      matchedAddress: match.matchedAddress,
    };
  } catch {
    return null;
  }
}

export async function resolveCountyFips(
  lat: number,
  lng: number
): Promise<CountyFipsResult | null> {
  try {
    const params = new URLSearchParams({
      x: String(lng),
      y: String(lat),
      benchmark: 'Public_AR_Current',
      vintage: 'Current_Current',
      layers: 'Counties',
      format: 'json',
    });
    const res = await fetch(`${CENSUS_GEOCODER_BASE}/geographies/coordinates?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    const counties = data?.result?.geographies?.Counties;
    if (!counties || counties.length === 0) return null;

    const county = counties[0];
    return {
      fips: county.GEOID,
      county_name: county.NAME,
      state_fips: county.STATE,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/geo/census-client.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo/census-client.ts src/__tests__/geo/census-client.test.ts
git commit -m "feat(parcel-lookup): add Census geocoder and FIPS client (#205)"
```

---

## Task 4: Field Matcher

**Files:**
- Create: `src/lib/geo/field-matcher.ts`
- Create: `src/__tests__/geo/field-matcher.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/geo/field-matcher.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { matchFields, type FieldMatchResult } from '@/lib/geo/field-matcher';

describe('matchFields', () => {
  it('matches Kitsap County field names', () => {
    const fields = [
      'OBJECTID', 'APN', 'RP_ACCT_ID', 'Shape__Area', 'Shape__Length',
      'CONTACT_NAME', 'SITE_ADDR', 'POLY_ACRES', 'ZONE_CODE',
    ];
    const result = matchFields(fields);
    expect(result.field_map.parcel_id).toBe('APN');
    expect(result.field_map.owner_name).toBe('CONTACT_NAME');
    expect(result.field_map.site_address).toBe('SITE_ADDR');
    expect(result.field_map.acres).toBe('POLY_ACRES');
    expect(result.confidence).toBe('high');
  });

  it('matches King County field names', () => {
    const fields = [
      'OBJECTID', 'PIN', 'MAJOR', 'MINOR', 'TAXPAYER_NAME',
      'PROP_ADDR', 'GIS_ACRES', 'Shape',
    ];
    const result = matchFields(fields);
    expect(result.field_map.parcel_id).toBe('PIN');
    expect(result.field_map.owner_name).toBe('TAXPAYER_NAME');
    expect(result.field_map.site_address).toBe('PROP_ADDR');
    expect(result.field_map.acres).toBe('GIS_ACRES');
    expect(result.confidence).toBe('high');
  });

  it('returns low confidence when only parcel_id matched', () => {
    const fields = ['OBJECTID', 'PARCEL_NUM', 'Shape', 'GlobalID'];
    const result = matchFields(fields);
    expect(result.field_map.parcel_id).toBe('PARCEL_NUM');
    expect(result.confidence).toBe('low');
  });

  it('returns medium confidence with parcel_id + one other', () => {
    const fields = ['OBJECTID', 'APN', 'OWNER', 'Shape'];
    const result = matchFields(fields);
    expect(result.field_map.parcel_id).toBe('APN');
    expect(result.field_map.owner_name).toBe('OWNER');
    expect(result.confidence).toBe('medium');
  });

  it('returns null when no parcel_id field found', () => {
    const fields = ['OBJECTID', 'Shape', 'GlobalID', 'NAME'];
    const result = matchFields(fields);
    expect(result).toBeNull();
  });

  it('handles case-insensitive matching', () => {
    const fields = ['objectid', 'apn', 'owner_name', 'site_addr', 'acres'];
    const result = matchFields(fields);
    expect(result).not.toBeNull();
    expect(result!.field_map.parcel_id).toBe('apn');
  });

  it('prefers exact matches over substring matches', () => {
    // APN is an exact match for parcel_id; APN_SUFFIX should not steal it
    const fields = ['APN', 'APN_SUFFIX', 'OWNER'];
    const result = matchFields(fields);
    expect(result!.field_map.parcel_id).toBe('APN');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/__tests__/geo/field-matcher.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement field matcher**

Create `src/lib/geo/field-matcher.ts`:

```typescript
import type { FieldMap } from './types';

export interface FieldMatchResult {
  field_map: FieldMap;
  confidence: 'high' | 'medium' | 'low';
  matched_count: number;
}

interface PatternEntry {
  canonical: keyof FieldMap;
  exact: string[];    // exact match (case-insensitive)
  prefix: string[];   // prefix match (case-insensitive)
}

const PATTERNS: PatternEntry[] = [
  {
    canonical: 'parcel_id',
    exact: ['APN', 'PIN', 'PARCEL_ID', 'PARCEL_NO', 'PARCEL_NUM', 'ACCT_ID', 'RP_ACCT_ID', 'TAX_ID', 'TAXLOT_ID', 'PARCELID', 'PARCEL_NUMBER'],
    prefix: ['PARCEL', 'TAX_PARCEL'],
  },
  {
    canonical: 'owner_name',
    exact: ['OWNER', 'OWNER_NAME', 'OWN_NAME', 'CONTACT_NAME', 'TAXPAYER', 'TAXPAYER_NAME', 'OWNERNAME'],
    prefix: ['OWNER', 'OWN_'],
  },
  {
    canonical: 'site_address',
    exact: ['SITE_ADDR', 'SITEADDRESS', 'SITE_ADDRESS', 'PROP_ADDR', 'ADDRESS', 'FULL_ADDR', 'FULL_ADDRESS', 'PROPADDR'],
    prefix: ['SITE_ADDR', 'PROP_ADDR', 'FULL_ADDR'],
  },
  {
    canonical: 'house_number',
    exact: ['HOUSE_NO', 'HOUSE_NUM', 'ADDR_NUM', 'STREET_NO', 'HOUSE_NUMBER', 'ADDNO', 'ADDR_NO'],
    prefix: ['HOUSE_N', 'ADDR_N'],
  },
  {
    canonical: 'street_name',
    exact: ['STREET_NAME', 'STREET', 'STREET_NM', 'ST_NAME', 'STREETNAME'],
    prefix: ['STREET_N', 'ST_NAME'],
  },
  {
    canonical: 'acres',
    exact: ['ACRES', 'POLY_ACRES', 'GIS_ACRES', 'AREA_ACRES', 'CALC_ACRES', 'ACREAGE', 'TOTAL_ACRES'],
    prefix: [],
  },
];

export function matchFields(fields: string[]): FieldMatchResult | null {
  const fieldMap: Partial<FieldMap> = {};
  const usedFields = new Set<string>();

  for (const pattern of PATTERNS) {
    const match = findBestMatch(fields, pattern, usedFields);
    if (match) {
      fieldMap[pattern.canonical] = match;
      usedFields.add(match.toUpperCase());
    }
  }

  if (!fieldMap.parcel_id) return null;

  // Count non-parcel_id matches
  const otherMatches = Object.keys(fieldMap).filter((k) => k !== 'parcel_id').length;

  let confidence: 'high' | 'medium' | 'low';
  if (otherMatches >= 2) {
    confidence = 'high';
  } else if (otherMatches === 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    field_map: { parcel_id: fieldMap.parcel_id, ...fieldMap } as FieldMap,
    confidence,
    matched_count: otherMatches + 1,
  };
}

function findBestMatch(
  fields: string[],
  pattern: PatternEntry,
  usedFields: Set<string>
): string | null {
  // 1. Try exact matches first (case-insensitive)
  for (const exact of pattern.exact) {
    const found = fields.find(
      (f) => f.toUpperCase() === exact.toUpperCase() && !usedFields.has(f.toUpperCase())
    );
    if (found) return found;
  }

  // 2. Try prefix matches (case-insensitive)
  for (const prefix of pattern.prefix) {
    const found = fields.find(
      (f) => f.toUpperCase().startsWith(prefix.toUpperCase()) && !usedFields.has(f.toUpperCase())
    );
    if (found) return found;
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/geo/field-matcher.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo/field-matcher.ts src/__tests__/geo/field-matcher.test.ts
git commit -m "feat(parcel-lookup): add heuristic ArcGIS field matcher (#205)"
```

---

## Task 5: ArcGIS Client

**Files:**
- Create: `src/lib/geo/arcgis-client.ts`
- Create: `src/__tests__/geo/arcgis-client.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/geo/arcgis-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchArcGISHub,
  fetchFeatureServerFields,
  queryParcelsByPoint,
  queryParcelsByEnvelope,
} from '@/lib/geo/arcgis-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('searchArcGISHub', () => {
  it('returns matching feature service URLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'Tax Parcel Polygons',
            url: 'https://services6.arcgis.com/abc/arcgis/rest/services/Tax_Parcels/FeatureServer',
            type: 'Feature Service',
          },
          {
            title: 'Zoning Districts',
            url: 'https://services6.arcgis.com/abc/arcgis/rest/services/Zoning/FeatureServer',
            type: 'Feature Service',
          },
        ],
      }),
    });

    const results = await searchArcGISHub('Kitsap', 'WA');
    // Only parcel-related results returned
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Tax Parcel Polygons');
  });

  it('returns empty array on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const results = await searchArcGISHub('Test', 'WA');
    expect(results).toEqual([]);
  });
});

describe('fetchFeatureServerFields', () => {
  it('returns field names from FeatureServer metadata', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fields: [
          { name: 'APN', type: 'esriFieldTypeString' },
          { name: 'OWNER', type: 'esriFieldTypeString' },
          { name: 'Shape', type: 'esriFieldTypeGeometry' },
        ],
        geometryType: 'esriGeometryPolygon',
      }),
    });

    const result = await fetchFeatureServerFields(
      'https://services6.arcgis.com/abc/arcgis/rest/services/Parcels/FeatureServer/0'
    );
    expect(result?.fields).toEqual(['APN', 'OWNER', 'Shape']);
    expect(result?.geometryType).toBe('esriGeometryPolygon');
  });

  it('returns null on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    const result = await fetchFeatureServerFields('https://bad-url');
    expect(result).toBeNull();
  });
});

describe('queryParcelsByPoint', () => {
  it('returns GeoJSON features for a point query', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { APN: '1311562', POLY_ACRES: 2.96 },
            geometry: {
              type: 'Polygon',
              coordinates: [[[-122.56, 47.63], [-122.55, 47.63], [-122.55, 47.64], [-122.56, 47.64], [-122.56, 47.63]]],
            },
          },
        ],
      }),
    });

    const features = await queryParcelsByPoint(
      'https://services6.arcgis.com/abc/arcgis/rest/services/Parcels/FeatureServer/0',
      47.634,
      -122.555
    );
    expect(features.length).toBe(1);
    expect(features[0].properties?.APN).toBe('1311562');
  });

  it('returns empty array when no parcels found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [],
      }),
    });

    const features = await queryParcelsByPoint(
      'https://example.com/FeatureServer/0',
      0,
      0
    );
    expect(features).toEqual([]);
  });
});

describe('queryParcelsByEnvelope', () => {
  it('returns features within bounding box filtered by where clause', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { APN: '1311273', CONTACT_NAME: 'ROLLING BAY LAND COMPANY' },
            geometry: {
              type: 'Polygon',
              coordinates: [[[-122.56, 47.63], [-122.54, 47.63], [-122.54, 47.64], [-122.56, 47.64], [-122.56, 47.63]]],
            },
          },
        ],
      }),
    });

    const features = await queryParcelsByEnvelope(
      'https://services6.arcgis.com/abc/arcgis/rest/services/Parcels/FeatureServer/0',
      [-122.562, 47.628, -122.548, 47.640],
      "CONTACT_NAME LIKE '%ROLLING BAY%'"
    );
    expect(features.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/__tests__/geo/arcgis-client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ArcGIS client**

Create `src/lib/geo/arcgis-client.ts`:

```typescript
const ARCGIS_HUB_SEARCH = 'https://www.arcgis.com/sharing/rest/search';

const PARCEL_KEYWORDS = ['parcel', 'tax', 'lot', 'cadastral', 'assessor'];

export interface HubSearchResult {
  title: string;
  url: string;
}

export interface FeatureServerMeta {
  fields: string[];
  geometryType: string;
}

export async function searchArcGISHub(
  countyName: string,
  state: string
): Promise<HubSearchResult[]> {
  try {
    const query = `${countyName} ${state} parcel polygon`;
    const params = new URLSearchParams({
      q: query,
      type: 'Feature Service',
      num: '20',
      f: 'json',
    });
    const res = await fetch(`${ARCGIS_HUB_SEARCH}?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    const results: HubSearchResult[] = (data.results ?? [])
      .filter((r: { title: string; type: string }) => {
        const titleLower = r.title.toLowerCase();
        return PARCEL_KEYWORDS.some((kw) => titleLower.includes(kw));
      })
      .map((r: { title: string; url: string }) => ({
        title: r.title,
        url: r.url,
      }));

    return results;
  } catch {
    return [];
  }
}

export async function fetchFeatureServerFields(
  layerUrl: string
): Promise<FeatureServerMeta | null> {
  try {
    const res = await fetch(`${layerUrl}?f=json`);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.fields) return null;

    return {
      fields: data.fields.map((f: { name: string }) => f.name),
      geometryType: data.geometryType ?? '',
    };
  } catch {
    return null;
  }
}

export async function queryParcelsByPoint(
  layerUrl: string,
  lat: number,
  lng: number
): Promise<GeoJSON.Feature[]> {
  try {
    const params = new URLSearchParams({
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      outSR: '4326',
      f: 'geojson',
    });
    const res = await fetch(`${layerUrl}/query?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    return data.features ?? [];
  } catch {
    return [];
  }
}

export async function queryParcelsByEnvelope(
  layerUrl: string,
  bbox: [number, number, number, number],
  where?: string
): Promise<GeoJSON.Feature[]> {
  try {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const params = new URLSearchParams({
      geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      where: where ?? '1=1',
      outFields: '*',
      outSR: '4326',
      f: 'geojson',
    });
    const res = await fetch(`${layerUrl}/query?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    return data.features ?? [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/geo/arcgis-client.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo/arcgis-client.ts src/__tests__/geo/arcgis-client.test.ts
git commit -m "feat(parcel-lookup): add ArcGIS Hub search and query client (#205)"
```

---

## Task 6: Parcel Lookup Pipeline Orchestrator

**Files:**
- Create: `src/lib/geo/parcel-lookup.ts`
- Create: `src/__tests__/geo/parcel-lookup.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/geo/parcel-lookup.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runParcelLookup } from '@/lib/geo/parcel-lookup';

// Mock all dependencies
vi.mock('@/lib/geo/census-client', () => ({
  geocodeAddress: vi.fn(),
  resolveCountyFips: vi.fn(),
}));

vi.mock('@/lib/geo/arcgis-client', () => ({
  searchArcGISHub: vi.fn(),
  fetchFeatureServerFields: vi.fn(),
  queryParcelsByPoint: vi.fn(),
  queryParcelsByEnvelope: vi.fn(),
}));

vi.mock('@/lib/geo/field-matcher', () => ({
  matchFields: vi.fn(),
}));

import { geocodeAddress, resolveCountyFips } from '@/lib/geo/census-client';
import { searchArcGISHub, fetchFeatureServerFields, queryParcelsByPoint, queryParcelsByEnvelope } from '@/lib/geo/arcgis-client';
import { matchFields } from '@/lib/geo/field-matcher';

const mockGeocodeAddress = vi.mocked(geocodeAddress);
const mockResolveCountyFips = vi.mocked(resolveCountyFips);
const mockSearchArcGISHub = vi.mocked(searchArcGISHub);
const mockFetchFields = vi.mocked(fetchFeatureServerFields);
const mockQueryByPoint = vi.mocked(queryParcelsByPoint);
const mockQueryByEnvelope = vi.mocked(queryParcelsByEnvelope);
const mockMatchFields = vi.mocked(matchFields);

beforeEach(() => {
  vi.clearAllMocks();
});

const MOCK_PARCEL_FEATURE: GeoJSON.Feature = {
  type: 'Feature',
  properties: { APN: '1311562', POLY_ACRES: 2.96, CONTACT_NAME: 'SMITH' },
  geometry: {
    type: 'Polygon',
    coordinates: [[[-122.56, 47.63], [-122.55, 47.63], [-122.55, 47.64], [-122.56, 47.64], [-122.56, 47.63]]],
  },
};

describe('runParcelLookup', () => {
  it('returns not_found when geocoding fails', async () => {
    mockGeocodeAddress.mockResolvedValueOnce(null);

    const result = await runParcelLookup({ address: 'bad address', registryLookup: async () => null, registrySave: async () => {} });
    expect(result.status).toBe('not_found');
    expect(result.error_message).toContain('geocode');
  });

  it('returns not_found when FIPS resolution fails', async () => {
    mockGeocodeAddress.mockResolvedValueOnce({ lat: 47.634, lng: -122.555, matchedAddress: 'test' });
    mockResolveCountyFips.mockResolvedValueOnce(null);

    const result = await runParcelLookup({ address: '123 Main St', registryLookup: async () => null, registrySave: async () => {} });
    expect(result.status).toBe('not_found');
    expect(result.error_message).toContain('county');
  });

  it('auto-discovers endpoint and returns found parcel', async () => {
    // Step 1: geocode
    mockGeocodeAddress.mockResolvedValueOnce({ lat: 47.634, lng: -122.555, matchedAddress: 'test' });
    // Step 2: FIPS
    mockResolveCountyFips.mockResolvedValueOnce({ fips: '53035', county_name: 'Kitsap', state_fips: '53' });
    // Step 3: no registry entry, so auto-discover
    // (registry lookup is via supabase — we mock the whole pipeline flow by having discovery succeed)
    mockSearchArcGISHub.mockResolvedValueOnce([
      { title: 'Tax Parcels', url: 'https://example.com/Parcels/FeatureServer' },
    ]);
    mockFetchFields.mockResolvedValueOnce({
      fields: ['APN', 'CONTACT_NAME', 'POLY_ACRES', 'Shape'],
      geometryType: 'esriGeometryPolygon',
    });
    mockMatchFields.mockReturnValueOnce({
      field_map: { parcel_id: 'APN', owner_name: 'CONTACT_NAME', acres: 'POLY_ACRES' },
      confidence: 'high',
      matched_count: 3,
    });
    // Step 4: query parcels
    mockQueryByPoint.mockResolvedValueOnce([MOCK_PARCEL_FEATURE]);
    // Step 5: adjacent parcels (none found)
    mockQueryByEnvelope.mockResolvedValueOnce([]);

    const result = await runParcelLookup({
      address: '7550 Fletcher Bay Rd',
      registryLookup: async () => null,
      registrySave: async () => {},
    });

    expect(result.status).toBe('found');
    expect(result.parcels.length).toBe(1);
    expect(result.parcels[0].apn).toBe('1311562');
    expect(result.parcels[0].acres).toBe(2.96);
    expect(result.county_fips).toBe('53035');
  });

  it('uses cached registry entry when available', async () => {
    mockGeocodeAddress.mockResolvedValueOnce({ lat: 47.634, lng: -122.555, matchedAddress: 'test' });
    mockResolveCountyFips.mockResolvedValueOnce({ fips: '53035', county_name: 'Kitsap', state_fips: '53' });
    mockQueryByPoint.mockResolvedValueOnce([MOCK_PARCEL_FEATURE]);
    mockQueryByEnvelope.mockResolvedValueOnce([]);

    const cachedConfig = {
      id: 'test-id',
      fips: '53035',
      county_name: 'Kitsap',
      state: 'WA',
      parcel_layer_url: 'https://example.com/Parcels/FeatureServer/0',
      address_layer_url: null,
      field_map: { parcel_id: 'APN', owner_name: 'CONTACT_NAME', acres: 'POLY_ACRES' },
      discovery_method: 'auto' as const,
      confidence: 'high' as const,
      last_verified_at: null,
    };

    const result = await runParcelLookup({
      address: '7550 Fletcher Bay Rd',
      registryLookup: async () => cachedConfig,
      registrySave: async () => {},
    });

    expect(result.status).toBe('found');
    // Should NOT have called discovery
    expect(mockSearchArcGISHub).not.toHaveBeenCalled();
  });

  it('returns multiple when adjacent same-owner parcels found', async () => {
    mockGeocodeAddress.mockResolvedValueOnce({ lat: 47.634, lng: -122.555, matchedAddress: 'test' });
    mockResolveCountyFips.mockResolvedValueOnce({ fips: '53035', county_name: 'Kitsap', state_fips: '53' });
    mockQueryByPoint.mockResolvedValueOnce([MOCK_PARCEL_FEATURE]);

    const adjacentFeature: GeoJSON.Feature = {
      type: 'Feature',
      properties: { APN: '1311273', POLY_ACRES: 19.89, CONTACT_NAME: 'SMITH' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-122.57, 47.63], [-122.55, 47.63], [-122.55, 47.65], [-122.57, 47.65], [-122.57, 47.63]]],
      },
    };
    mockQueryByEnvelope.mockResolvedValueOnce([MOCK_PARCEL_FEATURE, adjacentFeature]);

    const result = await runParcelLookup({
      address: '7550 Fletcher Bay Rd',
      registryLookup: async () => ({
        id: 'test',
        fips: '53035',
        county_name: 'Kitsap',
        state: 'WA',
        parcel_layer_url: 'https://example.com/Parcels/FeatureServer/0',
        address_layer_url: null,
        field_map: { parcel_id: 'APN', owner_name: 'CONTACT_NAME', acres: 'POLY_ACRES' },
        discovery_method: 'auto' as const,
        confidence: 'high' as const,
        last_verified_at: null,
      }),
      registrySave: async () => {},
    });

    expect(result.status).toBe('multiple');
    expect(result.parcels.length).toBe(2);
  });

  it('returns not_found when discovery finds no parcel layers', async () => {
    mockGeocodeAddress.mockResolvedValueOnce({ lat: 47.634, lng: -122.555, matchedAddress: 'test' });
    mockResolveCountyFips.mockResolvedValueOnce({ fips: '53035', county_name: 'Kitsap', state_fips: '53' });
    mockSearchArcGISHub.mockResolvedValueOnce([]);

    const result = await runParcelLookup({
      address: '123 Main St',
      registryLookup: async () => null,
      registrySave: async () => {},
    });

    expect(result.status).toBe('not_found');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/__tests__/geo/parcel-lookup.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the pipeline orchestrator**

Create `src/lib/geo/parcel-lookup.ts`:

```typescript
import { geocodeAddress, resolveCountyFips } from './census-client';
import { searchArcGISHub, fetchFeatureServerFields, queryParcelsByPoint, queryParcelsByEnvelope } from './arcgis-client';
import { matchFields } from './field-matcher';
import type { ParcelCandidate, ParcelLookupResult, CountyGISConfig, FieldMap } from './types';
import bbox from '@turf/bbox';

export interface ParcelLookupInput {
  address: string;
  /** Injected dependency: look up registry by FIPS. Null = not found. */
  registryLookup: (fips: string) => Promise<CountyGISConfig | null>;
  /** Injected dependency: save a discovered config to the registry. */
  registrySave: (config: Omit<CountyGISConfig, 'id' | 'last_verified_at'>) => Promise<void>;
}

const ADJACENT_BUFFER_DEGREES = 0.01; // ~800m

export async function runParcelLookup(input: ParcelLookupInput): Promise<ParcelLookupResult> {
  const emptyResult = (status: ParcelLookupResult['status'], error_message?: string): ParcelLookupResult => ({
    status,
    parcels: [],
    source: null,
    county_fips: null,
    county_name: null,
    error_message,
  });

  // Step 1: Geocode
  const geo = await geocodeAddress(input.address);
  if (!geo) return emptyResult('not_found', 'Could not geocode address. Check the address and try again.');

  // Step 2: Resolve county FIPS
  const fipsResult = await resolveCountyFips(geo.lat, geo.lng);
  if (!fipsResult) return emptyResult('not_found', 'Could not determine county for this location.');

  // Step 3: Resolve ArcGIS endpoint
  let config = await input.registryLookup(fipsResult.fips);

  if (!config) {
    // Auto-discover
    config = await discoverEndpoint(fipsResult.county_name, fipsResult.state_fips, fipsResult.fips);
    if (config) {
      await input.registrySave(config);
    }
  }

  if (!config) {
    return emptyResult('not_found', `No parcel data source found for ${fipsResult.county_name} County.`);
  }

  // Step 4: Query parcels at point
  const features = await queryParcelsByPoint(config.parcel_layer_url, geo.lat, geo.lng);
  if (features.length === 0) {
    return {
      status: 'not_found',
      parcels: [],
      source: 'county_arcgis',
      county_fips: fipsResult.fips,
      county_name: fipsResult.county_name,
      error_message: 'No parcels found at this location.',
    };
  }

  const baseParcels = features.map((f) => featureToCandidate(f, config!.field_map, config!.parcel_layer_url));

  // Step 5: Multi-parcel detection
  const ownerField = config.field_map.owner_name;
  const baseOwner = ownerField ? features[0].properties?.[ownerField] : null;

  let allParcels = baseParcels;

  if (baseOwner && ownerField) {
    const baseBbox = bbox({ type: 'FeatureCollection', features });
    const bufferedBbox: [number, number, number, number] = [
      baseBbox[0] - ADJACENT_BUFFER_DEGREES,
      baseBbox[1] - ADJACENT_BUFFER_DEGREES,
      baseBbox[2] + ADJACENT_BUFFER_DEGREES,
      baseBbox[3] + ADJACENT_BUFFER_DEGREES,
    ];

    const whereClause = `${ownerField} LIKE '%${escapeArcGIS(baseOwner)}%'`;
    const adjacentFeatures = await queryParcelsByEnvelope(
      config.parcel_layer_url,
      bufferedBbox,
      whereClause
    );

    if (adjacentFeatures.length > 0) {
      const parcelIdField = config.field_map.parcel_id;
      const seenApns = new Set(baseParcels.map((p) => p.apn));
      const additional = adjacentFeatures
        .filter((f) => {
          const apn = String(f.properties?.[parcelIdField] ?? '');
          return apn && !seenApns.has(apn);
        })
        .map((f) => featureToCandidate(f, config!.field_map, config!.parcel_layer_url));

      allParcels = [...baseParcels, ...additional];
    }
  }

  return {
    status: allParcels.length > 1 ? 'multiple' : 'found',
    parcels: allParcels,
    source: 'county_arcgis',
    county_fips: fipsResult.fips,
    county_name: fipsResult.county_name,
  };
}

function featureToCandidate(
  feature: GeoJSON.Feature,
  fieldMap: FieldMap,
  sourceUrl: string
): ParcelCandidate {
  const props = feature.properties ?? {};
  return {
    apn: String(props[fieldMap.parcel_id] ?? ''),
    geometry: feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
    acres: fieldMap.acres ? Number(props[fieldMap.acres]) || null : null,
    owner_of_record: fieldMap.owner_name ? String(props[fieldMap.owner_name] ?? '') || null : null,
    site_address: fieldMap.site_address ? String(props[fieldMap.site_address] ?? '') || null : null,
    source_url: sourceUrl,
  };
}

// State FIPS to abbreviation mapping for discovery queries
const STATE_FIPS_TO_ABBR: Record<string, string> = {
  '53': 'WA', '06': 'CA', '41': 'OR', '36': 'NY', '48': 'TX',
  '12': 'FL', '17': 'IL', '42': 'PA', '39': 'OH', '26': 'MI',
  '13': 'GA', '37': 'NC', '34': 'NJ', '51': 'VA', '25': 'MA',
  '04': 'AZ', '18': 'IN', '47': 'TN', '29': 'MO', '24': 'MD',
  '55': 'WI', '27': 'MN', '08': 'CO', '01': 'AL', '45': 'SC',
  '22': 'LA', '21': 'KY', '41': 'OR', '40': 'OK', '09': 'CT',
  '56': 'WY', '16': 'ID', '15': 'HI', '02': 'AK', '23': 'ME',
  '33': 'NH', '44': 'RI', '30': 'MT', '10': 'DE', '46': 'SD',
  '38': 'ND', '50': 'VT', '11': 'DC', '54': 'WV', '31': 'NE',
  '20': 'KS', '35': 'NM', '32': 'NV', '28': 'MS', '05': 'AR',
  '49': 'UT', '19': 'IA',
};

async function discoverEndpoint(
  countyName: string,
  stateFips: string,
  fips: string
): Promise<CountyGISConfig | null> {
  const stateAbbr = STATE_FIPS_TO_ABBR[stateFips] ?? '';
  const hubResults = await searchArcGISHub(countyName, stateAbbr);

  for (const result of hubResults) {
    // Try layer 0 by default
    const layerUrl = result.url.replace(/\/?$/, '/0');
    const meta = await fetchFeatureServerFields(layerUrl);
    if (!meta) continue;

    // Only consider polygon layers
    if (!meta.geometryType.includes('Polygon')) continue;

    const match = matchFields(meta.fields);
    if (!match) continue;

    return {
      id: '',
      fips,
      county_name: countyName,
      state: stateAbbr,
      parcel_layer_url: layerUrl,
      address_layer_url: null,
      field_map: match.field_map,
      discovery_method: 'auto',
      confidence: match.confidence,
      last_verified_at: null,
    };
  }

  return null;
}

function escapeArcGIS(value: string): string {
  return value.replace(/'/g, "''");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/geo/parcel-lookup.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/geo/parcel-lookup.ts src/__tests__/geo/parcel-lookup.test.ts
git commit -m "feat(parcel-lookup): add pipeline orchestrator with auto-discovery (#205)"
```

---

## Task 7: Server Actions

**Files:**
- Create: `src/app/admin/properties/[slug]/parcel-lookup/actions.ts`

- [ ] **Step 1: Implement server actions**

Create `src/app/admin/properties/[slug]/parcel-lookup/actions.ts`:

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { runParcelLookup } from '@/lib/geo/parcel-lookup';
import { createGeoLayer, assignLayerToProperties, setPropertyBoundary } from '@/app/admin/geo-layers/actions';
import type { CountyGISConfig, ParcelCandidate, ParcelLookupResult } from '@/lib/geo/types';
import type { FeatureCollection, Feature } from 'geojson';
import bbox from '@turf/bbox';

export async function lookupParcel(input: {
  address: string;
  orgId: string;
  propertyId: string;
}): Promise<ParcelLookupResult | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const registryLookup = async (fips: string): Promise<CountyGISConfig | null> => {
    const { data } = await supabase
      .from('county_gis_registry')
      .select('*')
      .eq('fips', fips)
      .single();
    return data ?? null;
  };

  const registrySave = async (config: Omit<CountyGISConfig, 'id' | 'last_verified_at'>) => {
    await supabase.from('county_gis_registry').upsert(
      {
        fips: config.fips,
        county_name: config.county_name,
        state: config.state,
        parcel_layer_url: config.parcel_layer_url,
        address_layer_url: config.address_layer_url,
        field_map: config.field_map,
        discovery_method: config.discovery_method,
        confidence: config.confidence,
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: 'fips' }
    );
  };

  const result = await runParcelLookup({
    address: input.address,
    registryLookup,
    registrySave,
  });

  // Log the lookup
  await supabase.from('parcel_lookups').insert({
    org_id: input.orgId,
    property_id: input.propertyId,
    input_address: input.address,
    county_fips: result.county_fips,
    source: result.source ?? 'county_arcgis',
    status: result.status === 'found' || result.status === 'multiple' ? 'success' : result.status,
    parcels_found: result.parcels.length,
  });

  return result;
}

export async function confirmParcelSelection(input: {
  parcels: ParcelCandidate[];
  propertyId: string;
  orgId: string;
  setAsBoundary: boolean;
  unionForBoundary: boolean;
  layerName: string;
}): Promise<{ success: true; geoLayerId: string } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Build FeatureCollection from selected parcels
  const features: Feature[] = input.parcels.map((p, i) => ({
    type: 'Feature' as const,
    properties: {
      apn: p.apn,
      acres: p.acres,
      owner_of_record: p.owner_of_record,
      site_address: p.site_address,
      source_url: p.source_url,
    },
    geometry: p.geometry,
  }));

  // If union for boundary, compute merged outline and add as feature
  if (input.unionForBoundary && features.length > 1) {
    try {
      const { default: union } = await import('@turf/union');
      let merged = features[0];
      for (let i = 1; i < features.length; i++) {
        const result = union(merged, features[i]);
        if (result) merged = result;
      }
      merged.properties = { role: 'boundary_outline' };
      features.push(merged);
    } catch {
      // If union fails, proceed without it
    }
  }

  const fc: FeatureCollection = { type: 'FeatureCollection', features };
  const layerBbox = bbox(fc) as [number, number, number, number];

  const totalAcres = input.parcels.reduce((sum, p) => sum + (p.acres ?? 0), 0);
  const description = `${input.parcels.length} parcel(s), ${totalAcres.toFixed(2)} acres. APNs: ${input.parcels.map((p) => p.apn).join(', ')}`;

  const result = await createGeoLayer({
    orgId: input.orgId,
    name: input.layerName,
    description,
    geojson: fc,
    sourceFormat: 'geojson',
    sourceFilename: 'parcel-lookup',
    color: '#16a34a',
    opacity: 0.5,
    featureCount: features.length,
    bbox: layerBbox,
    isPropertyBoundary: input.setAsBoundary,
    status: 'published',
    source: 'parcel_lookup',
  });

  if ('error' in result) return result;

  // Assign to property
  await assignLayerToProperties(result.layerId, input.orgId, [input.propertyId], true);

  // Set as property boundary if requested
  if (input.setAsBoundary) {
    await setPropertyBoundary(input.propertyId, result.layerId);
  }

  // Update audit log with result
  await supabase
    .from('parcel_lookups')
    .update({ result_geo_layer_id: result.layerId })
    .eq('property_id', input.propertyId)
    .eq('org_id', input.orgId)
    .is('result_geo_layer_id', null)
    .order('created_at', { ascending: false })
    .limit(1);

  return { success: true, geoLayerId: result.layerId };
}
```

- [ ] **Step 2: Run type-check**

Run: `npm run type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/properties/[slug]/parcel-lookup/actions.ts
git commit -m "feat(parcel-lookup): add lookupParcel and confirmParcelSelection server actions (#205)"
```

---

## Task 8: ParcelPreviewMap Component

**Files:**
- Create: `src/components/geo/ParcelPreviewMap.tsx`

- [ ] **Step 1: Implement the preview map component**

Create `src/components/geo/ParcelPreviewMap.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { ParcelCandidate } from '@/lib/geo/types';

interface ParcelPreviewMapProps {
  parcels: ParcelCandidate[];
  selectedApns: Set<string>;
  onToggleParcel?: (apn: string) => void;
  height?: string;
}

const PARCEL_COLORS = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed'];

export default function ParcelPreviewMap({
  parcels,
  selectedApns,
  onToggleParcel,
  height = '300px',
}: ParcelPreviewMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.GeoJSON[]>([]);

  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined') return;

    const L = require('leaflet');
    require('leaflet/dist/leaflet.css');

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    const map = L.map(mapRef.current);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Clear old layers
    layersRef.current.forEach((l) => l.remove());
    layersRef.current = [];

    const allBounds = L.latLngBounds([]);

    parcels.forEach((parcel, i) => {
      const color = PARCEL_COLORS[i % PARCEL_COLORS.length];
      const isSelected = selectedApns.has(parcel.apn);

      const feature: GeoJSON.Feature = {
        type: 'Feature',
        properties: { apn: parcel.apn },
        geometry: parcel.geometry,
      };

      const layer = L.geoJSON(feature, {
        style: {
          color: isSelected ? color : '#94a3b8',
          fillColor: isSelected ? color : '#cbd5e1',
          fillOpacity: isSelected ? 0.3 : 0.1,
          weight: isSelected ? 3 : 1,
        },
        onEachFeature: (_: unknown, featureLayer: L.Layer) => {
          if (onToggleParcel) {
            featureLayer.on('click', () => onToggleParcel(parcel.apn));
          }
        },
      }).addTo(map);

      allBounds.extend(layer.getBounds());
      layersRef.current.push(layer);
    });

    if (allBounds.isValid()) {
      map.fitBounds(allBounds, { padding: [30, 30] });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [parcels, selectedApns, onToggleParcel]);

  return <div ref={mapRef} style={{ height, width: '100%', borderRadius: '8px' }} />;
}
```

- [ ] **Step 2: Run type-check**

Run: `npm run type-check`
Expected: No errors (Leaflet types may need `@types/leaflet` which should already be installed)

- [ ] **Step 3: Commit**

```bash
git add src/components/geo/ParcelPreviewMap.tsx
git commit -m "feat(parcel-lookup): add ParcelPreviewMap Leaflet component (#205)"
```

---

## Task 9: ParcelLookup UI Component

**Files:**
- Create: `src/components/geo/ParcelLookup.tsx`

- [ ] **Step 1: Implement the ParcelLookup state machine component**

Create `src/components/geo/ParcelLookup.tsx`:

```tsx
'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { lookupParcel, confirmParcelSelection } from '@/app/admin/properties/[slug]/parcel-lookup/actions';
import type { ParcelCandidate, ParcelLookupResult } from '@/lib/geo/types';

const ParcelPreviewMap = dynamic(() => import('./ParcelPreviewMap'), { ssr: false });

type LookupState =
  | { step: 'idle' }
  | { step: 'searching'; address: string }
  | { step: 'found'; result: ParcelLookupResult }
  | { step: 'confirming' }
  | { step: 'confirmed'; geoLayerId: string; parcelCount: number; totalAcres: number }
  | { step: 'error'; message: string };

interface ParcelLookupProps {
  propertyId: string;
  propertyName: string;
  orgId: string;
}

export default function ParcelLookup({ propertyId, propertyName, orgId }: ParcelLookupProps) {
  const [state, setState] = useState<LookupState>({ step: 'idle' });
  const [address, setAddress] = useState('');
  const [selectedApns, setSelectedApns] = useState<Set<string>>(new Set());
  const [setAsBoundary, setSetAsBoundary] = useState(false);
  const [unionForBoundary, setUnionForBoundary] = useState(false);

  const handleLookup = useCallback(async () => {
    if (!address.trim()) return;
    setState({ step: 'searching', address });

    const result = await lookupParcel({ address, orgId, propertyId });

    if ('error' in result) {
      setState({ step: 'error', message: result.error });
      return;
    }

    if (result.status === 'not_found' || result.status === 'error') {
      setState({ step: 'error', message: result.error_message ?? 'No parcels found.' });
      return;
    }

    // Auto-select all parcels
    setSelectedApns(new Set(result.parcels.map((p) => p.apn)));
    setState({ step: 'found', result });
  }, [address, orgId, propertyId]);

  const handleToggleParcel = useCallback((apn: string) => {
    setSelectedApns((prev) => {
      const next = new Set(prev);
      if (next.has(apn)) {
        next.delete(apn);
      } else {
        next.add(apn);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (state.step !== 'found') return;

    const selected = state.result.parcels.filter((p) => selectedApns.has(p.apn));
    if (selected.length === 0) return;

    setState({ step: 'confirming' });

    const layerName = `${propertyName} Parcels`;
    const result = await confirmParcelSelection({
      parcels: selected,
      propertyId,
      orgId,
      setAsBoundary,
      unionForBoundary,
      layerName,
    });

    if ('error' in result) {
      setState({ step: 'error', message: result.error });
      return;
    }

    const totalAcres = selected.reduce((sum, p) => sum + (p.acres ?? 0), 0);
    setState({
      step: 'confirmed',
      geoLayerId: result.geoLayerId,
      parcelCount: selected.length,
      totalAcres,
    });
  }, [state, selectedApns, propertyId, propertyName, orgId, setAsBoundary, unionForBoundary]);

  const handleReset = useCallback(() => {
    setState({ step: 'idle' });
    setAddress('');
    setSelectedApns(new Set());
    setSetAsBoundary(false);
    setUnionForBoundary(false);
  }, []);

  return (
    <div className="space-y-4">
      {/* Idle */}
      {state.step === 'idle' && (
        <div className="card">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Find Property Boundary</h3>
            <p className="text-sm text-gray-500">
              Look up parcel boundaries automatically from public GIS records
            </p>
          </div>
          <div>
            <label className="label">Property Address</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="input-field flex-1"
                placeholder="e.g. 7550 Fletcher Bay Rd NE, Bainbridge Island, WA"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              />
              <button
                className="btn-primary whitespace-nowrap"
                onClick={handleLookup}
                disabled={!address.trim()}
              >
                Look Up
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Searching */}
      {state.step === 'searching' && (
        <div className="card">
          <div className="flex items-center gap-3 p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <div>
              <p className="font-medium">Searching county GIS records...</p>
              <p className="text-sm text-gray-500">Looking up parcels for: {state.address}</p>
            </div>
          </div>
        </div>
      )}

      {/* Found */}
      {state.step === 'found' && (
        <div className="card space-y-4">
          <div className="rounded-lg bg-green-50 p-3 border border-green-200">
            <p className="font-semibold text-green-700">
              {state.result.parcels.length === 1
                ? 'Parcel Found'
                : `Found ${state.result.parcels.length} parcels`}
            </p>
            {state.result.county_name && (
              <p className="text-sm text-gray-500">
                Source: {state.result.county_name} County ArcGIS
              </p>
            )}
          </div>

          <ParcelPreviewMap
            parcels={state.result.parcels}
            selectedApns={selectedApns}
            onToggleParcel={handleToggleParcel}
          />

          {/* Parcel list */}
          <div className="space-y-2">
            {state.result.parcels.map((p) => (
              <label
                key={p.apn}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedApns.has(p.apn)}
                  onChange={() => handleToggleParcel(p.apn)}
                />
                <div>
                  <span className="font-medium">APN {p.apn}</span>
                  {p.acres && <span className="text-gray-500"> · {p.acres} ac</span>}
                  {p.site_address && (
                    <span className="text-gray-500"> · {p.site_address}</span>
                  )}
                  {p.owner_of_record && (
                    <span className="text-gray-400 block text-xs">
                      Owner: {p.owner_of_record}
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>

          {/* Options */}
          <div className="space-y-2 border-t pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={setAsBoundary}
                onChange={(e) => setSetAsBoundary(e.target.checked)}
              />
              Set as property boundary
            </label>
            {selectedApns.size > 1 && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={unionForBoundary}
                  onChange={(e) => setUnionForBoundary(e.target.checked)}
                />
                Merge into unified boundary outline
              </label>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1"
              onClick={handleConfirm}
              disabled={selectedApns.size === 0}
            >
              Save Selected ({selectedApns.size})
            </button>
            <button className="btn-secondary" onClick={handleReset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirming */}
      {state.step === 'confirming' && (
        <div className="card">
          <div className="flex items-center gap-3 p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            <p className="font-medium">Saving parcels as geo layer...</p>
          </div>
        </div>
      )}

      {/* Confirmed */}
      {state.step === 'confirmed' && (
        <div className="card text-center">
          <div className="rounded-lg bg-green-50 p-6 border border-green-200">
            <p className="text-2xl mb-2">&#10003;</p>
            <p className="font-semibold text-green-700">Boundary Saved</p>
            <p className="text-sm text-gray-500 mt-2">
              {state.parcelCount} parcel(s) · {state.totalAcres.toFixed(2)} acres
            </p>
          </div>
          <div className="flex gap-2 justify-center mt-4">
            <a
              href={`/admin/geo-layers`}
              className="btn-secondary text-sm"
            >
              View in Geo Layers
            </a>
            <button className="btn-secondary text-sm" onClick={handleReset}>
              Look Up Another
            </button>
          </div>
        </div>
      )}

      {/* Error / Not Found */}
      {state.step === 'error' && (
        <div className="card space-y-4">
          <div className="rounded-lg bg-red-50 p-3 border border-red-200">
            <p className="font-semibold text-red-700">No parcels found</p>
            <p className="text-sm text-gray-500">{state.message}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Try another option:</p>
            <button className="btn-secondary w-full text-left text-sm" onClick={handleReset}>
              Try a different address
            </button>
            <a
              href={`/admin/properties`}
              className="btn-secondary w-full text-left text-sm block"
            >
              Draw boundary on map
            </a>
            <a
              href={`/admin/geo-layers`}
              className="btn-secondary w-full text-left text-sm block"
            >
              Upload boundary file
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run type-check**

Run: `npm run type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/geo/ParcelLookup.tsx
git commit -m "feat(parcel-lookup): add ParcelLookup UI component with state machine (#205)"
```

---

## Task 10: Page and Navigation

**Files:**
- Create: `src/app/admin/properties/[slug]/parcel-lookup/page.tsx`
- Modify: `src/app/admin/properties/[slug]/layout.tsx:36`

- [ ] **Step 1: Create the parcel lookup page**

Create `src/app/admin/properties/[slug]/parcel-lookup/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/context';
import { redirect } from 'next/navigation';
import ParcelLookup from '@/components/geo/ParcelLookup';

export default async function ParcelLookupPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tenant = await getTenantContext();
  if (!tenant) redirect('/login');

  const { data: property } = await supabase
    .from('properties')
    .select('id, name')
    .eq('org_id', tenant.org_id)
    .eq('slug', params.slug)
    .single();

  if (!property) redirect('/admin/properties');

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold mb-4">Parcel Lookup</h2>
      <p className="text-sm text-gray-500 mb-6">
        Search for parcel boundaries from public county GIS records and save them as geo layers.
      </p>
      <ParcelLookup
        propertyId={property.id}
        propertyName={property.name}
        orgId={tenant.org_id}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add Parcel Lookup to sidebar navigation**

In `src/app/admin/properties/[slug]/layout.tsx`, find the `items` array and add a "Parcel Lookup" entry after "Geo Layers":

Change:
```typescript
  { label: 'Geo Layers', href: `${base}/geo-layers/discover` },
```
to:
```typescript
  { label: 'Geo Layers', href: `${base}/geo-layers/discover` },
  { label: 'Parcel Lookup', href: `${base}/parcel-lookup` },
```

- [ ] **Step 3: Run type-check**

Run: `npm run type-check`
Expected: No errors

- [ ] **Step 4: Run dev server and verify page loads**

Run: `npm run dev`

Navigate to `/admin/properties/[any-property-slug]/parcel-lookup` and verify:
- Page loads without errors
- "Parcel Lookup" appears in sidebar navigation
- Address input and "Look Up" button are visible

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/properties/[slug]/parcel-lookup/page.tsx src/app/admin/properties/[slug]/layout.tsx
git commit -m "feat(parcel-lookup): add parcel lookup page and sidebar nav entry (#205)"
```

---

## Task 11: Post-Property-Creation Entry Point

**Files:**
- Modify: `src/app/admin/properties/page.tsx:134`

- [ ] **Step 1: Update property creation redirect to include parcel lookup prompt**

In `src/app/admin/properties/page.tsx`, change the redirect after property creation (line 134) from:
```typescript
    router.push(`/admin/properties/${result.slug}`);
```
to:
```typescript
    router.push(`/admin/properties/${result.slug}/parcel-lookup`);
```

This sends the admin directly to the parcel lookup page after creating a property, making boundary discovery the natural next step.

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/properties/page.tsx
git commit -m "feat(parcel-lookup): redirect to parcel lookup after property creation (#205)"
```

---

## Task 12: Install @turf/union Dependency (do this before Task 7)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @turf/union**

Run: `npm install @turf/union`

The `confirmParcelSelection` action uses `@turf/union` for merging multi-parcel boundaries. The other Turf packages (`@turf/bbox`, `@turf/helpers`, `@turf/intersect`, `@turf/boolean-point-in-polygon`) are already installed.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @turf/union dependency for parcel boundary merging (#205)"
```

---

## Task 13: Run All Tests and Type-Check

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass, including new census-client, field-matcher, arcgis-client, and parcel-lookup tests.

- [ ] **Step 2: Run type-check**

Run: `npm run type-check`
Expected: No errors

- [ ] **Step 3: Fix any issues found**

If any tests fail or type errors exist, fix them before proceeding.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(parcel-lookup): resolve test and type-check issues (#205)"
```
