# Landing Page Feature Spec

## Overview

Add customizable landing pages to Field Mapper that serve as the public entry point for a project site. Landing pages are **AI-generated from a text prompt**, then **editable block-by-block** in an admin UI. They automatically inherit the site's existing theme (CSS variables, colors, fonts) so will they match the rest of the app with zero extra styling work.

The current `/` route (interactive map) moves to `/map`. The new `/` becomes the landing page.

---

## Use Case: Fairbanks Eagle Project

> **Springbrook Creek Preserve Birdhouses**
> By Fairbanks Jackson Troop 1564 ([troop1564.org](https://troop1564.org))
> In collaboration with BI LandTrust ([link])
>
> [Hero image of birdhouse & Fairbanks]
>
> [Description paragraphs: land, wildlife, bird species, small logos, volunteer info]
>
> [Large button → Go to Map]

This drives the block types and layout requirements below.

---

## Architecture

### Data Model

Landing page content is stored as an ordered array of typed blocks in the existing `site_config` table (key: `landing_page`). No new tables needed.

```typescript
// src/lib/config/types.ts additions

interface SiteConfig {
  // ... existing fields ...
  landingPage: LandingPageConfig | null;
}

interface LandingPageConfig {
  enabled: boolean;
  blocks: LandingBlock[];
  generatedFrom?: string; // original prompt, for re-generation
  assets: LandingAsset[];  // uploaded context files and images
}

// -- Assets: files uploaded as context for AI generation & for use in blocks --

interface LandingAsset {
  id: string;           // uuid
  storagePath: string;  // Supabase Storage path (landing-assets/...)
  publicUrl: string;    // resolved public URL for serving
  fileName: string;     // original file name
  mimeType: string;     // e.g. "image/jpeg", "application/pdf"
  category: 'image' | 'document'; // determines how AI + blocks can use it
  description?: string; // admin-provided label (used as AI context + alt text)
  uploadedAt: string;   // ISO timestamp
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

// -- Block definitions --

interface BlockBase {
  id: string;        // uuid for stable keys/reorder
  type: string;
}

interface HeroBlock extends BlockBase {
  type: 'hero';
  title: string;
  subtitle?: string;
  backgroundImageUrl?: string; // Supabase Storage path
  overlay?: boolean;           // darken image for text readability
}

interface TextBlock extends BlockBase {
  type: 'text';
  content: string;  // markdown
  alignment?: 'left' | 'center';
}

interface ImageBlock extends BlockBase {
  type: 'image';
  url: string;       // Supabase Storage path or external URL
  alt: string;
  caption?: string;
  width?: 'small' | 'medium' | 'full'; // max-w constraint
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
  source: 'manual' | 'auto';  // auto = pull from DB at render time
  items?: { label: string; value: string }[]; // manual mode
  // auto mode pulls: total items, item types count, total updates, species count
}

interface GalleryBlock extends BlockBase {
  type: 'gallery';
  images: { url: string; alt: string; caption?: string }[];
  columns?: 2 | 3 | 4;
}

interface SpacerBlock extends BlockBase {
  type: 'spacer';
  size: 'small' | 'medium' | 'large'; // py-4, py-8, py-16
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

- **Images** (jpeg, png, webp, gif, svg): Stored and served publicly via Supabase Storage CDN. Can be referenced directly in Image/Hero/Gallery blocks via their `publicUrl`. Also sent to Claude as image content blocks during AI generation.
- **Documents** (pdf, txt, md, docx): Stored for AI context only. During generation, text-extractable files (txt, md) have their content read and included in the prompt. PDFs have their text extracted server-side. These are NOT rendered on the public landing page, but their content informs what the AI writes.
- **Links** (URLs provided by admin): Stored as part of the generation prompt context. Not fetched — just passed as text for the AI to reference and incorporate into link/text blocks.
- **Max file size**: 10MB per file (images resized to 2000px max dimension before upload, reusing existing `resizeImage()` util)
- **RLS**: Public SELECT on `landing-assets` bucket (images need to be publicly viewable). INSERT/DELETE restricted to admin role.

---

## Routing Changes

| Route | Before | After |
|---|---|---|
| `/` | Interactive map | Landing page (if enabled) OR map (if disabled/no landing page) |
| `/map` | N/A | Interactive map (always available) |
| `/about` | About page | Unchanged |

### Implementation

**`src/app/page.tsx`** — New landing page renderer. If `landingPage.enabled` is false or null, render the map inline (preserving current behavior, no redirect).

**`src/app/map/page.tsx`** — Move current `page.tsx` map logic here.

**Middleware** — No changes needed. `/map` is a public route like `/`.

**Navigation** — Add "Map" to nav when landing page is enabled. Currently the nav logo/home links to `/`; when landing page is active, add an explicit "Map" link.

---

## Block Renderer Components

Each block type gets a simple, presentable React component that uses Tailwind + the existing CSS variable theme system.

```
src/components/landing/
  LandingRenderer.tsx       // maps block[] → components
  blocks/
    HeroBlock.tsx
    TextBlock.tsx            // uses react-markdown
    ImageBlock.tsx
    ButtonBlock.tsx
    LinksBlock.tsx
    StatsBlock.tsx           // auto mode: server component fetches counts
    GalleryBlock.tsx
    SpacerBlock.tsx
```

### Theme Integration

All block components use the existing CSS variable classes (`text-forest-dark`, `bg-forest-dark`, etc.) and Tailwind's `var()` references. This means:

- Blocks automatically match whatever theme preset the admin selected (forest, ocean, desert, etc.)
- No per-block color configuration needed
- The hero block uses `bg-[var(--color-primary-dark)]` for overlay, buttons use `bg-[var(--color-primary)]`, etc.
- If the admin changes the site theme, the landing page updates instantly

### `react-markdown` Dependency

Add `react-markdown` + `remark-gfm` for rendering TextBlock markdown. This also improves the existing `/about` page which currently does naive line splitting (see `src/app/about/page.tsx:15-30`).

---

## AI Generation Flow

### Admin UI: `/admin/landing`

The admin editor has three sections above the block list:

#### 1. Context Attachments (top section)

Before or during generation, the admin can attach context that informs what the AI generates:

- **Images**: Upload photos (hero shots, logos, wildlife photos, team photos). These are:
  - Stored in Supabase Storage (`landing-assets/images/`)
  - Sent to Claude as **image content blocks** so the AI can see them and write relevant descriptions
  - Available in a picker when editing Image/Hero/Gallery blocks (no re-upload needed)
  - Admin adds an optional description per image (e.g., "Troop 1564 installing birdhouse #4")
- **Documents**: Upload PDFs, text files, markdown files. These are:
  - Stored in Supabase Storage (`landing-assets/documents/`)
  - Text content extracted and included in the AI prompt as context
  - NOT rendered on the public page — just used to inform AI-generated text
  - Useful for: project proposals, species lists, grant descriptions, org bylaws
- **Links**: Add reference URLs with labels. These are:
  - Passed as text in the AI prompt (e.g., "Partner org: BI Land Trust — https://bilandtrust.org")
  - AI incorporates them into LinksBlock items or inline markdown links
  - NOT fetched/scraped — just provided as-is for the AI to reference

All attachments persist across regenerations (stored in `LandingPageConfig.assets`). The admin can add/remove attachments and regenerate to get updated output.

#### 2. Prompt (middle section)

Text area: "Describe your landing page"

Example placeholder: *"Landing page for Springbrook Creek Preserve birdhouse project by Boy Scout Troop 1564, in collaboration with BI Land Trust. Include hero with project title, description of the preserve and wildlife, and a button to view the map."*

**Generate** button (or **Regenerate** if blocks exist, with confirmation).

#### 3. Block Editor (below)

After generation, the block list appears for editing (see Per-Block Edit Forms below).

### Generation Flow

1. Admin uploads context attachments (images, documents, links) — optional but recommended
2. Admin writes a text prompt describing the desired landing page
3. Admin clicks **Generate**
4. Server action:
   a. Reads site config (siteName, tagline, locationName, item types, species, etc.)
   b. Reads uploaded image assets → converts to Claude image content blocks
   c. Reads uploaded document assets → extracts text content
   d. Collects reference links
   e. Calls Claude API with all context + prompt + block schema
5. Claude returns structured block JSON, with image blocks referencing uploaded asset IDs
6. Blocks render in live preview
7. Admin edits blocks, uploads replacement images, tweaks text, reorders
8. Admin clicks **Save / Publish**

### Claude API Prompt Structure

```typescript
// Server action: src/app/admin/landing/actions.ts

async function generateLandingPage(
  userPrompt: string,
  assets: LandingAsset[],
  referenceLinks: { label: string; url: string }[]
) {
  const config = await getConfig();
  const supabase = createServiceClient();

  // Gather site context
  const [itemCount, typeRes, speciesCount] = await Promise.all([
    supabase.from('items').select('id', { count: 'exact', head: true }),
    supabase.from('item_types').select('name'),
    supabase.from('species').select('id', { count: 'exact', head: true }),
  ]);

  // --- Build context from attachments ---

  // Images: download from storage and convert to base64 for Claude vision
  const imageAssets = assets.filter(a => a.category === 'image');
  const imageContentBlocks = [];
  for (const img of imageAssets) {
    const { data } = await supabase.storage
      .from('landing-assets')
      .download(img.storagePath);
    if (data) {
      const base64 = Buffer.from(await data.arrayBuffer()).toString('base64');
      imageContentBlocks.push({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: img.mimeType,
          data: base64,
        },
      });
      // Add description as text context right after the image
      if (img.description) {
        imageContentBlocks.push({
          type: 'text' as const,
          text: `[Image above: ${img.description}] (asset id: ${img.id})`,
        });
      }
    }
  }

  // Documents: extract text content for context
  const docAssets = assets.filter(a => a.category === 'document');
  let documentContext = '';
  for (const doc of docAssets) {
    const { data } = await supabase.storage
      .from('landing-assets')
      .download(doc.storagePath);
    if (data) {
      if (doc.mimeType === 'text/plain' || doc.mimeType === 'text/markdown') {
        const text = await data.text();
        documentContext += `\n--- Document: ${doc.fileName} ---\n${text}\n`;
      }
      // PDF text extraction would use a lightweight lib (pdf-parse) or
      // skip for MVP and just note the filename
    }
  }

  // Reference links
  const linkContext = referenceLinks.length > 0
    ? '\nReference links:\n' + referenceLinks
        .map(l => `- ${l.label}: ${l.url}`)
        .join('\n')
    : '';

  const systemPrompt = `You are a landing page designer for a field mapping application.
Generate a JSON array of content blocks for a landing page.

SITE CONTEXT:
- Name: "${config.siteName}"
- Location: "${config.locationName}"
- Tagline: "${config.tagline}"
- Tracks ${itemCount.count} items across types: ${typeRes.data?.map(t => t.name).join(', ')}
- ${speciesCount.count} species tracked
${linkContext}
${documentContext ? '\nDOCUMENT CONTEXT:\n' + documentContext : ''}

AVAILABLE IMAGES (use these asset IDs in image/hero/gallery blocks):
${imageAssets.map(img => `- id: "${img.id}" — ${img.description || img.fileName}`).join('\n') || '(none uploaded)'}

Output ONLY a valid JSON array of blocks matching this schema:
${BLOCK_SCHEMA_JSON}

Guidelines:
- Start with a hero block with a compelling title
- Include descriptive text blocks with markdown
- Add a prominent button block linking to "/map"
- Use a stats block with source:"auto" to show live project numbers
- Keep it concise: 4-8 blocks total
- For image/hero/gallery blocks, set url to the asset ID from AVAILABLE IMAGES above
  (the system will resolve these to public URLs). If no images are available,
  use url:"placeholder" and the admin will upload later.
- Incorporate reference links naturally into links blocks or inline markdown
- Use document context to write accurate, detailed descriptions`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        // Send images first so Claude can see them
        ...imageContentBlocks,
        // Then the user's prompt
        { type: 'text', text: userPrompt },
      ],
    }],
  });

  // Parse, validate, and resolve asset IDs to public URLs
  const blocks = JSON.parse(extractJSON(response.content[0].text));
  return resolveAssetUrls(addBlockIds(blocks), assets);
}

/** Replace asset IDs in block urls with actual Supabase public URLs */
function resolveAssetUrls(blocks: LandingBlock[], assets: LandingAsset[]): LandingBlock[] {
  const assetMap = new Map(assets.map(a => [a.id, a.publicUrl]));
  return blocks.map(block => {
    if ('url' in block && assetMap.has(block.url)) {
      return { ...block, url: assetMap.get(block.url)! };
    }
    if (block.type === 'hero' && block.backgroundImageUrl && assetMap.has(block.backgroundImageUrl)) {
      return { ...block, backgroundImageUrl: assetMap.get(block.backgroundImageUrl)! };
    }
    if (block.type === 'gallery') {
      return {
        ...block,
        images: block.images.map(img =>
          assetMap.has(img.url) ? { ...img, url: assetMap.get(img.url)! } : img
        ),
      };
    }
    return block;
  });
}
```

### API Key

Uses `ANTHROPIC_API_KEY` env var (added to Vercel). The `@anthropic-ai/sdk` package is server-side only (used in server action), adds zero client bundle weight.

---

## Admin Editor UI

### `/admin/landing/page.tsx`

Layout: **Two-column on desktop** — editor panel (left), live preview (right).

#### Editor Panel

1. **Generate section** (top) — text area + "Generate" button + "Regenerate" button (if blocks exist)
2. **Block list** — vertical list of blocks, each showing:
   - Block type icon + label
   - Collapsed summary (title for hero, first line for text, etc.)
   - Expand to edit block-specific fields
   - Drag handle for reorder (Phase 2: `@dnd-kit`; Phase 1: up/down arrow buttons)
   - Delete button (with confirmation)
3. **Add block** — dropdown button at bottom to add a new block of any type
4. **Save / Publish** — saves block JSON to `site_config`

#### Per-Block Edit Forms

| Block Type | Editable Fields |
|---|---|
| Hero | title (text input), subtitle (text input), background image (**asset picker** or new upload), overlay toggle |
| Text | content (textarea with markdown preview) |
| Image | **asset picker** (choose from uploaded assets) or new upload or URL input, alt text, caption, width select |
| Button | label, href, style select (primary/outline), size select |
| Links | add/remove link items, each with label + URL + optional description |
| Stats | toggle auto/manual, manual items editor |
| Gallery | **multi-asset picker** or multi-upload, captions, column count select |
| Spacer | size select (small/medium/large) |

#### Asset Picker Component

When editing Image/Hero/Gallery blocks, an **asset picker** modal shows all uploaded image assets as a thumbnail grid. The admin can:
- Select an existing asset (one click to use it)
- Upload a new image (added to assets and immediately selected)
- Enter an external URL instead

This means images uploaded as AI context are directly reusable in blocks — no re-uploading.

#### Live Preview

Right column renders `<LandingRenderer blocks={blocks} />` in real-time as the admin edits. Uses the same components as the public page.

---

## Implementation Phases

### Phase 1: Core (MVP)

**New dependencies:** `react-markdown`, `remark-gfm`, `@anthropic-ai/sdk`

| Task | Files |
|---|---|
| Add `LandingPageConfig` + `LandingAsset` types | `src/lib/config/types.ts` |
| Add `landing_page` to config key map + defaults | `src/lib/config/types.ts`, `src/lib/config/defaults.ts` |
| Create `landing-assets` Supabase Storage bucket + RLS | SQL migration |
| Block renderer components (8 blocks) | `src/components/landing/*.tsx` |
| Landing page route (`/`) with conditional rendering | `src/app/page.tsx` (refactor) |
| Move map to `/map` | `src/app/map/page.tsx` (move existing logic) |
| Update navigation links | `src/components/layout/Navigation.tsx` |
| Asset upload UI (images + documents + reference links) | `src/components/admin/landing/AssetManager.tsx` |
| Asset picker component for block editing | `src/components/admin/landing/AssetPicker.tsx` |
| AI generation server action (with attachment context) | `src/app/admin/landing/actions.ts` |
| Admin editor page (attachments + generate + edit blocks) | `src/app/admin/landing/page.tsx` + sub-components |
| Block reorder with up/down buttons | Built into editor |
| Upgrade `/about` page to use `react-markdown` | `src/app/about/page.tsx` |

### Phase 2: Polish

- Drag-and-drop block reorder (`@dnd-kit/sortable`)
- Block duplication
- Undo/redo (editor state history)
- Mobile-responsive preview toggle (iframe with viewport simulation)
- SEO metadata per landing page (og:image, description)

### Phase 3: Multi-page (future)

- Multiple landing pages for different audiences/campaigns
- Custom URL slugs (`/welcome`, `/scout-project`, etc.)
- Landing page templates (save/load block configurations)
- Public sharing / embed support

---

## Fairbanks Eagle Project — Expected Workflow

### Step 1: Upload Context Attachments

The admin uploads:
- **Images**: Photo of Fairbanks with birdhouse, Springbrook Creek Preserve landscape, Troop 1564 logo, BI Land Trust logo
- **Documents**: A short text file describing the preserve's ecology and the eagle scout project goals
- **Links**: `https://troop1564.org` (labeled "Troop 1564"), `https://bilandtrust.org` (labeled "BI Land Trust")

### Step 2: Write Prompt

> "Landing page for Springbrook Creek Preserve birdhouse monitoring project by Fairbanks Jackson Boy Scout Troop 1564 in collaboration with Bainbridge Island Land Trust. Use the preserve photo as hero background. Include project description based on the uploaded document, partner links, and a big button to view the map."

### Step 3: AI Generates Blocks

Claude sees the uploaded images, reads the document text, and knows about the reference links. It generates:

```json
[
  {
    "type": "hero",
    "title": "Springbrook Creek Preserve Birdhouses",
    "subtitle": "By Fairbanks Jackson Troop 1564 · In collaboration with BI Land Trust"
  },
  {
    "type": "image",
    "url": "placeholder",
    "alt": "Birdhouse at Springbrook Creek Preserve",
    "width": "full"
  },
  {
    "type": "text",
    "content": "The Springbrook Creek Preserve is home to a diverse ecosystem..."
  },
  {
    "type": "links",
    "items": [
      { "label": "Troop 1564", "url": "https://troop1564.org", "description": "Fairbanks Jackson Boy Scout Troop" },
      { "label": "BI Land Trust", "url": "https://bilandtrust.org", "description": "Bainbridge Island Land Trust" }
    ],
    "layout": "inline"
  },
  {
    "type": "stats",
    "source": "auto"
  },
  {
    "type": "button",
    "label": "Explore the Map",
    "href": "/map",
    "style": "primary",
    "size": "large"
  }
]
```

### Step 4: Admin Edits

- The hero background was auto-set to the preserve landscape photo (from uploaded assets)
- The text block content is based on the uploaded ecology document — admin tweaks wording
- The links block already has the correct URLs from the reference links
- Admin adds the Troop 1564 logo to a gallery block using the asset picker
- Admin reorders blocks, adjusts spacing, and publishes

---

## Security Considerations

- AI generation runs server-side only (API key never exposed to client)
- Block JSON is sanitized before save (no script injection in markdown/HTML)
- `react-markdown` does NOT render raw HTML by default (safe against XSS)
- Image uploads go through Supabase Storage (existing RLS policies apply)
- Landing page editing requires admin role (existing middleware protects `/admin/*`)

## Performance Considerations

- Landing page is server-rendered (Next.js RSC) — fast initial load
- `StatsBlock` with `source: "auto"` fetches counts server-side at render time (cached via `getConfig()` pattern)
- Images served from Supabase Storage CDN
- No client-side JS needed for public landing page (all blocks are static/presentational)
- `react-markdown` adds ~14kb gzipped to pages that use it
