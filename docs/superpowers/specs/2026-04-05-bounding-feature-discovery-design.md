# Bounding Feature Discovery

**Issue:** [#209 — [GeoData] Locate features by bounding box](https://github.com/patjackson52/birdhouse-mapper/issues/209)
**Date:** 2026-04-05
**Status:** Design

## Overview

Users who have uploaded many geodata files (GeoJSON, Shapefile, KML/KMZ) to their org need a way to find and import only the features relevant to a specific property. This feature provides a full-page wizard that lets users define a search area, preview all matching features on a map, select the ones they want, and create a new geo layer on the property from those selections.

## Approach

Full-page wizard at `/admin/properties/[slug]/geo-layers/discover`, following the existing `ImportFlow` multi-step pattern. Hybrid spatial query: server narrows candidate layers by bbox overlap, client does precise Turf.js intersection. Selected features are extracted into a new `geo_layers` record with per-feature source provenance stored in GeoJSON properties.

## Entry Points

- **Property geo layers admin page:** "Discover Features" button alongside existing "Quick Import"
- **Org geo layers admin page:** "Assign by Area" action on each layer row, linking to the discover page with that layer pre-filtered

## Wizard Steps

### Step 1: Define Area

- If the property has a `boundary_layer_id`, fetch and display that polygon as the default search area
- If no boundary exists, go straight to draw mode with prompt: "This property doesn't have a boundary set. Draw an area to search for features."
- Toggle: "Draw Custom Area" / "Use Property Boundary"
- Rectangle mode by default, with option to switch to freeform polygon
- Drawn vertices are draggable for adjustment; "Reset" button to clear and redraw
- "Next" is enabled once an area is defined
- Output: a GeoJSON polygon representing the search area

### Step 2: Review Matches

- Server action `findCandidateLayers(orgId, searchBbox)` queries `geo_layers` where the stored `bbox` overlaps the search area's bounding box
- Overlap check: `layer.bbox[0] <= search.bbox[2] AND layer.bbox[2] >= search.bbox[0] AND layer.bbox[1] <= search.bbox[3] AND layer.bbox[3] >= search.bbox[1]`
- Excludes layers already assigned to the property via `geo_layer_properties`
- Returns layer metadata + full GeoJSON for candidates (limit 20 layers initially)
- Client runs Turf.js intersection against the search polygon:
  - Points: `booleanPointInPolygon`
  - Polygons: `intersect` (clip to search area)
  - Lines: vertex-in-polygon check (matching existing `clipLayerToBoundary` pattern)
- Features with no intersection are filtered out
- Surviving features are grouped by source layer and displayed on the map
- If no matches: empty state with "No features found in this area. Try expanding your search area." and back button
- If all org layers already assigned: "All available layers are already assigned to this property." with link to import flow

### Step 3: Select Features

- Bidirectional selection: click/tap features on the map or toggle checkboxes in the list panel
- Map and list stay in sync
- "Select All" / "Deselect All" per source group
- Running count of selected features displayed
- User names the new layer (auto-suggested: "{Property Name} — Discovered Features")
- Search/filter input at top of list panel for large result sets

### Step 4: Confirm & Create

- Summary card: layer name, feature count, source breakdown, preview thumbnail
- "Create Layer" button
- On success: redirect to the property's geo layers page with the new layer visible

## Layout & Responsive Design

### Desktop (md+)

- Steps 2-3: split layout — map ~65% width left, list panel ~35% right
- Map has standard controls (zoom, tile switcher) plus draw tool in Step 1
- List panel is scrollable with sticky group headers (source layer names)
- Steps 1 and 4: centered single-column layout (matching `ImportFlow`)

### Mobile

- Map is full-width, top ~50% of viewport
- List panel as draggable bottom sheet (consistent with `QuickAddSheet` and `FeaturePopup` patterns)
- Sheet snap points: collapsed (summary count), half-screen (browsable list), full-screen (detailed view)
- Feature selection via both map taps and list toggles
- Draw tool uses touch-friendly drag handles
- Back/Next navigation at bottom

### Shared

- Step indicator bar at top (matching `ImportFlow`)
- Minimum 44px touch targets throughout

## Map Interaction & Visual Design

### Color Coding

- Each source layer gets a distinct color from a preset palette (8-10 colors, cycling if more sources)
- Unselected features: semi-transparent fill (0.3 opacity), thin stroke
- Selected features: full opacity (0.8), thicker stroke, subtle glow/outline
- Search area polygon: dashed border, light fill (0.1 opacity), neutral color — visually behind features

### Interactions

- Hover (desktop): highlight feature, show tooltip with feature name/type and source layer name
- Click/tap: toggle selection, feature pulses briefly to confirm
- Map auto-fits to show all matched features when Step 2 loads, with padding for list panel

### List Panel

- Grouped by source layer; each group has a colored dot matching its map color
- Group header: source layer name, format badge (GeoJSON/SHP/KML), feature count, "Select All" toggle
- Feature row: feature name (or geometry type if unnamed), small type icon (point/line/polygon)
- Selected rows get a left border accent in the source color

## Data Model

### No schema changes required

Selected features are stored in a new `geo_layers` record using the existing schema. Source provenance is tracked per-feature inside the GeoJSON `properties` object:

```json
{
  "type": "Feature",
  "geometry": { "..." },
  "properties": {
    "name": "Trail Segment A",
    "_source_layer_id": "uuid-of-original-layer",
    "_source_layer_name": "Parks Department Trails"
  }
}
```

The new layer is created with `source: 'discovered'` (extending the existing `source` text field which currently supports `'manual'` and `'ai'`). No migration needed — `source` is an unconstrained `text` column.

### Server Actions

- `findCandidateLayers(orgId, searchBbox)` — query layers with bbox overlap, exclude already-assigned
- `createDiscoveredLayer(propertyId, name, features[])` — build FeatureCollection, inject provenance, compute bbox, insert into `geo_layers`, create `geo_layer_properties` association

## Error Handling & Edge Cases

| Scenario | Behavior |
|----------|----------|
| No boundary layer on property | Skip default, go to draw mode with prompt |
| No matching features | Empty state with suggestion to expand area |
| All layers already assigned | Message with link to import flow |
| >5,000 candidate features | Warning before intersection, suggest narrowing area |
| >1,000 selected features | Warning before creation, note map performance impact |
| Mixed geometry types | Supported — points, lines, polygons coexist in one layer |
| Duplicate features across sources | Show once with "found in N layers" badge, user picks source |

### Performance

- Intersection runs with a progress indicator to avoid blocking the UI
- Server-side bbox filtering reduces data transfer before client-side intersection
- 20-layer candidate limit prevents excessive GeoJSON payloads

## Testing Strategy

- Unit tests for bbox overlap logic and Turf.js intersection helpers
- Unit tests for provenance injection into feature properties
- Integration tests for `findCandidateLayers` and `createDiscoveredLayer` server actions
- Component tests for wizard step navigation and selection sync (map ↔ list)
- E2E test: full wizard flow from define area through layer creation
