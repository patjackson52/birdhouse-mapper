# MapLibre GL + Protomaps vs React-Leaflet: Tradeoff Analysis

**Date:** 2026-05-02
**Author:** Claude (research agent)
**Status:** Decision input — not yet acted on
**Branch context:** Written on `feat/species-picker-grid`; intended for triage on main.

---

## 1. Executive summary

- **Bundle cost real, ops cost real.** MapLibre GL JS is ~6–7x larger than Leaflet (~290 KB gz vs ~42 KB gz), and self-hosting Protomaps means owning a tile artifact that's anywhere from ~50 MB (small county) to ~120 GB (planet) depending on extract scope.
- **Migration is not a swap, it's a port.** Every map-touching component (`MapView`, `ItemMarker`, `GeoLayerRenderer`, `PropertyBoundary`, `DrawAreaControl`, `LocateButton`, `FlyToUser`) uses Leaflet's imperative `L.*` API or `react-leaflet`'s declarative wrappers. None of that is portable. `leaflet-draw` has no first-class MapLibre equivalent — `terra-draw` or `@mapbox/mapbox-gl-draw` (MIT fork) is the replacement and behaves differently.
- **Recommendation: don't migrate now. Conditional yes later.** Today the app needs offline-first, low-bundle, and a working WYSIWYG layer/style pipeline that Leaflet already delivers. Revisit when one of three triggers fires (see §10).

---

## 2. What we have today

Map stack files (cite by path):

- **Container & top-level orchestration:** `src/components/map/MapView.tsx` — uses `MapContainer`, `TileLayer`, `ImageOverlay`, `useMap`. Handles fullscreen, escape key, `invalidateSize` on resize, fly-to-user, sheet-state-aware FAB.
- **Per-item markers:** `src/components/map/ItemMarker.tsx` — uses `L.divIcon` with HTML+CSS pin shape, dynamic background color from `statusColors`, custom emoji/icon HTML rendered async via `iconToHtml`, native Leaflet `<Popup>` with React children.
- **Geo-layer overlays:** `src/components/geo/GeoLayerRenderer.tsx` — `L.geoJSON` with `style`, `pointToLayer` (circleMarker), `onEachFeature` for click + hover tooltip. Per-layer color/opacity from `GeoLayerSummary`.
- **Property boundary:** `src/components/geo/PropertyBoundary.tsx` — `L.geoJSON` non-interactive, dashed stroke, calls `map.fitBounds` on mount.
- **Drawing:** `src/components/geo/DrawAreaControl.tsx` — uses `leaflet-draw` (rectangle/polygon), bundled CSS, custom shape options.
- **Locate / GPS:** `src/components/map/LocateButton.tsx` + `src/components/map/UserLocationLayer.tsx` — DOM button, `flyTo`, location-permission state UI.
- **Layer panel + feature popup:** `src/components/geo/LayerControlPanel.tsx`, `src/components/geo/FeaturePopup.tsx` — both are pure React DOM overlays, not Leaflet-bound. **Portable as-is.**
- **Parcel preview:** `src/components/geo/ParcelPreviewMap.tsx`, `src/components/geo/ParcelLookup.tsx` — secondary map instance for parcel review flow.
- **Theming / tile sources:** `src/lib/config/themes.ts` + `src/lib/config/map-styles.ts` — 10 raster styles across CARTO / OSM / Stadia / ESRI / OpenTopoMap, selected per-org or per-theme. Single `<TileLayer url=… />` call at `MapView.tsx:108`.
- **Service worker tile cache:** `src/app/sw.ts:34-52` — Serwist `CacheFirst` matcher on `tile.openstreetmap.org`, `basemaps.cartocdn.com`, `tiles.stadiamaps.com`, `server.arcgisonline.com`, `stamen-tiles.a.ssl.fastly.net`. 30,000 entries × 30 days.
- **Public submission map:** `src/components/map/PublicSubmissionForm.tsx`, `PublicContributeButton.tsx`.

Package versions (`package.json`): `leaflet@^1.9.4`, `react-leaflet@^4.2.1`, `leaflet-draw@^1.0.4`.

---

## 3. What changes with MapLibre + Protomaps

| Feature (file) | Rewrite scope | Notes |
|---|---|---|
| Container / lifecycle (`MapView.tsx`) | **Medium.** | `react-map-gl/maplibre` provides declarative wrappers but covers ~70% of `react-leaflet`'s surface. `useMap` → `useMap` (different API). `invalidateSize` → `map.resize()`. Escape/fullscreen logic survives. |
| Marker w/ HTML pin + popup (`ItemMarker.tsx`) | **Medium-large.** | Two valid paths: (a) HTML `<Marker>` overlays — perf falls off ~500–1000 markers; (b) symbol layer with sprite atlas — needs sprite generation pipeline for the dynamic color × icon × status combinatorial. Today's div-icon approach (CSS pin + rotating inner span + emoji/icon HTML) does **not** map cleanly to a sprite. The async `iconToHtml` flow has to be re-thought. |
| Geo-layer renderer (`GeoLayerRenderer.tsx`) | **Medium.** | Becomes `addSource({type:'geojson'})` + `addLayer` (one fill, one line, one circle per layer). Per-feature click handled via `map.on('click', layerId, …)`. Hover tooltip becomes `mousemove` + custom DOM popup. Cleanup on unmount changes shape. |
| Property boundary (`PropertyBoundary.tsx`) | **Small.** | Two layers (line dashed + fill 0.05) plus `fitBounds` (`map.fitBounds(bbox)`). |
| Draw control (`DrawAreaControl.tsx`) | **Large.** | `leaflet-draw` has no drop-in. Options: `terra-draw` (active, MIT) or `@mapbox/mapbox-gl-draw` (works with MapLibre via shim, but Mapbox v1 license — verify). Both have different event models, different shape-style APIs. Rectangle drawing in particular is not first-class in mapbox-gl-draw. **This is the biggest single rewrite.** |
| Locate / fly-to (`LocateButton.tsx`, `FlyToUser`) | **Small.** | `map.flyTo({center,zoom,duration})`. UI button is DOM. |
| Layer panel / feature popup | **Trivial.** | Already DOM-only. |
| Theming (10 raster styles → vector style) | **Medium-large.** | Today: change one URL. With MapLibre + Protomaps you ship a single vector tile source plus a JSON style. Each "theme" (forest / ocean / desert / urban / arctic / meadow) needs a hand-tuned style JSON or you adapt the official Protomaps light/dark/white/black/grayscale variants. CARTO Voyager / Stadia Outdoors / ESRI Imagery have **no** vector equivalent in Protomaps — satellite specifically requires a separate raster source. |
| Custom raster overlay (`ImageOverlay`) | **Small.** | MapLibre `image` source + `raster` layer. |
| Public submission map | **Medium.** | Same as `MapView` rewrite, smaller. |

Net: ~5 medium and 2 large rewrites, plus theming pipeline plus a new tile-hosting story.

---

## 4. Performance

**Bundle:**
- Leaflet `1.9.4` ≈ 42 KB gz; `react-leaflet@4` ≈ 4 KB gz. Total ~46 KB gz.
- `maplibre-gl@4+` ≈ 200–290 KB gz (figures vary by version; community consensus ~290 KB gz). `react-map-gl/maplibre` ≈ 5 KB gz. `pmtiles` JS protocol ≈ 20 KB gz.
- **Net bundle add: ~230–270 KB gz** — material on a mobile-first PWA. Code-splitting keeps it off the main entry but the map is the home page.

**Tile transfer:**
- Today: raster PNG ≈ 15–35 KB / tile, ~10–20 tiles per viewport on first paint. Subsequent pans cache-hit via SW.
- MapLibre + Protomaps: single `.pmtiles` file served via HTTP range requests; per-viewport bytes drop substantially because vector tiles are 5–10x smaller than raster (typically 2–10 KB per vector tile vs 15–35 KB raster). After the file is "warm" in CDN, range requests have very low latency.
- **Win for pan/zoom on warm cache. Loss on first cold load** (style JSON + sprite + glyphs + first range chunks).

**Rendering:**
- Leaflet: DOM/SVG. Markers as DOM elements — degrades visibly past ~500–1000 markers, very visibly past ~2000.
- MapLibre: WebGL; thousands of symbol-layer markers render at 60 fps. Smooth pan/zoom (continuous, not tile-step). Pitch and rotation supported (today's stack has neither).
- For current marker counts (10–200 per property, low hundreds for power users) **the perf difference is invisible**. Becomes meaningful at 1000+ items per viewport.

**Mobile gestures:**
- Both handle pinch-zoom and drag. MapLibre's continuous zoom feels nicer; Leaflet's discrete zoom is fine and what users are used to.

---

## 5. Hosting & ops

**Where does the .pmtiles file live?**
- Cloudflare R2 / S3 / Backblaze B2 (must support HTTP `Range:` — all three do).
- Vercel: serving large static files via Vercel's CDN works but **range-request behavior on Vercel's edge has historically been spotty for files > a few hundred MB**. Recommend Cloudflare R2 (zero egress) or B2 in front of Bunny CDN.
- CORS: must allow `Range`, `If-Match`, `If-Range` and expose `Content-Range`, `Accept-Ranges`, `ETag`.

**File size by scope:**
- Planet z0–z15: ~120 GB (Protomaps docs).
- Country (US): roughly 17–18 GB (cited example: US + Mexico extract ~17 GB).
- State (e.g. California) z0–z14: estimated ~2–4 GB — unknown, needs benchmark.
- County or single-property bbox z0–z15: ~50–500 MB — unknown, needs benchmark.

**Update cadence:** Protomaps publishes weekly planet builds. Re-extracting per region is a CLI step (`pmtiles extract --bbox=…`) you'd schedule (cron / GitHub Action). For an org with parcels in multiple counties you either ship one larger extract or one file per region with style switching.

**Bandwidth:** per-user range traffic is *lower* than raster tiles after warm-up but the artifact storage is yours. CDN egress is the dominant cost line — Cloudflare R2 is free egress, S3 / Vercel are not.

---

## 6. Offline support

Today's offline model: Serwist `CacheFirst` on raster tile hostnames, 30k entries, 30d (`src/app/sw.ts:43-51`). Works because each tile is its own URL — SW caches them independently as the user pans.

PMTiles + SW: harder.
- The browser fetches **byte ranges of one big file**. Chrome and Firefox do **not** properly cache range responses against an origin URL (cited: PMTiles issue #272). The CacheStorage API stores full responses, not ranges.
- Workable patterns:
  1. **Download whole `.pmtiles` to Cache or IndexedDB once**, then a SW intercepts subsequent range requests and slices bytes from the cached blob (the Cloudflare Pages pattern). Works, requires the entire file to fit on the device. For a property-bbox extract (~50–200 MB) this is acceptable; for state-level it's not.
  2. **Use the PMTiles JS library's in-memory LRU cache** — ephemeral, lost on reload.
  3. **Pre-bake per-property extracts** at signup and download on first launch — this is actually a *new feature opportunity* (true offline maps), not a regression, but it's also new engineering.
- Today's "30k tile entries × 30 days" model gives generous offline behavior for free. Replicating that with PMTiles requires writing the SW slicing layer.

**Verdict:** offline gets *strictly worse* unless we invest in pattern (1) or (3).

---

## 7. Cost

**Engineering effort (rough):**

| Workstream | Person-days |
|---|---|
| MapView + lifecycle port | 3–5 |
| ItemMarker rewrite (with sprite pipeline OR HTML-overlay perf strategy) | 4–7 |
| GeoLayerRenderer + click/hover/tooltip parity | 3–5 |
| PropertyBoundary, ImageOverlay, fly-to, locate | 2–3 |
| Drawing replacement (`terra-draw` adoption + theming + parity tests) | 5–8 |
| Theme → vector style mapping (6 themes) | 4–6 |
| Tile hosting setup, extract pipeline, CDN, CORS | 3–5 |
| SW range-slicing for offline parity | 4–7 |
| QA + visual regression + Playwright re-baselines | 3–5 |
| **Total** | **~31–51 person-days** (roughly 6–10 weeks one engineer) |

**Risk of regression:** high. Map is the home screen. Touch behavior, popup placement, marker hit-targets, zoom feel — all user-visible, hard to spec, easy to break.

**What gets thrown away:** the divIcon styling pipeline, the `leaflet-draw` integration, the per-style raster theming UX, and the existing SW tile cache strategy. None of that work is portable.

---

## 8. Pros / Cons

### React-Leaflet (current)

**Pros:** small bundle (~46 KB gz); battle-tested DOM model; `leaflet-draw` works; SW tile caching trivial; switching basemap is a URL change; existing code works; visual baselines exist.

**Cons:** raster only (no client-side restyling); third-party tile dependency (CARTO / Stadia rate-limits or pricing risk); marker perf cliff at ~1000+; no pitch/rotation; no offline-by-design (offline is best-effort cache).

### MapLibre GL + Protomaps

**Pros:** vector basemap → live restyling, pitch/rotate, 3D terrain possible; smooth WebGL pan/zoom; massive marker counts; **basemap is yours** (no third-party rate limits); MIT-licensed all the way down; enables a real "download offline map" feature; Protomaps has a clean weekly OSM build pipeline.

**Cons:** ~250 KB gz bundle add; entire map layer rewrite (~6–10 weeks); `leaflet-draw` replacement is a meaningful project; offline parity requires custom SW work or regresses; tile artifact storage + CDN ops to own; satellite/topo themes still need third-party raster sources; visual regressions inevitable.

---

## 9. Decision matrix — when does it become worth it?

Migrate **conditionally** if any of these become true:

| Trigger | Why it forces the move |
|---|---|
| Per-property item count routinely > 1500 markers in viewport | Leaflet DOM perf cliff |
| Product needs fully offline maps as a sold feature | Vector + downloadable PMTiles is the only credible path |
| Branding requires custom basemap styling (client logos in tiles, custom land-cover colors per org) | Vector restyling required |
| Third-party raster bills exceed a threshold or rate limits hit production | Self-hosted Protomaps bypasses both |
| New requirement: terrain / pitch / 3D / indoor floors | Leaflet can't do these |
| Conservation orgs request: "show me parcels with this attribute styled live by ownership" with thousands of features | Vector attribute styling makes this trivial; Leaflet GeoJSON does not |

If **none** of those are true within the next two quarters, the migration is premature optimization.

---

## 10. Recommendation

**Don't migrate now.** The current Leaflet stack is doing its job, the feature surface is wide and growing (parcel lookup, draw control, theming, layer panel, public submission, offline), and a port costs ~6–10 engineer-weeks plus a permanent ops surface (PMTiles hosting, SW slicing, extract pipeline) for benefits the user base does not yet need.

**Trigger that flips the answer:**
- Hard signal: a paying org asks for offline map download as a feature, OR
- Hard signal: marker perf complaints from a property with > 1000 items, OR
- Hard signal: third-party tile costs / rate limits become a recurring problem.

When one of those fires, do the migration as a **scoped 8-week project**, starting with: (a) a parallel `MapViewV2` behind a feature flag, (b) a single-property PMTiles extract pipeline, (c) a Playwright visual baseline gate per theme. Don't try to cut over in place.

---

## Sources

- [MapLibre GL JS vs Leaflet — Jawg blog](https://blog.jawg.io/maplibre-gl-vs-leaflet-choosing-the-right-tool-for-your-interactive-map/)
- [Mapbox vs Leaflet vs MapLibre — PkgPulse 2026 guide](https://www.pkgpulse.com/guides/mapbox-vs-leaflet-vs-maplibre-interactive-maps-2026)
- [Leaflet migration guide — MapLibre docs](https://maplibre.org/maplibre-gl-js/docs/guides/leaflet-migration-guide/)
- [PMTiles concepts — Protomaps docs](https://docs.protomaps.com/pmtiles/)
- [Protomaps basemap downloads](https://docs.protomaps.com/basemaps/downloads)
- [Creating PMTiles (extract command)](https://docs.protomaps.com/pmtiles/create)
- [Host Protomaps on Cloudflare Pages with Service Workers](https://thomasgauvin.com/writing/static-protomaps-on-cloudflare/)
- [PMTiles range-request browser caching bug (#272)](https://github.com/protomaps/PMTiles/issues/272)
- [MapLibre + PMTiles — Simon Willison's TIL](https://til.simonwillison.net/gis/pmtiles)
- [MapLibre GL caching strategy discussion](https://github.com/maplibre/maplibre-gl-js/discussions/6910)
- [pmtiles extract feedback (US+Mexico extract size)](https://github.com/protomaps/go-pmtiles/issues/68)
