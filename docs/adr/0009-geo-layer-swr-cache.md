# ADR-0009: Stale-While-Revalidate Cache for Org Geo-Layer GeoJSON

**Status:** Accepted

**Date:** 2026-05-03

**Issue / PR:** [#316](https://github.com/patjackson52/birdhouse-mapper/pulls/316) — "perf(map): IDB-cached GeoJSON with stale-while-revalidate (Phase 3)"

## Context

GeoJSON payloads for org geo-layers can be large (hundreds of features). Before PR #316, `HomeMapView` fetched every visible layer's full GeoJSON from Supabase on every `/map` load via `getGeoLayerPublic`. On warm visits (repeat page loads) this was wasteful: the data had not changed but the client had no way to know that, so it re-transferred the full payload every time.

The `geo_layers` table had no `updated_at` column, making any version check impossible. Measurement via the `?perf=1` overlay (see `docs/playbooks/map-perf-investigation.md`) showed that `idb-resolved → geolayers-resolved` was the dominant latency gap on warm visits, driven entirely by these redundant full fetches.

Phase 3 of the map TTRC improvement initiative targeted this gap.

## Decision

1. **Add `updated_at` to `geo_layers` (migration `supabase/migrations/051_geo_layers_updated_at.sql`).** The column is auto-maintained by the existing `update_updated_at()` trigger. Existing rows are backfilled to `created_at`.

2. **Expose `updated_at` on `GeoLayerSummary` (`src/lib/geo/types.ts`).** The lightweight summary returned by list actions now carries the version token without fetching the full GeoJSON.

3. **Add a `geo_layer_cache` table to IndexedDB (Dexie schema v3, `src/lib/offline/db.ts`).** Schema: `{ id, version, geojson, fetchedAt }` keyed on layer id. Helpers live in `src/lib/offline/geo-layer-cache.ts` (`getCachedLayer`, `putCachedLayer`, `bulkGetCachedLayers`).

4. **Add `getGeoLayerPublicIfNewer` server action (`src/app/admin/geo-layers/actions.ts`).** Queries with `.gt('updated_at', knownVersion).maybeSingle()` — returns `{ unchanged: true }` when nothing changed, full layer otherwise. No extra round-trip for version check; the condition is pushed into Postgres.

5. **Implement SWR in `HomeMapViewContent` (`src/components/map/HomeMapView.tsx`).** On each page load:
   - Fetch the lightweight layer manifest (`getPropertyGeoLayersPublic`) — small, metadata only.
   - Bulk-read cached GeoJSON from IndexedDB (`bulkGetCachedLayers`) — zero network.
   - Render immediately from cache if present.
   - In parallel, compare each cached row's `version` to the manifest's `updated_at`. If equal, skip. If different (or no cache), call `getGeoLayerPublicIfNewer`. Replace the rendered layer only if the server returns a newer payload.
   - Write updated payloads back to IDB via `putCachedLayer`.

   The same SWR logic applies to the boundary layer and to layers toggled on by the user (`loadLayerCacheFirst`).

## Alternatives Considered

- **Revalidate on every load (no cache).** Simple but wastes bandwidth and adds ~200–800ms latency on every warm visit. Rejected — the measured TTRC gap was the primary motivation.
- **Cache forever (no revalidation).** Zero latency on warm visits but stale layers show indefinitely after admin edits. Rejected — layers are editable and org admins expect changes to appear promptly on the public map.
- **ETag / `If-None-Match` HTTP header check.** Natural fit but Supabase server actions run as Next.js Server Actions over POST, not cacheable HTTP GET responses. No way to plumb HTTP conditional request headers through the action boundary. Rejected — `updated_at` comparison pushed to Postgres achieves the same semantic with the tools available.
- **Polling / WebSocket for cache invalidation.** Adds persistent connection complexity for a relatively static asset. Rejected — geo-layer edits are infrequent; lazy revalidation on page load is sufficient.
- **Service Worker Cache API instead of IndexedDB.** The rest of the offline layer (items, photos, sync metadata) uses Dexie/IDB. Splitting storage engines for one asset type adds complexity with no benefit. Rejected.

## Consequences

**Positive:**
- Warm visits skip full GeoJSON transfer for unchanged layers; `geolayers-resolved` mark fires as soon as IDB reads complete rather than waiting for network.
- Cold visits (no IDB entry) are unchanged in behaviour — full fetch, then write to cache.
- Admin edits propagate on the next page load (`updated_at` mismatch → revalidate); no stale-forever risk.
- IDB schema versioning (Dexie v3) is additive; existing v1/v2 databases upgrade automatically.

**Negative:**
- First load after clearing IndexedDB (or first ever visit) is unchanged — no cache hit possible.
- Dexie schema upgrade blocked by a stale service worker causes a `blocked` event; the `db.ts` handler reloads the page once to resolve it (see comment in `src/lib/offline/db.ts`).

**Neutral:**
- `geo_layer_cache` is a separate IDB table from the `geo_layers` sync-engine table (which stores layer metadata without GeoJSON). Two separate concerns; deliberate separation.

## Related Files

- `supabase/migrations/051_geo_layers_updated_at.sql`
- `src/lib/geo/types.ts` — `GeoLayerSummary.updated_at`
- `src/lib/offline/db.ts` — Dexie schema v3, `geo_layer_cache` table
- `src/lib/offline/geo-layer-cache.ts` — get/put/bulkGet helpers
- `src/app/admin/geo-layers/actions.ts` — `getGeoLayerPublicIfNewer`
- `src/components/map/HomeMapView.tsx` — SWR logic in geo-layer `useEffect`
- `docs/playbooks/map-perf-investigation.md` — measurement runbook, `ttrc:geolayers-resolved` mark

## Tags

`performance`, `offline`, `geo`, `indexeddb`, `caching`
