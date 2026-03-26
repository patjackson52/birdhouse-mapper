# AI-Powered Geo Data Import — Research Document

**Date:** 2026-03-25
**Status:** Research Only (no code)

---

## 1. Current Codebase Context

The application is a Next.js 14 field mapping app using:
- **Supabase** for database and file storage (buckets: `item-photos`, `landing-assets`)
- **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`) — already used for landing page generation with Claude vision
- **Leaflet / React-Leaflet** for maps
- **Zod** for schema validation

**Target data model** (from `src/lib/types.ts`):

| Entity | Key Fields |
|---|---|
| `Item` | `name`, `latitude`, `longitude`, `item_type_id`, `custom_field_values`, `status`, `org_id`, `property_id` |
| `ItemType` | `name`, `icon`, `color`, `sort_order`, `org_id` |
| `CustomField` | `item_type_id`, `name`, `field_type` (text/number/dropdown/date), `options`, `required`, `sort_order`, `org_id` |

The AI SDK pattern is already established in `src/app/admin/landing/actions.ts` using `generateText` with the Anthropic provider. The project already handles image uploads to Supabase storage and passes them as base64 to Claude's vision API.

---

## 2. Format Parsing — Package Recommendations

### CSV: **PapaParse** (recommended)

- **npm:** `papaparse` — 6.5M weekly downloads, 13k+ GitHub stars
- Best-in-class for browser environments: auto-detects delimiters, supports Web Workers for non-blocking parsing, streaming for large files
- Works both client-side and server-side
- Returns typed results with header detection
- **Key API:** `Papa.parse(file, { header: true, dynamicTyping: true, worker: true })`

### Spreadsheets (XLSX): **SheetJS** (recommended)

- **npm:** `xlsx` — 8.3M weekly downloads, 36k+ GitHub stars
- Reads XLSX, XLS, ODS, CSV — most format coverage of any option
- Works in browser and Node.js
- The Community Edition (CE) is Apache-2.0 licensed
- **Alternative:** `exceljs` (5.4M downloads) has better styling/formatting support but is overkill for read-only import
- **Key API:** `XLSX.read(data, { type: 'array' })` then `XLSX.utils.sheet_to_json(worksheet)`

### PDF Text Extraction: **pdf-parse**

- **npm:** `pdf-parse` — pure TypeScript, zero native dependencies
- Extracts text content from PDFs; good enough for text-heavy PDFs
- For tabular PDF data, consider `pdf-data-parser` or `pdfreader` (which handles table structure)
- **Limitation:** Complex table layouts in PDFs are inherently unreliable with any JS library. For these cases, sending the PDF as an image to Claude Vision is more robust.
- **Key API:** `const data = await pdfParse(buffer); data.text`

### JSON: **Built-in**

- `JSON.parse()` is sufficient
- Validate structure with Zod schemas
- Support both GeoJSON (`FeatureCollection` with `Point` geometries) and flat JSON arrays

### Coordinate Format Variations

| Format | Solution |
|---|---|
| Decimal degrees (40.7128, -74.0060) | Direct use — this is the target format |
| DMS (40°42'46"N 74°0'22"W) | `geo-coordinates-parser` npm package — handles many DMS notations |
| UTM (18T 583960 4507523) | `proj4` npm package — full projection support including UTM-to-WGS84 |
| what3words (///filled.count.soap) | `@what3words/api` — requires API key, rate-limited |
| Addresses | Geocoding API needed (Mapbox, Google, Nominatim) — out of scope for v1 |

**Recommendation:** Use `geo-coordinates-parser` for flexible DMS/DD parsing, and `proj4` for UTM conversion. Both are lightweight. what3words requires a paid API key and should be a stretch goal.

---

## 3. Map Photo Georeferencing

### How Georeferencing Works

Georeferencing converts pixel coordinates (x, y) in an image to geographic coordinates (lat, lng) using Ground Control Points (GCPs) — known pairs of (pixel, geo) coordinates.

**Transformation types by number of control points:**

| Points | Transformation | Capabilities |
|---|---|---|
| 2 | Similarity (Helmert) | Translate, rotate, uniform scale |
| 3 | Affine | Translate, rotate, scale (non-uniform), skew |
| 4+ | Projective / polynomial | Perspective correction, curved surfaces |

**The math (affine):**

```
lng = a*x + b*y + c
lat = d*x + e*y + f
```

Six unknowns (a-f) require minimum 3 GCPs. Each GCP gives 2 equations, so 3 points give 6 equations — exactly determined. More points allow least-squares fitting for better accuracy.

### Proposed Workflow for Map Photo Import

1. **User uploads a photo** of a map (paper map, whiteboard, screenshot)
2. **Claude Vision analyzes the image** — identifies markers, labels, scale bars, north arrows
3. **User provides anchor points** — taps on the image at locations where they know the GPS coordinates (minimum 2, ideally 3+)
4. **System computes transformation matrix** — maps pixel positions to geographic coordinates
5. **Claude Vision identifies remaining markers** — returns pixel coordinates for each detected marker
6. **System transforms pixel coords to geo coords** using the computed matrix

### Can Claude Vision Identify Map Markers?

**Yes, with caveats.** Based on the existing pattern in this codebase (landing page generation already uses Claude vision with base64 images) and Claude's documented capabilities:

- Claude can identify distinct markers (pins, dots, symbols) on maps
- Claude can return approximate pixel positions (it can describe spatial locations like "upper-left quadrant" or provide bounding box coordinates)
- Claude can read labels near markers
- **Limitation:** Claude's pixel coordinate estimation is approximate, not pixel-perfect. Expect accuracy of +/- 5-15 pixels on a typical photo.
- **Limitation:** Dense or overlapping markers reduce accuracy
- **Mitigation:** Use Claude to identify markers and get approximate positions, then optionally let users adjust positions on a preview

### Pixel-to-Coordinate Transformation Library

**Recommended:** `transformation-matrix` npm package

- Isomorphic JS (browser + Node), ES6, well-tested
- Supports affine transformations, matrix composition, inverse transforms
- **Alternative approach:** Implement the 6-parameter affine transform directly — it's only ~20 lines of linear algebra (solve a 6x6 system). No library strictly needed.

### Accuracy Expectations

- With 3 well-distributed GCPs on a flat, small-area map: **1-5 meter accuracy** is realistic
- With photos of paper maps (perspective distortion, wrinkles): **5-50 meter accuracy**
- Satellite/aerial imagery screenshots with known bounds: **sub-meter possible** with 4+ GCPs
- **Key factors:** quality of GCP placement, map projection, area covered, photo angle/distortion

### Image Processing: Client-Side vs Server-Side

| Approach | Pros | Cons |
|---|---|---|
| **OpenCV.js (browser)** | Real-time preview, no upload needed | ~2MB WASM bundle, limited API surface vs full OpenCV |
| **Server-side (Claude Vision)** | Much simpler, no extra bundle, leverages AI for marker detection | Requires upload, API latency, cost per call |
| **Canvas API (browser)** | Zero dependencies, good enough for marker overlay/preview | No computer vision capabilities |

**Recommendation:** Skip OpenCV.js entirely. Use Claude Vision server-side for marker detection and the native Canvas API client-side for the interactive anchor-point UI (letting users click on the map image to set GCPs). This avoids a heavy WASM dependency while getting better marker detection than traditional CV.

---

## 4. AI Schema Mapping

### Approach: Claude + generateObject (Vercel AI SDK)

The project already uses `@ai-sdk/anthropic` with `generateText`. For schema mapping, use `generateObject` with a Zod schema to get structured output directly.

**Note from research:** Anthropic supports structured outputs (public beta since Nov 2025). The AI SDK's `generateObject` uses tool calling internally to enforce JSON schema compliance.

### Prompt Engineering Strategy

**Input to Claude:**
1. Column headers from the parsed file
2. Sample values (first 5-10 rows)
3. The target schema definition (Item fields + existing ItemTypes + existing CustomFields)
4. The org's existing item types and custom fields

**Suggested prompt structure:**

```
You are a data import assistant for a field mapping application.

EXISTING SCHEMA:
- Item types: [{name, id}...]
- Custom fields per type: [{name, field_type, item_type_id}...]

IMPORTED DATA:
- Headers: [col1, col2, col3, ...]
- Sample rows:
  Row 1: [val1, val2, val3, ...]
  Row 2: [val1, val2, val3, ...]
  ...

MAP each source column to one of:
- "name" (item display name)
- "latitude" (geographic latitude in decimal degrees)
- "longitude" (geographic longitude in decimal degrees)
- "item_type" (maps to an existing item type, or suggest creating new)
- "status" (active/planned/damaged/removed)
- "description" (item description)
- "custom_field:{field_name}" (an existing or new custom field)
- "ignore" (skip this column)

Also detect:
- Coordinate format (decimal degrees, DMS, UTM)
- Whether a column contains combined lat/lng (e.g., "40.71,-74.00")
- Suggested new item types to create
- Suggested new custom fields with their field_type (text/number/dropdown/date)
```

**Output Zod schema:**

```typescript
z.object({
  mappings: z.array(z.object({
    sourceColumn: z.string(),
    targetField: z.string(),  // "name" | "latitude" | "longitude" | etc.
    confidence: z.number(),   // 0-1
    reasoning: z.string(),
  })),
  coordinateFormat: z.enum(["decimal", "dms", "utm", "combined", "unknown"]),
  suggestedItemTypes: z.array(z.object({
    name: z.string(),
    icon: z.string(),
    color: z.string(),
  })),
  suggestedCustomFields: z.array(z.object({
    name: z.string(),
    fieldType: z.enum(["text", "number", "dropdown", "date"]),
    sourceColumn: z.string(),
    options: z.array(z.string()).optional(),  // for dropdowns
  })),
})
```

### Handling Ambiguous Columns

| Ambiguity | Strategy |
|---|---|
| "Location" (address or coords?) | Check sample values — regex for numbers/decimals suggests coords; text suggests address |
| "Lat" vs "Latitude" vs "Y" | Claude handles synonyms naturally |
| Combined "Coordinates" column | Detect comma/space-separated number pairs |
| "Type" or "Category" | Map to `item_type`; check against existing item types |
| Unknown columns | Default to `custom_field` suggestion with appropriate `field_type` |

### Column Detection Heuristics (pre-AI, for speed)

Before calling the AI, apply fast regex heuristics to pre-classify obvious columns:
- Columns named `lat*`, `latitude`, `y` with numeric values -> latitude
- Columns named `lng*`, `lon*`, `longitude`, `x` with numeric values -> longitude
- Values matching `[-]?[0-9]+\.[0-9]+` in range [-90, 90] -> likely latitude
- Values matching `[-]?[0-9]+\.[0-9]+` in range [-180, 180] -> likely longitude

These heuristics can seed the AI prompt (e.g., "Column 'lat' appears to be latitude based on values") to improve accuracy and reduce token usage.

---

## 5. Prior Art: How Existing Tools Handle Import

### Google MyMaps
- Accepts CSV, XLSX, KML, GPX
- After upload, asks user to **select which column(s) contain location data**
- Auto-detects columns named "latitude"/"longitude"
- Supports address geocoding
- **Limit:** 2,000 rows per import
- Lets user choose a column for marker titles

### Mapbox Studio
- Accepts GeoJSON, CSV, KML, GPX, Shapefile (zipped)
- CSV must have columns named `latitude`/`longitude` (or `lat`/`lon`/`lng`)
- Upload limit: 300 MB, 20 uploads/month on free tier
- No AI assistance — strictly column-name-based detection

### QGIS
- Most flexible — accepts virtually any format
- Manual column mapping UI for CSV import
- Supports WKT geometry columns
- Has batch import plugins for multiple CSV files
- Professional tool — complex UI not suitable as UX reference

### Key Takeaway from Prior Art
Most tools require the user to manually select lat/lng columns. The AI-powered auto-detection proposed here would be a significant UX improvement over all existing tools. Google MyMaps' approach of auto-detecting then confirming is the best UX pattern to follow.

---

## 6. Architecture Recommendations

### File Parsing: Client-Side (recommended)

| Factor | Client-Side | Server-Side |
|---|---|---|
| **Speed** | Instant for small files, no upload latency | Upload + process + return |
| **File size** | Limited by browser memory (~50-200MB practical) | Next.js server actions limited to **1MB body by default** |
| **Privacy** | Data stays in browser until user confirms | File transmitted to server |
| **Libraries** | PapaParse + SheetJS both work in browser | Same libraries work in Node |
| **Large files** | PapaParse streaming/Web Workers handle well | Need Supabase signed URL upload to bypass 1MB limit |

**Recommendation:** Parse CSV/XLSX/JSON **client-side** using PapaParse and SheetJS. Send only the parsed headers + sample rows (first 10 rows) to the server for AI schema analysis. This avoids the 1MB server action limit entirely.

**For photos and PDFs:** Upload to Supabase storage first (using signed URLs for large files), then process server-side with Claude Vision / pdf-parse.

### Processing Pipeline

```
1. CLIENT: User selects file(s) or photo
   |
2. CLIENT: Parse file (CSV/XLSX/JSON) -> extract headers + sample rows
   |         OR upload photo/PDF to Supabase storage
   |
3. SERVER: AI schema mapping (send headers + samples to Claude)
   |         OR AI vision analysis (send image to Claude)
   |
4. CLIENT: Show preview — mapped columns, detected items, suggested types
   |         User adjusts mappings, confirms new types/fields
   |
5. SERVER: Create new item types and custom fields (if any)
   |
6. CLIENT: Transform all rows using confirmed mappings
   |         Convert coordinates to decimal degrees
   |
7. SERVER: Batch insert items via Supabase
   |         (chunked in batches of 100-250 for reliability)
   |
8. CLIENT: Show import results — success count, errors, map preview
```

### Handling Large Imports (1000+ items)

- **Batch inserts:** Supabase supports bulk `.insert([...])` — use batches of 100-250 rows
- **Progress tracking:** Use a client-side state machine or React state to track batch progress
- **Error handling:** Collect per-row errors (invalid coords, missing required fields) and report them in the preview step
- **Rate limiting:** Supabase has no hard row-insert rate limit, but keep batches reasonable
- **Transaction safety:** Wrap the full import in a strategy where failure of any batch can be reported without corrupting data — consider creating all items with a shared `import_batch_id` custom field value for easy rollback

### Photo Upload Flow

1. User selects photo
2. Client uploads to Supabase storage bucket (e.g., `import-photos`) using signed URL
3. Server action downloads from storage, converts to base64, sends to Claude Vision
4. Claude returns: detected markers with approximate pixel positions, labels, and descriptions
5. Client renders the photo with detected markers overlaid
6. User sets anchor GCPs (clicks known locations on the image, enters their GPS coordinates)
7. Client computes affine transformation matrix
8. Client transforms all detected marker positions to geo coordinates
9. Results feed into the standard preview-and-confirm flow

### API Cost Considerations

- **Schema mapping call:** ~500-1000 input tokens (headers + samples), ~500 output tokens. Cost: ~$0.005 per import.
- **Vision call for map photo:** Image tokens vary by size (roughly 1000-5000 tokens for a typical photo). Cost: ~$0.01-0.05 per photo.
- **Total per import:** Under $0.10 even for complex cases. Very affordable.

---

## 7. Recommended Package List

| Purpose | Package | Weekly Downloads | Notes |
|---|---|---|---|
| CSV parsing | `papaparse` | 6.5M | Browser + Node, Web Workers, streaming |
| Spreadsheet parsing | `xlsx` (SheetJS CE) | 8.3M | XLSX/XLS/ODS/CSV, browser + Node |
| PDF text extraction | `pdf-parse` | — | Server-side only, pure TS |
| Coordinate parsing (DMS) | `geo-coordinates-parser` | — | Flexible DMS/DD detection and conversion |
| Projection conversion (UTM) | `proj4` | — | Full coordinate system transforms |
| Affine transformation | `transformation-matrix` | — | 2D matrix ops, or hand-roll ~20 lines |
| AI inference | `ai` + `@ai-sdk/anthropic` | — | **Already installed** |
| File upload | `@supabase/supabase-js` | — | **Already installed**, use signed URLs |

No new infrastructure or services needed beyond what the project already has.

---

## 8. Unstructured Data (Text / Free-form)

For raw text input (e.g., pasted field notes, email content), Claude can extract structured data directly:

**Approach:** Send the raw text to Claude with a prompt like:

```
Extract geographic items from this text. For each item found, extract:
- name, latitude, longitude (if coordinates are mentioned)
- description, type/category
- any additional attributes

Text: "{user_pasted_text}"
```

Use `generateObject` with a Zod schema for the output to guarantee structure.

This handles cases like:
- "The bluebird box is at 40.7128, -74.0060 near the oak tree"
- Pasted spreadsheet data (tab-separated)
- Field notes with addresses instead of coordinates

---

## 9. Suggested MVP Scope

**Phase 1 (MVP):**
- CSV and JSON import with AI schema mapping
- Preview/confirm UI with column mapping adjustments
- Auto-create item types and custom fields
- Batch insert with error reporting

**Phase 2:**
- XLSX support (add SheetJS)
- Raw text / paste import
- Coordinate format auto-detection and conversion (DMS, UTM)

**Phase 3:**
- Map photo import with Claude Vision
- Interactive GCP placement UI
- Affine transformation for marker georeferencing

**Phase 4:**
- PDF import
- what3words support
- Address geocoding
- Import history / undo

---

## 10. Key Risks and Mitigations

| Risk | Mitigation |
|---|---|
| AI schema mapping hallucination | Always show preview; user confirms before commit |
| Coordinate format detection errors | Validate all coords are within reasonable bounds; show on map preview |
| Map photo georeferencing inaccuracy | Show accuracy estimate; let user adjust individual points |
| Large file browser memory issues | PapaParse streaming; warn at >50MB; suggest splitting |
| Claude Vision pixel coordinate imprecision | Use CV detection as suggestion, let user adjust; more GCPs improve transform |
| Rate limits on Claude API | Cache schema mapping results; one call per import, not per row |

---

## Sources

- [JavaScript CSV Parsers Comparison](https://leanylabs.com/blog/js-csv-parsers-benchmarks/)
- [PapaParse vs fast-csv vs csv-parser — npm compare](https://npm-compare.com/csv,csv-parser,fast-csv,papaparse)
- [SheetJS vs ExcelJS vs node-xlsx — PkgPulse](https://www.pkgpulse.com/blog/sheetjs-vs-exceljs-vs-node-xlsx-excel-files-node-2026)
- [SheetJS Community Edition Docs](https://docs.sheetjs.com/)
- [pdf-parse — npm](https://www.npmjs.com/package/pdf-parse)
- [7 PDF Parsing Libraries for Node.js](https://strapi.io/blog/7-best-javascript-pdf-parsing-libraries-nodejs-2025)
- [geo-coordinates-parser — npm](https://www.npmjs.com/package/geo-coordinates-parser)
- [proj4js — GitHub](https://github.com/proj4js/proj4js)
- [what3words JavaScript SDK](https://developer.what3words.com/tutorial/javascript-sdk)
- [transformation-matrix — npm](https://www.npmjs.com/package/transformation-matrix)
- [Georeferencing — Wikipedia](https://en.wikipedia.org/wiki/Georeferencing)
- [Georeferencing fundamentals — ArcGIS](https://desktop.arcgis.com/en/arcmap/latest/manage-data/raster-and-images/fundamentals-for-georeferencing-a-raster-dataset.htm)
- [Ground Control Points — Mapscaping](https://mapscaping.com/ground-control-points/)
- [Claude Vision API Docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- [Claude Vision Object Detection — GitHub](https://github.com/Doriandarko/Claude-Vision-Object-Detection)
- [AI-Powered Schema Mapping with LLMs — Medium](https://medium.com/@shrinath.suresh/ai-powered-schema-mapping-95f596d31590)
- [CSV Column Auto-Recognition — Heuristic vs LLM](https://codenote.net/en/posts/csv-column-auto-recognition-heuristic-vs-llm/)
- [Google MyMaps Import](https://support.google.com/mymaps/answer/3024836)
- [Mapbox Upload Docs](https://docs.mapbox.com/help/troubleshooting/uploads/)
- [AI SDK 6 — Vercel](https://vercel.com/blog/ai-sdk-6)
- [AI SDK Anthropic Provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)
- [Supabase Standard Uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [Supabase File Limits](https://supabase.com/docs/guides/storage/uploads/file-limits)
- [OpenCV.js Tutorials](https://docs.opencv.org/3.4/d5/d10/tutorial_js_root.html)
