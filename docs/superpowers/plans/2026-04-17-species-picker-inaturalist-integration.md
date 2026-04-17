# Species Picker — iNaturalist Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an API-powered species picker component that searches iNaturalist, displays nearby-observed species, auto-creates entity records on selection, and swaps in for `EntitySelect` when an entity type has `api_source = 'inaturalist'`.

**Architecture:** One migration adds `api_source` to `entity_types` and `external_id` (+ partial unique index) to `entities`. Two Next.js API routes proxy iNaturalist. A new `SpeciesPicker.tsx` component handles search/nearby/selection, inserting entities directly via the client Supabase client (search is online-only). `UpdateForm` and `ItemForm` pick `SpeciesPicker` vs `EntitySelect` per entity type. `EntityCard` falls back to `custom_field_values.photo_url` when `photo_path` is null. Coordinates flow: `ItemForm` uses its own `latitude`/`longitude` state; `UpdateForm` uses the selected item's coordinates.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase JS client, React hooks (no third-party debounce), Vitest + @testing-library/react, Playwright.

---

## File Structure

**New files:**
- `supabase/migrations/045_species_picker.sql` — schema changes
- `src/app/api/species/search/route.ts` — iNaturalist taxa autocomplete proxy
- `src/app/api/species/nearby/route.ts` — iNaturalist observations/species_counts proxy
- `src/app/api/species/__tests__/search.test.ts` — search route tests
- `src/app/api/species/__tests__/nearby.test.ts` — nearby route tests
- `src/components/manage/SpeciesPicker.tsx` — new picker component
- `src/components/manage/__tests__/SpeciesPicker.test.tsx` — component tests
- `e2e/tests/mobile/species-picker.spec.ts` — E2E tests

**Modified files:**
- `src/lib/types.ts` — add `SpeciesResult`, extend `Entity`/`EntityType`, update `Database` interface
- `src/components/admin/EntityTypeForm.tsx` — add `api_source` dropdown
- `src/components/admin/EntityCard.tsx` — photo fallback
- `src/components/manage/UpdateForm.tsx` — conditional render
- `src/components/manage/ItemForm.tsx` — conditional render

---

## Task 1: Migration — add `api_source` and `external_id` columns

**Files:**
- Create: `supabase/migrations/045_species_picker.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/045_species_picker.sql`:

```sql
-- 045_species_picker.sql — Add API-source metadata for species-style entity types
-- Spec: docs/superpowers/specs/2026-04-17-species-picker-inaturalist-integration-design.md
--
-- Adds:
--   * entity_types.api_source — opt-in flag that swaps EntitySelect for SpeciesPicker
--   * entities.external_id     — iNaturalist taxon ID (or similar) for dedup
--   * Partial unique index on (entity_type_id, external_id) to prevent race duplicates

alter table entity_types
  add column api_source text
  check (api_source in ('inaturalist'))
  default null;

alter table entities
  add column external_id text default null;

create index idx_entities_external_id on entities(external_id);

create unique index idx_entities_unique_external
  on entities(entity_type_id, external_id)
  where external_id is not null;
```

- [ ] **Step 2: Apply migration locally and verify**

Run: `npx supabase db reset` (or the equivalent local apply command used by this repo — check `package.json` scripts first).

Verify with psql or Supabase Studio that `entity_types.api_source` and `entities.external_id` exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/045_species_picker.sql
git commit -m "feat(db): add api_source and external_id columns for species picker"
```

---

## Task 2: Add TypeScript types

**Files:**
- Modify: `src/lib/types.ts:267-320` (enum/Entity/EntityType region) and `src/lib/types.ts:511-528` (Database Tables entries)

- [ ] **Step 1: Add the `SpeciesResult` interface and `api_source` / `external_id` fields**

Edit `src/lib/types.ts`. Add a new type near the entity definitions and extend the two interfaces. Replace the existing `EntityType` and `Entity` interfaces (currently at lines 271–306):

```typescript
export type EntityApiSource = 'inaturalist';

export interface SpeciesResult {
  id: number;                   // iNaturalist taxon ID
  name: string;                 // scientific name
  common_name: string;          // preferred common name (falls back to name)
  photo_url: string | null;     // medium image URL
  rank: string;                 // "species", "subspecies", etc.
  observations_count: number;
  wikipedia_url: string | null;
}

export interface EntityType {
  id: string;
  org_id: string;
  name: string;
  icon: IconValue;
  color: string;
  link_to: EntityLinkTarget[];
  sort_order: number;
  api_source: EntityApiSource | null;
  created_at: string;
  updated_at: string;
}

export interface EntityTypeField {
  id: string;
  entity_type_id: string;
  org_id: string;
  name: string;
  field_type: EntityFieldType;
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

export interface Entity {
  id: string;
  entity_type_id: string;
  org_id: string;
  name: string;
  description: string | null;
  photo_path: string | null;
  external_link: string | null;
  external_id: string | null;
  custom_field_values: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Run type-check to verify downstream usage still compiles**

Run: `npm run type-check`
Expected: PASS (no errors). The `Database` interface pulls from these types, so `entity_types` and `entities` rows automatically pick up the new fields.

If any existing code treats `api_source` or `external_id` as required (they are nullable now), fix those sites with `?? null`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add SpeciesResult, api_source, external_id"
```

---

## Task 3: API route — `GET /api/species/search` (tests first)

**Files:**
- Create: `src/app/api/species/search/route.ts`
- Test: `src/app/api/species/__tests__/search.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/species/__tests__/search.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const originalFetch = globalThis.fetch;

describe('GET /api/species/search', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects requests without q parameter', async () => {
    const { GET } = await import('../search/route');
    const request = new NextRequest('http://localhost/api/species/search');
    const response = await GET(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('q');
  });

  it('returns trimmed SpeciesResult array from iNaturalist response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 7086,
              name: 'Sialia sialis',
              preferred_common_name: 'Eastern Bluebird',
              default_photo: { medium_url: 'https://example.com/bluebird.jpg' },
              rank: 'species',
              observations_count: 42000,
              wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
            },
          ],
        }),
        { status: 200 }
      )
    );

    const { GET } = await import('../search/route');
    const request = new NextRequest('http://localhost/api/species/search?q=bluebird');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([
      {
        id: 7086,
        name: 'Sialia sialis',
        common_name: 'Eastern Bluebird',
        photo_url: 'https://example.com/bluebird.jpg',
        rank: 'species',
        observations_count: 42000,
        wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
      },
    ]);
  });

  it('returns empty array when iNaturalist errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response('upstream down', { status: 503 })
    );

    const { GET } = await import('../search/route');
    const request = new NextRequest('http://localhost/api/species/search?q=bluebird');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('returns empty array when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('network'));
    const { GET } = await import('../search/route');
    const request = new NextRequest('http://localhost/api/species/search?q=bluebird');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('falls back to name when preferred_common_name is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 1,
              name: 'Unknown Taxon',
              preferred_common_name: null,
              default_photo: null,
              rank: 'species',
              observations_count: 0,
              wikipedia_url: null,
            },
          ],
        }),
        { status: 200 }
      )
    );
    const { GET } = await import('../search/route');
    const request = new NextRequest('http://localhost/api/species/search?q=x');
    const response = await GET(request);
    const body = await response.json();
    expect(body[0].common_name).toBe('Unknown Taxon');
    expect(body[0].photo_url).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test -- src/app/api/species/__tests__/search.test.ts`
Expected: FAIL (module not found: `../search/route`).

- [ ] **Step 3: Implement the route**

Create `src/app/api/species/search/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import type { SpeciesResult } from '@/lib/types';

interface INatTaxonRaw {
  id: number;
  name: string;
  preferred_common_name?: string | null;
  default_photo?: { medium_url?: string | null } | null;
  rank?: string;
  observations_count?: number;
  wikipedia_url?: string | null;
}

function toSpeciesResult(raw: INatTaxonRaw): SpeciesResult {
  return {
    id: raw.id,
    name: raw.name,
    common_name: raw.preferred_common_name || raw.name,
    photo_url: raw.default_photo?.medium_url ?? null,
    rank: raw.rank ?? 'unknown',
    observations_count: raw.observations_count ?? 0,
    wikipedia_url: raw.wikipedia_url ?? null,
  };
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q');
  const taxonId = request.nextUrl.searchParams.get('taxon_id');

  if (!q || q.trim().length === 0) {
    return NextResponse.json(
      { error: 'Missing required parameter: q' },
      { status: 400 }
    );
  }

  const upstream = new URL('https://api.inaturalist.org/v1/taxa/autocomplete');
  upstream.searchParams.set('q', q);
  upstream.searchParams.set('per_page', '20');
  if (taxonId) upstream.searchParams.set('taxon_id', taxonId);

  try {
    const res = await fetch(upstream.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json([], {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    const json = (await res.json()) as { results?: INatTaxonRaw[] };
    const results = (json.results ?? []).map(toSpeciesResult);

    return NextResponse.json(results, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm run test -- src/app/api/species/__tests__/search.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/species/search/route.ts src/app/api/species/__tests__/search.test.ts
git commit -m "feat(api): add /api/species/search proxy for iNaturalist autocomplete"
```

---

## Task 4: API route — `GET /api/species/nearby` (tests first)

**Files:**
- Create: `src/app/api/species/nearby/route.ts`
- Test: `src/app/api/species/__tests__/nearby.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/species/__tests__/nearby.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const originalFetch = globalThis.fetch;

describe('GET /api/species/nearby', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects requests without lat', async () => {
    const { GET } = await import('../nearby/route');
    const request = new NextRequest('http://localhost/api/species/nearby?lng=-73');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('rejects requests without lng', async () => {
    const { GET } = await import('../nearby/route');
    const request = new NextRequest('http://localhost/api/species/nearby?lat=42');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('rejects non-numeric lat/lng', async () => {
    const { GET } = await import('../nearby/route');
    const request = new NextRequest('http://localhost/api/species/nearby?lat=abc&lng=xyz');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('returns trimmed SpeciesResult array from species_counts response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              count: 99,
              taxon: {
                id: 7086,
                name: 'Sialia sialis',
                preferred_common_name: 'Eastern Bluebird',
                default_photo: { medium_url: 'https://example.com/bluebird.jpg' },
                rank: 'species',
                observations_count: 42000,
                wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
              },
            },
          ],
        }),
        { status: 200 }
      )
    );
    globalThis.fetch = fetchMock;

    const { GET } = await import('../nearby/route');
    const request = new NextRequest(
      'http://localhost/api/species/nearby?lat=42.5&lng=-73.5'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(7086);
    expect(body[0].common_name).toBe('Eastern Bluebird');

    const callUrl = new URL((fetchMock.mock.calls[0] as [string])[0]);
    expect(callUrl.searchParams.get('lat')).toBe('42.5');
    expect(callUrl.searchParams.get('lng')).toBe('-73.5');
    expect(callUrl.searchParams.get('radius')).toBe('10');
  });

  it('caps radius at 50km', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), { status: 200 })
    );
    globalThis.fetch = fetchMock;

    const { GET } = await import('../nearby/route');
    const request = new NextRequest(
      'http://localhost/api/species/nearby?lat=42&lng=-73&radius=999'
    );
    await GET(request);

    const callUrl = new URL((fetchMock.mock.calls[0] as [string])[0]);
    expect(callUrl.searchParams.get('radius')).toBe('50');
  });

  it('returns empty array on upstream error', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 502 }));
    const { GET } = await import('../nearby/route');
    const request = new NextRequest(
      'http://localhost/api/species/nearby?lat=42&lng=-73'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test -- src/app/api/species/__tests__/nearby.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the route**

Create `src/app/api/species/nearby/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import type { SpeciesResult } from '@/lib/types';

interface INatTaxonRaw {
  id: number;
  name: string;
  preferred_common_name?: string | null;
  default_photo?: { medium_url?: string | null } | null;
  rank?: string;
  observations_count?: number;
  wikipedia_url?: string | null;
}

function toSpeciesResult(raw: INatTaxonRaw): SpeciesResult {
  return {
    id: raw.id,
    name: raw.name,
    common_name: raw.preferred_common_name || raw.name,
    photo_url: raw.default_photo?.medium_url ?? null,
    rank: raw.rank ?? 'unknown',
    observations_count: raw.observations_count ?? 0,
    wikipedia_url: raw.wikipedia_url ?? null,
  };
}

export async function GET(request: NextRequest) {
  const latRaw = request.nextUrl.searchParams.get('lat');
  const lngRaw = request.nextUrl.searchParams.get('lng');
  const radiusRaw = request.nextUrl.searchParams.get('radius');

  const lat = latRaw !== null ? Number(latRaw) : NaN;
  const lng = lngRaw !== null ? Number(lngRaw) : NaN;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: 'Missing or invalid required parameters: lat, lng' },
      { status: 400 }
    );
  }

  const requestedRadius = radiusRaw !== null ? Number(radiusRaw) : 10;
  const radius = Number.isFinite(requestedRadius)
    ? Math.min(Math.max(requestedRadius, 1), 50)
    : 10;

  const upstream = new URL(
    'https://api.inaturalist.org/v1/observations/species_counts'
  );
  upstream.searchParams.set('lat', String(lat));
  upstream.searchParams.set('lng', String(lng));
  upstream.searchParams.set('radius', String(radius));
  upstream.searchParams.set('per_page', '20');

  try {
    const res = await fetch(upstream.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json([], {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=3600' },
      });
    }

    const json = (await res.json()) as {
      results?: Array<{ taxon: INatTaxonRaw }>;
    };

    const results = (json.results ?? [])
      .filter((r) => r.taxon)
      .map((r) => toSpeciesResult(r.taxon));

    return NextResponse.json(results, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm run test -- src/app/api/species/__tests__/nearby.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/species/nearby/route.ts src/app/api/species/__tests__/nearby.test.ts
git commit -m "feat(api): add /api/species/nearby proxy for iNaturalist species_counts"
```

---

## Task 5: SpeciesPicker skeleton — offline message and nearby-on-focus

**Files:**
- Create: `src/components/manage/SpeciesPicker.tsx`
- Test: `src/components/manage/__tests__/SpeciesPicker.test.tsx`

This task builds the bones: component file, offline detection, and the nearby fetch when the input is focused with coordinates. Search and selection come in later tasks.

- [ ] **Step 1: Write the failing tests**

Create `src/components/manage/__tests__/SpeciesPicker.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpeciesPicker from '@/components/manage/SpeciesPicker';

vi.mock('@/lib/offline/network', () => ({
  useNetworkStatus: () => ({ isOnline: mockIsOnline }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn(),
    storage: { from: vi.fn() },
  }),
}));

let mockIsOnline = true;

const baseProps = {
  entityTypeId: 'et-species',
  entityTypeName: 'Species',
  orgId: 'org-1',
  selectedIds: [],
  onChange: vi.fn(),
};

describe('SpeciesPicker (skeleton)', () => {
  beforeEach(() => {
    mockIsOnline = true;
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('shows the search input', () => {
    render(<SpeciesPicker {...baseProps} />);
    expect(screen.getByPlaceholderText(/search species/i)).toBeInTheDocument();
  });

  it('shows offline notice when navigator is offline', () => {
    mockIsOnline = false;
    render(<SpeciesPicker {...baseProps} />);
    expect(
      screen.getByText(/search requires internet connection/i)
    ).toBeInTheDocument();
  });

  it('fetches nearby species when focused with coordinates', async () => {
    const nearbyMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 1,
            name: 'Sialia sialis',
            common_name: 'Eastern Bluebird',
            photo_url: null,
            rank: 'species',
            observations_count: 1,
            wikipedia_url: null,
          },
        ]),
        { status: 200 }
      )
    );
    globalThis.fetch = nearbyMock;

    const user = userEvent.setup();
    render(<SpeciesPicker {...baseProps} lat={42.5} lng={-73.5} />);

    await user.click(screen.getByPlaceholderText(/search species/i));

    await waitFor(() =>
      expect(screen.getByText(/recently seen nearby/i)).toBeInTheDocument()
    );
    expect(screen.getByText('Eastern Bluebird')).toBeInTheDocument();

    const called = new URL((nearbyMock.mock.calls[0] as [string])[0], 'http://localhost');
    expect(called.pathname).toBe('/api/species/nearby');
    expect(called.searchParams.get('lat')).toBe('42.5');
    expect(called.searchParams.get('lng')).toBe('-73.5');
  });

  it('does not fetch nearby when coordinates are missing', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const user = userEvent.setup();
    render(<SpeciesPicker {...baseProps} />);
    await user.click(screen.getByPlaceholderText(/search species/i));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/type to search species/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test -- src/components/manage/__tests__/SpeciesPicker.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the skeleton**

Create `src/components/manage/SpeciesPicker.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useNetworkStatus } from '@/lib/offline/network';
import type { SpeciesResult } from '@/lib/types';

interface SpeciesPickerProps {
  entityTypeId: string;
  entityTypeName: string;
  orgId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  lat?: number;
  lng?: number;
}

export default function SpeciesPicker({
  entityTypeId,
  entityTypeName,
  orgId,
  selectedIds,
  onChange,
  lat,
  lng,
}: SpeciesPickerProps) {
  const { isOnline } = useNetworkStatus();
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [nearby, setNearby] = useState<SpeciesResult[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  useEffect(() => {
    if (!isFocused) return;
    if (lat === undefined || lng === undefined) return;
    if (!isOnline) return;

    let cancelled = false;
    setNearbyLoading(true);
    fetch(`/api/species/nearby?lat=${lat}&lng=${lng}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((json: SpeciesResult[]) => {
        if (!cancelled) setNearby(Array.isArray(json) ? json : []);
      })
      .catch(() => {
        if (!cancelled) setNearby([]);
      })
      .finally(() => {
        if (!cancelled) setNearbyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isFocused, lat, lng, isOnline]);

  const showNearby = isFocused && query.trim().length === 0 && nearby.length > 0;
  const showEmptyState =
    isFocused && query.trim().length === 0 && nearby.length === 0 && !nearbyLoading;

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 150)}
        placeholder={`Search ${entityTypeName.toLowerCase()}...`}
        className="input-field"
        disabled={!isOnline}
      />

      {!isOnline && (
        <p className="text-xs text-sage mt-1">
          Search requires internet connection.
        </p>
      )}

      {showNearby && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-sage-light rounded-lg shadow-lg">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-sage border-b border-sage-light">
            Recently seen nearby
          </div>
          {nearby.map((s) => (
            <div
              key={s.id}
              className="px-3 py-2 text-sm text-forest-dark hover:bg-sage-light"
            >
              <div className="font-medium">{s.common_name}</div>
              <div className="text-xs italic text-sage">{s.name}</div>
            </div>
          ))}
        </div>
      )}

      {showEmptyState && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-sage-light rounded-lg shadow-lg px-3 py-2 text-xs text-sage">
          Type to search species...
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm run test -- src/components/manage/__tests__/SpeciesPicker.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/manage/SpeciesPicker.tsx src/components/manage/__tests__/SpeciesPicker.test.tsx
git commit -m "feat(manage): add SpeciesPicker skeleton with offline + nearby"
```

---

## Task 6: SpeciesPicker search with debounce

**Files:**
- Modify: `src/components/manage/SpeciesPicker.tsx`
- Modify: `src/components/manage/__tests__/SpeciesPicker.test.tsx`

- [ ] **Step 1: Add failing tests for search**

Append the following `describe` block to `src/components/manage/__tests__/SpeciesPicker.test.tsx`:

```typescript
describe('SpeciesPicker (search)', () => {
  beforeEach(() => {
    mockIsOnline = true;
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function searchResponse(items: unknown[]) {
    return new Response(JSON.stringify(items), { status: 200 });
  }

  it('debounces search by 300ms before calling /api/species/search', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(searchResponse([
        {
          id: 7086,
          name: 'Sialia sialis',
          common_name: 'Eastern Bluebird',
          photo_url: null,
          rank: 'species',
          observations_count: 42000,
          wikipedia_url: null,
        },
      ]));
    globalThis.fetch = fetchMock;

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SpeciesPicker {...baseProps} />);

    const input = screen.getByPlaceholderText(/search species/i);
    await user.type(input, 'blue');

    // Before 300ms, no search call fired
    expect(
      fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/api/species/search')
      )
    ).toHaveLength(0);

    vi.advanceTimersByTime(320);

    await waitFor(() => {
      const searchCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/api/species/search')
      );
      expect(searchCalls).toHaveLength(1);
      expect(String(searchCalls[0][0])).toContain('q=blue');
    });
  });

  it('renders search results replacing nearby list', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      searchResponse([
        {
          id: 1,
          name: 'Sialia sialis',
          common_name: 'Eastern Bluebird',
          photo_url: 'https://example.com/bluebird.jpg',
          rank: 'species',
          observations_count: 99,
          wikipedia_url: null,
        },
      ])
    );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SpeciesPicker {...baseProps} />);

    const input = screen.getByPlaceholderText(/search species/i);
    await user.type(input, 'bluebird');
    vi.advanceTimersByTime(320);

    await waitFor(() =>
      expect(screen.getByText('Eastern Bluebird')).toBeInTheDocument()
    );
    expect(screen.getByText('Sialia sialis')).toBeInTheDocument();
    expect(screen.queryByText(/recently seen nearby/i)).not.toBeInTheDocument();
  });
});
```

Also add `afterEach` to the imports at the top of the test file if not already present:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test -- src/components/manage/__tests__/SpeciesPicker.test.tsx`
Expected: FAIL on the two new tests (no search fetch is fired).

- [ ] **Step 3: Implement search with debounce**

Edit `src/components/manage/SpeciesPicker.tsx` — add search state, a debounce effect, and a results list. After the existing `nearby` state and effect, add:

```typescript
  const [results, setResults] = useState<SpeciesResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      return;
    }
    if (!isOnline) return;

    const handle = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/species/search?q=${encodeURIComponent(trimmed)}`
        );
        const json = res.ok ? await res.json() : [];
        setResults(Array.isArray(json) ? json : []);
      } catch {
        setResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [query, isOnline]);
```

Update the JSX so that when there is a search query, search results render instead of the nearby list. Replace the dropdown JSX (after the offline notice) with:

```tsx
      {isFocused && query.trim().length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-sage-light rounded-lg shadow-lg">
          {searchLoading && (
            <div className="px-3 py-2 text-xs text-sage">Searching...</div>
          )}
          {!searchLoading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-sage">No matches.</div>
          )}
          {results.map((s) => (
            <div
              key={s.id}
              className="px-3 py-2 text-sm text-forest-dark hover:bg-sage-light"
            >
              <div className="font-medium">{s.common_name}</div>
              <div className="text-xs italic text-sage">
                {s.name}
                {s.observations_count > 0 && (
                  <span className="not-italic ml-2 text-[10px]">
                    ({s.observations_count.toLocaleString()} observations)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNearby && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-sage-light rounded-lg shadow-lg">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-sage border-b border-sage-light">
            Recently seen nearby
          </div>
          {nearby.map((s) => (
            <div
              key={s.id}
              className="px-3 py-2 text-sm text-forest-dark hover:bg-sage-light"
            >
              <div className="font-medium">{s.common_name}</div>
              <div className="text-xs italic text-sage">{s.name}</div>
            </div>
          ))}
        </div>
      )}

      {showEmptyState && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-sage-light rounded-lg shadow-lg px-3 py-2 text-xs text-sage">
          Type to search species...
        </div>
      )}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm run test -- src/components/manage/__tests__/SpeciesPicker.test.tsx`
Expected: PASS (all tests, including new search tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/manage/SpeciesPicker.tsx src/components/manage/__tests__/SpeciesPicker.test.tsx
git commit -m "feat(manage): add debounced search to SpeciesPicker"
```

---

## Task 7: SpeciesPicker selection — dedup and auto-entity-creation

**Files:**
- Modify: `src/components/manage/SpeciesPicker.tsx`
- Modify: `src/components/manage/__tests__/SpeciesPicker.test.tsx`

- [ ] **Step 1: Add failing tests for selection**

Append to `src/components/manage/__tests__/SpeciesPicker.test.tsx`:

```typescript
describe('SpeciesPicker (selection)', () => {
  beforeEach(() => {
    mockIsOnline = true;
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const speciesRow = {
    id: 7086,
    name: 'Sialia sialis',
    common_name: 'Eastern Bluebird',
    photo_url: 'https://example.com/bluebird.jpg',
    rank: 'species',
    observations_count: 42000,
    wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
  };

  function searchResponse(items: unknown[]) {
    return new Response(JSON.stringify(items), { status: 200 });
  }

  it('links to existing entity when external_id matches', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(searchResponse([speciesRow]));

    // supabase.from('entities').select...eq('external_id', '7086').eq('entity_type_id', ...)
    //   .maybeSingle() → returns existing row
    const existingRow = { id: 'existing-entity-id' };
    const maybeSingle = vi.fn().mockResolvedValue({ data: existingRow, error: null });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const insert = vi.fn();
    const from = vi.fn().mockReturnValue({ select, insert });

    const supabaseModule = await import('@/lib/supabase/client');
    vi.spyOn(supabaseModule, 'createClient').mockReturnValue({
      from,
      storage: { from: vi.fn() },
    } as unknown as ReturnType<typeof supabaseModule.createClient>);

    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SpeciesPicker {...baseProps} onChange={onChange} />);

    await user.type(screen.getByPlaceholderText(/search species/i), 'blue');
    vi.advanceTimersByTime(320);
    await waitFor(() => screen.getByText('Eastern Bluebird'));

    await user.click(screen.getByText('Eastern Bluebird'));

    expect(insert).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(['existing-entity-id']);
  });

  it('inserts a new entity when external_id does not exist', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(searchResponse([speciesRow]));

    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });

    const insertSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: 'new-entity-id' }, error: null });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });

    const from = vi.fn().mockReturnValue({ select, insert });

    const supabaseModule = await import('@/lib/supabase/client');
    vi.spyOn(supabaseModule, 'createClient').mockReturnValue({
      from,
      storage: { from: vi.fn() },
    } as unknown as ReturnType<typeof supabaseModule.createClient>);

    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SpeciesPicker {...baseProps} onChange={onChange} />);

    await user.type(screen.getByPlaceholderText(/search species/i), 'blue');
    vi.advanceTimersByTime(320);
    await waitFor(() => screen.getByText('Eastern Bluebird'));

    await user.click(screen.getByText('Eastern Bluebird'));

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    const insertedRow = insert.mock.calls[0][0];
    expect(insertedRow).toMatchObject({
      entity_type_id: 'et-species',
      org_id: 'org-1',
      name: 'Eastern Bluebird',
      description: 'Sialia sialis',
      external_id: '7086',
    });
    expect(insertedRow.custom_field_values).toMatchObject({
      scientific_name: 'Sialia sialis',
      photo_url: 'https://example.com/bluebird.jpg',
      wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
      observations_count: 42000,
    });
    expect(onChange).toHaveBeenCalledWith(['new-entity-id']);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test -- src/components/manage/__tests__/SpeciesPicker.test.tsx`
Expected: FAIL on the two new tests (clicking a result does nothing yet).

- [ ] **Step 3: Implement selection**

Edit `src/components/manage/SpeciesPicker.tsx`. Add the Supabase import at the top:

```typescript
import { createClient } from '@/lib/supabase/client';
```

Inside the component, above the return, add a selection handler:

```typescript
  async function handleSelect(species: SpeciesResult) {
    const supabase = createClient();
    const externalId = String(species.id);

    const { data: existing } = await supabase
      .from('entities')
      .select('id')
      .eq('entity_type_id', entityTypeId)
      .eq('external_id', externalId)
      .maybeSingle();

    let entityId: string | null = existing?.id ?? null;

    if (!entityId) {
      const { data: inserted, error } = await supabase
        .from('entities')
        .insert({
          entity_type_id: entityTypeId,
          org_id: orgId,
          name: species.common_name,
          description: species.name,
          external_id: externalId,
          photo_path: null,
          custom_field_values: {
            scientific_name: species.name,
            photo_url: species.photo_url,
            wikipedia_url: species.wikipedia_url,
            observations_count: species.observations_count,
          },
        })
        .select('id')
        .single();

      if (error || !inserted) return;
      entityId = inserted.id;
    }

    if (!selectedIds.includes(entityId)) {
      onChange([...selectedIds, entityId]);
    }
    setQuery('');
    setIsFocused(false);
  }
```

Wire the handler into both the nearby and results lists by wrapping each result `<div>` in a `<button type="button">` with `onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}`. `onMouseDown` (not `onClick`) is required because the input's `onBlur` fires before `onClick`, which hides the dropdown.

Replace the nearby-list rendering loop:

```tsx
          {nearby.map((s) => (
            <button
              type="button"
              key={s.id}
              onMouseDown={(e) => {
                e.preventDefault();
                void handleSelect(s);
              }}
              className="w-full text-left px-3 py-2 text-sm text-forest-dark hover:bg-sage-light"
            >
              <div className="font-medium">{s.common_name}</div>
              <div className="text-xs italic text-sage">{s.name}</div>
            </button>
          ))}
```

And the search-results loop:

```tsx
          {results.map((s) => (
            <button
              type="button"
              key={s.id}
              onMouseDown={(e) => {
                e.preventDefault();
                void handleSelect(s);
              }}
              className="w-full text-left px-3 py-2 text-sm text-forest-dark hover:bg-sage-light"
            >
              <div className="font-medium">{s.common_name}</div>
              <div className="text-xs italic text-sage">
                {s.name}
                {s.observations_count > 0 && (
                  <span className="not-italic ml-2 text-[10px]">
                    ({s.observations_count.toLocaleString()} observations)
                  </span>
                )}
              </div>
            </button>
          ))}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm run test -- src/components/manage/__tests__/SpeciesPicker.test.tsx`
Expected: PASS (all selection tests green).

Note: the two new selection tests use `onMouseDown`, which `userEvent.click` fires before `mouseup`. If the selection test fails because click fires on the button, swap to `await fireEvent.mouseDown(...)` from `@testing-library/react`. Prefer `user.click` first since `userEvent.click` performs `mousedown` internally.

- [ ] **Step 5: Commit**

```bash
git add src/components/manage/SpeciesPicker.tsx src/components/manage/__tests__/SpeciesPicker.test.tsx
git commit -m "feat(manage): SpeciesPicker auto-creates or links entity on select"
```

---

## Task 8: SpeciesPicker selected chips

**Files:**
- Modify: `src/components/manage/SpeciesPicker.tsx`
- Modify: `src/components/manage/__tests__/SpeciesPicker.test.tsx`

- [ ] **Step 1: Add failing tests for chip display + removal**

Append to `src/components/manage/__tests__/SpeciesPicker.test.tsx`:

```typescript
describe('SpeciesPicker (chips)', () => {
  beforeEach(() => {
    mockIsOnline = true;
    vi.clearAllMocks();
  });

  it('renders chip for each selected entity with name and remove button', async () => {
    const maybeSingle = vi.fn(); // not needed here
    const inOrderFetch = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'e1',
          name: 'Eastern Bluebird',
          description: 'Sialia sialis',
          custom_field_values: { photo_url: 'https://example.com/b.jpg' },
        },
      ],
      error: null,
    });
    const inFn = vi.fn().mockReturnValue(inOrderFetch);
    const select = vi.fn().mockReturnValue({ in: inFn });
    const from = vi.fn().mockReturnValue({ select });

    const supabaseModule = await import('@/lib/supabase/client');
    vi.spyOn(supabaseModule, 'createClient').mockReturnValue({
      from,
      storage: { from: vi.fn() },
    } as unknown as ReturnType<typeof supabaseModule.createClient>);

    const onChange = vi.fn();
    render(
      <SpeciesPicker
        {...baseProps}
        selectedIds={['e1']}
        onChange={onChange}
      />
    );

    await waitFor(() =>
      expect(screen.getByText('Eastern Bluebird')).toBeInTheDocument()
    );

    const removeBtn = screen.getByRole('button', { name: /remove eastern bluebird/i });
    const user = userEvent.setup();
    await user.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test -- src/components/manage/__tests__/SpeciesPicker.test.tsx`
Expected: FAIL (no chip rendering yet).

- [ ] **Step 3: Implement chips**

Edit `src/components/manage/SpeciesPicker.tsx`. Add state and fetch for existing entities:

```typescript
  interface SelectedEntity {
    id: string;
    name: string;
    photo_url: string | null;
  }

  const [selectedEntities, setSelectedEntities] = useState<SelectedEntity[]>([]);

  useEffect(() => {
    if (selectedIds.length === 0) {
      setSelectedEntities([]);
      return;
    }

    let cancelled = false;
    const supabase = createClient();
    supabase
      .from('entities')
      .select('id, name, custom_field_values')
      .in('id', selectedIds)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as Array<{
          id: string;
          name: string;
          custom_field_values: Record<string, unknown>;
        }>;
        const mapped: SelectedEntity[] = selectedIds.map((sid) => {
          const row = rows.find((r) => r.id === sid);
          const photo =
            row && typeof row.custom_field_values?.photo_url === 'string'
              ? (row.custom_field_values.photo_url as string)
              : null;
          return {
            id: sid,
            name: row?.name ?? 'Unknown',
            photo_url: photo,
          };
        });
        setSelectedEntities(mapped);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedIds]);

  function removeSelected(id: string) {
    onChange(selectedIds.filter((sid) => sid !== id));
  }
```

Prepend chip rendering to the returned JSX so chips appear above the input:

```tsx
    <div>
      {selectedEntities.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedEntities.map((se) => (
            <span
              key={se.id}
              className="inline-flex items-center gap-1.5 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full"
            >
              {se.photo_url && (
                <img
                  src={se.photo_url}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover"
                />
              )}
              {se.name}
              <button
                type="button"
                aria-label={`Remove ${se.name}`}
                onClick={() => removeSelected(se.id)}
                className="hover:text-red-600"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
```

(Remember to close the extra opening `<div>` and adjust the final `</div>` accordingly.)

- [ ] **Step 4: Run tests and verify they pass**

Run: `npm run test -- src/components/manage/__tests__/SpeciesPicker.test.tsx`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/components/manage/SpeciesPicker.tsx src/components/manage/__tests__/SpeciesPicker.test.tsx
git commit -m "feat(manage): render selected species as removable chips"
```

---

## Task 9: EntityTypeForm — `api_source` dropdown

**Files:**
- Modify: `src/components/admin/EntityTypeForm.tsx`

- [ ] **Step 1: Write a failing test**

Create `src/components/admin/__tests__/EntityTypeForm.test.tsx` (or append if it exists — check with `ls` first). If the file does not exist, create it:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntityTypeForm from '@/components/admin/EntityTypeForm';

const insertSingle = vi.fn().mockResolvedValue({
  data: {
    id: 'et-new',
    org_id: 'org-1',
    name: 'Species',
    icon: { set: 'emoji', name: '🦅' },
    color: '#5D7F3A',
    link_to: ['items', 'updates'],
    api_source: 'inaturalist',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
  error: null,
});
const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
const insert = vi.fn().mockReturnValue({ select: insertSelect });
const from = vi.fn().mockReturnValue({ insert });

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from }),
}));

vi.mock('@/components/shared/IconPicker', () => ({
  IconPicker: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <button type="button" onClick={() => onChange({ set: 'emoji', name: '🦅' })}>
      pick
    </button>
  ),
  IconRenderer: () => null,
}));

vi.mock('@/components/shared/fields', () => ({
  FieldDefinitionEditor: () => <div data-testid="field-editor" />,
}));

describe('EntityTypeForm api_source field', () => {
  it('renders an API Source dropdown and submits the selected value', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <EntityTypeForm orgId="org-1" onSaved={onSaved} onCancel={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/^Name/i), 'Species');

    const apiSource = screen.getByLabelText(/api source/i) as HTMLSelectElement;
    await user.selectOptions(apiSource, 'inaturalist');

    await user.click(
      screen.getByRole('button', { name: /create entity type/i })
    );

    await vi.waitFor(() => expect(insert).toHaveBeenCalled());
    expect(insert.mock.calls[0][0]).toMatchObject({
      name: 'Species',
      api_source: 'inaturalist',
    });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test -- src/components/admin/__tests__/EntityTypeForm.test.tsx`
Expected: FAIL (no dropdown, api_source not in payload).

- [ ] **Step 3: Add the dropdown**

Edit `src/components/admin/EntityTypeForm.tsx`:

1. Update the type import to include the new union:

```typescript
import type { EntityType, EntityTypeField, EntityLinkTarget, IconValue, EntityApiSource } from '@/lib/types';
```

2. Add state after the `linkTo` state (around line 24):

```typescript
  const [apiSource, setApiSource] = useState<EntityApiSource | ''>(
    entityType?.api_source ?? ''
  );
```

3. Add `api_source` to the payload inside `handleSubmit` (inside the `payload` object near line 64):

```typescript
      const payload = {
        name: name.trim(),
        icon,
        color,
        link_to: linkTo,
        api_source: apiSource === '' ? null : apiSource,
        org_id: orgId,
      };
```

4. Add the dropdown to the form UI (after the "Link To" block, before `FieldDefinitionEditor`):

```tsx
      <div>
        <label className="label" htmlFor="api-source">API Source</label>
        <select
          id="api-source"
          value={apiSource}
          onChange={(e) => setApiSource(e.target.value as EntityApiSource | '')}
          className="input-field w-auto"
        >
          <option value="">None</option>
          <option value="inaturalist">iNaturalist</option>
        </select>
        <p className="text-xs text-sage mt-1">
          When set, forms render the species picker instead of a basic select.
        </p>
      </div>
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm run test -- src/components/admin/__tests__/EntityTypeForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/EntityTypeForm.tsx src/components/admin/__tests__/EntityTypeForm.test.tsx
git commit -m "feat(admin): add API Source dropdown to EntityTypeForm"
```

---

## Task 10: UpdateForm conditional rendering

**Files:**
- Modify: `src/components/manage/UpdateForm.tsx:349-359`

- [ ] **Step 1: Write a failing test**

Update `src/components/manage/__tests__/UpdateForm.test.tsx`. First, update the hoisted mock entity types. Replace the existing `mockEntityTypes` mock (add one if not present) and add a mock that includes `api_source: 'inaturalist'`. Also stub `SpeciesPicker` by adding near the existing `EntitySelect` stub:

```typescript
vi.mock('@/components/manage/SpeciesPicker', () => ({
  default: (props: { entityTypeId: string }) => (
    <div data-testid={`species-picker-${props.entityTypeId}`} />
  ),
}));
```

Then extend the `vi.hoisted` block and the offline store mock so that `getEntityTypes` returns two rows — one with `api_source: 'inaturalist'` and one with `api_source: null`. Example (inside the existing `vi.hoisted({ ... })` return):

```typescript
const mockEntityTypes = [
  {
    id: 'et-species',
    org_id: 'org-1',
    name: 'Species',
    icon: { set: 'emoji', name: '🦅' },
    color: '#5D7F3A',
    link_to: ['updates'],
    api_source: 'inaturalist',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'et-volunteers',
    org_id: 'org-1',
    name: 'Volunteers',
    icon: { set: 'emoji', name: '🙋' },
    color: '#5D7F3A',
    link_to: ['updates'],
    api_source: null,
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
];
```

Update `getEntityTypes: vi.fn().mockResolvedValue(mockEntityTypes)`, and include `mockEntityTypes` in the hoisted return.

Add a new test to the file:

```typescript
it('renders SpeciesPicker for api_source entity types, EntitySelect otherwise', async () => {
  render(<UpdateForm />);
  await waitFor(() =>
    expect(screen.getByTestId('species-picker-et-species')).toBeInTheDocument()
  );
  expect(screen.getByTestId('entity-select')).toBeInTheDocument();
});
```

The existing `EntitySelect` stub returns `<div data-testid="entity-select" />`, which will match the volunteers entity type.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test -- src/components/manage/__tests__/UpdateForm.test.tsx`
Expected: FAIL (no species-picker-et-species testid; UpdateForm still always renders `EntitySelect`).

- [ ] **Step 3: Implement conditional rendering**

Edit `src/components/manage/UpdateForm.tsx`:

1. Add the import near the `EntitySelect` import (line 12):

```typescript
import SpeciesPicker from './SpeciesPicker';
```

2. Derive coordinates for `SpeciesPicker` from the selected item. Above the `return` (near line 150), derive:

```typescript
const speciesLat =
  typeof selectedItem?.latitude === 'number' ? selectedItem.latitude : undefined;
const speciesLng =
  typeof selectedItem?.longitude === 'number' ? selectedItem.longitude : undefined;
```

3. Replace the existing entity-types loop (lines 349-359) with:

```tsx
{entityTypes.map((et) => (
  <div key={et.id}>
    <label className="label">
      <IconRenderer icon={et.icon} size={14} /> {et.name}
    </label>
    {et.api_source === 'inaturalist' && orgId ? (
      <SpeciesPicker
        entityTypeId={et.id}
        entityTypeName={et.name}
        orgId={orgId}
        selectedIds={selectedEntityIds[et.id] || []}
        onChange={(ids) => setSelectedEntityIds((prev) => ({ ...prev, [et.id]: ids }))}
        lat={speciesLat}
        lng={speciesLng}
      />
    ) : (
      <EntitySelect
        entityTypeId={et.id}
        entityTypeName={et.name}
        selectedIds={selectedEntityIds[et.id] || []}
        onChange={(ids) => setSelectedEntityIds((prev) => ({ ...prev, [et.id]: ids }))}
      />
    )}
  </div>
))}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm run test -- src/components/manage/__tests__/UpdateForm.test.tsx`
Expected: PASS (including the new conditional test).

- [ ] **Step 5: Commit**

```bash
git add src/components/manage/UpdateForm.tsx src/components/manage/__tests__/UpdateForm.test.tsx
git commit -m "feat(manage): render SpeciesPicker for api_source entity types in UpdateForm"
```

---

## Task 11: ItemForm conditional rendering

**Files:**
- Modify: `src/components/manage/ItemForm.tsx:329-339`

- [ ] **Step 1: Write a failing test**

Create (or append to) `src/components/manage/__tests__/ItemForm.test.tsx`. If it does not exist, create a minimal version following the `UpdateForm.test.tsx` mock pattern, including:

```typescript
vi.mock('@/components/manage/SpeciesPicker', () => ({
  default: (props: { entityTypeId: string; lat?: number; lng?: number }) => (
    <div
      data-testid={`species-picker-${props.entityTypeId}`}
      data-lat={props.lat ?? ''}
      data-lng={props.lng ?? ''}
    />
  ),
}));

vi.mock('@/components/manage/EntitySelect', () => ({
  default: () => <div data-testid="entity-select" />,
}));

vi.mock('@/components/manage/LocationPicker', () => ({
  default: ({ onChange }: { onChange: (lat: number, lng: number) => void }) => (
    <button
      type="button"
      onClick={() => onChange(44.1, -73.9)}
      data-testid="location-picker"
    >
      pick
    </button>
  ),
}));
```

Mock entity types as in Task 10 and configure `useOfflineStore` to return them. Then add:

```typescript
it('renders SpeciesPicker and forwards item coords', async () => {
  const user = userEvent.setup();
  render(<ItemForm />);
  await waitFor(() =>
    expect(screen.getByTestId('species-picker-et-species')).toBeInTheDocument()
  );
  expect(screen.getByTestId('entity-select')).toBeInTheDocument();

  await user.click(screen.getByTestId('location-picker'));
  await waitFor(() => {
    const picker = screen.getByTestId('species-picker-et-species');
    expect(picker.getAttribute('data-lat')).toBe('44.1');
    expect(picker.getAttribute('data-lng')).toBe('-73.9');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test -- src/components/manage/__tests__/ItemForm.test.tsx`
Expected: FAIL (ItemForm always renders EntitySelect).

- [ ] **Step 3: Implement conditional rendering**

Edit `src/components/manage/ItemForm.tsx`:

1. Add the import near the `EntitySelect` import (line 14):

```typescript
import SpeciesPicker from './SpeciesPicker';
```

2. Replace the loop at lines 329–339 with:

```tsx
{entityTypes.map((et) => (
  <div key={et.id}>
    <label className="label">
      <IconRenderer icon={et.icon} size={14} /> {et.name}
    </label>
    {et.api_source === 'inaturalist' && orgId ? (
      <SpeciesPicker
        entityTypeId={et.id}
        entityTypeName={et.name}
        orgId={orgId}
        selectedIds={selectedEntityIds[et.id] || []}
        onChange={(ids) => setSelectedEntityIds((prev) => ({ ...prev, [et.id]: ids }))}
        lat={latitude ?? undefined}
        lng={longitude ?? undefined}
      />
    ) : (
      <EntitySelect
        entityTypeId={et.id}
        entityTypeName={et.name}
        selectedIds={selectedEntityIds[et.id] || []}
        onChange={(ids) => setSelectedEntityIds((prev) => ({ ...prev, [et.id]: ids }))}
      />
    )}
  </div>
))}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm run test -- src/components/manage/__tests__/ItemForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/manage/ItemForm.tsx src/components/manage/__tests__/ItemForm.test.tsx
git commit -m "feat(manage): render SpeciesPicker for api_source entity types in ItemForm"
```

---

## Task 12: EntityCard photo fallback to `custom_field_values.photo_url`

**Files:**
- Modify: `src/components/admin/EntityCard.tsx:16-34`

- [ ] **Step 1: Write a failing test**

Create `src/components/admin/__tests__/EntityCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EntityCard from '@/components/admin/EntityCard';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        getPublicUrl: () => ({ data: { publicUrl: 'https://supabase/x.jpg' } }),
      }),
    },
  }),
}));

vi.mock('@/components/shared/IconPicker', () => ({
  IconRenderer: () => <span data-testid="icon-fallback" />,
}));

const entityType = {
  id: 'et-1',
  org_id: 'o',
  name: 'Species',
  icon: { set: 'emoji', name: '🦅' },
  color: '#000',
  link_to: ['items'],
  api_source: null,
  sort_order: 0,
  created_at: '',
  updated_at: '',
};

describe('EntityCard photo fallback', () => {
  it('uses photo_path via Supabase when set', () => {
    const entity = {
      id: '1',
      entity_type_id: 'et-1',
      org_id: 'o',
      name: 'X',
      description: null,
      photo_path: 'path/one.jpg',
      external_link: null,
      external_id: null,
      custom_field_values: {},
      sort_order: 0,
      created_at: '',
      updated_at: '',
    };
    render(
      <EntityCard
        entity={entity}
        entityType={entityType as any}
        fields={[]}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://supabase/x.jpg'
    );
  });

  it('falls back to custom_field_values.photo_url when photo_path is null', () => {
    const entity = {
      id: '2',
      entity_type_id: 'et-1',
      org_id: 'o',
      name: 'Bluebird',
      description: null,
      photo_path: null,
      external_link: null,
      external_id: '7086',
      custom_field_values: { photo_url: 'https://inat/b.jpg' },
      sort_order: 0,
      created_at: '',
      updated_at: '',
    };
    render(
      <EntityCard
        entity={entity}
        entityType={entityType as any}
        fields={[]}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://inat/b.jpg'
    );
  });

  it('renders icon when neither photo_path nor custom_field_values.photo_url present', () => {
    const entity = {
      id: '3',
      entity_type_id: 'et-1',
      org_id: 'o',
      name: 'X',
      description: null,
      photo_path: null,
      external_link: null,
      external_id: null,
      custom_field_values: {},
      sort_order: 0,
      created_at: '',
      updated_at: '',
    };
    render(
      <EntityCard
        entity={entity}
        entityType={entityType as any}
        fields={[]}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByTestId('icon-fallback')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test -- src/components/admin/__tests__/EntityCard.test.tsx`
Expected: FAIL on the fallback test (current code only checks `photo_path`).

- [ ] **Step 3: Implement the fallback**

Edit `src/components/admin/EntityCard.tsx` — replace the existing `photoUrl` memo (lines 17–20) with:

```typescript
  const photoUrl = useMemo(() => {
    if (entity.photo_path) {
      return createClient()
        .storage.from('vault-public')
        .getPublicUrl(entity.photo_path).data.publicUrl;
    }
    const fromCustom = entity.custom_field_values?.photo_url;
    if (typeof fromCustom === 'string' && fromCustom.length > 0) {
      return fromCustom;
    }
    return null;
  }, [entity.photo_path, entity.custom_field_values]);
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm run test -- src/components/admin/__tests__/EntityCard.test.tsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/EntityCard.tsx src/components/admin/__tests__/EntityCard.test.tsx
git commit -m "feat(admin): EntityCard falls back to custom_field_values.photo_url"
```

---

## Task 13: Full type-check and test pass

**Files:** none (verification only)

- [ ] **Step 1: Run type-check**

Run: `npm run type-check`
Expected: PASS. Fix any errors introduced (most likely from `api_source` / `external_id` being new fields).

- [ ] **Step 2: Run full unit-test suite**

Run: `npm run test`
Expected: all tests green.

- [ ] **Step 3: Commit any fixes**

If fixes were needed:

```bash
git add <files>
git commit -m "fix: resolve type errors surfaced by species picker changes"
```

Skip this commit if no fixes were needed.

---

## Task 14: E2E happy path — select a species, save update, verify DB row

**Files:**
- Create: `e2e/tests/mobile/species-picker.spec.ts`

This test uses Playwright's route mocking to intercept `/api/species/*` so CI does not call iNaturalist. It assumes the existing `e2e/tests/mobile/mobile-views.spec.ts` seed produces a property, an item, an `entity_types` row with `api_source = 'inaturalist'` linked to updates, and a logged-in session. If not, update the seed first — see `e2e/fixtures` (or equivalent).

- [ ] **Step 1: Read the existing e2e fixture/seed setup**

Look at `e2e/tests/mobile/mobile-views.spec.ts` and any shared fixtures (`e2e/fixtures/*.ts`) to learn: how tests log in, how tenant is resolved, and how seed data is wired. Note the patterns used so the new spec matches.

- [ ] **Step 2: Write the happy-path E2E**

Create `e2e/tests/mobile/species-picker.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

const MOCK_SPECIES = {
  id: 7086,
  name: 'Sialia sialis',
  common_name: 'Eastern Bluebird',
  photo_url: 'https://example.com/bluebird.jpg',
  rank: 'species',
  observations_count: 42000,
  wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
};

test.describe('Species picker — happy path', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/species/nearby**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_SPECIES]),
      })
    );

    await page.route('**/api/species/search**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_SPECIES]),
      })
    );
  });

  test('pick a nearby species in an update and save it', async ({ page }) => {
    // Adjust URL + login per your e2e harness conventions.
    await page.goto('/manage/updates/new?item=seed-item-1');

    await page.getByPlaceholder(/search species/i).click();
    await expect(page.getByText(/recently seen nearby/i)).toBeVisible();
    await page.getByText('Eastern Bluebird').click();

    await expect(
      page.locator('text=Eastern Bluebird').first()
    ).toBeVisible();

    // Fill required fields
    await page.getByLabel(/update type/i).selectOption({ index: 1 });
    await page.getByRole('button', { name: /save update|submit/i }).click();

    // After redirect, assert the update exists. The exact assertion depends on
    // how the manage index lists updates — at minimum, confirm no error banner.
    await expect(page).toHaveURL(/\/manage/);
  });
});
```

- [ ] **Step 3: Run the smoke E2E**

Run: `npm run test:e2e:smoke -- --grep "Species picker"`
Expected: PASS. If selectors/URLs don't match the real shell, update them based on the existing `mobile-views.spec.ts` patterns.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/mobile/species-picker.spec.ts
git commit -m "test(e2e): species picker happy path"
```

---

## Task 15: E2E deduplication — same species selected twice creates one entity

**Files:**
- Modify: `e2e/tests/mobile/species-picker.spec.ts`

- [ ] **Step 1: Add the dedup test**

Append a second `test` block inside the existing `test.describe` in `e2e/tests/mobile/species-picker.spec.ts`:

```typescript
  test('selecting the same species twice reuses one entity', async ({ page, request }) => {
    // First selection
    await page.goto('/manage/updates/new?item=seed-item-1');
    await page.getByPlaceholder(/search species/i).click();
    await page.getByText('Eastern Bluebird').click();
    await page.getByLabel(/update type/i).selectOption({ index: 1 });
    await page.getByRole('button', { name: /save update|submit/i }).click();
    await expect(page).toHaveURL(/\/manage/);

    // Second selection (new update, same species)
    await page.goto('/manage/updates/new?item=seed-item-1');
    await page.getByPlaceholder(/search species/i).click();
    await page.getByText('Eastern Bluebird').click();
    await page.getByLabel(/update type/i).selectOption({ index: 1 });
    await page.getByRole('button', { name: /save update|submit/i }).click();
    await expect(page).toHaveURL(/\/manage/);

    // Query the DB via the Supabase REST endpoint or an admin test fixture to
    // verify exactly one entity exists with external_id=7086 for this org.
    // If a test helper already exists, use it; otherwise skip this query and
    // rely on a UI-level assertion that would fail on duplicate chips.
    const response = await request.get(
      `${process.env.E2E_SUPABASE_URL}/rest/v1/entities?external_id=eq.7086&select=id`,
      {
        headers: {
          apikey: process.env.E2E_SUPABASE_ANON_KEY ?? '',
          Authorization: `Bearer ${process.env.E2E_SUPABASE_ANON_KEY ?? ''}`,
        },
      }
    );
    const rows = await response.json();
    expect(Array.isArray(rows) ? rows.length : 0).toBe(1);
  });
```

If the repo does not expose `E2E_SUPABASE_URL` / `E2E_SUPABASE_ANON_KEY`, replace the DB assertion with a UI assertion that visits the entity admin page and asserts exactly one "Eastern Bluebird" entity is listed. Check `e2e/tests/admin/` for an existing pattern before writing a new one.

- [ ] **Step 2: Run and verify**

Run: `npm run test:e2e -- --grep "Species picker"`
Expected: both tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/mobile/species-picker.spec.ts
git commit -m "test(e2e): species picker deduplicates via external_id"
```

---

## Deferred — Tasks 14 and 15 (E2E)

Tasks 14 and 15 (Playwright happy-path and deduplication E2E) are deferred to a follow-up session. Implementing them cleanly requires:

- Extending `e2e/fixtures/seed.ts` to provision an `api_source = 'inaturalist'` entity type alongside the existing basic `Species` entity type, seeded on the test property.
- A known item with lat/lng on the test property so "nearby" suggestions have a target.
- Running against the live e2e harness (`npm run test:e2e`) with `.env.test.local` configured — writing these without executing them in the real environment is fragile.

The unit + integration coverage landed in Tasks 3–12 already exercises the API proxies, the picker component (search + debounce + selection + chips + offline), admin form wiring, the two parent-form integrations, and the EntityCard photo fallback. The open E2E work is UX-level verification, not implementation.

When resumed, follow the task text in the sections above and also:
1. Add a second entity-type seed row with `api_source: 'inaturalist'` (e.g. `iNat Species`) so existing tests that rely on the plain `Species` type aren't affected.
2. Use `page.route('**/api/species/**', ...)` to intercept upstream requests at the Next.js route layer.

---

## Done criteria

- `npm run type-check` passes.
- `npm run test` passes.
- Manual check in dev: creating an entity type with `api_source = inaturalist`, then opening the update form for an item, shows the new picker; selecting a species creates an `entities` row with `external_id` populated; selecting the same species again reuses that row.
- (Deferred) `npm run test:e2e:smoke` passes including the new `Species picker` tests — see "Deferred" section above.
