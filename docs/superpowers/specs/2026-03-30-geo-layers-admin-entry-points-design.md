# Geo Layers Admin Entry Points & AI Context Integration

## Problem

The geo layers management page (`/admin/geo-layers`) exists but has no entry point in the admin sidebar. Admins can only reach it by typing the URL directly. Additionally, geo data and AI context are related but disconnected — AI Context detects geo files during upload but doesn't create usable map layers from them.

## Goals

1. Expose geo layers in the admin sidebar as a first-class page
2. Provide two import paths: manual (precise control) and AI-assisted (fast setup)
3. Connect AI Context uploads to the geo layers system via auto-created draft layers
4. Introduce a draft/published lifecycle so auto-created layers don't appear on public maps until explicitly configured

## Design

### 1. Admin Sidebar Restructure

Add section headers to group related nav items. The current flat list of 8 items becomes grouped:

```
Dashboard
Properties
Members
Roles
── Data ──
AI Context
Geo Layers          ← NEW link to /admin/geo-layers
── Settings ──
Domains
Access & Tokens
Org Settings
```

**Implementation:** Update `ORG_NAV_ITEMS` in `src/app/admin/AdminShell.tsx` to support section headers. The `AdminSidebar` component renders a small uppercase label when it encounters a section divider.

### 2. Geo Layer Lifecycle: Draft → Published

Add a `status` field to the `geo_layers` table:

- **`draft`** — Layer exists in admin, not visible on any map (public or admin map views). Created automatically by AI Context or manually via import.
- **`published`** — Layer is visible on maps for assigned properties. Admin must explicitly publish after configuring name, color, opacity, and property assignments.

Default status for new layers: `draft`.

The Geo Layers list page shows a status badge (Draft/Published) and a "Source" column indicating whether the layer was created via manual import or AI-assisted import.

### 3. Geo Layers Page — Dual Upload Modes

The existing `/admin/geo-layers` page gains two import buttons:

**Quick Import** (existing ImportFlow wizard):
1. Upload file (GeoJSON, KML, KMZ, Shapefile)
2. Preview on map
3. Configure name, color, opacity
4. Assign to properties
5. Layer created as `draft`

**AI-Assisted Import** (new):
1. Upload file (same formats + broader document types)
2. File sent through AI Context parsing pipeline
3. AI auto-detects geo features, suggests layer names, descriptions, and property assignments
4. Draft layers auto-created with AI suggestions pre-filled
5. Admin reviews and adjusts before publishing

The layers table shows all layers with columns: Status (Draft/Published), Name (with color swatch), Features count, Format, Source (Manual/AI), and Actions (Edit/Configure/Delete).

### 4. AI Context → Geo Layers Cross-Link

When the AI Context page processes uploads that contain geo data:

1. Geo files are parsed and draft `geo_layers` records are auto-created
2. A banner appears on the AI Context page: "N geo layers detected in uploaded files — [View in Geo Layers →]"
3. The banner lists detected layers by name and feature count
4. Clicking the link navigates to `/admin/geo-layers` (filtered to show drafts from this upload, or just the full list)

This means uploading a shapefile on the AI Context page both extracts text/metadata for the AI knowledge base AND creates a draft geo layer — no double-uploading.

### 5. Data Flow

Three paths into the same system:

| Path | Entry Point | Steps | Result |
|------|------------|-------|--------|
| Manual | Geo Layers → Quick Import | Upload → Preview → Configure | Draft layer |
| AI-assisted | Geo Layers → AI-Assisted Import | Upload → AI analysis → Review suggestions | Draft layer(s) with AI metadata |
| AI Context | AI Context → Upload files | Upload → AI extracts context + detects geo → Auto-create | Draft layer(s) + AI context items |

All paths produce draft layers. Publishing is always explicit: configure → assign to properties → publish.

## Schema Changes

```sql
-- Add status column to geo_layers
ALTER TABLE geo_layers ADD COLUMN status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

-- Add source tracking
ALTER TABLE geo_layers ADD COLUMN source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'ai'));
```

Existing layers (if any from the geo-data-layers branch) should be migrated to `status = 'published'` since they were explicitly created.

## Files to Modify

| File | Change |
|------|--------|
| `src/app/admin/AdminShell.tsx` | Add section headers to `ORG_NAV_ITEMS`, add Geo Layers link |
| `src/components/admin/AdminSidebar.tsx` | Support rendering section header items |
| `src/app/admin/geo-layers/page.tsx` | Add status/source columns, dual import buttons, AI-assisted flow |
| `src/app/admin/geo-layers/actions.ts` | Add status field to create/update, add publish action |
| `src/app/admin/ai-context/page.tsx` | Add geo layers detection banner with cross-link |
| `src/app/admin/ai-context/actions.ts` | Auto-create draft geo layers when geo files are processed |
| `src/components/geo/ImportFlow.tsx` | Support AI-assisted mode alongside existing manual flow |
| `src/components/map/MapView.tsx` | Filter layers to `status = 'published'` for public maps |
| `supabase/migrations/022_geo_layer_status.sql` | Add status and source columns |

## Out of Scope

- Bulk import (multiple files at once)
- Layer versioning or history
- Property-level sidebar changes (geo layers tab in property settings is sufficient)
- Public API for geo layer management
