# Parcel Boundary Lookup — Design Spec

**Issue:** #205
**Date:** 2026-04-05

## Overview

Automated parcel boundary lookup from public US county GIS sources. Given an address, the system geocodes it, identifies the county, discovers or looks up the county's ArcGIS parcel endpoint, queries for matching parcels, and returns GeoJSON candidates for the user to confirm. Results are stored as geo layers using the existing `geo_layers` table.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Map library | Leaflet (existing) | No migration now; possible future MapLibre support |
| Registry scope | Global DB table | County endpoints are public infrastructure, shared across orgs |
| Data model | Reuse geo_layers | Parcel results stored as geo layers with `source: 'parcel_lookup'`; user opts in to `is_property_boundary` |
| Pipeline location | Server-side (server actions) | Centralizes caching, keeps door open for Regrid API keys |
| Discovery | Auto-discover with registry cache | Query ArcGIS Hub, probe fields with heuristics, cache results |
| Multi-parcel storage | Separate features in FeatureCollection | Preserves per-parcel metadata (APN, acres, owner) |
| Boundary display | Optional Turf.js union | User can opt to merge parcels into unified boundary outline |
| Boundary versioning | No explicit versioning | Old boundary becomes a regular geo layer when replaced |
| Regrid fallback | Deferred to v2 | Free APIs (Census, ArcGIS) cover v1; Regrid adds cost/complexity |
| Onboarding wizard | Not in v1 | Entry points: post-property-creation prompt + geo layers section |

## Data Model

### New table: `county_gis_registry` (global)

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `fips` | text UNIQUE | County FIPS code, e.g. "53035" |
| `county_name` | text | e.g. "Kitsap County" |
| `state` | text | e.g. "WA" |
| `parcel_layer_url` | text | ArcGIS FeatureServer URL for parcel polygons |
| `address_layer_url` | text | Optional separate address points layer |
| `field_map` | jsonb | Maps canonical names to county-specific field names |
| `discovery_method` | text | `'manual'` or `'auto'` |
| `confidence` | text | `'high'`, `'medium'`, or `'low'` |
| `last_verified_at` | timestamptz | When endpoint was last confirmed working |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**`field_map` schema:**
```json
{
  "parcel_id": "APN",
  "owner_name": "CONTACT_NAME",
  "site_address": "SITE_ADDR",
  "house_number": "HOUSE_NO",
  "street_name": "STREET_NAME",
  "acres": "POLY_ACRES",
  "address_link_field": "RP_ACCT_ID"
}
```

### New table: `parcel_lookups` (per-org, audit log)

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `org_id` | uuid FK | |
| `property_id` | uuid FK | |
| `input_address` | text | Address the user entered |
| `input_lat` | numeric | Geocoded latitude |
| `input_lng` | numeric | Geocoded longitude |
| `county_fips` | text | Resolved county FIPS |
| `source` | text | `'county_arcgis'` |
| `status` | text | `'success'`, `'partial'`, `'not_found'`, `'error'` |
| `parcels_found` | integer | Number of parcels returned |
| `cost_cents` | integer | For future Regrid tracking |
| `result_geo_layer_id` | uuid FK | Geo layer created from this lookup |
| `created_at` | timestamptz | |

### Modified: `geo_layers.source` column

Add `'parcel_lookup'` as a valid value alongside existing `'manual'`, `'ai'`, `'discovered'`.

### No new columns on `properties`

The property boundary is represented by a geo_layer with `is_property_boundary: true`, linked via the existing `geo_layer_properties` join table.

## Server-Side Pipeline

### Entry point: `lookupParcel(input)`

```
Input: { address, propertyId, orgId }
        |
Step 1: Geocode address -> { lat, lng }
  Census Geocoder API (free, no key)
  GET https://geocoding.geo.census.gov/geocoder/locations/onelineaddress
        |
Step 2: Resolve county FIPS from lat/lng
  Census TIGERweb API (free, no key)
  GET https://geocoding.geo.census.gov/geocoder/geographies/coordinates
        |
Step 3: Resolve ArcGIS endpoint
  Check county_gis_registry by FIPS
  If not found -> auto-discover via ArcGIS Hub search
  If discovered -> probe fields with heuristics, cache to registry
  If discovery fails -> return { status: 'not_found' }
        |
Step 4: Query parcels
  Query parcel polygons layer with spatial query (point intersection)
  Or query address points layer to get parcel ID, then query polygons by ID
  Return matching candidates with geometry + metadata
        |
Step 5: Multi-parcel detection
  If parcel found, query for adjacent parcels with same owner
  Use bbox envelope + owner name filter
  Return all candidates for user selection
        |
Output: { status, parcels[], countyFips, source }
```

### Confirmation: `confirmParcelSelection(input)`

The `lookupParcel` action returns full parcel candidate objects (GeoJSON geometry + metadata). The client holds these in state and passes back the user's selection:

```
Input: {
  parcels: ParcelCandidate[],  -- full GeoJSON features selected by user
  propertyId, orgId,
  setAsBoundary: boolean,
  unionForBoundary: boolean,
  layerName: string            -- user-provided or auto-generated name
}
        |
- Build FeatureCollection from selected parcels
- If unionForBoundary: compute Turf.js union, store as additional
  "_boundary" feature in the FeatureCollection with property
  { role: "boundary_outline" }
- Create geo_layer via existing createGeoLayer()
- If setAsBoundary: set is_property_boundary on the geo_layer
- Log to parcel_lookups audit table
        |
Output: { success: true, geoLayerId }
```

All external API calls are free (Census Geocoder, Census TIGERweb, ArcGIS public services). No API keys needed for v1.

## Auto-Discovery & Field Matching

### Discovery flow

1. Search ArcGIS Hub: `https://www.arcgis.com/sharing/rest/search?q={county}+{state}+parcel&type=Feature+Service`
2. Filter results for likely parcel layers (keywords: `parcel`, `tax`, `lot`, `cadastral`)
3. For each candidate, fetch FeatureServer metadata (`/0?f=json`) to get field list
4. Run heuristic field matcher against field list
5. If confident match -> run test query (small bbox, limit 1) to validate
6. Cache to `county_gis_registry` with `discovery_method: 'auto'`

### Heuristic field matcher

Pattern matching against common US county naming conventions:

| Canonical field | Common patterns |
|---|---|
| `parcel_id` | `APN`, `PIN`, `PARCEL_ID`, `PARCEL_NO`, `ACCT_ID`, `RP_ACCT_ID`, `TAX_ID`, `PARCEL_NUM` |
| `owner_name` | `OWNER`, `OWNER_NAME`, `CONTACT_NAME`, `TAXPAYER`, `OWN_NAME` |
| `site_address` | `SITE_ADDR`, `SITEADDRESS`, `PROP_ADDR`, `ADDRESS`, `FULL_ADDR` |
| `house_number` | `HOUSE_NO`, `HOUSE_NUM`, `ADDR_NUM`, `STREET_NO` |
| `street_name` | `STREET_NAME`, `STREET`, `STREET_NM`, `ST_NAME` |
| `acres` | `ACRES`, `POLY_ACRES`, `GIS_ACRES`, `AREA_ACRES`, `CALC_ACRES` |

Minimum requirement: confident match on `parcel_id`. Without that, the endpoint is unusable.

**Confidence levels:**
- **High**: matched `parcel_id` + 2+ other fields + successful test query
- **Medium**: matched `parcel_id` + 1 other field
- **Low**: matched `parcel_id` only

## UI Design

### Component: `<ParcelLookup />`

State machine with 5 states:

1. **Idle** — Address input with "Look Up" button
2. **Searching** — Spinner with county name feedback
3. **Found** — Two variants:
   - **Single parcel**: Map preview with highlighted polygon, "Save as Geo Layer" + "Find Adjacent Parcels" buttons, "Set as property boundary" checkbox
   - **Multiple parcels**: Checkboxes per parcel with APN/acreage labels, "Save Selected" button, "Set as property boundary" checkbox, "Merge into unified boundary outline" checkbox
4. **Not Found** — Fallback options: try different address, draw on map, upload file
5. **Confirmed** — Summary (parcel count, acreage, geo layer name), links to view on map or edit in geo layers

### Component: `<ParcelPreviewMap />`

Leaflet map showing parcel candidates with:
- Highlighted polygon fills (color-coded per parcel)
- Fit bounds to show all candidates
- Click to select/deselect individual parcels

### Entry points

1. **Post-property-creation**: After creating a property on `/admin/properties`, prompt with "Find boundary automatically" linking to parcel lookup
2. **Geo Layers section**: "Parcel Lookup" button in `/admin/properties/[slug]/geo-layers/` alongside existing Import and Discover actions

Fallback options (draw, upload) link to existing geo layer functionality — no new UI needed for those paths.

## File Structure

### New files

```
src/lib/geo/parcel-lookup.ts            -- Core pipeline (geocode, FIPS, discover, query)
src/lib/geo/field-matcher.ts            -- Heuristic field name matching
src/lib/geo/arcgis-client.ts            -- ArcGIS REST API client
src/lib/geo/census-client.ts            -- Census geocoder + TIGERweb FIPS lookup

src/app/admin/properties/[slug]/
  parcel-lookup/
    page.tsx                             -- Parcel lookup page
    actions.ts                           -- Server actions (lookupParcel, confirmParcelSelection)

src/components/geo/ParcelLookup.tsx      -- Main UI component (state machine)
src/components/geo/ParcelPreviewMap.tsx   -- Leaflet map for parcel candidates

supabase/migrations/
  034_county_gis_registry.sql            -- Registry table
  035_parcel_lookups.sql                 -- Audit log table
  036_geo_layer_source_parcel.sql        -- Add 'parcel_lookup' to geo_layers.source

src/__tests__/geo/parcel-lookup.test.ts  -- Pipeline unit tests
src/__tests__/geo/field-matcher.test.ts  -- Field matcher unit tests
```

### Modified files

```
src/app/admin/properties/[slug]/layout.tsx  -- Add "Parcel Lookup" to sidebar nav
src/lib/geo/types.ts                        -- Add parcel lookup types
```

## Testing Strategy

- **Unit tests** for field matcher: known field lists from Kitsap County, King County, and synthetic edge cases
- **Unit tests** for pipeline logic: mocked HTTP responses for Census and ArcGIS APIs
- **Integration test** against live Kitsap County endpoint: skipped in CI, run manually with `LIVE_GIS_TEST=1`
- **Component tests** for ParcelLookup state transitions

## External APIs (all free, no keys)

| API | Purpose | Rate limits |
|---|---|---|
| Census Geocoder | Address -> lat/lng | Undocumented, generous |
| Census TIGERweb | lat/lng -> county FIPS | Undocumented, generous |
| ArcGIS Hub Search | Discover county FeatureServer URLs | Public, no auth |
| County ArcGIS FeatureServers | Query parcel polygons | Public, per-county |

## Success Criteria

- Given a US address, returns correct parcel boundary in <5 seconds for discoverable counties
- Handles multi-parcel properties (detects adjacent same-owner parcels)
- Falls back gracefully to manual draw / file upload with clear UX
- Parcel data stored as geo_layer with source metadata
- Works from both post-property-creation flow and geo layers admin
- County registry auto-populates via discovery, no manual config required
- No API keys or costs for v1

## Out of Scope (v1)

- Regrid API fallback (v2)
- Onboarding wizard integration (v2)
- Boundary versioning / history tracking
- PMTiles cache triggering on boundary confirm (separate feature)
- Non-US parcel systems
- Admin UI for manually editing county registry entries
