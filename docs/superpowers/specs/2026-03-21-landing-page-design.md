# Landing Page Feature Spec

## Overview

Add customizable landing pages to Field Mapper that serve as the public entry point for a project site. Landing pages are **AI-generated from a text prompt** (via Vercel AI SDK + Claude), then **editable block-by-block** in an admin UI. They automatically inherit the site's existing theme (CSS variables, colors, fonts) so they match the rest of the app with zero extra styling work.

The current `/` route (interactive map) moves to `/map`. The new `/` becomes the landing page. A **default landing page is auto-generated at setup time** using existing site config (siteName, tagline, locationName), so every site gets a landing page immediately with zero extra work. The admin can toggle the homepage between landing page and map.

---

## Use Case: Fairbanks Eagle Project

> **Springbrook Creek Preserve Birdhouses**
> By Fairbanks Jackson Troop 1564 · In collaboration with BI Land Trust
>
> [Hero image of birdhouse & Fairbanks]
> [Description paragraphs: land, wildlife, bird species]
> [Live stats: 24 Birdhouses · 8 Species · 142 Updates]
> [Large button → Explore the Map]

---

## Architecture

### Data Model

Landing page content is stored as an ordered array of typed blocks in the existing `site_config` table (key: `landing_page`). No new tables needed.

```typescript
interface SiteConfig {
  // ... existing fields ...
  landingPage: LandingPageConfig | null;
}

interface LandingPageConfig {
  enabled: boolean;             // true = / shows landing page; false = / shows map
  blocks: LandingBlock[];
  generatedFrom?: string;       // original prompt, for re-generation
  assets: LandingAsset[];       // uploaded context files and images
}

interface LandingAsset {
  id: string;                   // uuid
  storagePath: string;          // Supabase Storage path (landing-assets/...)
  publicUrl: string;            // resolved public URL for serving
  fileName: string;             // original file name
  mimeType: string;             // e.g. "image/jpeg", "application/pdf"
  category: 'image' | 'document';
  description?: string;         // admin-provided label (AI context + alt text)
  uploadedAt: string;           // ISO timestamp
}

type LandingBlock =
  | HeroBlock
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | LinksBlock
  | StatsBlock
  | GalleryBlock
  | SpacerBlock;

interface BlockBase {
  id: string;        // uuid for stable keys/reorder
  type: string;
}

interface HeroBlock extends BlockBase {
  type: 'hero';
  title: string;
  subtitle?: string;
  backgroundImageUrl?: string;
  overlay?: boolean;
}

interface TextBlock extends BlockBase {
  type: 'text';
  content: string;              // markdown
  alignment?: 'left' | 'center';
}

interface ImageBlock extends BlockBase {
  type: 'image';
  url: string;
  alt: string;
  caption?: string;
  width?: 'small' | 'medium' | 'full';
}

interface ButtonBlock extends BlockBase {
  type: 'button';
  label: string;
  href: string;
  style?: 'primary' | 'outline';
  size?: 'default' | 'large';
}

interface LinksBlock extends BlockBase {
  type: 'links';
  items: { label: string; url: string; description?: string }[];
  layout?: 'inline' | 'stacked';
}

interface StatsBlock extends BlockBase {
  type: 'stats';
  source: 'manual' | 'auto';
  items?: { label: string; value: string }[];
}

interface GalleryBlock extends BlockBase {
  type: 'gallery';
  images: { url: string; alt: string; caption?: string }[];
  columns?: 2 | 3 | 4;
}

interface SpacerBlock extends BlockBase {
  type: 'spacer';
  size: 'small' | 'medium' | 'large';
}
```

### Storage

| What | Where |
|---|---|
| Block JSON + asset metadata | `site_config` table, key `landing_page`, value is `LandingPageConfig` |
| Uploaded images (for blocks) | Supabase Storage `landing-assets/images/` prefix |
| Uploaded documents (context) | Supabase Storage `landing-assets/documents/` prefix |
| Config caching | Existing `getConfig()` 60s cache + `revalidateTag('site-config')` on save |

No new DB tables. A single `landing-assets` Supabase Storage bucket with `images/` and `documents/` prefixes. The existing `site_config` JSONB column handles the block array + asset metadata.

#### Asset Storage Details

- **Images** (jpeg, png, webp, gif, svg): Stored and served publicly via Supabase Storage CDN. Referenced directly in Image/Hero/Gallery blocks via `publicUrl`. Sent to Claude as image content blocks during AI generation.
- **Documents** (pdf, txt, md): Stored for AI context only. Text-extractable files have content read and included in the prompt. NOT rendered on the public landing page.
- **Links** (URLs provided by admin): Stored as part of generation prompt context. Not fetched — passed as text for AI to reference and incorporate.
- **Max file size**: 10MB per file, images resized to 2000px max dimension client-side before upload (reusing existing `resizeImage()` util from `src/lib/utils.ts` which uses browser Canvas API). No server-side image resizing needed — images are uploaded at final size.
- **Limits**: Max 50 blocks per landing page, max 20 assets. These are soft limits enforced in the admin UI to keep the `site_config` JSONB value reasonable.
- **RLS**: Public SELECT on `landing-assets` bucket. INSERT/DELETE restricted to admin role.

#### Asset Deletion Behavior

Assets can be deleted even if referenced by blocks. Blocks referencing deleted assets render gracefully:
- **Editor**: Shows placeholder with warning badge indicating the image was removed
- **Public page**: Skips rendering empty/broken image URLs (no broken img tags)

This allows a natural workflow: delete old image → upload replacement → pick it in the affected blocks.

---

## Routing Changes

| Route | Before | After |
|---|---|---|
| `/` | Interactive map | Landing page (if enabled) OR map (if disabled/no landing page) |
| `/map` | N/A | Interactive map (always available when landing page is enabled) |
| `/?item=123` | Deep-link to item on map | Redirects to `/map?item=123` |
| `/about` | About page | Unchanged |

### Homepage Toggle

The admin can choose what `/` displays:
- **Landing Page** (default when landing page exists) — `/` shows the landing page, map at `/map`
- **Map** — `/` shows the interactive map directly (current behavior), `/map` route not needed

This is controlled by `landingPage.enabled` and surfaced in the admin UI as a clear toggle at the top of `/admin/landing`.

### Implementation

**`src/app/page.tsx`** — New **server component** landing page renderer:
1. If URL has any query params (e.g., `?item=123&zoom=15`) → redirect to `/map?...` with all params preserved (uses `searchParams` prop from Next.js page, not `useSearchParams()` hook)
2. If `landingPage.enabled` is true → render `LandingRenderer` with blocks (server component, no client JS)
3. If `landingPage` is null/disabled → render map via a **client component wrapper** (the existing map logic uses `useSearchParams()`, dynamic imports, and client state — this moves to a `HomeMapView` client component imported by the server page)

**`src/app/map/page.tsx`** — Receives current `page.tsx` map logic as a client component page. Same structure as current home page.

**Navigation** — When landing page is enabled: **Home** (/) | **Map** (/map) | **List** (/list) | **About** (/about). When disabled: **Map** (/) | **List** (/list) | **About** (/about) — same as today. Admin sidebar gets **Landing Page** link.

---

## Block Renderer Components

Each block type gets a React component using Tailwind + the existing CSS variable theme system.

```
src/components/landing/
  LandingRenderer.tsx       // maps block[] → components
  blocks/
    HeroBlock.tsx
    TextBlock.tsx            // uses react-markdown + remark-gfm
    ImageBlock.tsx
    ButtonBlock.tsx
    LinksBlock.tsx
    StatsBlock.tsx           // auto mode: server component fetches counts
    GalleryBlock.tsx
    SpacerBlock.tsx
```

### Theme Integration

All block components use the **theme-agnostic CSS variable classes** defined in `tailwind.config.ts` — e.g., `text-primary`, `text-primary-dark`, `bg-accent`, `bg-parchment`, `text-sage`. These map to CSS variables (`var(--color-primary)`, etc.) that resolve to different colors per theme preset. Do NOT use preset-specific class names like `text-forest-dark` — use `text-primary-dark` instead. This ensures blocks work correctly across all theme presets (forest, ocean, desert, urban, arctic, meadow). No per-block color configuration needed. If the admin changes the site theme, the landing page updates instantly.

### StatsBlock Auto Mode — Smart Filtering

When `source: "auto"`, the StatsBlock is a **server component** that fetches live counts directly from the database via Supabase queries (not via `getConfig()` — these are DB aggregates, not config values). Counts are cached with a 60-second `unstable_cache` using a `'landing-stats'` tag, revalidated alongside site config on admin saves.

Counts fetched: total items, item types count, total updates, species count.
- **Only shows stats where count > 0**
- **If fewer than 2 stats qualify, the block is hidden on the public page** (still visible in editor with a note)
- This prevents new/small sites from showing underwhelming numbers

### react-markdown Dependency

Add `react-markdown` + `remark-gfm` for TextBlock markdown rendering. Also upgrades the existing `/about` page which currently does naive line splitting.

---

## AI Generation Flow

### Vercel AI SDK with `generateObject()`

Uses the Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) instead of the direct Anthropic SDK. Key advantage: `generateObject()` with a Zod schema returns typed, validated block JSON directly — no manual JSON parsing or `extractJSON()` hacks needed.

### Generation Pipeline

1. **Gather site context** — siteName, tagline, locationName, item counts, species count, item types
2. **Process attachments**:
   - Images → download from storage → base64 → image content parts for Claude
   - Documents → download → extract text (txt/md directly; PDFs: skip text extraction for MVP, include filename as context only)
   - Links → format as text context
3. **Build prompt** — system prompt with site context, document text, image asset IDs, block Zod schema, guidelines (including: generate descriptive alt text for all image blocks for accessibility). User message with image content parts + admin's text prompt.
4. **Call `generateObject()`** — claude-sonnet-4-6, Zod schema for block array, max_tokens: 2000
5. **Post-process** — add UUIDs to blocks, resolve asset IDs → public URLs

### Default Landing Page (Auto-Generated at Setup)

No AI call needed. Created during the setup wizard using existing config values:

```json
[
  { "type": "hero", "title": "{siteName}", "subtitle": "{tagline}" },
  { "type": "text", "content": "Welcome to {siteName} at {locationName}..." },
  { "type": "stats", "source": "auto" },
  { "type": "button", "label": "Explore the Map", "href": "/map", "style": "primary", "size": "large" }
]
```

#### New Sites vs. Existing Sites

- **New sites**: Default landing page is created during the setup wizard alongside other initial config. `enabled: true` — the landing page is immediately active.
- **Existing sites (migration path)**: When `getConfig()` returns a config where `landingPage` is null (site was set up before this feature), it backfills with a default landing page config with `enabled: false`. This means existing sites continue showing the map at `/` with no disruption. The admin can visit `/admin/landing` to enable and customize it.

### Regeneration Behavior

- **Regenerate** replaces all current blocks after a confirmation dialog
- **Previous blocks are stashed in component state** before replacement
- **"Undo Regeneration" button** appears after regeneration — one click restores previous blocks
- The original prompt is pre-filled so the admin can tweak and regenerate
- **On failure** (API error, timeout): error toast + "Try Again" button. No partial state saved. Previous blocks are NOT lost on failed regeneration.

### API Key

Uses `ANTHROPIC_API_KEY` env var (added to Vercel). The `ai` + `@ai-sdk/anthropic` packages are server-side only, zero client bundle weight.

---

## Admin Editor UI

### `/admin/landing/page.tsx`

Layout: **Two-column on desktop** — editor panel (left), live preview (right). On mobile: single column with editor/preview tab toggle.

#### Editor Panel (top to bottom)

1. **Homepage toggle** — Landing Page vs Map selector at top. Controls `landingPage.enabled`.

2. **Context Attachments** — images (thumbnail grid + upload), documents (file chips + upload), reference links (label + URL pairs). All persist across regenerations. Used as AI context during generation and available in the asset picker for blocks.

3. **AI Generation** — text area with prompt, Generate button (first time) or Regenerate button (with confirmation + undo). Prompt pre-filled with `generatedFrom` value.

4. **Block list** — vertical list of blocks, each showing:
   - Block type badge + collapsed summary
   - Expand to edit block-specific fields (see below)
   - Up/down arrow buttons for reorder (Phase 1; drag-and-drop in Phase 2)
   - Delete button with confirmation

5. **Add block** — dropdown at bottom to add a new block of any type

6. **Save & Publish** — saves block JSON to `site_config` with cache invalidation

#### Per-Block Edit Forms

| Block Type | Editable Fields |
|---|---|
| Hero | title, subtitle, background image (asset picker or upload), overlay toggle |
| Text | content (plain textarea, markdown, live preview in right panel) |
| Image | asset picker / upload / URL input, alt text, caption, width select |
| Button | label, href, style (primary/outline), size (default/large) |
| Links | add/remove items (label + URL + optional description) |
| Stats | toggle auto/manual, manual items editor |
| Gallery | multi-asset picker / multi-upload, captions, column count |
| Spacer | size select (small/medium/large) |

#### Asset Picker Modal

When editing Image/Hero/Gallery blocks, a modal shows all uploaded image assets as a thumbnail grid:
- Select an existing asset (one click)
- Upload a new image (added to assets and immediately selected)
- Enter an external URL instead

Images uploaded as AI context are directly reusable in blocks — no re-uploading.

#### Live Preview

Right column renders `<LandingRenderer blocks={blocks} />` in real-time as the admin edits. Uses the same components as the public page.

---

## Security Considerations

- AI generation runs server-side only (API key never exposed to client)
- Block JSON validated via Zod schema before save (prevents malformed data)
- `react-markdown` does NOT render raw HTML by default (safe against XSS)
- Image uploads go through Supabase Storage with RLS policies
- Landing page editing requires admin role (existing middleware protects `/admin/*`)
- Max 10MB per uploaded file, images resized before upload

## Performance Considerations

- Landing page is server-rendered (Next.js RSC) — fast initial load
- No client-side JS needed for public landing page (all blocks are static/presentational)
- StatsBlock `auto` mode fetches counts server-side via own `unstable_cache` (60s, `'landing-stats'` tag)
- Images served from Supabase Storage CDN
- `react-markdown` adds ~14kb gzipped to pages that use it
- `ai` + `@ai-sdk/anthropic` are server-only — zero client bundle impact

---

## New Dependencies

| Package | Purpose | Bundle Impact |
|---|---|---|
| `ai` | Vercel AI SDK core | Server-only |
| `@ai-sdk/anthropic` | Anthropic provider for Vercel AI SDK | Server-only |
| `react-markdown` | Markdown rendering for TextBlocks | ~14kb gzipped |
| `remark-gfm` | GitHub-flavored markdown support | ~2kb gzipped |

`zod` is likely already available as a transitive dependency; verify and add explicitly if needed.

### Optional Field Defaults

When optional block fields are omitted, renderer components apply these defaults:
- `TextBlock.alignment` → `'left'`
- `ImageBlock.width` → `'medium'`
- `ButtonBlock.style` → `'primary'`
- `ButtonBlock.size` → `'default'`
- `LinksBlock.layout` → `'stacked'`
- `GalleryBlock.columns` → `3`
- `HeroBlock.overlay` → `true`

---

## Implementation Phases

### Phase 1: Core (MVP)

| # | Task | Key Files |
|---|---|---|
| 1 | Add `LandingPageConfig`, `LandingAsset`, block types | `src/lib/config/types.ts` |
| 2 | Add `landing_page: 'landingPage'` to `CONFIG_KEY_MAP` + `landingPage: null` to `DEFAULT_CONFIG` | `src/lib/config/types.ts`, `src/lib/config/defaults.ts` |
| 3 | Backfill logic for existing sites (lazy init on config load) | `src/lib/config/server.ts` |
| 4 | Create `landing-assets` Supabase Storage bucket + RLS | SQL migration |
| 5 | Default landing page generation in setup wizard | `src/app/setup/` |
| 6 | Block renderer components (8 blocks) with theme integration | `src/components/landing/*.tsx` |
| 7 | Move map logic to `/map` route | `src/app/map/page.tsx` |
| 8 | Rewrite `/` as landing page renderer with map fallback + `?item=` forwarding | `src/app/page.tsx` |
| 9 | Update navigation (conditional Home/Map links, admin link) | `src/components/layout/Navigation.tsx` |
| 10 | Asset upload/management UI | `src/components/admin/landing/AssetManager.tsx` |
| 11 | Asset picker component for block editing | `src/components/admin/landing/AssetPicker.tsx` |
| 12 | AI generation server action (Vercel AI SDK + `generateObject()`) | `src/app/admin/landing/actions.ts` |
| 13 | Admin editor page (two-column, blocks, preview, regenerate + undo) | `src/app/admin/landing/page.tsx` + sub-components |
| 14 | Upgrade `/about` page to use `react-markdown` | `src/app/about/page.tsx` |

### Phase 2: Polish

- Drag-and-drop block reorder (`@dnd-kit/sortable`)
- Block duplication
- Markdown toolbar for TextBlock editing
- Mobile-responsive preview toggle in editor (iframe with viewport simulation)
- SEO metadata per landing page (og:image, description)

### Phase 3: Multi-page (Future)

- Multiple landing pages for different audiences/campaigns
- Custom URL slugs (`/welcome`, `/scout-project`, etc.)
- Landing page templates (save/load block configurations)

---

## Example Workflow: Fairbanks Eagle Project

### Step 1: Upload Context Attachments

- **Images**: Preserve landscape, birdhouse photo, Troop 1564 logo, BI Land Trust logo
- **Documents**: Text file describing the preserve's ecology and eagle scout project goals
- **Links**: `troop1564.org` (Troop 1564), `bilandtrust.org` (BI Land Trust)

### Step 2: Write Prompt

> "Landing page for Springbrook Creek Preserve birdhouse monitoring project by Fairbanks Jackson Boy Scout Troop 1564 in collaboration with Bainbridge Island Land Trust. Use the preserve photo as hero background. Include project description based on the uploaded document, partner links, and a big button to view the map."

### Step 3: AI Generates Blocks

Claude sees uploaded images, reads document text, knows about reference links. Returns typed block array via `generateObject()`.

### Step 4: Admin Edits

- Hero background auto-set to preserve landscape (from uploaded assets)
- Text block content based on ecology document — admin tweaks wording
- Links block has correct URLs from reference links
- Admin reorders, adjusts spacing, publishes
