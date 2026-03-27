# AI Context System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an org-level AI context store where uploaded files, URLs, and text are analyzed once and stored as distilled summaries that power all AI workflows, with a revised onboarding flow that pre-fills wizard fields from context.

**Architecture:** Three new database tables (`ai_context_items`, `ai_context_summary`, `ai_context_geo_features`) with a private Supabase Storage bucket. Processing pipeline: client upload → client-side parsing → server AI analysis → org summary rebuild. New `ai_context` permission category integrated into the existing IAM system. Admin management page at `/admin/ai-context` and inline sidebar panel for AI wizards.

**Tech Stack:** Next.js 14, Supabase (PostgreSQL + Storage + RLS), Vercel AI SDK + Anthropic Claude, react-dropzone, framer-motion, papaparse, xlsx (SheetJS), Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-27-ai-context-system-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/014_ai_context.sql` | Database tables, indexes, triggers, RLS policies, storage bucket |
| `src/lib/ai-context/types.ts` | TypeScript interfaces for AI context items, summary, geo features |
| `src/lib/ai-context/parsers.ts` | Client-side file parsing (CSV, XLSX, JSON, GeoJSON, KML, GPX) |
| `src/lib/ai-context/actions.ts` | Server actions: upload, analyze, rebuild summary, delete, status polling |
| `src/lib/ai-context/prompts.ts` | AI prompt templates for file analysis and org summary synthesis |
| `src/lib/ai-context/context-provider.ts` | Helper to build the `<org-context>` block for AI system prompts |
| `src/components/ai-context/FileDropZone.tsx` | react-dropzone wrapper with Tailwind styling, file type icons |
| `src/components/ai-context/ProcessingProgress.tsx` | Vercel-style per-file progress stepper with framer-motion |
| `src/components/ai-context/AiContextPanel.tsx` | Collapsible sidebar panel for AI wizards (collapsed/expanded states) |
| `src/components/ai-context/AiContextTable.tsx` | File list table for admin page (name, summary, geo count, actions) |
| `src/components/ai-context/OrgProfileCard.tsx` | AI-generated org profile display card |
| `src/app/admin/ai-context/page.tsx` | Admin AI context management page |
| `src/app/api/ai-context/status/route.ts` | Polling endpoint for processing status |
| `src/__tests__/ai-context/parsers.test.ts` | Unit tests for client-side parsers |
| `src/__tests__/ai-context/actions.test.ts` | Unit tests for server actions |
| `src/__tests__/ai-context/context-provider.test.ts` | Unit tests for context provider |

### Modified Files

| File | Changes |
|------|---------|
| `src/lib/types.ts` | Add `ai_context` to `RolePermissions` interface |
| `src/lib/permissions/resolve.ts` | No changes needed (already uses `keyof RolePermissions`) |
| `src/app/onboard/actions.ts` | Add `ai_context` permissions to `getDefaultPermissions()`, add AI context pre-fill action |
| `src/app/onboard/page.tsx` | Add AI path choice at welcome, upload step, analysis progress step, pre-filled review step |
| `src/app/admin/AdminShell.tsx` | Add "AI Context" nav item to `ORG_NAV_ITEMS` |
| `package.json` | Add `react-dropzone`, `framer-motion`, `@formkit/auto-animate`, `papaparse`, `xlsx`, `proj4` |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/014_ai_context.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 014_ai_context.sql — AI Context system tables and storage
-- Spec: docs/superpowers/specs/2026-03-27-ai-context-system-design.md
--
-- This migration:
--   1. Creates ai_context_items, ai_context_summary, ai_context_geo_features
--   2. Creates indexes, triggers, and RLS policies
--   3. Creates the ai-context storage bucket

-- ============================================================================
-- Step 1: Create tables
-- ============================================================================

create table ai_context_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('file', 'url', 'text')),
  file_name text not null,
  mime_type text,
  file_size bigint,
  storage_path text,
  content_summary text,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processing', 'complete', 'error')),
  processing_error text,
  batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ai_context_summary (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade unique,
  org_profile text not null default '',
  content_map jsonb not null default '[]',
  last_rebuilt_at timestamptz not null default now(),
  version integer not null default 1
);

create table ai_context_geo_features (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  source_item_id uuid not null references ai_context_items(id) on delete cascade,
  name text not null,
  description text,
  geometry_type text not null check (geometry_type in ('point', 'polygon', 'linestring')),
  geometry jsonb not null,
  properties jsonb not null default '{}',
  confidence float not null default 0.5,
  status text not null default 'pending' check (status in ('pending', 'approved', 'placed')),
  placed_item_id uuid references items(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Step 2: Indexes
-- ============================================================================

create index idx_ai_context_items_org on ai_context_items(org_id);
create index idx_ai_context_items_batch on ai_context_items(batch_id) where batch_id is not null;
create index idx_ai_context_items_status on ai_context_items(processing_status);
create index idx_ai_context_geo_features_org on ai_context_geo_features(org_id);
create index idx_ai_context_geo_features_source on ai_context_geo_features(source_item_id);
create index idx_ai_context_geo_features_status on ai_context_geo_features(status);

-- ============================================================================
-- Step 3: Updated_at triggers
-- ============================================================================

create trigger ai_context_items_updated_at
  before update on ai_context_items
  for each row execute function update_updated_at();

-- ============================================================================
-- Step 4: Auto-populate org triggers
-- ============================================================================

create trigger ai_context_items_auto_org before insert on ai_context_items
  for each row execute function auto_populate_org_property('org_scoped');
create trigger ai_context_geo_features_auto_org before insert on ai_context_geo_features
  for each row execute function auto_populate_org_property('org_scoped');

-- ============================================================================
-- Step 5: RLS policies
-- ============================================================================

alter table ai_context_items enable row level security;
alter table ai_context_summary enable row level security;
alter table ai_context_geo_features enable row level security;

-- ai_context_items: org members read, org-admin writes
-- NOTE: These use org_admin for writes since the ai_context permission category
-- is enforced at the application layer. RLS provides the baseline tenant isolation.
create policy "ai_context_items_org_read" on ai_context_items for select
  to authenticated using (org_id in (select user_org_ids()));
create policy "ai_context_items_insert" on ai_context_items for insert
  to authenticated with check (org_id in (select user_org_ids()));
create policy "ai_context_items_update" on ai_context_items for update
  to authenticated using (org_id in (select user_org_ids()));
create policy "ai_context_items_delete" on ai_context_items for delete
  to authenticated using (org_id in (select user_org_admin_org_ids()));

-- ai_context_summary: org members read, org-admin writes
create policy "ai_context_summary_org_read" on ai_context_summary for select
  to authenticated using (org_id in (select user_org_ids()));
create policy "ai_context_summary_upsert" on ai_context_summary for insert
  to authenticated with check (org_id in (select user_org_ids()));
create policy "ai_context_summary_update" on ai_context_summary for update
  to authenticated using (org_id in (select user_org_ids()));

-- ai_context_geo_features: org members read, org-admin writes
create policy "ai_context_geo_features_org_read" on ai_context_geo_features for select
  to authenticated using (org_id in (select user_org_ids()));
create policy "ai_context_geo_features_insert" on ai_context_geo_features for insert
  to authenticated with check (org_id in (select user_org_ids()));
create policy "ai_context_geo_features_update" on ai_context_geo_features for update
  to authenticated using (org_id in (select user_org_ids()));
create policy "ai_context_geo_features_delete" on ai_context_geo_features for delete
  to authenticated using (org_id in (select user_org_admin_org_ids()));

-- ============================================================================
-- Step 6: Storage bucket
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('ai-context', 'ai-context', false);

create policy "ai_context_storage_select" on storage.objects for select
  to authenticated using (bucket_id = 'ai-context' and (storage.foldername(name))[1] in (
    select id::text from orgs where id in (select user_org_ids())
  ));

create policy "ai_context_storage_insert" on storage.objects for insert
  to authenticated with check (bucket_id = 'ai-context' and (storage.foldername(name))[1] in (
    select id::text from orgs where id in (select user_org_ids())
  ));

create policy "ai_context_storage_delete" on storage.objects for delete
  to authenticated using (bucket_id = 'ai-context' and (storage.foldername(name))[1] in (
    select id::text from orgs where id in (select user_org_admin_org_ids())
  ));
```

Note: The `user_org_ids()` function should already exist from migration 008/009 (it returns org IDs where the user is a member). Verify by checking migration 008. If it doesn't exist, you'll need to check what helper function is available — the pattern in 009 uses `user_org_admin_org_ids()` for write policies.

- [ ] **Step 2: Verify the migration references valid helper functions**

Run: `grep -n 'user_org_ids\|user_org_admin_org_ids' supabase/migrations/008_multi_tenant_foundation.sql supabase/migrations/009_properties_and_permissions.sql | head -20`

Check that `user_org_ids()` exists. If only `user_org_admin_org_ids()` exists, update the SELECT policies to use a different approach — e.g., subquery on `org_memberships` directly:
```sql
org_id in (select org_id from org_memberships where user_id = auth.uid() and status = 'active')
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/014_ai_context.sql
git commit -m "feat: add AI context database migration (tables, RLS, storage bucket)"
```

---

## Task 2: TypeScript Types and Permission Integration

**Files:**
- Create: `src/lib/ai-context/types.ts`
- Modify: `src/lib/types.ts:129-138`
- Modify: `src/app/onboard/actions.ts:33-80`

- [ ] **Step 1: Write the AI context types**

Create `src/lib/ai-context/types.ts`:

```typescript
export type AiContextSourceType = 'file' | 'url' | 'text';
export type AiContextProcessingStatus = 'pending' | 'processing' | 'complete' | 'error';
export type GeoFeatureGeometryType = 'point' | 'polygon' | 'linestring';
export type GeoFeatureStatus = 'pending' | 'approved' | 'placed';

export interface AiContextItem {
  id: string;
  org_id: string;
  uploaded_by: string;
  source_type: AiContextSourceType;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  storage_path: string | null;
  content_summary: string | null;
  processing_status: AiContextProcessingStatus;
  processing_error: string | null;
  batch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiContextSummary {
  id: string;
  org_id: string;
  org_profile: string;
  content_map: ContentMapEntry[];
  last_rebuilt_at: string;
  version: number;
}

export interface ContentMapEntry {
  item_id: string;
  filename: string;
  summary: string;
}

export interface AiContextGeoFeature {
  id: string;
  org_id: string;
  source_item_id: string;
  name: string;
  description: string | null;
  geometry_type: GeoFeatureGeometryType;
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
  confidence: number;
  status: GeoFeatureStatus;
  placed_item_id: string | null;
  created_at: string;
}

/** Shape returned by the polling endpoint */
export interface BatchStatusResponse {
  items: Array<{
    id: string;
    processing_status: AiContextProcessingStatus;
    content_summary: string | null;
    geo_count: number;
  }>;
  summary_ready: boolean;
}

/** Shape returned by the AI analysis for a single file */
export interface FileAnalysisResult {
  content_summary: string;
  geo_features: Array<{
    name: string;
    description: string | null;
    geometry_type: GeoFeatureGeometryType;
    geometry: GeoJSON.Geometry;
    properties: Record<string, unknown>;
    confidence: number;
  }>;
  suggested_org_metadata: {
    name: string | null;
    tagline: string | null;
    location_name: string | null;
    lat: number | null;
    lng: number | null;
    org_type: string | null;
    purpose: string | null;
  };
}

/** Pre-fill suggestions returned after context analysis */
export interface OnboardingPreFill {
  orgName: string | null;
  tagline: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  zoom: number | null;
  themePreset: string | null;
  itemTypes: Array<{ name: string; icon: string; color: string }> | null;
  entityTypes: Array<{
    name: string;
    icon: string;
    color: string;
    link_to: string[];
    fields: Array<{ name: string; field_type: string; options?: string[]; required?: boolean }>;
  }> | null;
  aboutContent: string | null;
}

/** Parsed file data sent from client to server */
export interface ParsedFileData {
  fileName: string;
  mimeType: string;
  fileSize: number;
  sourceType: AiContextSourceType;
  /** For text-parseable files: extracted text content */
  textContent?: string;
  /** For structured files (CSV/XLSX): headers + sample rows */
  headers?: string[];
  sampleRows?: string[][];
  /** For geo files: parsed GeoJSON features */
  geoFeatures?: GeoJSON.Feature[];
  /** For binary files (images/PDFs): base64 content */
  base64Content?: string;
  /** For URLs: the URL itself */
  url?: string;
}
```

- [ ] **Step 2: Add `ai_context` to `RolePermissions` in `src/lib/types.ts`**

Add the new category after the `modules` line (line 137):

```typescript
// In RolePermissions interface, add after modules:
  ai_context: { view: boolean; download: boolean; upload: boolean; manage: boolean };
```

- [ ] **Step 3: Add `ai_context` permissions to `getDefaultPermissions()` in `src/app/onboard/actions.ts`**

In each role case, add the `ai_context` key after `modules`:

For `org_admin` (after line 44):
```typescript
        ai_context: { view: true, download: true, upload: true, manage: true },
```

For `org_staff` (after line 55):
```typescript
        ai_context: { view: true, download: true, upload: true, manage: false },
```

For `contributor` (after line 67):
```typescript
        ai_context: { view: true, download: true, upload: false, manage: false },
```

For `viewer` / default (after line 78):
```typescript
        ai_context: { view: false, download: false, upload: false, manage: false },
```

- [ ] **Step 4: Run type-check to verify**

Run: `npm run type-check`
Expected: PASS (no errors — the permission resolution system uses `keyof RolePermissions` dynamically so it picks up the new category automatically)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-context/types.ts src/lib/types.ts src/app/onboard/actions.ts
git commit -m "feat: add AI context types and permission category"
```

---

## Task 3: Install Frontend Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
npm install react-dropzone framer-motion @formkit/auto-animate papaparse xlsx proj4
npm install -D @types/papaparse @types/proj4
```

- [ ] **Step 2: Verify installation**

Run: `npm run build -- --no-lint 2>&1 | tail -5`
Expected: Build succeeds (or at least doesn't fail due to the new packages)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install AI context frontend dependencies"
```

---

## Task 4: Client-Side File Parsers

**Files:**
- Create: `src/lib/ai-context/parsers.ts`
- Create: `src/__tests__/ai-context/parsers.test.ts`

- [ ] **Step 1: Write failing tests for parsers**

Create `src/__tests__/ai-context/parsers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseFileForAnalysis, getSupportedMimeTypes, isGeoFile } from '@/lib/ai-context/parsers';

describe('getSupportedMimeTypes', () => {
  it('returns a set of accepted MIME types', () => {
    const types = getSupportedMimeTypes();
    expect(types).toContain('text/csv');
    expect(types).toContain('application/pdf');
    expect(types).toContain('image/jpeg');
    expect(types).toContain('application/geo+json');
  });
});

describe('isGeoFile', () => {
  it('identifies GeoJSON files', () => {
    expect(isGeoFile('data.geojson', 'application/geo+json')).toBe(true);
  });

  it('identifies KML files', () => {
    expect(isGeoFile('map.kml', 'application/vnd.google-earth.kml+xml')).toBe(true);
  });

  it('identifies GPX files', () => {
    expect(isGeoFile('track.gpx', 'application/gpx+xml')).toBe(true);
  });

  it('rejects non-geo files', () => {
    expect(isGeoFile('photo.jpg', 'image/jpeg')).toBe(false);
  });
});

describe('parseFileForAnalysis', () => {
  it('parses CSV text into headers and sample rows', async () => {
    const csvContent = 'name,lat,lng\nNest 1,43.5,-70.2\nNest 2,43.6,-70.3';
    const file = new File([csvContent], 'nests.csv', { type: 'text/csv' });
    const result = await parseFileForAnalysis(file);

    expect(result.fileName).toBe('nests.csv');
    expect(result.mimeType).toBe('text/csv');
    expect(result.sourceType).toBe('file');
    expect(result.headers).toEqual(['name', 'lat', 'lng']);
    expect(result.sampleRows).toHaveLength(2);
    expect(result.sampleRows![0]).toEqual(['Nest 1', '43.5', '-70.2']);
  });

  it('parses GeoJSON into features', async () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-70.2, 43.5] }, properties: { name: 'Nest 1' } },
      ],
    });
    const file = new File([geojson], 'points.geojson', { type: 'application/geo+json' });
    const result = await parseFileForAnalysis(file);

    expect(result.geoFeatures).toHaveLength(1);
    expect(result.geoFeatures![0].geometry.type).toBe('Point');
  });

  it('parses plain text as textContent', async () => {
    const text = 'Our organization monitors shorebird populations along the Maine coast.';
    const file = new File([text], 'notes.txt', { type: 'text/plain' });
    const result = await parseFileForAnalysis(file);

    expect(result.textContent).toBe(text);
    expect(result.sourceType).toBe('file');
  });

  it('encodes images as base64', async () => {
    // Create a tiny 1x1 PNG
    const pngBytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222,
    ]);
    const file = new File([pngBytes], 'photo.png', { type: 'image/png' });
    const result = await parseFileForAnalysis(file);

    expect(result.base64Content).toBeDefined();
    expect(result.base64Content!.length).toBeGreaterThan(0);
  });

  it('parses JSON files as textContent', async () => {
    const json = JSON.stringify({ species: ['Piping Plover', 'Least Tern'] });
    const file = new File([json], 'species.json', { type: 'application/json' });
    const result = await parseFileForAnalysis(file);

    expect(result.textContent).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --run src/__tests__/ai-context/parsers.test.ts`
Expected: FAIL — module `@/lib/ai-context/parsers` does not exist

- [ ] **Step 3: Implement the parsers**

Create `src/lib/ai-context/parsers.ts`:

```typescript
import type { ParsedFileData } from './types';

const SUPPORTED_EXTENSIONS: Record<string, string> = {
  // Images
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.heic': 'image/heic',
  // Documents
  '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Spreadsheets
  '.csv': 'text/csv', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Text
  '.txt': 'text/plain', '.md': 'text/markdown',
  // Geo
  '.geojson': 'application/geo+json', '.kml': 'application/vnd.google-earth.kml+xml',
  '.kmz': 'application/vnd.google-earth.kmz', '.gpx': 'application/gpx+xml',
  '.shp': 'application/x-shapefile',
  // Data
  '.json': 'application/json',
};

const GEO_EXTENSIONS = new Set(['.geojson', '.kml', '.kmz', '.gpx', '.shp']);
const GEO_MIME_TYPES = new Set([
  'application/geo+json', 'application/vnd.google-earth.kml+xml',
  'application/vnd.google-earth.kmz', 'application/gpx+xml', 'application/x-shapefile',
]);

const BINARY_MIME_PREFIXES = ['image/', 'application/pdf'];
const BINARY_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.google-earth.kmz',
]);

const MAX_SAMPLE_ROWS = 10;

export function getSupportedMimeTypes(): string[] {
  return [...new Set(Object.values(SUPPORTED_EXTENSIONS))];
}

export function getSupportedExtensions(): string[] {
  return Object.keys(SUPPORTED_EXTENSIONS);
}

export function isGeoFile(fileName: string, mimeType: string): boolean {
  const ext = getExtension(fileName);
  return GEO_EXTENSIONS.has(ext) || GEO_MIME_TYPES.has(mimeType);
}

function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
}

function isBinaryMime(mimeType: string): boolean {
  if (BINARY_MIME_TYPES.has(mimeType)) return true;
  return BINARY_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix));
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function parseCSV(file: File): Promise<Pick<ParsedFileData, 'headers' | 'sampleRows' | 'textContent'>> {
  const Papa = (await import('papaparse')).default;
  const text = await file.text();
  const result = Papa.parse(text, { header: false, skipEmptyLines: true });
  const rows = result.data as string[][];
  if (rows.length === 0) return { textContent: text };

  const headers = rows[0];
  const sampleRows = rows.slice(1, 1 + MAX_SAMPLE_ROWS);
  return { headers, sampleRows, textContent: text.slice(0, 5000) };
}

async function parseXLSX(file: File): Promise<Pick<ParsedFileData, 'headers' | 'sampleRows' | 'textContent'>> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as string[][];
  if (rows.length === 0) return { textContent: '' };

  const headers = rows[0].map(String);
  const sampleRows = rows.slice(1, 1 + MAX_SAMPLE_ROWS).map(row => row.map(String));
  const textSummary = `Sheet: ${sheetName}\nHeaders: ${headers.join(', ')}\nRows: ${rows.length - 1}`;
  return { headers, sampleRows, textContent: textSummary };
}

async function parseGeoJSON(file: File): Promise<Pick<ParsedFileData, 'geoFeatures' | 'textContent'>> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
    return { geoFeatures: parsed.features, textContent: text.slice(0, 5000) };
  }
  if (parsed.type === 'Feature') {
    return { geoFeatures: [parsed], textContent: text.slice(0, 5000) };
  }
  // Bare geometry
  return {
    geoFeatures: [{ type: 'Feature', geometry: parsed, properties: {} }],
    textContent: text.slice(0, 5000),
  };
}

async function parseKMLorGPX(file: File): Promise<Pick<ParsedFileData, 'geoFeatures' | 'textContent'>> {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const features: GeoJSON.Feature[] = [];

  // KML: extract Placemarks
  const placemarks = doc.querySelectorAll('Placemark');
  for (const pm of placemarks) {
    const name = pm.querySelector('name')?.textContent ?? 'Unnamed';
    const desc = pm.querySelector('description')?.textContent ?? null;
    const coordsEl = pm.querySelector('coordinates');
    if (coordsEl?.textContent) {
      const parts = coordsEl.textContent.trim().split(/\s+/);
      if (parts.length === 1) {
        const [lng, lat] = parts[0].split(',').map(Number);
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { name, description: desc },
        });
      } else {
        const coords = parts.map(p => {
          const [lng, lat] = p.split(',').map(Number);
          return [lng, lat];
        });
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { name, description: desc },
        });
      }
    }
  }

  // GPX: extract waypoints and track points
  const wpts = doc.querySelectorAll('wpt');
  for (const wpt of wpts) {
    const lat = Number(wpt.getAttribute('lat'));
    const lng = Number(wpt.getAttribute('lon'));
    const name = wpt.querySelector('name')?.textContent ?? 'Waypoint';
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { name },
    });
  }

  const trkpts = doc.querySelectorAll('trkpt');
  if (trkpts.length > 0) {
    const coords = Array.from(trkpts).map(pt => [
      Number(pt.getAttribute('lon')),
      Number(pt.getAttribute('lat')),
    ]);
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { name: doc.querySelector('trk > name')?.textContent ?? 'Track' },
    });
  }

  return { geoFeatures: features, textContent: text.slice(0, 5000) };
}

export async function parseFileForAnalysis(file: File): Promise<ParsedFileData> {
  const ext = getExtension(file.name);
  const mimeType = file.type || SUPPORTED_EXTENSIONS[ext] || 'application/octet-stream';

  const base: ParsedFileData = {
    fileName: file.name,
    mimeType,
    fileSize: file.size,
    sourceType: 'file',
  };

  // CSV
  if (mimeType === 'text/csv' || ext === '.csv') {
    return { ...base, ...(await parseCSV(file)) };
  }

  // XLSX
  if (ext === '.xlsx' || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return { ...base, ...(await parseXLSX(file)) };
  }

  // GeoJSON
  if (ext === '.geojson' || mimeType === 'application/geo+json') {
    return { ...base, ...(await parseGeoJSON(file)) };
  }

  // KML / GPX (text-based XML geo)
  if (['.kml', '.gpx'].includes(ext)) {
    return { ...base, ...(await parseKMLorGPX(file)) };
  }

  // Plain text / Markdown / JSON
  if (mimeType.startsWith('text/') || mimeType === 'application/json' || ['.txt', '.md', '.json'].includes(ext)) {
    const textContent = await file.text();
    return { ...base, textContent: textContent.slice(0, 50000) };
  }

  // Binary files (images, PDFs, DOCX, PPTX, KMZ)
  if (isBinaryMime(mimeType)) {
    const base64Content = await fileToBase64(file);
    return { ...base, base64Content };
  }

  // Fallback: try to read as text
  try {
    const textContent = await file.text();
    return { ...base, textContent: textContent.slice(0, 50000) };
  } catch {
    return base;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- --run src/__tests__/ai-context/parsers.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-context/parsers.ts src/__tests__/ai-context/parsers.test.ts
git commit -m "feat: add client-side file parsers for AI context (CSV, XLSX, GeoJSON, KML, GPX)"
```

---

## Task 5: AI Prompts and Context Provider

**Files:**
- Create: `src/lib/ai-context/prompts.ts`
- Create: `src/lib/ai-context/context-provider.ts`
- Create: `src/__tests__/ai-context/context-provider.test.ts`

- [ ] **Step 1: Write the context provider test**

Create `src/__tests__/ai-context/context-provider.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildOrgContextBlock } from '@/lib/ai-context/context-provider';
import type { AiContextSummary } from '@/lib/ai-context/types';

describe('buildOrgContextBlock', () => {
  it('returns empty string when no summary exists', () => {
    expect(buildOrgContextBlock(null)).toBe('');
  });

  it('builds XML context block from summary', () => {
    const summary: AiContextSummary = {
      id: '1',
      org_id: 'org-1',
      org_profile: 'Coastal Maine conservation org.',
      content_map: [
        { item_id: 'item-1', filename: 'guide.pdf', summary: '47 species entries' },
      ],
      last_rebuilt_at: '2026-03-27T00:00:00Z',
      version: 1,
    };

    const result = buildOrgContextBlock(summary);
    expect(result).toContain('<org-context>');
    expect(result).toContain('Coastal Maine conservation org.');
    expect(result).toContain('guide.pdf');
    expect(result).toContain('47 species entries');
    expect(result).toContain('</org-context>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/__tests__/ai-context/context-provider.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement context provider**

Create `src/lib/ai-context/context-provider.ts`:

```typescript
import type { AiContextSummary } from './types';

/**
 * Build the <org-context> XML block to inject into AI system prompts.
 * Returns empty string if no summary exists.
 */
export function buildOrgContextBlock(summary: AiContextSummary | null): string {
  if (!summary) return '';

  const fileEntries = summary.content_map
    .map(entry => `  - ${entry.filename}: ${entry.summary}`)
    .join('\n');

  return `<org-context>
${summary.org_profile}

<available-context-files>
${fileEntries}
</available-context-files>
</org-context>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run src/__tests__/ai-context/context-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Write the AI prompts module**

Create `src/lib/ai-context/prompts.ts`:

```typescript
import type { ParsedFileData } from './types';

/**
 * System prompt for analyzing a single uploaded file.
 * Returns content_summary + geo_features + suggested_org_metadata.
 */
export function buildFileAnalysisPrompt(orgContext: string): string {
  return `You are an AI assistant helping a conservation organization set up their field mapping platform. You are analyzing a file they uploaded to understand what it contains.

${orgContext ? `Here is what we already know about this organization:\n${orgContext}\n` : ''}
Analyze the provided file data and respond with valid JSON matching this exact structure:
{
  "content_summary": "A concise 1-3 sentence description of what this file contains and what's relevant about it for a conservation field mapping organization.",
  "geo_features": [
    {
      "name": "Feature name or label",
      "description": "Brief description or null",
      "geometry_type": "point" | "polygon" | "linestring",
      "geometry": { GeoJSON geometry object },
      "properties": { any extracted metadata },
      "confidence": 0.0 to 1.0
    }
  ],
  "suggested_org_metadata": {
    "name": "Organization name or null if not evident",
    "tagline": "Short tagline or null",
    "location_name": "Location name or null",
    "lat": latitude or null,
    "lng": longitude or null,
    "org_type": "Type of org (e.g., 'wildlife conservation', 'land trust') or null",
    "purpose": "Brief purpose statement or null"
  }
}

Rules:
- geo_features: Only include if you find actual geographic coordinates in the data. Do not fabricate coordinates.
- confidence: 1.0 for explicit coordinates, 0.5-0.8 for inferred/approximate coordinates, below 0.5 for uncertain.
- suggested_org_metadata: Only fill fields you can confidently infer from the file. Use null for anything uncertain.
- content_summary: Be specific about quantities (e.g., "47 species" not "many species").
- Respond with ONLY valid JSON, no markdown fences or extra text.`;
}

/**
 * Builds the user message for file analysis, formatting parsed data appropriately.
 */
export function buildFileAnalysisUserMessage(parsed: ParsedFileData): string {
  const parts: string[] = [`File: ${parsed.fileName} (${parsed.mimeType}, ${formatBytes(parsed.fileSize)})`];

  if (parsed.headers && parsed.sampleRows) {
    parts.push(`\nHeaders: ${parsed.headers.join(', ')}`);
    parts.push(`Sample rows (${parsed.sampleRows.length}):`);
    for (const row of parsed.sampleRows) {
      parts.push(`  ${row.join(', ')}`);
    }
  }

  if (parsed.geoFeatures && parsed.geoFeatures.length > 0) {
    parts.push(`\nParsed ${parsed.geoFeatures.length} GeoJSON features.`);
    // Include first 5 features as samples
    const sample = parsed.geoFeatures.slice(0, 5);
    parts.push(`Sample features:\n${JSON.stringify(sample, null, 2)}`);
  }

  if (parsed.textContent) {
    parts.push(`\nContent:\n${parsed.textContent}`);
  }

  // Note: base64Content is handled separately via the Vision API message format

  return parts.join('\n');
}

/**
 * System prompt for synthesizing org-level summary from all file summaries.
 */
export function buildOrgSynthesisPrompt(): string {
  return `You are synthesizing an organizational profile from multiple uploaded files. Create a concise, informative summary.

Respond with valid JSON matching this structure:
{
  "org_profile": "A concise 2-4 sentence summary of the organization: what they do, where they're located, what type of organization they are, and their primary purpose/focus areas.",
  "content_map": [
    {
      "item_id": "the-item-id",
      "filename": "original-filename",
      "summary": "1 sentence summary of what this file contributes"
    }
  ]
}

Rules:
- org_profile: Synthesize across ALL files to create a coherent picture. Be specific about location, species, activities.
- content_map: One entry per file. Summarize each file's unique contribution to the overall context.
- Respond with ONLY valid JSON, no markdown fences or extra text.`;
}

/**
 * System prompt for generating onboarding pre-fill suggestions.
 */
export function buildOnboardingPreFillPrompt(): string {
  return `Based on the analyzed context files, suggest values to pre-fill the organization setup wizard.

Respond with valid JSON matching this structure:
{
  "orgName": "Suggested org name or null",
  "tagline": "Short tagline or null",
  "locationName": "Location name or null",
  "lat": latitude or null,
  "lng": longitude or null,
  "zoom": suggested map zoom level (10-16) or null,
  "themePreset": "forest" | "ocean" | "desert" | "mountain" | "prairie" | "urban" or null,
  "itemTypes": [
    { "name": "Type name", "icon": "emoji", "color": "#hexcolor" }
  ] or null,
  "entityTypes": [
    {
      "name": "Entity type name",
      "icon": "emoji",
      "color": "#hexcolor",
      "link_to": ["items", "updates"],
      "fields": [
        { "name": "Field name", "field_type": "text|number|dropdown|date|url", "options": ["opt1"] or undefined, "required": true/false }
      ]
    }
  ] or null,
  "aboutContent": "Markdown about page content or null"
}

Rules:
- Only suggest values you can confidently infer from the provided context.
- Use null for anything uncertain — the user will fill these manually.
- themePreset: Choose based on the organization type and location.
- itemTypes: Suggest based on what the org tracks (e.g., nest boxes, trail markers, planting sites).
- entityTypes: Suggest based on species lists, categories, or entity types found in the data.
- aboutContent: Draft from any mission statements, descriptions, or about pages found in the context.
- Respond with ONLY valid JSON, no markdown fences or extra text.`;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai-context/prompts.ts src/lib/ai-context/context-provider.ts src/__tests__/ai-context/context-provider.test.ts
git commit -m "feat: add AI prompts and context provider for org context injection"
```

---

## Task 6: Server Actions — Upload, Analyze, Status, Delete

**Files:**
- Create: `src/lib/ai-context/actions.ts`
- Create: `src/app/api/ai-context/status/route.ts`

- [ ] **Step 1: Write the server actions**

Create `src/lib/ai-context/actions.ts`:

```typescript
'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { buildFileAnalysisPrompt, buildFileAnalysisUserMessage, buildOrgSynthesisPrompt, buildOnboardingPreFillPrompt } from './prompts';
import { buildOrgContextBlock } from './context-provider';
import type { ParsedFileData, FileAnalysisResult, AiContextSummary, OnboardingPreFill, ContentMapEntry } from './types';

/**
 * Upload a file to AI context storage and create the DB record.
 * Returns the created item ID.
 */
export async function uploadAiContextItem(
  orgId: string,
  file: { name: string; type: string; size: number; base64: string },
  sourceType: 'file' | 'url' | 'text',
  batchId: string | null
): Promise<{ success: true; itemId: string } | { error: string }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated' };

  const service = createServiceClient();

  // Create DB record
  const { data: item, error: insertError } = await service
    .from('ai_context_items')
    .insert({
      org_id: orgId,
      uploaded_by: user.id,
      source_type: sourceType,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      processing_status: 'pending',
      batch_id: batchId,
    })
    .select('id')
    .single();

  if (insertError || !item) return { error: insertError?.message ?? 'Failed to create record' };

  // Upload to storage
  if (sourceType === 'file' && file.base64) {
    const buffer = Buffer.from(file.base64, 'base64');
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const storagePath = `${orgId}/${item.id}/original${ext}`;

    const { error: uploadError } = await service.storage
      .from('ai-context')
      .upload(storagePath, buffer, { contentType: file.type });

    if (uploadError) {
      // Clean up the DB record
      await service.from('ai_context_items').delete().eq('id', item.id);
      return { error: `Storage upload failed: ${uploadError.message}` };
    }

    await service.from('ai_context_items').update({ storage_path: storagePath }).eq('id', item.id);
  }

  return { success: true, itemId: item.id };
}

/**
 * Analyze a single AI context item using Claude.
 * Updates the item's content_summary and creates geo features.
 */
export async function analyzeAiContextItem(
  itemId: string,
  parsedData: ParsedFileData
): Promise<{ success: true; result: FileAnalysisResult } | { error: string }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated' };

  const service = createServiceClient();

  // Get item and org context
  const { data: item } = await service.from('ai_context_items').select('id, org_id').eq('id', itemId).single();
  if (!item) return { error: 'Item not found' };

  // Mark as processing
  await service.from('ai_context_items').update({ processing_status: 'processing' }).eq('id', itemId);

  // Get existing org context for richer analysis
  const { data: existingSummary } = await service
    .from('ai_context_summary')
    .select('*')
    .eq('org_id', item.org_id)
    .maybeSingle();

  const orgContext = buildOrgContextBlock(existingSummary as AiContextSummary | null);

  try {
    const { generateText } = await import('ai');
    const { anthropic } = await import('@ai-sdk/anthropic');

    const systemPrompt = buildFileAnalysisPrompt(orgContext);
    const userMessage = buildFileAnalysisUserMessage(parsedData);

    // Build messages array — use vision for base64 content
    const messages: Array<{ role: 'user'; content: string | Array<{ type: string; text?: string; image?: { url: string } }> }> = [];

    if (parsedData.base64Content && parsedData.mimeType?.startsWith('image/')) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image', image: { url: `data:${parsedData.mimeType};base64,${parsedData.base64Content}` } },
          { type: 'text', text: userMessage },
        ],
      });
    } else if (parsedData.base64Content && parsedData.mimeType === 'application/pdf') {
      messages.push({
        role: 'user',
        content: [
          { type: 'file', data: parsedData.base64Content, mimeType: 'application/pdf' } as any,
          { type: 'text', text: userMessage },
        ],
      });
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: systemPrompt,
      messages,
      maxOutputTokens: 3000,
    });

    const result: FileAnalysisResult = JSON.parse(text);

    // Update item with summary
    await service.from('ai_context_items').update({
      content_summary: result.content_summary,
      processing_status: 'complete',
    }).eq('id', itemId);

    // Insert geo features
    if (result.geo_features && result.geo_features.length > 0) {
      const geoRows = result.geo_features.map(gf => ({
        org_id: item.org_id,
        source_item_id: itemId,
        name: gf.name,
        description: gf.description,
        geometry_type: gf.geometry_type,
        geometry: gf.geometry,
        properties: gf.properties,
        confidence: gf.confidence,
        status: 'pending',
      }));

      await service.from('ai_context_geo_features').insert(geoRows);
    }

    // Also insert any client-parsed geo features directly
    if (parsedData.geoFeatures && parsedData.geoFeatures.length > 0) {
      const clientGeoRows = parsedData.geoFeatures.map(f => ({
        org_id: item.org_id,
        source_item_id: itemId,
        name: (f.properties?.name as string) ?? 'Unnamed',
        description: (f.properties?.description as string) ?? null,
        geometry_type: f.geometry.type.toLowerCase() as 'point' | 'polygon' | 'linestring',
        geometry: f.geometry,
        properties: f.properties ?? {},
        confidence: 1.0,
        status: 'pending',
      }));

      await service.from('ai_context_geo_features').insert(clientGeoRows);
    }

    return { success: true, result };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Analysis failed';
    await service.from('ai_context_items').update({
      processing_status: 'error',
      processing_error: errorMessage,
    }).eq('id', itemId);
    return { error: errorMessage };
  }
}

/**
 * Rebuild the org-level AI context summary from all completed items.
 */
export async function rebuildOrgSummary(
  orgId: string
): Promise<{ success: true; summary: AiContextSummary } | { error: string }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated' };

  const service = createServiceClient();

  // Get all completed items
  const { data: items } = await service
    .from('ai_context_items')
    .select('id, file_name, content_summary')
    .eq('org_id', orgId)
    .eq('processing_status', 'complete')
    .order('created_at');

  if (!items || items.length === 0) {
    return { error: 'No analyzed items to synthesize' };
  }

  const itemSummaries = items.map(i => `- ${i.file_name}: ${i.content_summary}`).join('\n');

  try {
    const { generateText } = await import('ai');
    const { anthropic } = await import('@ai-sdk/anthropic');

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: buildOrgSynthesisPrompt(),
      messages: [{
        role: 'user',
        content: `Here are the analyzed files for this organization:\n\n${itemSummaries}\n\nFile IDs for content_map:\n${items.map(i => `${i.id}: ${i.file_name}`).join('\n')}`,
      }],
      maxOutputTokens: 2000,
    });

    const parsed = JSON.parse(text) as { org_profile: string; content_map: ContentMapEntry[] };

    // Upsert the summary
    const { data: existing } = await service
      .from('ai_context_summary')
      .select('id, version')
      .eq('org_id', orgId)
      .maybeSingle();

    let summary: AiContextSummary;

    if (existing) {
      const { data: updated } = await service
        .from('ai_context_summary')
        .update({
          org_profile: parsed.org_profile,
          content_map: parsed.content_map,
          last_rebuilt_at: new Date().toISOString(),
          version: existing.version + 1,
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      summary = updated as AiContextSummary;
    } else {
      const { data: created } = await service
        .from('ai_context_summary')
        .insert({
          org_id: orgId,
          org_profile: parsed.org_profile,
          content_map: parsed.content_map,
        })
        .select('*')
        .single();
      summary = created as AiContextSummary;
    }

    return { success: true, summary };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Synthesis failed' };
  }
}

/**
 * Generate onboarding pre-fill suggestions from org context.
 */
export async function generateOnboardingPreFill(
  orgId: string
): Promise<{ success: true; preFill: OnboardingPreFill } | { error: string }> {
  const service = createServiceClient();

  const { data: summary } = await service
    .from('ai_context_summary')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle();

  if (!summary) return { error: 'No context summary available' };

  const { data: items } = await service
    .from('ai_context_items')
    .select('file_name, content_summary')
    .eq('org_id', orgId)
    .eq('processing_status', 'complete');

  const contextBlock = buildOrgContextBlock(summary as AiContextSummary);
  const fileDetails = (items ?? []).map(i => `- ${i.file_name}: ${i.content_summary}`).join('\n');

  try {
    const { generateText } = await import('ai');
    const { anthropic } = await import('@ai-sdk/anthropic');

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: buildOnboardingPreFillPrompt(),
      messages: [{
        role: 'user',
        content: `Organization context:\n${contextBlock}\n\nDetailed file contents:\n${fileDetails}`,
      }],
      maxOutputTokens: 2000,
    });

    const preFill: OnboardingPreFill = JSON.parse(text);
    return { success: true, preFill };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Pre-fill generation failed' };
  }
}

/**
 * Delete an AI context item and its associated storage and geo features.
 */
export async function deleteAiContextItem(
  itemId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated' };

  const service = createServiceClient();

  const { data: item } = await service
    .from('ai_context_items')
    .select('id, org_id, storage_path')
    .eq('id', itemId)
    .single();

  if (!item) return { error: 'Item not found' };

  // Delete storage file
  if (item.storage_path) {
    await service.storage.from('ai-context').remove([item.storage_path]);
  }

  // Delete DB record (cascades to geo_features)
  const { error: deleteError } = await service
    .from('ai_context_items')
    .delete()
    .eq('id', itemId);

  if (deleteError) return { error: deleteError.message };

  return { success: true };
}

/**
 * Process a URL: fetch, snapshot, and analyze.
 */
export async function processUrlContext(
  orgId: string,
  url: string,
  batchId: string | null
): Promise<{ success: true; itemId: string } | { error: string }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated' };

  const service = createServiceClient();

  // Create DB record
  const { data: item, error: insertError } = await service
    .from('ai_context_items')
    .insert({
      org_id: orgId,
      uploaded_by: user.id,
      source_type: 'url',
      file_name: url,
      mime_type: 'text/html',
      processing_status: 'pending',
      batch_id: batchId,
    })
    .select('id')
    .single();

  if (insertError || !item) return { error: insertError?.message ?? 'Failed to create record' };

  try {
    // Fetch URL content
    const response = await fetch(url, {
      headers: { 'User-Agent': 'FieldMapper/1.0 (Context Analyzer)' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    const html = await response.text();

    // Simple HTML to text extraction
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50000);

    // Store snapshot
    const snapshotPath = `${orgId}/${item.id}/snapshot.html`;
    await service.storage
      .from('ai-context')
      .upload(snapshotPath, html, { contentType: 'text/html' });

    await service.from('ai_context_items').update({
      storage_path: snapshotPath,
      file_size: html.length,
    }).eq('id', item.id);

    // Analyze using the text content
    const parsedData: ParsedFileData = {
      fileName: url,
      mimeType: 'text/html',
      fileSize: html.length,
      sourceType: 'url',
      textContent,
      url,
    };

    const analysisResult = await analyzeAiContextItem(item.id, parsedData);
    if ('error' in analysisResult) return { error: analysisResult.error };

    return { success: true, itemId: item.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'URL processing failed';
    await service.from('ai_context_items').update({
      processing_status: 'error',
      processing_error: errorMessage,
    }).eq('id', item.id);
    return { error: errorMessage };
  }
}
```

- [ ] **Step 2: Write the polling API route**

Create `src/app/api/ai-context/status/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('org_id');
  const batchId = searchParams.get('batch_id');

  if (!orgId) {
    return NextResponse.json({ error: 'org_id required' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Build query
  let query = supabase
    .from('ai_context_items')
    .select('id, processing_status, content_summary')
    .eq('org_id', orgId);

  if (batchId) {
    query = query.eq('batch_id', batchId);
  }

  const { data: items, error: itemsError } = await query.order('created_at');

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // Get geo feature counts per item
  const itemIds = (items ?? []).map(i => i.id);
  let geoCounts: Record<string, number> = {};

  if (itemIds.length > 0) {
    const { data: geoData } = await supabase
      .from('ai_context_geo_features')
      .select('source_item_id')
      .in('source_item_id', itemIds);

    if (geoData) {
      geoCounts = geoData.reduce((acc, row) => {
        acc[row.source_item_id] = (acc[row.source_item_id] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    }
  }

  // Check if summary is ready
  const { data: summary } = await supabase
    .from('ai_context_summary')
    .select('id')
    .eq('org_id', orgId)
    .maybeSingle();

  const allComplete = (items ?? []).every(i => i.processing_status === 'complete' || i.processing_status === 'error');

  return NextResponse.json({
    items: (items ?? []).map(i => ({
      id: i.id,
      processing_status: i.processing_status,
      content_summary: i.content_summary,
      geo_count: geoCounts[i.id] ?? 0,
    })),
    summary_ready: allComplete && summary !== null,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai-context/actions.ts src/app/api/ai-context/status/route.ts
git commit -m "feat: add AI context server actions and polling endpoint"
```

---

## Task 7: FileDropZone Component

**Files:**
- Create: `src/components/ai-context/FileDropZone.tsx`

- [ ] **Step 1: Build the drop zone component**

Create `src/components/ai-context/FileDropZone.tsx`:

```tsx
'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { getSupportedExtensions } from '@/lib/ai-context/parsers';
import {
  FileText, FileImage, FileSpreadsheet, Globe, MapPin, File as FileIcon, X,
} from 'lucide-react';

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  onUrlSubmit?: (url: string) => void;
  onTextSubmit?: (text: string, label: string) => void;
  disabled?: boolean;
}

function getFileIcon(mimeType: string, fileName: string) {
  if (mimeType.startsWith('image/')) return <FileImage className="w-5 h-5 text-blue-400" />;
  if (mimeType === 'application/pdf') return <FileText className="w-5 h-5 text-red-400" />;
  if (mimeType.includes('spreadsheet') || fileName.endsWith('.csv') || fileName.endsWith('.xlsx')) {
    return <FileSpreadsheet className="w-5 h-5 text-green-400" />;
  }
  if (fileName.match(/\.(geojson|kml|kmz|gpx|shp)$/i)) return <MapPin className="w-5 h-5 text-cyan-400" />;
  if (mimeType.startsWith('text/')) return <FileText className="w-5 h-5 text-gray-400" />;
  return <FileIcon className="w-5 h-5 text-gray-400" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileDropZone({ onFilesSelected, onUrlSubmit, onTextSubmit, disabled }: FileDropZoneProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [textLabel, setTextLabel] = useState('');
  const [activeTab, setActiveTab] = useState<'files' | 'url' | 'text'>('files');

  const onDrop = useCallback((accepted: File[]) => {
    const updated = [...selectedFiles, ...accepted];
    setSelectedFiles(updated);
    onFilesSelected(updated);
  }, [selectedFiles, onFilesSelected]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: Object.fromEntries(
      getSupportedExtensions().map(ext => [ext, []])
    ),
    disabled,
  });

  function removeFile(index: number) {
    const updated = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
    onFilesSelected(updated);
  }

  function handleUrlSubmit() {
    if (urlInput.trim() && onUrlSubmit) {
      onUrlSubmit(urlInput.trim());
      setUrlInput('');
    }
  }

  function handleTextSubmit() {
    if (textInput.trim() && onTextSubmit) {
      onTextSubmit(textInput.trim(), textLabel.trim() || 'Text note');
      setTextInput('');
      setTextLabel('');
    }
  }

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-2">
        {(['files', 'url', 'text'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-amber-700 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {tab === 'files' ? 'Files' : tab === 'url' ? 'URL' : 'Text'}
          </button>
        ))}
      </div>

      {/* Files tab */}
      {activeTab === 'files' && (
        <>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-amber-500 bg-amber-50'
                : disabled
                ? 'border-stone-200 bg-stone-50 cursor-not-allowed'
                : 'border-stone-300 hover:border-amber-400 hover:bg-amber-50/50'
            }`}
          >
            <input {...getInputProps()} />
            <div className="text-stone-500">
              <p className="text-lg font-medium">
                {isDragActive ? 'Drop files here' : 'Drag & drop files, or click to browse'}
              </p>
              <p className="text-sm mt-1">
                PDFs, images, spreadsheets, geo data, documents — any format
              </p>
            </div>
          </div>

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              {selectedFiles.map((file, i) => (
                <div key={`${file.name}-${i}`} className="flex items-center gap-3 p-2 bg-stone-50 rounded-md">
                  {getFileIcon(file.type, file.name)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-stone-400">{formatSize(file.size)}</p>
                  </div>
                  <button
                    onClick={() => removeFile(i)}
                    className="text-stone-400 hover:text-stone-600"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* URL tab */}
      {activeTab === 'url' && (
        <div className="space-y-2">
          <input
            type="url"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://example.org/about"
            className="input-field w-full"
            disabled={disabled}
            onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
          />
          <button
            onClick={handleUrlSubmit}
            disabled={!urlInput.trim() || disabled}
            className="btn-primary text-sm"
          >
            Add URL
          </button>
        </div>
      )}

      {/* Text tab */}
      {activeTab === 'text' && (
        <div className="space-y-2">
          <input
            type="text"
            value={textLabel}
            onChange={e => setTextLabel(e.target.value)}
            placeholder="Label (e.g., 'Organization description')"
            className="input-field w-full"
            disabled={disabled}
          />
          <textarea
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            placeholder="Paste text here..."
            className="input-field w-full h-32 resize-y"
            disabled={disabled}
          />
          <button
            onClick={handleTextSubmit}
            disabled={!textInput.trim() || disabled}
            className="btn-primary text-sm"
          >
            Add Text
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ai-context/FileDropZone.tsx
git commit -m "feat: add FileDropZone component with drag-and-drop, URL, and text inputs"
```

---

## Task 8: ProcessingProgress Component

**Files:**
- Create: `src/components/ai-context/ProcessingProgress.tsx`

- [ ] **Step 1: Build the processing progress component**

Create `src/components/ai-context/ProcessingProgress.tsx`:

```tsx
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, AlertCircle, FileText, FileImage, FileSpreadsheet, MapPin, Globe, File as FileIcon } from 'lucide-react';
import type { AiContextProcessingStatus } from '@/lib/ai-context/types';

interface ProcessingItem {
  id: string;
  fileName: string;
  mimeType: string;
  status: AiContextProcessingStatus;
  contentSummary: string | null;
  geoCount: number;
}

interface ProcessingProgressProps {
  items: ProcessingItem[];
  summaryReady: boolean;
  orgProfile?: string | null;
}

function getFileIcon(mimeType: string, fileName: string) {
  if (mimeType.startsWith('image/')) return <FileImage className="w-4 h-4" />;
  if (mimeType === 'application/pdf') return <FileText className="w-4 h-4" />;
  if (mimeType.includes('spreadsheet') || fileName.endsWith('.csv') || fileName.endsWith('.xlsx')) {
    return <FileSpreadsheet className="w-4 h-4" />;
  }
  if (fileName.match(/\.(geojson|kml|kmz|gpx|shp)$/i)) return <MapPin className="w-4 h-4" />;
  if (mimeType === 'text/html') return <Globe className="w-4 h-4" />;
  return <FileIcon className="w-4 h-4" />;
}

function StatusIcon({ status }: { status: AiContextProcessingStatus }) {
  switch (status) {
    case 'pending':
      return <div className="w-5 h-5 rounded-full border-2 border-stone-300" />;
    case 'processing':
      return (
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
          <Loader2 className="w-5 h-5 text-amber-500" />
        </motion.div>
      );
    case 'complete':
      return (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
        </motion.div>
      );
    case 'error':
      return <AlertCircle className="w-5 h-5 text-red-500" />;
  }
}

export default function ProcessingProgress({ items, summaryReady, orgProfile }: ProcessingProgressProps) {
  const completedCount = items.filter(i => i.status === 'complete').length;
  const totalGeo = items.reduce((sum, i) => sum + i.geoCount, 0);

  return (
    <div className="space-y-4">
      {/* Overall progress bar */}
      <div>
        <div className="flex justify-between text-sm text-stone-500 mb-1">
          <span>Analyzing {items.length} files</span>
          <span>{completedCount}/{items.length} complete</span>
        </div>
        <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-amber-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Per-file progress list */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-start gap-3 p-3 bg-stone-50 rounded-lg"
            >
              <StatusIcon status={item.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {getFileIcon(item.mimeType, item.fileName)}
                  <span className="text-sm font-medium truncate">{item.fileName}</span>
                </div>
                <AnimatePresence>
                  {item.status === 'complete' && item.contentSummary && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="text-xs text-stone-500 mt-1"
                    >
                      {item.contentSummary}
                    </motion.p>
                  )}
                  {item.status === 'error' && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="text-xs text-red-500 mt-1"
                    >
                      Analysis failed — this file will be skipped
                    </motion.p>
                  )}
                </AnimatePresence>
                {item.geoCount > 0 && (
                  <span className="text-xs text-cyan-600 mt-1 inline-block">
                    {item.geoCount} geo feature{item.geoCount !== 1 ? 's' : ''} extracted
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Org profile preview */}
      <AnimatePresence>
        {summaryReady && orgProfile && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-amber-50 border border-amber-200 rounded-lg"
          >
            <p className="text-xs font-medium text-amber-800 mb-1">Here&apos;s what we learned about your organization:</p>
            <p className="text-sm text-amber-900">{orgProfile}</p>
            {totalGeo > 0 && (
              <p className="text-xs text-amber-700 mt-2">{totalGeo} geographic features found across your files</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ai-context/ProcessingProgress.tsx
git commit -m "feat: add ProcessingProgress component with framer-motion animations"
```

---

## Task 9: Admin AI Context Page

**Files:**
- Create: `src/components/ai-context/OrgProfileCard.tsx`
- Create: `src/components/ai-context/AiContextTable.tsx`
- Create: `src/app/admin/ai-context/page.tsx`
- Modify: `src/app/admin/AdminShell.tsx:16-24`

- [ ] **Step 1: Create OrgProfileCard**

Create `src/components/ai-context/OrgProfileCard.tsx`:

```tsx
import type { AiContextSummary } from '@/lib/ai-context/types';

interface OrgProfileCardProps {
  summary: AiContextSummary | null;
}

export default function OrgProfileCard({ summary }: OrgProfileCardProps) {
  if (!summary) {
    return (
      <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-center text-stone-500 text-sm">
        No AI context uploaded yet. Add files, URLs, or text to get started.
      </div>
    );
  }

  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
            Organization Profile (AI-Generated)
          </p>
          <p className="text-sm text-amber-900 leading-relaxed">{summary.org_profile}</p>
        </div>
        <span className="text-xs text-amber-600 whitespace-nowrap ml-3">
          v{summary.version}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create AiContextTable**

Create `src/components/ai-context/AiContextTable.tsx`:

```tsx
'use client';

import { FileText, FileImage, FileSpreadsheet, MapPin, Globe, File as FileIcon, Download, Trash2 } from 'lucide-react';
import type { AiContextItem } from '@/lib/ai-context/types';

interface AiContextTableProps {
  items: Array<AiContextItem & { geo_count: number }>;
  onDelete: (id: string) => void;
  onDownload: (item: AiContextItem) => void;
  canManage: boolean;
  canDownload: boolean;
}

function getIcon(item: AiContextItem) {
  if (item.source_type === 'url') return <Globe className="w-4 h-4 text-purple-400" />;
  if (item.mime_type?.startsWith('image/')) return <FileImage className="w-4 h-4 text-blue-400" />;
  if (item.mime_type === 'application/pdf') return <FileText className="w-4 h-4 text-red-400" />;
  if (item.mime_type?.includes('spreadsheet') || item.file_name.match(/\.(csv|xlsx)$/i)) {
    return <FileSpreadsheet className="w-4 h-4 text-green-400" />;
  }
  if (item.file_name.match(/\.(geojson|kml|kmz|gpx|shp)$/i)) return <MapPin className="w-4 h-4 text-cyan-400" />;
  return <FileIcon className="w-4 h-4 text-stone-400" />;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    complete: 'text-green-600',
    processing: 'text-amber-600',
    pending: 'text-stone-400',
    error: 'text-red-600',
  };
  return <span className={`text-xs ${colors[status] ?? 'text-stone-400'}`}>{status}</span>;
}

export default function AiContextTable({ items, onDelete, onDownload, canManage, canDownload }: AiContextTableProps) {
  if (items.length === 0) {
    return <p className="text-sm text-stone-500 text-center py-8">No files uploaded yet.</p>;
  }

  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wide">
            <th className="text-left px-4 py-2">File</th>
            <th className="text-left px-4 py-2 hidden md:table-cell">AI Summary</th>
            <th className="text-center px-4 py-2">Geo</th>
            <th className="text-center px-4 py-2">Status</th>
            <th className="text-right px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-t border-stone-100 hover:bg-stone-50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {getIcon(item)}
                  <div>
                    <p className="font-medium truncate max-w-[200px]">{item.file_name}</p>
                    <p className="text-xs text-stone-400">{formatSize(item.file_size)}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-stone-500 text-xs hidden md:table-cell max-w-[300px]">
                <p className="line-clamp-2">{item.content_summary ?? '—'}</p>
              </td>
              <td className="px-4 py-3 text-center">
                {item.geo_count > 0 ? (
                  <span className="text-xs text-cyan-600">{item.geo_count}</span>
                ) : (
                  <span className="text-xs text-stone-300">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                <StatusBadge status={item.processing_status} />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  {canDownload && item.storage_path && (
                    <button
                      onClick={() => onDownload(item)}
                      className="text-stone-400 hover:text-stone-600"
                      aria-label={`Download ${item.file_name}`}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  {canManage && (
                    <button
                      onClick={() => onDelete(item.id)}
                      className="text-stone-400 hover:text-red-600"
                      aria-label={`Delete ${item.file_name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create the admin page**

Create `src/app/admin/ai-context/page.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getTenantContext } from '@/lib/tenant/server';
import { parseFileForAnalysis } from '@/lib/ai-context/parsers';
import { uploadAiContextItem, analyzeAiContextItem, rebuildOrgSummary, deleteAiContextItem, processUrlContext } from '@/lib/ai-context/actions';
import FileDropZone from '@/components/ai-context/FileDropZone';
import ProcessingProgress from '@/components/ai-context/ProcessingProgress';
import OrgProfileCard from '@/components/ai-context/OrgProfileCard';
import AiContextTable from '@/components/ai-context/AiContextTable';
import type { AiContextItem, AiContextSummary } from '@/lib/ai-context/types';

export default function AiContextPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [items, setItems] = useState<Array<AiContextItem & { geo_count: number }>>([]);
  const [summary, setSummary] = useState<AiContextSummary | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingItems, setProcessingItems] = useState<Array<{
    id: string; fileName: string; mimeType: string; status: 'pending' | 'processing' | 'complete' | 'error';
    contentSummary: string | null; geoCount: number;
  }>>([]);

  const loadData = useCallback(async (oid: string) => {
    const supabase = createClient();

    const { data: contextItems } = await supabase
      .from('ai_context_items')
      .select('*')
      .eq('org_id', oid)
      .order('created_at', { ascending: false });

    const { data: geoFeatures } = await supabase
      .from('ai_context_geo_features')
      .select('source_item_id')
      .eq('org_id', oid);

    const geoCounts: Record<string, number> = {};
    for (const gf of geoFeatures ?? []) {
      geoCounts[gf.source_item_id] = (geoCounts[gf.source_item_id] ?? 0) + 1;
    }

    setItems((contextItems ?? []).map(i => ({ ...i, geo_count: geoCounts[i.id] ?? 0 })));

    const { data: summaryData } = await supabase
      .from('ai_context_summary')
      .select('*')
      .eq('org_id', oid)
      .maybeSingle();

    setSummary(summaryData as AiContextSummary | null);
  }, []);

  useEffect(() => {
    // Get org_id from tenant context via a server component or cookie
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('org_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data?.org_id) {
            setOrgId(data.org_id);
            loadData(data.org_id);
          }
        });
    });
  }, [loadData]);

  async function handleFilesSelected(files: File[]) {
    if (!orgId || files.length === 0) return;
    setUploading(true);
    setProcessing(true);

    const batchId = crypto.randomUUID();
    const newProcessingItems = files.map((f, i) => ({
      id: `temp-${i}`,
      fileName: f.name,
      mimeType: f.type,
      status: 'pending' as const,
      contentSummary: null,
      geoCount: 0,
    }));
    setProcessingItems(newProcessingItems);

    // Upload and analyze each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Upload
      const base64 = await fileToBase64(file);
      const uploadResult = await uploadAiContextItem(orgId, {
        name: file.name, type: file.type, size: file.size, base64,
      }, 'file', batchId);

      if ('error' in uploadResult) {
        setProcessingItems(prev => prev.map((p, j) =>
          j === i ? { ...p, status: 'error' as const } : p
        ));
        continue;
      }

      const itemId = uploadResult.itemId;
      setProcessingItems(prev => prev.map((p, j) =>
        j === i ? { ...p, id: itemId, status: 'processing' } : p
      ));

      // Parse and analyze
      const parsed = await parseFileForAnalysis(file);
      const analysisResult = await analyzeAiContextItem(itemId, parsed);

      if ('error' in analysisResult) {
        setProcessingItems(prev => prev.map(p =>
          p.id === itemId ? { ...p, status: 'error' } : p
        ));
      } else {
        setProcessingItems(prev => prev.map(p =>
          p.id === itemId ? {
            ...p,
            status: 'complete',
            contentSummary: analysisResult.result.content_summary,
            geoCount: analysisResult.result.geo_features.length,
          } : p
        ));
      }
    }

    // Rebuild org summary
    const summaryResult = await rebuildOrgSummary(orgId);
    if ('success' in summaryResult) {
      setSummary(summaryResult.summary);
    }

    setUploading(false);
    setProcessing(false);
    await loadData(orgId);
  }

  async function handleUrlSubmit(url: string) {
    if (!orgId) return;
    setProcessing(true);
    setProcessingItems([{ id: 'url-temp', fileName: url, mimeType: 'text/html', status: 'processing', contentSummary: null, geoCount: 0 }]);

    const result = await processUrlContext(orgId, url, null);

    if ('error' in result) {
      setProcessingItems(prev => prev.map(p => ({ ...p, status: 'error' as const })));
    } else {
      await rebuildOrgSummary(orgId);
      await loadData(orgId);
    }

    setProcessing(false);
    setProcessingItems([]);
  }

  async function handleDelete(itemId: string) {
    if (!orgId) return;
    const result = await deleteAiContextItem(itemId);
    if ('success' in result) {
      await rebuildOrgSummary(orgId);
      await loadData(orgId);
    }
  }

  async function handleDownload(item: AiContextItem) {
    if (!item.storage_path) return;
    const supabase = createClient();
    const { data } = await supabase.storage.from('ai-context').download(item.storage_path);
    if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.file_name;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  const totalGeo = items.reduce((sum, i) => sum + i.geo_count, 0);
  const totalSize = items.reduce((sum, i) => sum + (i.file_size ?? 0), 0);

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-xl font-bold">AI Context</h1>
          <p className="text-sm text-stone-500">Manage the knowledge your AI tools draw from</p>
        </div>
      </div>

      <OrgProfileCard summary={summary} />

      <div className="mt-6">
        <FileDropZone
          onFilesSelected={handleFilesSelected}
          onUrlSubmit={handleUrlSubmit}
          disabled={uploading}
        />
      </div>

      {processing && processingItems.length > 0 && (
        <div className="mt-6">
          <ProcessingProgress
            items={processingItems}
            summaryReady={summary !== null}
            orgProfile={summary?.org_profile}
          />
        </div>
      )}

      <div className="mt-6">
        <AiContextTable
          items={items}
          onDelete={handleDelete}
          onDownload={handleDownload}
          canManage={true}
          canDownload={true}
        />
      </div>

      {items.length > 0 && (
        <div className="mt-3 flex justify-between text-xs text-stone-400">
          <span>{items.length} item{items.length !== 1 ? 's' : ''} &middot; {formatBytes(totalSize)}</span>
          <span>{totalGeo} geo feature{totalGeo !== 1 ? 's' : ''} extracted</span>
        </div>
      )}
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
```

- [ ] **Step 4: Add AI Context to admin sidebar**

In `src/app/admin/AdminShell.tsx`, add the nav item between Roles and Domains in `ORG_NAV_ITEMS` (line 20):

```typescript
const ORG_NAV_ITEMS = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Properties', href: '/admin/properties' },
  { label: 'Members', href: '/admin/members' },
  { label: 'Roles', href: '/admin/roles' },
  { label: 'AI Context', href: '/admin/ai-context' },
  { label: 'Domains', href: '/admin/domains' },
  { label: 'Access & Tokens', href: '/admin/access' },
  { label: 'Org Settings', href: '/admin/settings' },
];
```

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/ai-context/OrgProfileCard.tsx src/components/ai-context/AiContextTable.tsx src/app/admin/ai-context/page.tsx src/app/admin/AdminShell.tsx
git commit -m "feat: add admin AI context page with file management UI"
```

---

## Task 10: AI Wizard Sidebar Panel

**Files:**
- Create: `src/components/ai-context/AiContextPanel.tsx`

- [ ] **Step 1: Build the collapsible panel**

Create `src/components/ai-context/AiContextPanel.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown, ChevronUp, Plus, ExternalLink, FileText, FileImage, FileSpreadsheet, MapPin, Globe, File as FileIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AiContextItem, AiContextSummary } from '@/lib/ai-context/types';

interface AiContextPanelProps {
  orgId: string;
}

function getIcon(item: AiContextItem) {
  if (item.source_type === 'url') return <Globe className="w-3 h-3 text-purple-400" />;
  if (item.mime_type?.startsWith('image/')) return <FileImage className="w-3 h-3 text-blue-400" />;
  if (item.mime_type === 'application/pdf') return <FileText className="w-3 h-3 text-red-400" />;
  if (item.file_name.match(/\.(csv|xlsx)$/i)) return <FileSpreadsheet className="w-3 h-3 text-green-400" />;
  if (item.file_name.match(/\.(geojson|kml|kmz|gpx|shp)$/i)) return <MapPin className="w-3 h-3 text-cyan-400" />;
  return <FileIcon className="w-3 h-3 text-stone-400" />;
}

export default function AiContextPanel({ orgId }: AiContextPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<AiContextItem[]>([]);
  const [summary, setSummary] = useState<AiContextSummary | null>(null);
  const [geoCount, setGeoCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();

    supabase.from('ai_context_items')
      .select('*')
      .eq('org_id', orgId)
      .eq('processing_status', 'complete')
      .order('created_at')
      .then(({ data }) => setItems(data ?? []));

    supabase.from('ai_context_summary')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle()
      .then(({ data }) => setSummary(data as AiContextSummary | null));

    supabase.from('ai_context_geo_features')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .then(({ count }) => setGeoCount(count ?? 0));
  }, [orgId]);

  if (items.length === 0 && !summary) return null;

  return (
    <div className="border border-amber-200 bg-amber-50/50 rounded-lg">
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-amber-600" />
          <div>
            <span className="text-xs font-medium text-amber-800">AI Context</span>
            <span className="text-xs text-amber-600 ml-2">
              {items.length} file{items.length !== 1 ? 's' : ''} &middot; {geoCount} geo feature{geoCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/admin/ai-context"
            onClick={e => e.stopPropagation()}
            className="text-xs text-amber-600 hover:text-amber-800"
          >
            Manage <ExternalLink className="w-3 h-3 inline" />
          </a>
          {expanded ? <ChevronUp className="w-4 h-4 text-amber-600" /> : <ChevronDown className="w-4 h-4 text-amber-600" />}
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {summary?.org_profile && (
                <p className="text-xs text-amber-800 leading-relaxed">{summary.org_profile}</p>
              )}
              <div className="space-y-1">
                {items.map(item => (
                  <div key={item.id} className="flex items-center gap-1.5 text-xs text-amber-700">
                    {getIcon(item)}
                    <span className="truncate">{item.file_name}</span>
                  </div>
                ))}
              </div>
              <div className="pt-1 border-t border-amber-200">
                <a href="/admin/ai-context" className="text-xs text-amber-600 hover:text-amber-800">
                  Manage in settings <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ai-context/AiContextPanel.tsx
git commit -m "feat: add collapsible AI context panel for AI wizards"
```

---

## Task 11: Onboarding Flow Integration

**Files:**
- Modify: `src/app/onboard/page.tsx`

This is the largest task. The onboarding page needs to be updated to support the AI-assisted path alongside the existing manual path.

- [ ] **Step 1: Update the Step type and STEPS array**

In `src/app/onboard/page.tsx`, replace the Step type and STEPS on lines 10-11:

```typescript
type OnboardPath = 'ai' | 'manual';
type Step = 'welcome' | 'ai-upload' | 'ai-progress' | 'ai-review' | 'name' | 'theme' | 'custommap' | 'items' | 'entities' | 'about' | 'review';

const AI_STEPS: Step[] = ['welcome', 'ai-upload', 'ai-progress', 'ai-review'];
const MANUAL_STEPS: Step[] = ['welcome', 'name', 'theme', 'custommap', 'items', 'entities', 'about', 'review'];
```

- [ ] **Step 2: Add AI context state and path selection**

Add new state variables after the existing form state declarations:

```typescript
  const [onboardPath, setOnboardPath] = useState<OnboardPath | null>(null);
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [aiBatchId] = useState(crypto.randomUUID());
  const [aiProcessingItems, setAiProcessingItems] = useState<Array<{
    id: string; fileName: string; mimeType: string;
    status: 'pending' | 'processing' | 'complete' | 'error';
    contentSummary: string | null; geoCount: number;
  }>>([]);
  const [aiSummaryReady, setAiSummaryReady] = useState(false);
  const [aiOrgProfile, setAiOrgProfile] = useState<string | null>(null);
  const [preFillApplied, setPreFillApplied] = useState(false);
```

- [ ] **Step 3: Update the steps array to be dynamic**

Replace the fixed `STEPS` reference with:

```typescript
  const steps = onboardPath === 'ai' ? AI_STEPS : MANUAL_STEPS;
  const stepIndex = steps.indexOf(step);
  const isLast = stepIndex === steps.length - 1;
```

Update `next()` and `back()` to use `steps` instead of `STEPS`.

- [ ] **Step 4: Add the welcome step with path selection**

In the JSX render, update the `welcome` step to include the path choice:

```tsx
{step === 'welcome' && (
  <div className="text-center max-w-lg mx-auto space-y-6">
    <h2 className="text-2xl font-bold">Welcome to FieldMapper</h2>
    <p className="text-stone-600">Let&apos;s set up your organization. Choose how you&apos;d like to get started:</p>

    <div className="space-y-3">
      <button
        onClick={() => { setOnboardPath('ai'); setStep('ai-upload'); }}
        className="w-full p-4 border-2 border-amber-300 bg-amber-50 rounded-lg text-left hover:border-amber-500 transition-colors"
      >
        <p className="font-medium text-amber-900">Upload context to get started fast</p>
        <p className="text-sm text-amber-700 mt-1">
          Upload files, URLs, or text about your organization and we&apos;ll configure everything for you.
        </p>
      </button>

      <button
        onClick={() => { setOnboardPath('manual'); setStep('name'); }}
        className="w-full p-4 border border-stone-200 rounded-lg text-left hover:border-stone-400 transition-colors"
      >
        <p className="font-medium">Set up manually</p>
        <p className="text-sm text-stone-500 mt-1">
          Configure your organization step by step.
        </p>
      </button>
    </div>

    <div className="text-xs text-stone-400 space-y-1">
      <p>Your data stays yours — stored securely, never used for training.</p>
      <p>You can always add or remove AI context later in settings.</p>
    </div>
  </div>
)}
```

- [ ] **Step 5: Add the AI upload step**

Add new step renders for `ai-upload`, `ai-progress`, and `ai-review`. Import the new components at the top of the file:

```typescript
import FileDropZone from '@/components/ai-context/FileDropZone';
import ProcessingProgress from '@/components/ai-context/ProcessingProgress';
import { parseFileForAnalysis } from '@/lib/ai-context/parsers';
import { uploadAiContextItem, analyzeAiContextItem, rebuildOrgSummary, generateOnboardingPreFill, processUrlContext } from '@/lib/ai-context/actions';
```

Add the upload step JSX:

```tsx
{step === 'ai-upload' && (
  <div className="max-w-lg mx-auto space-y-6">
    <div>
      <h2 className="text-xl font-bold">Upload Your Context</h2>
      <p className="text-sm text-stone-600 mt-1">
        Share anything about your organization — field guides, species lists, property maps, website URLs, descriptions. The more you provide, the better we can configure your platform.
      </p>
    </div>

    <FileDropZone
      onFilesSelected={setAiFiles}
      onUrlSubmit={async (url) => {
        // URL handling during onboarding — process inline
      }}
      disabled={false}
    />

    <div className="bg-stone-50 rounded-lg p-4 space-y-2 text-xs text-stone-500">
      <p><strong>Your data stays yours</strong> — stored securely in your private storage.</p>
      <p><strong>We never train on your data</strong> — analyzed once to help you get set up.</p>
      <p><strong>Full control</strong> — add, download, or delete files anytime from settings.</p>
    </div>

    <button
      onClick={async () => {
        if (aiFiles.length === 0) return;
        setStep('ai-progress');
        // Start processing — this will be handled in the progress step
      }}
      disabled={aiFiles.length === 0}
      className="btn-primary w-full"
    >
      Analyze {aiFiles.length} file{aiFiles.length !== 1 ? 's' : ''}
    </button>
  </div>
)}
```

- [ ] **Step 6: Add the AI progress step**

This step handles the actual upload + analysis and shows progress:

```tsx
{step === 'ai-progress' && (
  <AiProgressStep
    files={aiFiles}
    batchId={aiBatchId}
    processingItems={aiProcessingItems}
    setProcessingItems={setAiProcessingItems}
    onComplete={async (orgId) => {
      const summaryResult = await rebuildOrgSummary(orgId);
      if ('success' in summaryResult) {
        setAiOrgProfile(summaryResult.summary.org_profile);
        setAiSummaryReady(true);

        // Generate pre-fill
        const preFillResult = await generateOnboardingPreFill(orgId);
        if ('success' in preFillResult) {
          const pf = preFillResult.preFill;
          if (pf.orgName) setOrgName(pf.orgName);
          if (pf.tagline) setTagline(pf.tagline);
          if (pf.locationName) setLocationName(pf.locationName);
          if (pf.lat) setLat(pf.lat);
          if (pf.lng) setLng(pf.lng);
          if (pf.zoom) setZoom(pf.zoom);
          if (pf.themePreset) setThemePreset(pf.themePreset);
          if (pf.itemTypes) setItemTypes(pf.itemTypes);
          if (pf.entityTypes) setEntityTypeSuggestions(pf.entityTypes);
          if (pf.aboutContent) setAboutContent(pf.aboutContent);
          setPreFillApplied(true);
        }
      }
      setStep('ai-review');
    }}
    summaryReady={aiSummaryReady}
    orgProfile={aiOrgProfile}
  />
)}
```

Note: `AiProgressStep` is an inline component within the onboard page that orchestrates the upload → analyze → rebuild flow. It uses the existing `uploadAiContextItem` and `analyzeAiContextItem` server actions. The implementation should follow the same pattern as `handleFilesSelected` from the admin page (Task 9) but with the org being created first (or using a temporary org ID). This is a design consideration — during onboarding, the org doesn't exist yet. The approach should be:

1. Create the org record first (minimal — just name/slug), then upload context against it.
2. Or, upload to a temporary staging area and move after org creation.

Option 1 is simpler. Create the org with a placeholder name first, then update it with AI-suggested values.

- [ ] **Step 7: Add the AI review step**

The review step shows all pre-filled fields in expandable sections:

```tsx
{step === 'ai-review' && (
  <div className="max-w-lg mx-auto space-y-4">
    <h2 className="text-xl font-bold">Review Your Setup</h2>
    <p className="text-sm text-stone-600">
      We&apos;ve pre-filled everything based on your context. Review and adjust anything that doesn&apos;t look right.
    </p>

    {/* Expandable sections for each field group */}
    {/* Name & Location, Theme, Item Types, Entity Types, About */}
    {/* Each section shows pre-filled value with edit capability */}
    {/* Re-use existing form fields from the manual path */}

    <button onClick={handleLaunch} disabled={saving} className="btn-primary w-full">
      {saving ? 'Creating...' : 'Launch Organization'}
    </button>
  </div>
)}
```

The full implementation of the review step should reuse the existing form field components from the manual steps, wrapped in collapsible sections. Each section shows the pre-filled value and allows editing.

- [ ] **Step 8: Run type-check and test**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/app/onboard/page.tsx
git commit -m "feat: integrate AI context upload path into onboarding wizard"
```

---

## Task 12: Wire AI Context Into Existing AI Calls

**Files:**
- Modify: `src/app/onboard/actions.ts` (the `generateEntityTypeSuggestions` function)

- [ ] **Step 1: Update `generateEntityTypeSuggestions` to use org context**

In `src/app/onboard/actions.ts`, update the `generateEntityTypeSuggestions` function to accept and inject org context:

```typescript
import { buildOrgContextBlock } from '@/lib/ai-context/context-provider';
import type { AiContextSummary } from '@/lib/ai-context/types';

// Add orgContext parameter
export async function generateEntityTypeSuggestions(input: {
  orgName: string;
  itemTypes: string[];
  userPrompt: string;
  orgContext?: AiContextSummary | null;
}): Promise<{ success: true; suggestions: EntityTypeSuggestion[] } | { error: string }> {
  // ... existing auth check ...

  const contextBlock = buildOrgContextBlock(input.orgContext ?? null);

  const systemPrompt = `You are helping set up a field mapping platform for "${input.orgName}".
${contextBlock ? `\n${contextBlock}\n` : ''}
The organization tracks these item types: ${input.itemTypes.join(', ')}.
// ... rest of existing prompt ...`;

  // ... rest of existing implementation ...
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/onboard/actions.ts
git commit -m "feat: inject AI context into entity type generation"
```

---

## Task 13: Run Full Build and Integration Verification

- [ ] **Step 1: Run type-check**

Run: `npm run type-check`
Expected: PASS with no errors

- [ ] **Step 2: Run all unit tests**

Run: `npm run test -- --run`
Expected: All tests pass, including new parser and context-provider tests

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Fix any issues found**

Address any type errors, import issues, or build failures.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix: resolve build issues from AI context integration"
```

(Only if there were fixes needed)

---

## Summary

| Task | What it builds | Key files |
|------|---------------|-----------|
| 1 | Database tables, RLS, storage | `014_ai_context.sql` |
| 2 | TypeScript types, permission integration | `types.ts`, `RolePermissions` |
| 3 | Frontend dependencies | `package.json` |
| 4 | Client-side file parsers | `parsers.ts` + tests |
| 5 | AI prompts + context provider | `prompts.ts`, `context-provider.ts` + tests |
| 6 | Server actions + polling API | `actions.ts`, `status/route.ts` |
| 7 | FileDropZone component | `FileDropZone.tsx` |
| 8 | ProcessingProgress component | `ProcessingProgress.tsx` |
| 9 | Admin AI context page + sidebar nav | `admin/ai-context/page.tsx`, `AdminShell.tsx` |
| 10 | AI wizard sidebar panel | `AiContextPanel.tsx` |
| 11 | Onboarding flow integration | `onboard/page.tsx` |
| 12 | Wire context into existing AI calls | `onboard/actions.ts` |
| 13 | Build verification | Full build + test run |
