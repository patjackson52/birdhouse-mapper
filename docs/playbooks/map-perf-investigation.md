# Map Performance Investigation Runbook

Short reference for diagnosing `/map` TTRC issues using the Phase 0 measurement suite.

## Vercel Speed Insights

Vercel auto-collects Core Web Vitals per route. Open the project's Speed Insights tab and filter by route `/map`. Key metrics:

- **LCP** (Largest Contentful Paint) — when the largest visible element painted. Target: <2.5s on mobile.
- **INP** (Interaction to Next Paint) — responsiveness to user input. Target: <200ms.
- **CLS** (Cumulative Layout Shift) — visual stability. Target: <0.1.
- **FCP** (First Contentful Paint) — first pixel painted. Loose proxy for perceived load.
- **TTFB** (Time to First Byte) — server response time.

Compare metrics across deploys to spot regressions.

## `?perf=1` debug overlay

Append `?perf=1` to any URL to render a fixed bottom-right overlay listing custom `performance.mark` entries from our codebase (third-party marks are filtered out). The overlay polls `getReport()` every 500ms and exposes a copy-as-JSON button. Persist across navigations with `localStorage.perfOverlay = '1'` (set in DevTools console).

### Marks emitted from `/map`

| Mark | Where |
|---|---|
| `ttrc:hydrate-start` | `HomeMapViewContent` first render |
| `ttrc:idb-resolved` | items + types + custom-fields available from IndexedDB |
| `ttrc:geolayers-resolved` | default-visible geo-layers fetched (or cache-validated post-Phase-3) |
| `ttrc:first-paint-tile` | first basemap tile loaded into Leaflet |
| `ttrc:first-marker` | first item marker mounted |
| `ttrc:all-markers` | last item marker mounted (fires once per items.length change) |
| `ttrc:interactive` | first user pan / zoom / click on the map |

The cache-state tag at the top of the overlay reads `cold` when no service worker controller is present, `warm` when one is.

## Reproducing a cold visit

1. Open Chrome DevTools → **Application** tab.
2. **Service Workers**: click "Unregister" for the current origin.
3. **Storage** → "Clear site data" — check all boxes (especially IndexedDB and Cache Storage), click "Clear site data".
4. Hard-reload (`Cmd+Shift+R`).
5. The `?perf=1` overlay should now show `cold` and the marks should reflect a fresh-from-network load.

For a quicker repro that keeps service worker but clears app caches, use **Application → Storage → IndexedDB** to delete only the `birdhousemapper-offline` database.

## Identifying the bottleneck

Sort the overlay marks by `start`. Subtract consecutive marks to find the longest gap. Common patterns:

- **`hydrate-start` → `idb-resolved` is large** — IndexedDB is cold or slow. Phase 1.2 + Phase 2.1 (bootstrap JSON) target this.
- **`idb-resolved` → `geolayers-resolved` is large on warm visits** — geo-layer cache miss or revalidation slow. Phase 3 targets this.
- **`first-marker` long after `idb-resolved`** — Leaflet hydration is slow, or markers are fighting for the main thread with background sync. Phase 1.3 (deferred sync) addresses the latter.
- **`first-paint-tile` long after `hydrate-start`** — tile network is slow, or preconnect missed. Phase 1.4 (preconnect) targets this.

## Related PRs and issues

- Parent issue: #308 — Map TTRC improvements
- Phase 0 (measurement, shipped): #298, #309
- Phase 1 (quick wins): #302, #310
- Phase 2 (cold-visit fix): #311
- Phase 3 (this work): #312
- Spec: `docs/superpowers/specs/2026-05-02-map-ttrc-improvements-design.md`
