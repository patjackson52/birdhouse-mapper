# Landing Pages — Feature Spec

## Problem

Field Mapper projects need a public-facing landing page that introduces the project before visitors reach the map. Currently, `/` goes straight to the interactive map, and `/about` is a plain markdown page. Neither supports rich, branded content with images, partner logos, call-to-action buttons, or structured layouts.

**Example use case — Fairbanks Eagle Project:**

> **Springbrook Creek Preserve Birdhouses**
> By Fairbanks Jackson Troop 1564 · In collaboration with BI LandTrust
>
> [Hero image of birdhouse & Fairbanks]
>
> [2-3 paragraphs about the land, wildlife, and bird species]
> [Partner logos and volunteer group info]
>
> [Large "Explore the Map →" button]

---

## Goals

1. Let admins create a rich, customizable landing page without writing code
2. Support images, links, partner logos, and structured layouts
3. Landing page is the new `/` route; map moves to `/map`
4. Keep the system simple enough for non-technical users but extensible for future AI-assisted generation
5. Work within the existing Supabase + Next.js architecture

---

## Approach: Block-Based Template System

After considering the tradeoffs between raw HTML storage, a WYSIWYG editor, and fixed templates, we recommend a **block-based template system** — a structured middle ground:

- Admins compose a landing page from an ordered list of **content blocks**
- Each block has a `type` (hero, text, image-row, partners, cta, etc.) and a JSON `data` payload
- The frontend renders each block with a purpose-built React component
- No raw HTML/JS stored in DB (safe, consistent styling, no XSS)
- Extensible: new block types can be added over time, and AI agents can generate block arrays

### Why not the alternatives?

| Approach | Pros | Cons |
|---|---|---|
| **Raw HTML/JS in DB** | Maximum flexibility | XSS risk, breaks theming, hard to edit, no mobile guarantee |
| **WYSIWYG editor** (e.g., TipTap, Plate) | Familiar editing UX | Large dependency, still produces HTML, hard to constrain layouts |
| **Fixed templates** (pick 1 of 3) | Simplest to build | Too rigid, doesn't scale to varied projects |
| **Block-based (proposed)** | Structured yet flexible, theme-consistent, AI-friendly | Requires building block editor UI |

---

## Data Model

### New table: `landing_pages`

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` PK | |
| `slug` | `text` UNIQUE | URL slug. `"home"` = root landing page |
| `title` | `text` | Page title (for `<title>` and OG tags) |
| `description` | `text` | SEO/OG meta description |
| `og_image_path` | `text` | Storage path for social sharing image |
| `blocks` | `jsonb` | Ordered array of content blocks |
| `published` | `boolean` | `false` = draft, only visible to admins |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |
| `created_by` | `uuid` FK → profiles | |

**RLS:** Public SELECT where `published = true`. Admin INSERT/UPDATE/DELETE.

### New `site_config` key

| Key | Value |
|---|---|
| `landing_page_enabled` | `boolean` — when `true`, `/` renders the landing page (slug `"home"`), map moves to `/map` |

---

## Block Types

Each block is a JSON object: `{ type: string, data: object }`.

### Phase 1 — Core blocks

#### `hero`
Full-width banner with title, subtitle, optional background image.

```jsonc
{
  "type": "hero",
  "data": {
    "title": "Springbrook Creek Preserve Birdhouses",
    "subtitle": "By Fairbanks Jackson Troop 1564",
    "backgroundImage": "landing/hero-bg.jpg",  // storage path
    "overlay": "dark",   // "dark" | "light" | "none"
    "links": [
      { "label": "Troop 1564", "url": "https://troop1564.org" },
      { "label": "BI LandTrust", "url": "https://bilandtrust.org" }
    ]
  }
}
```

#### `text`
Rich text content rendered from markdown. Supports headings, bold, links, lists.

```jsonc
{
  "type": "text",
  "data": {
    "markdown": "## About the Project\n\nSpringbrook Creek Preserve is a 45-acre...",
    "maxWidth": "prose"  // "prose" (65ch) | "wide" (80ch) | "full"
  }
}
```

#### `image`
Single image with optional caption.

```jsonc
{
  "type": "image",
  "data": {
    "src": "landing/birdhouse-fairbanks.jpg",
    "alt": "Birdhouse installation at Fairbanks",
    "caption": "Eagle Scout Fairbanks Jackson installing box #12",
    "size": "medium"  // "small" | "medium" | "large" | "full"
  }
}
```

#### `image-row`
Horizontal row of 2-4 images (responsive grid).

```jsonc
{
  "type": "image-row",
  "data": {
    "images": [
      { "src": "landing/img1.jpg", "alt": "...", "caption": "..." },
      { "src": "landing/img2.jpg", "alt": "...", "caption": "..." }
    ]
  }
}
```

#### `partners`
Logo row with optional labels and links (for collaborators, sponsors).

```jsonc
{
  "type": "partners",
  "data": {
    "heading": "In Collaboration With",
    "partners": [
      { "name": "BI LandTrust", "logo": "landing/bi-logo.png", "url": "https://bilandtrust.org" },
      { "name": "Troop 1564", "logo": "landing/troop-logo.png", "url": "https://troop1564.org" }
    ]
  }
}
```

#### `cta`
Call-to-action button(s). Primary use: link to the map.

```jsonc
{
  "type": "cta",
  "data": {
    "buttons": [
      { "label": "Explore the Map", "href": "/map", "style": "primary" },
      { "label": "Learn More", "href": "#about", "style": "secondary" }
    ]
  }
}
```

#### `divider`
Visual separator between sections.

```jsonc
{
  "type": "divider",
  "data": {
    "style": "line"  // "line" | "space" | "dots"
  }
}
```

### Phase 2 — Extended blocks (future)

| Type | Description |
|---|---|
| `stats` | Numeric counters (e.g., "24 birdhouses · 12 species · 8 volunteers") |
| `map-preview` | Embedded mini-map showing item markers |
| `species-grid` | Auto-populated grid of species from DB |
| `timeline` | Project milestones / history |
| `embed` | Sandboxed iframe (YouTube, etc.) |
| `columns` | 2-3 column layout containing nested blocks |

---

## Routing Changes

| Current Route | New Route | Notes |
|---|---|---|
| `/` (map) | `/map` | Map becomes `/map` when landing page is enabled |
| — | `/` | Renders landing page with slug `"home"` |
| `/about` | `/about` | Unchanged; landing page may replace need for separate about |

**When `landing_page_enabled = false`** (default): no change, `/` still shows the map. This preserves backward compatibility for existing deployments.

**Middleware logic:**
```
if landing_page_enabled AND request is GET /
  → render landing page (slug "home")

if landing_page_enabled AND request is GET /map
  → render map (current page.tsx logic)
```

No redirect — just conditional rendering at the route level. The `/map` route always exists regardless of the landing page setting.

---

## Admin UI

### New admin page: `/admin/landing`

**Block editor interface:**

1. **Page settings panel** — title, description, OG image, published toggle
2. **Block list** — vertical sortable list of blocks (drag to reorder)
3. **Add block** — dropdown/modal to pick block type, then fill in fields
4. **Edit block** — click block to expand inline editor with type-specific form fields
5. **Preview** — "Preview" button opens the page in a new tab (drafts visible to admins)
6. **Image upload** — reuse existing `PhotoUploader` component, store in `landing/` storage bucket prefix

**Block editor per type:**
- `hero`: text inputs for title/subtitle, image uploader, link list editor, overlay dropdown
- `text`: textarea with markdown preview (split pane)
- `image` / `image-row`: image uploader(s), alt text, caption inputs, size dropdown
- `partners`: repeatable row of (name, logo upload, URL)
- `cta`: repeatable row of (label, href, style dropdown)
- `divider`: style radio buttons

### Settings integration

Add a "Landing Page" toggle to `/admin/settings` under General tab. When enabled, shows a link to `/admin/landing`.

---

## Image Storage

Landing page images stored in Supabase Storage under a `landing/` prefix within the existing photos bucket:

```
photos/
  landing/
    hero-bg.jpg
    birdhouse-fairbanks.jpg
    bi-logo.png
    troop-logo.png
```

Reuse the existing `PhotoUploader` component with a modified storage path. Public read access via existing bucket policy.

---

## AI Agent Generation (Future)

The block-based architecture is specifically designed to support AI-assisted page creation:

### How it works

1. Admin provides a text prompt: *"Create a landing page for our eagle scout birdhouse project at Springbrook Creek. We're Troop 1564 working with BI LandTrust."*
2. AI agent generates a `blocks[]` JSON array matching the block schema
3. Agent output is validated against block type schemas before saving
4. Admin reviews in the block editor, adjusts as needed

### Why blocks are AI-friendly

- **Structured output** — LLMs reliably produce JSON matching a schema (tool use / structured output)
- **Constrained** — agent can't break styling or inject scripts
- **Reviewable** — each block is independently editable after generation
- **Image placeholders** — agent generates blocks with placeholder text like `"[Upload hero image]"` that the admin fills in

### Implementation sketch

```
POST /api/landing/generate
Body: { prompt: string, existingBlocks?: Block[] }
→ Calls Claude API with block schema as tool definition
→ Returns Block[] for preview
→ Admin approves / edits / regenerates
```

This is a Phase 2+ feature. The block schema is the foundation that makes it possible.

---

## Migration

### SQL migration: `005_landing_pages.sql`

```sql
-- Landing pages table
CREATE TABLE landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  og_image_path text,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- RLS
ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published landing pages"
  ON landing_pages FOR SELECT
  USING (published = true);

CREATE POLICY "Admins can manage landing pages"
  ON landing_pages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Landing page enabled flag
INSERT INTO site_config (key, value) VALUES ('landing_page_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

---

## TypeScript Types

```typescript
// src/lib/types.ts additions

type HeroBlock = {
  type: 'hero';
  data: {
    title: string;
    subtitle?: string;
    backgroundImage?: string;
    overlay?: 'dark' | 'light' | 'none';
    links?: { label: string; url: string }[];
  };
};

type TextBlock = {
  type: 'text';
  data: {
    markdown: string;
    maxWidth?: 'prose' | 'wide' | 'full';
  };
};

type ImageBlock = {
  type: 'image';
  data: {
    src: string;
    alt: string;
    caption?: string;
    size?: 'small' | 'medium' | 'large' | 'full';
  };
};

type ImageRowBlock = {
  type: 'image-row';
  data: {
    images: { src: string; alt: string; caption?: string }[];
  };
};

type PartnersBlock = {
  type: 'partners';
  data: {
    heading?: string;
    partners: { name: string; logo?: string; url?: string }[];
  };
};

type CtaBlock = {
  type: 'cta';
  data: {
    buttons: { label: string; href: string; style?: 'primary' | 'secondary' }[];
  };
};

type DividerBlock = {
  type: 'divider';
  data: {
    style?: 'line' | 'space' | 'dots';
  };
};

type LandingBlock =
  | HeroBlock
  | TextBlock
  | ImageBlock
  | ImageRowBlock
  | PartnersBlock
  | CtaBlock
  | DividerBlock;

type LandingPage = {
  id: string;
  slug: string;
  title: string;
  description: string;
  og_image_path: string | null;
  blocks: LandingBlock[];
  published: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};
```

---

## Implementation Phases

### Phase 1 — MVP
- [ ] DB migration for `landing_pages` table
- [ ] TypeScript types for blocks and landing page
- [ ] Block renderer components (hero, text, image, image-row, partners, cta, divider)
- [ ] Landing page route (`/` conditional, `/map` route)
- [ ] Admin landing page editor (`/admin/landing`) with block CRUD + reorder
- [ ] Image upload for landing page assets
- [ ] `landing_page_enabled` toggle in admin settings
- [ ] Config types + defaults update

### Phase 2 — Polish
- [ ] Drag-and-drop block reordering (use `@dnd-kit/sortable`)
- [ ] Live preview in editor (side-by-side or floating preview)
- [ ] OG meta tags / social sharing from landing page metadata
- [ ] `stats` block (auto-populated from item counts)
- [ ] `map-preview` block (embedded mini-map)
- [ ] `species-grid` block (auto-populated from species table)

### Phase 3 — AI Generation
- [ ] `/api/landing/generate` endpoint
- [ ] Claude API integration with block schema as structured output
- [ ] "Generate with AI" button in admin editor
- [ ] Prompt input modal with context (site name, item types, species)
- [ ] Preview → approve → save flow

### Phase 4 — Multi-page
- [ ] Support multiple landing pages at custom slugs (e.g., `/eagle-project`)
- [ ] `columns` block type for complex layouts
- [ ] `embed` block type (sandboxed iframe)
- [ ] `timeline` block type
- [ ] Page duplication / templating

---

## Fairbanks Eagle Project — Example Configuration

Here's how the use case maps to blocks:

```json
{
  "slug": "home",
  "title": "Springbrook Creek Preserve Birdhouses",
  "blocks": [
    {
      "type": "hero",
      "data": {
        "title": "Springbrook Creek Preserve Birdhouses",
        "subtitle": "By Fairbanks Jackson Troop 1564",
        "backgroundImage": "landing/hero-springbrook.jpg",
        "overlay": "dark",
        "links": [
          { "label": "Troop 1564", "url": "https://troop1564.org" },
          { "label": "BI LandTrust", "url": "https://bilandtrust.org" }
        ]
      }
    },
    {
      "type": "image",
      "data": {
        "src": "landing/fairbanks-birdhouse.jpg",
        "alt": "Fairbanks with completed birdhouse",
        "size": "large"
      }
    },
    {
      "type": "text",
      "data": {
        "markdown": "## About the Project\n\nSpringbrook Creek Preserve is a 45-acre nature preserve managed by the Bainbridge Island Land Trust...\n\n## Wildlife & Bird Species\n\nThe preserve is home to over 30 species of birds including...\n\n## Volunteer Groups\n\nThis project was made possible by the dedication of...",
        "maxWidth": "prose"
      }
    },
    {
      "type": "partners",
      "data": {
        "heading": "In Collaboration With",
        "partners": [
          { "name": "BI LandTrust", "logo": "landing/bi-landtrust-logo.png", "url": "https://bilandtrust.org" },
          { "name": "BSA Troop 1564", "logo": "landing/troop-logo.png", "url": "https://troop1564.org" }
        ]
      }
    },
    {
      "type": "cta",
      "data": {
        "buttons": [
          { "label": "Explore the Map", "href": "/map", "style": "primary" }
        ]
      }
    }
  ]
}
```

---

## Open Questions

1. **Should landing pages support the existing theme system?** Recommendation: yes — block components use the same CSS variables/Tailwind classes as the rest of the app, ensuring visual consistency.

2. **Multiple landing pages in Phase 1?** Recommendation: no — start with a single `"home"` landing page. The table schema supports multiple pages via `slug`, but the UI and routing can be scoped to one page initially.

3. **Markdown rendering library?** The app already stores markdown for `aboutContent`. Need to add a markdown renderer (e.g., `react-markdown` + `remark-gfm`) if not already present. This benefits both the about page and text blocks.
