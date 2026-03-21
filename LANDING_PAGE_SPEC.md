# Landing Page Feature Spec

## Overview

Add customizable landing pages to Field Mapper that serve as the public entry point for a project site. Landing pages are **AI-generated from a text prompt**, then **editable block-by-block** in an admin UI. They automatically inherit the site's existing theme (CSS variables, colors, fonts) so they match the rest of the app with zero extra styling work.

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
| Block JSON | `site_config` table, key `landing_page`, value is `LandingPageConfig` |
| Uploaded images | Supabase Storage `landing` bucket, referenced by path in block data |
| Config caching | Existing `getConfig()` 60s cache + `revalidateTag('site-config')` on save |

No new DB tables. No new storage buckets beyond a folder prefix. The existing `site_config` JSONB column handles the block array.

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

1. Admin sees a text area: "Describe your landing page"
2. Example placeholder: *"Landing page for Springbrook Creek Preserve birdhouse project by Boy Scout Troop 1564, in collaboration with BI Land Trust. Include hero with project title, description of the preserve and wildlife, and a button to view the map."*
3. Admin clicks **Generate**
4. Server action calls Claude API with:
   - The user's prompt
   - The site's current config (siteName, tagline, locationName, item types, species count, etc.) for context
   - The block schema (as a JSON schema / TypeScript types)
   - Instruction to output valid `LandingBlock[]` JSON
5. Claude returns structured block JSON
6. Blocks render in a live preview
7. Admin can then **edit individual blocks**, **reorder**, **add/remove blocks**, **upload images**, and **re-generate**

### Claude API Prompt Structure

```typescript
// Server action: src/app/admin/landing/actions.ts

async function generateLandingPage(userPrompt: string) {
  const config = await getConfig();
  const supabase = createServiceClient();

  // Gather site context for the AI
  const [itemCount, typeRes, speciesCount] = await Promise.all([
    supabase.from('items').select('id', { count: 'exact', head: true }),
    supabase.from('item_types').select('name'),
    supabase.from('species').select('id', { count: 'exact', head: true }),
  ]);

  const systemPrompt = `You are a landing page designer for a field mapping application.
Generate a JSON array of content blocks for a landing page.
The site is called "${config.siteName}" located at "${config.locationName}".
Tagline: "${config.tagline}"
The site tracks ${itemCount.count} items across types: ${typeRes.data?.map(t => t.name).join(', ')}.
${speciesCount.count} species are tracked.

Output ONLY a valid JSON array of blocks matching this schema:
${BLOCK_SCHEMA_JSON}

Guidelines:
- Start with a hero block with a compelling title
- Include descriptive text blocks with markdown
- Add a prominent button block linking to "/map"
- Use a stats block with source:"auto" to show live project numbers
- Keep it concise: 4-8 blocks total
- For image blocks, use url:"placeholder" (admin will upload real images later)`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // Parse and validate the block array
  const blocks = JSON.parse(extractJSON(response.content[0].text));
  return addBlockIds(blocks); // ensure each block has a uuid
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
| Hero | title (text input), subtitle (text input), background image (file upload), overlay toggle |
| Text | content (textarea with markdown preview) |
| Image | file upload or URL input, alt text, caption, width select |
| Button | label, href, style select (primary/outline), size select |
| Links | add/remove link items, each with label + URL + optional description |
| Stats | toggle auto/manual, manual items editor |
| Gallery | multi-image upload, captions, column count select |
| Spacer | size select (small/medium/large) |

#### Live Preview

Right column renders `<LandingRenderer blocks={blocks} />` in real-time as the admin edits. Uses the same components as the public page.

---

## Implementation Phases

### Phase 1: Core (MVP)

**New dependencies:** `react-markdown`, `remark-gfm`, `@anthropic-ai/sdk`

| Task | Files |
|---|---|
| Add `LandingPageConfig` types | `src/lib/config/types.ts` |
| Add `landing_page` to config key map + defaults | `src/lib/config/types.ts`, `src/lib/config/defaults.ts` |
| Block renderer components (8 blocks) | `src/components/landing/*.tsx` |
| Landing page route (`/`) with conditional rendering | `src/app/page.tsx` (refactor) |
| Move map to `/map` | `src/app/map/page.tsx` (move existing logic) |
| Update navigation links | `src/components/layout/Navigation.tsx` |
| AI generation server action | `src/app/admin/landing/actions.ts` |
| Admin editor page (generate + edit blocks) | `src/app/admin/landing/page.tsx` + sub-components |
| Block reorder with up/down buttons | Built into editor |
| Image upload to Supabase Storage | Reuse existing `PhotoUploader` pattern |
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

## Fairbanks Eagle Project — Expected Output

Given a prompt like:
> "Landing page for Springbrook Creek Preserve birdhouse monitoring project by Fairbanks Jackson Boy Scout Troop 1564 in collaboration with Bainbridge Island Land Trust. Include project description, link to troop website, and button to view the map."

The AI would generate blocks roughly like:

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

The admin then uploads the real hero image, tweaks text, and publishes.

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
