# AI Context System — Design Spec

## Overview

A shared, org-level AI context store that all AI workflows draw from. Organizations upload files, URLs, and text during onboarding (or later), which are analyzed once and stored as a distilled summary. This summary powers all AI features — entity generation, species auto-fill, geo import, property setup — without re-processing raw files each time.

**North star:** Upload context → fully configured app with only minor tweaks needed. Ready in minutes.

## Goals

- Every org has a private AI context store (files, URLs, text)
- Files are analyzed once at upload → produces per-file summaries + org-level profile
- Geo data extracted from uploads is stored structured for map use
- Context is injected into all AI system prompts as a compact summary (~2K tokens)
- Onboarding uses context to pre-fill all wizard fields
- Users who opt out of AI get the existing manual wizard
- Full CRUD control via admin settings, governed by IAM roles
- Privacy-first: org-isolated storage, no training on user data, full user control

## Consolidates Existing Issues

This design is the parent initiative for:
- **#62** — AI-Powered Geo Data Import (consumes AI context for schema mapping + geo features)
- **#29** — AI Onboarding Wizard for Property Setup (consumes AI context for property config)
- **#22** — AI Auto-fill for Species (consumes AI context for species data)

All three become consumers of the shared AI context system rather than independent data-gathering flows.

## Data Model

### `ai_context_items` — Per-file metadata and analysis

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK → orgs | Tenant isolation |
| uploaded_by | uuid FK → profiles | Who uploaded it |
| source_type | enum: `file`, `url`, `text` | How it was provided |
| file_name | text | Original filename, URL, or label |
| mime_type | text | e.g., `application/pdf` |
| file_size | bigint | Bytes |
| storage_path | text | Supabase Storage path |
| content_summary | text | AI-generated description of this file's contents |
| processing_status | enum: `pending`, `processing`, `complete`, `error` | Analysis pipeline state |
| processing_error | text nullable | Error message if failed |
| batch_id | uuid nullable | Groups files uploaded together (for polling) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `ai_context_summary` — Org-level synthesized context

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK → orgs (unique) | One summary per org |
| org_profile | text | Concise summary: what the org does, location, purpose, type |
| content_map | jsonb | Array of `{ item_id, filename, summary }` — what AI knows per file |
| last_rebuilt_at | timestamptz | When the summary was last regenerated |
| version | integer | Increments on each rebuild |

### `ai_context_geo_features` — Extracted geo data

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK → orgs | Tenant isolation |
| source_item_id | uuid FK → ai_context_items | Which upload this came from |
| name | text | Feature name/label |
| description | text nullable | Extracted description/metadata |
| geometry_type | enum: `point`, `polygon`, `linestring` | GeoJSON geometry type |
| geometry | jsonb | GeoJSON geometry object |
| properties | jsonb | Extra metadata extracted with the feature |
| confidence | float | 0–1 extraction confidence |
| status | enum: `pending`, `approved`, `placed` | pending=review, approved=ready, placed=on map |
| placed_item_id | uuid FK → items nullable | Links to actual map item once placed |

### Supabase Storage

Private bucket `ai-context`, RLS-protected:

```
ai-context/
  {org_id}/
    {item_id}/original.pdf
    {item_id}/original.xlsx
    {item_id}/snapshot.html    ← URL snapshots
    {item_id}/original.geojson
```

### Permissions

New `ai_context` category added to the existing role permissions system:

| Permission | org_admin | org_staff | contributor | viewer |
|------------|-----------|-----------|-------------|--------|
| view | ✓ | ✓ | ✓ | — |
| download | ✓ | ✓ | ✓ | — |
| upload | ✓ | ✓ | — | — |
| manage | ✓ | — | — | — |

`manage` = delete files, rebuild summary, configure settings.

## Processing Pipeline

### Step 1: Client Upload

File drops into react-dropzone → uploaded to Supabase Storage at `ai-context/{org_id}/{item_id}/` → row inserted in `ai_context_items` with `status: pending`.

### Step 2: Client-Side Parsing (where possible)

- CSV → `papaparse`
- XLSX → `xlsx` (SheetJS)
- JSON/GeoJSON → native `JSON.parse`
- GPX/KML/KMZ → DOM parser

Extract headers + sample rows or full geo features. Send extracted text/data to server action, not the raw binary.

### Step 3: Server Analysis Action

Server action receives extracted text/data. For each file, Claude generates:

- **Content summary** — what the file contains, relevant details
- **Geo features** — any coordinates, boundaries, points → stored in `ai_context_geo_features`
- **Suggested org metadata** — inferred org name, location, type, purpose (for onboarding pre-fill)

Updates `ai_context_items.content_summary` and sets `processing_status: complete`.

### Step 4: URL Processing

Server fetches the URL, extracts text content (strip HTML), stores snapshot in storage. Then runs through the same analysis as step 3.

### Step 5: Image/PDF Processing

Binary files that can't be parsed client-side get sent as base64 to Claude Vision. Extracts text, identifies map features, reads table data from scanned documents.

### Step 6: Rebuild Org Summary

After all files in a batch are processed, a synthesis prompt runs over all `content_summary` values to produce:

- **org_profile** — "Coastal Maine Audubon chapter focused on shorebird conservation..."
- **content_map** — JSON array mapping each file to its role/summary

Stored in `ai_context_summary`, version incremented.

### Step 7: Pre-fill Onboarding Fields (onboarding only)

Return suggested values for pre-filling wizard steps:

- Org name, tagline, location (lat/lng/zoom)
- Item types + entity types (from species lists, field guides)
- About page content (from org descriptions, mission statements)
- Theme suggestion (based on org type)

All pre-filled values are editable — user confirms or overrides.

### Polling Mechanism

Each file processes independently. Client polls for status updates:

```
GET /api/ai-context/status?org_id={org_id}&batch_id={batch_id}
→ { items: [{ id, status, content_summary, geo_count }], summary_ready: bool }
```

When all items are `complete` and `summary_ready: true`, client transitions to the pre-filled review step. Framer-motion animates each file card from spinner → checkmark as status updates arrive.

### How Context Gets Used in Future AI Calls

```xml
<org-context>
  ${ai_context_summary.org_profile}

  <available-context-files>
    ${ai_context_summary.content_map}
  </available-context-files>
</org-context>
```

The org_profile + content_map is compact (~2K tokens) — cheap to include in every AI call. Individual file summaries can be pulled in selectively when the wizard's task relates to specific files.

## Onboarding Flow

### AI-Assisted Path (5 steps)

1. **Welcome + Choose Path** — Explain AI context: what it does, privacy, security, user control. Two buttons: "Upload context to get started fast" / "Set up manually"
2. **Upload AI Context** — Drag-and-drop zone + URL input + text paste. Upload everything you have. Progress animations as files process. Privacy reassurance messaging throughout.
3. **AI Analysis Progress** — Vercel-style progress: each file shows analyzing → extracting → complete. Org summary builds in real-time. "Here's what we learned about your organization..." preview.
4. **Review & Confirm** — Single review page with all pre-filled sections, each expandable/editable: Name & Location, Theme, Item Types, Entity Types + Fields, About Page, Geo features found (count + map preview).
5. **Launch** — Create org with all pre-filled data. Geo features saved as pending for later review/placement.

### Manual Path (7 steps, existing flow)

1. Welcome + Choose Path → user clicks "Set up manually"
2. Name & Location (manual entry)
3. Theme (manual selection)
4. Item Types (manual entry)
5. Entity Types (AI-assisted generation or manual — existing flow)
6. About Page (manual markdown entry)
7. Review & Launch

### Privacy & Trust Messaging

Shown during the AI context upload step:

- **Your data stays yours** — Files are stored securely in your organization's private storage. Only your team members with the right permissions can access them.
- **We never train on your data** — Your files are analyzed once to help set up your organization. They are never used to train AI models or shared with third parties.
- **Full control** — You can view, download, add, or delete any AI context file at any time from your admin settings. You decide what stays.
- **Better AI assistance** — The more context you provide, the better our AI tools can help your team — from auto-filling species data to suggesting property configurations.

## UI Entry Points

### 1. Admin AI Context Page (`/admin/ai-context`)

Full management interface accessible from admin sidebar. Shows:

- **Org profile card** — AI-generated summary with version number and last-updated timestamp
- **File list table** — file name, type, AI summary, geo feature count, processing status, download/delete actions
- **Add buttons** — Add Files, Add URL, Add Text (triggers upload + analysis pipeline)
- **Footer stats** — total items, total size, geo features extracted, pending review count

Requires `ai_context.view` permission to access; `ai_context.manage` for delete/rebuild actions.

### 2. AI Wizard Sidebar Panel

Collapsible panel shown inline whenever an AI wizard is active (geo import, species auto-fill, property setup):

- **Collapsed** — icon + "4 files · 237 geo features" + "Manage ↗" link + "+ Add" button
- **Expanded** — org profile summary + file list + "Add More" button + "Manage in settings ↗" link

Provides awareness of what context the AI is working with and a quick path to add more.

### 3. Admin Sidebar Navigation

New "AI Context" nav item with badge showing item count, positioned between Roles and Domains in the admin shell sidebar.

## Supported File Formats

All supported at launch:

- **Images:** JPG, PNG, WebP, HEIC
- **Documents:** PDF, DOCX, PPTX
- **Spreadsheets:** CSV, XLSX
- **Text:** Plain text, Markdown
- **Geo data:** GeoJSON, KML, KMZ, GPX, Shapefiles (.shp + sidecars)
- **URLs:** Any web page (fetched + snapshotted)

Client-side parsing for structured formats (CSV, XLSX, JSON, GeoJSON, KML, GPX). Claude Vision for binary formats (images, PDFs, DOCX, PPTX).

## Frontend Libraries

| Concern | Library | Bundle Size |
|---------|---------|-------------|
| Drag-and-drop | `react-dropzone` | ~8 kB |
| Animations | `framer-motion` | ~32 kB |
| Simple list animations | `@formkit/auto-animate` | ~2 kB |
| File type icons | `lucide-react` (tree-shaken) | ~1 kB/icon |
| CSV parsing | `papaparse` | ~28 kB |
| Spreadsheet parsing | `xlsx` (SheetJS) | ~370 kB |
| Geo projection conversion | `proj4` | ~45 kB |
| Progress stepper | Custom (Tailwind + framer-motion) | 0 kB |

## RLS Policies

All three tables (`ai_context_items`, `ai_context_summary`, `ai_context_geo_features`) enforce:

- **SELECT:** User must be a member of the org with `ai_context.view` permission
- **INSERT:** User must have `ai_context.upload` permission
- **DELETE:** User must have `ai_context.manage` permission
- **UPDATE:** User must have `ai_context.manage` permission (except `processing_status` updates from server actions)

Storage bucket `ai-context` uses Supabase Storage RLS:

- **SELECT/download:** Org member with `ai_context.download` permission
- **INSERT/upload:** Org member with `ai_context.upload` permission
- **DELETE:** Org member with `ai_context.manage` permission

## Out of Scope

- Real-time streaming (polling is sufficient for v1; can add Supabase Realtime subscriptions later)
- Conversational AI agent for onboarding (issue #29 — future enhancement that builds on this context system)
- Auto-placement of geo features on the map (v1 extracts and stores; placement is a separate workflow)
- AI context sharing between orgs
- File versioning (re-upload replaces; original is not retained)
