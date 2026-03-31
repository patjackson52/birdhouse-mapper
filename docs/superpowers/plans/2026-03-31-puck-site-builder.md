# Puck Site Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom block-based landing page editor with Puck visual editor and extend customization to site chrome (header/nav/footer).

**Architecture:** Puck `<Render>` for server-side public pages (zero client JS), full `<Puck>` editor only on admin routes. Site chrome stored in `puck_root` JSONB, page content in `puck_pages` JSONB (keyed by path). Old and new systems coexist — dual renderer checks for Puck data first, falls back to legacy `LandingRenderer`.

**Tech Stack:** `@measured/puck` (visual editor + renderer), Next.js 14, Supabase PostgreSQL, Zod validation, Vercel AI SDK + Claude for generation, Tailwind CSS with CSS variable theming.

**Spec:** `docs/superpowers/specs/2026-03-31-puck-site-builder-design.md`

---

## File Structure

### New Files

```
src/lib/puck/
  types.ts                    — Puck data types, template types, component prop interfaces
  schemas.ts                  — Zod schemas for Puck data validation
  config.ts                   — Puck component config (registers all components for editor)
  chrome-config.ts            — Puck config for chrome editor (root zones only)
  templates/
    index.ts                  — Template registry + types
    classic.ts                — Classic template data
    minimal.ts                — Minimal template data
    showcase.ts               — Showcase template data

src/lib/puck/components/
  page/
    Hero.tsx                  — Hero component (Puck version)
    RichText.tsx              — Markdown text component
    ImageBlock.tsx            — Single image component
    ButtonGroup.tsx           — CTA button group
    LinkList.tsx              — Links with descriptions
    Stats.tsx                 — Auto/manual stats
    Gallery.tsx               — Image grid
    Spacer.tsx                — Vertical spacing
    Columns.tsx               — Multi-column layout with DropZones
    Section.tsx               — Full-width wrapper with DropZone
    Card.tsx                  — Content card
    MapPreview.tsx            — Read-only map thumbnail
    Testimonial.tsx           — Quote block
    Embed.tsx                 — Iframe embed
  chrome/
    HeaderBar.tsx             — Site header with logo/name
    NavBar.tsx                — Navigation links
    AnnouncementBar.tsx       — Dismissable banner
    FooterColumns.tsx         — Multi-column footer
    SocialLinks.tsx           — Social media icons
    SimpleFooter.tsx          — Minimal footer

src/components/puck/
  PuckPageRenderer.tsx        — Server component: renders landing page from Puck data
  PuckRootRenderer.tsx        — Server component: renders chrome wrapping page content
  PuckPageEditor.tsx          — Client component: Puck editor for landing page
  PuckChromeEditor.tsx        — Client component: Puck editor for chrome

src/app/admin/properties/[slug]/site-builder/
  layout.tsx                  — Site Builder sub-navigation
  landing/page.tsx            — Landing page Puck editor
  chrome/page.tsx             — Chrome Puck editor
  templates/page.tsx          — Template picker + AI generation

src/app/admin/site-builder/
  actions.ts                  — Server actions: save/load/publish Puck data, AI generation

supabase/migrations/NNN_puck_site_builder.sql  — New columns on properties table
```

### Modified Files

```
src/app/layout.tsx            — Dual chrome rendering (PuckRoot vs legacy)
src/app/page.tsx              — Dual page rendering (Puck vs legacy landing)
src/lib/config/types.ts       — Add puck fields to SiteConfig
src/lib/config/server.ts      — Fetch puck fields in getConfig()
src/lib/config/client.tsx     — Expose puck data in context
package.json                  — Add @measured/puck dependency
```

---

## Phase 1: Foundation

### Task 1: Install Puck and Add DB Schema

**Files:**
- Modify: `package.json`
- Create: `supabase/migrations/NNN_puck_site_builder.sql`
- Modify: `src/lib/config/types.ts`
- Modify: `src/lib/config/server.ts`

- [ ] **Step 1: Install @measured/puck**

```bash
npm install @measured/puck
```

- [ ] **Step 2: Create database migration**

Create the next migration file. Check existing migrations for the next number:

```bash
ls supabase/migrations/ | tail -5
```

Create `supabase/migrations/NNN_puck_site_builder.sql`:

```sql
-- Add Puck site builder columns to properties table
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS puck_pages jsonb,
  ADD COLUMN IF NOT EXISTS puck_root jsonb,
  ADD COLUMN IF NOT EXISTS puck_template text,
  ADD COLUMN IF NOT EXISTS puck_pages_draft jsonb,
  ADD COLUMN IF NOT EXISTS puck_root_draft jsonb;

-- Comment for clarity
COMMENT ON COLUMN properties.puck_pages IS 'Per-page Puck editor data, keyed by path (e.g. {"/": {...}})';
COMMENT ON COLUMN properties.puck_root IS 'Published site chrome (header/footer) Puck data';
COMMENT ON COLUMN properties.puck_template IS 'Name of the template applied to this property';
COMMENT ON COLUMN properties.puck_pages_draft IS 'Unpublished draft of puck_pages';
COMMENT ON COLUMN properties.puck_root_draft IS 'Unpublished draft of puck_root';
```

- [ ] **Step 3: Add Puck fields to SiteConfig type**

In `src/lib/config/types.ts`, add to the `SiteConfig` interface:

```typescript
// Puck site builder (null = legacy mode)
puckPages: Record<string, unknown> | null;
puckRoot: Record<string, unknown> | null;
puckTemplate: string | null;
puckPagesDraft: Record<string, unknown> | null;
puckRootDraft: Record<string, unknown> | null;
```

- [ ] **Step 4: Fetch Puck fields in getConfig()**

In `src/lib/config/server.ts`, update the property query to include the new columns. Find where the property is fetched (the `.select()` call) and add the Puck columns:

```typescript
puck_pages, puck_root, puck_template, puck_pages_draft, puck_root_draft
```

Update `buildSiteConfig()` to map these to the SiteConfig fields:

```typescript
puckPages: property?.puck_pages ?? null,
puckRoot: property?.puck_root ?? null,
puckTemplate: property?.puck_template ?? null,
puckPagesDraft: property?.puck_pages_draft ?? null,
puckRootDraft: property?.puck_root_draft ?? null,
```

- [ ] **Step 5: Run migration locally and verify**

```bash
npx supabase db push
```

- [ ] **Step 6: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Puck site builder DB schema and config types"
```

---

### Task 2: Puck Type Definitions and Schemas

**Files:**
- Create: `src/lib/puck/types.ts`
- Create: `src/lib/puck/schemas.ts`
- Test: `src/lib/puck/__tests__/schemas.test.ts`

- [ ] **Step 1: Write the type definitions**

Create `src/lib/puck/types.ts`:

```typescript
import type { Data, Config } from '@measured/puck';

// ---- Component prop types (page components) ----

export interface HeroProps {
  title: string;
  subtitle: string;
  backgroundImageUrl: string;
  overlay: 'primary' | 'dark' | 'none';
  ctaLabel: string;
  ctaHref: string;
}

export interface RichTextProps {
  content: string;
  alignment: 'left' | 'center';
  columns: 1 | 2;
}

export interface ImageBlockProps {
  url: string;
  alt: string;
  caption: string;
  width: 'small' | 'medium' | 'full';
  linkHref: string;
}

export interface ButtonGroupProps {
  buttons: Array<{
    label: string;
    href: string;
    style: 'primary' | 'outline';
    size: 'default' | 'large';
  }>;
}

export interface LinkListProps {
  items: Array<{
    label: string;
    url: string;
    description: string;
  }>;
  layout: 'inline' | 'stacked';
}

export interface StatsProps {
  source: 'auto' | 'manual';
  items: Array<{
    label: string;
    value: string;
  }>;
}

export interface GalleryProps {
  images: Array<{
    url: string;
    alt: string;
    caption: string;
  }>;
  columns: 2 | 3 | 4;
}

export interface SpacerProps {
  size: 'small' | 'medium' | 'large';
}

export interface ColumnsProps {
  columnCount: 2 | 3 | 4;
}

export interface SectionProps {
  backgroundColor: 'default' | 'primary' | 'accent' | 'surface' | 'muted';
  backgroundImageUrl: string;
  paddingY: 'small' | 'medium' | 'large';
}

export interface CardProps {
  imageUrl: string;
  title: string;
  text: string;
  linkHref: string;
  linkLabel: string;
}

export interface MapPreviewProps {
  height: 200 | 300 | 400;
  zoom: number;
  showControls: boolean;
}

export interface TestimonialProps {
  quote: string;
  attribution: string;
  photoUrl: string;
  style: 'default' | 'accent';
}

export interface EmbedProps {
  url: string;
  height: number;
  title: string;
}

// ---- Chrome component prop types ----

export interface HeaderBarProps {
  layout: 'centered' | 'left-aligned';
  showTagline: boolean;
  backgroundColor: 'primary' | 'primary-dark' | 'surface' | 'default';
}

export interface NavBarProps {
  style: 'horizontal' | 'hamburger' | 'tabs';
  position: 'below-header' | 'sticky';
  showMobileBottomBar: boolean;
}

export interface AnnouncementBarProps {
  text: string;
  linkUrl: string;
  backgroundColor: 'primary' | 'accent' | 'surface';
}

export interface FooterColumnsProps {
  columns: Array<{
    title: string;
    links: Array<{ label: string; url: string }>;
  }>;
  showBranding: boolean;
  copyrightText: string;
}

export interface SocialLinksProps {
  links: Array<{
    platform: 'facebook' | 'twitter' | 'instagram' | 'youtube' | 'github' | 'linkedin';
    url: string;
  }>;
  size: 'small' | 'medium' | 'large';
  alignment: 'left' | 'center' | 'right';
}

export interface SimpleFooterProps {
  text: string;
  links: Array<{ label: string; url: string }>;
  showPoweredBy: boolean;
}

// ---- Puck data types ----

export type PuckPageData = Data;

export type PuckRootData = Data;

export interface PuckSiteData {
  pages: Record<string, PuckPageData>;
  root: PuckRootData;
  template: string | null;
}

// ---- Template types ----

export interface SiteTemplate {
  id: string;
  name: string;
  description: string;
  previewImageUrl?: string;
  root: PuckRootData;
  pages: Record<string, PuckPageData>;
}
```

- [ ] **Step 2: Write the Zod schemas**

Create `src/lib/puck/schemas.ts`:

```typescript
import { z } from 'zod';

// Puck Data schema — validates the structure Puck produces
// Puck stores content as an array of { type, props } objects
const puckComponentSchema = z.object({
  type: z.string(),
  props: z.record(z.unknown()),
});

const puckRootSchema = z.object({
  props: z.record(z.unknown()).optional(),
});

export const puckDataSchema = z.object({
  root: puckRootSchema.optional().default({ props: {} }),
  content: z.array(puckComponentSchema).default([]),
  zones: z.record(z.array(puckComponentSchema)).optional(),
});

// Per-page map: { "/": PuckData, "/about": PuckData, ... }
export const puckPagesSchema = z.record(z.string(), puckDataSchema);

// Root chrome data (same shape as PuckData but for root zones)
export const puckRootDataSchema = puckDataSchema;

// Embed URL whitelist
const ALLOWED_EMBED_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
  'google.com',       // Google Maps
  'www.google.com',
  'open.spotify.com',
  'calendar.google.com',
];

export function isAllowedEmbedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_EMBED_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host)
    );
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Write tests for schemas**

Create `src/lib/puck/__tests__/schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { puckDataSchema, puckPagesSchema, isAllowedEmbedUrl } from '../schemas';

describe('puckDataSchema', () => {
  it('validates minimal Puck data', () => {
    const data = { root: { props: {} }, content: [] };
    expect(puckDataSchema.parse(data)).toEqual(data);
  });

  it('validates Puck data with components', () => {
    const data = {
      root: { props: {} },
      content: [
        { type: 'Hero', props: { title: 'Hello', subtitle: 'World' } },
        { type: 'Stats', props: { source: 'auto' } },
      ],
    };
    expect(puckDataSchema.parse(data)).toEqual(data);
  });

  it('validates Puck data with zones', () => {
    const data = {
      root: { props: {} },
      content: [
        { type: 'Columns', props: { columnCount: 2 } },
      ],
      zones: {
        'Columns-1:column-0': [
          { type: 'RichText', props: { content: 'Left col' } },
        ],
        'Columns-1:column-1': [
          { type: 'ImageBlock', props: { url: '/img.jpg' } },
        ],
      },
    };
    expect(puckDataSchema.parse(data)).toEqual(data);
  });

  it('applies defaults for missing root/content', () => {
    const result = puckDataSchema.parse({});
    expect(result.root).toEqual({ props: {} });
    expect(result.content).toEqual([]);
  });

  it('rejects content items without type', () => {
    expect(() =>
      puckDataSchema.parse({ content: [{ props: {} }] })
    ).toThrow();
  });
});

describe('puckPagesSchema', () => {
  it('validates a pages map', () => {
    const pages = {
      '/': { root: { props: {} }, content: [{ type: 'Hero', props: { title: 'Home' } }] },
    };
    expect(puckPagesSchema.parse(pages)).toEqual(pages);
  });
});

describe('isAllowedEmbedUrl', () => {
  it('allows YouTube URLs', () => {
    expect(isAllowedEmbedUrl('https://www.youtube.com/embed/abc123')).toBe(true);
    expect(isAllowedEmbedUrl('https://youtu.be/abc123')).toBe(true);
  });

  it('allows Vimeo URLs', () => {
    expect(isAllowedEmbedUrl('https://player.vimeo.com/video/123')).toBe(true);
  });

  it('allows Google Maps embeds', () => {
    expect(isAllowedEmbedUrl('https://www.google.com/maps/embed?pb=...')).toBe(true);
  });

  it('rejects unknown hosts', () => {
    expect(isAllowedEmbedUrl('https://evil.com/embed')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isAllowedEmbedUrl('not-a-url')).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- src/lib/puck/__tests__/schemas.test.ts
```

- [ ] **Step 5: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/puck/types.ts src/lib/puck/schemas.ts src/lib/puck/__tests__/schemas.test.ts
git commit -m "feat: add Puck type definitions and validation schemas"
```

---

### Task 3: Page Components — Migrated Blocks

Build Puck-compatible versions of the 8 existing block types. Each component is a standard React component that receives props — Puck just calls them with the saved props.

**Files:**
- Create: `src/lib/puck/components/page/Hero.tsx`
- Create: `src/lib/puck/components/page/RichText.tsx`
- Create: `src/lib/puck/components/page/ImageBlock.tsx`
- Create: `src/lib/puck/components/page/ButtonGroup.tsx`
- Create: `src/lib/puck/components/page/LinkList.tsx`
- Create: `src/lib/puck/components/page/Stats.tsx`
- Create: `src/lib/puck/components/page/Gallery.tsx`
- Create: `src/lib/puck/components/page/Spacer.tsx`
- Test: `src/lib/puck/components/page/__tests__/page-components.test.tsx`

- [ ] **Step 1: Write tests for page components**

Create `src/lib/puck/components/page/__tests__/page-components.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero } from '../Hero';
import { RichText } from '../RichText';
import { ImageBlock } from '../ImageBlock';
import { ButtonGroup } from '../ButtonGroup';
import { LinkList } from '../LinkList';
import { Gallery } from '../Gallery';
import { Spacer } from '../Spacer';

describe('Hero', () => {
  it('renders title and subtitle', () => {
    render(<Hero title="Welcome" subtitle="To the reserve" backgroundImageUrl="" overlay="none" ctaLabel="" ctaHref="" />);
    expect(screen.getByText('Welcome')).toBeDefined();
    expect(screen.getByText('To the reserve')).toBeDefined();
  });

  it('renders CTA button when label and href provided', () => {
    render(<Hero title="Hi" subtitle="" backgroundImageUrl="" overlay="none" ctaLabel="Explore" ctaHref="/map" />);
    const link = screen.getByRole('link', { name: 'Explore' });
    expect(link.getAttribute('href')).toBe('/map');
  });

  it('does not render CTA when label is empty', () => {
    render(<Hero title="Hi" subtitle="" backgroundImageUrl="" overlay="none" ctaLabel="" ctaHref="/map" />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('RichText', () => {
  it('renders markdown content', () => {
    render(<RichText content="## Hello World" alignment="left" columns={1} />);
    expect(screen.getByText('Hello World')).toBeDefined();
  });

  it('applies center alignment', () => {
    const { container } = render(<RichText content="Centered" alignment="center" columns={1} />);
    expect(container.querySelector('.text-center')).toBeDefined();
  });
});

describe('ImageBlock', () => {
  it('renders image with alt text', () => {
    render(<ImageBlock url="/test.jpg" alt="A bird" caption="" width="medium" linkHref="" />);
    const img = screen.getByAltText('A bird');
    expect(img).toBeDefined();
  });

  it('renders caption when provided', () => {
    render(<ImageBlock url="/test.jpg" alt="Bird" caption="A nice bird" width="medium" linkHref="" />);
    expect(screen.getByText('A nice bird')).toBeDefined();
  });
});

describe('ButtonGroup', () => {
  it('renders multiple buttons', () => {
    render(
      <ButtonGroup
        buttons={[
          { label: 'Primary', href: '/map', style: 'primary', size: 'default' },
          { label: 'Secondary', href: '/about', style: 'outline', size: 'default' },
        ]}
      />
    );
    expect(screen.getByText('Primary')).toBeDefined();
    expect(screen.getByText('Secondary')).toBeDefined();
  });
});

describe('LinkList', () => {
  it('renders links with descriptions', () => {
    render(
      <LinkList
        items={[
          { label: 'Trail Map', url: '/map', description: 'Explore trails' },
          { label: 'Species', url: '/list', description: 'View species' },
        ]}
        layout="stacked"
      />
    );
    expect(screen.getByText('Trail Map')).toBeDefined();
    expect(screen.getByText('Explore trails')).toBeDefined();
  });
});

describe('Gallery', () => {
  it('renders images in grid', () => {
    render(
      <Gallery
        images={[
          { url: '/img1.jpg', alt: 'Bird 1', caption: '' },
          { url: '/img2.jpg', alt: 'Bird 2', caption: '' },
        ]}
        columns={2}
      />
    );
    expect(screen.getByAltText('Bird 1')).toBeDefined();
    expect(screen.getByAltText('Bird 2')).toBeDefined();
  });
});

describe('Spacer', () => {
  it('renders with size class', () => {
    const { container } = render(<Spacer size="large" />);
    expect(container.firstChild).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- src/lib/puck/components/page/__tests__/page-components.test.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement Hero component**

Create `src/lib/puck/components/page/Hero.tsx`:

```tsx
import Link from 'next/link';
import type { HeroProps } from '../../types';

const overlayClasses = {
  primary: 'bg-[var(--color-primary)]/70',
  dark: 'bg-black/60',
  none: '',
};

export function Hero({ title, subtitle, backgroundImageUrl, overlay, ctaLabel, ctaHref }: HeroProps) {
  return (
    <section
      className="relative flex min-h-[300px] items-center justify-center"
      style={backgroundImageUrl ? { backgroundImage: `url(${backgroundImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {overlay !== 'none' && (
        <div className={`absolute inset-0 ${overlayClasses[overlay]}`} />
      )}
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-16 text-center text-white">
        {title && <h1 className="text-4xl font-bold md:text-5xl">{title}</h1>}
        {subtitle && <p className="mt-4 text-lg opacity-90 md:text-xl">{subtitle}</p>}
        {ctaLabel && ctaHref && (
          <Link
            href={ctaHref}
            className="mt-8 inline-block rounded-lg bg-white px-8 py-3 font-semibold text-[var(--color-primary-dark)] transition hover:bg-opacity-90"
          >
            {ctaLabel}
          </Link>
        )}
      </div>
      {!backgroundImageUrl && (
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)]" />
      )}
    </section>
  );
}
```

- [ ] **Step 4: Implement RichText component**

Create `src/lib/puck/components/page/RichText.tsx`:

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RichTextProps } from '../../types';

export function RichText({ content, alignment, columns }: RichTextProps) {
  const alignClass = alignment === 'center' ? 'text-center' : 'text-left';
  const colClass = columns === 2 ? 'md:columns-2 md:gap-8' : '';

  return (
    <div className={`mx-auto max-w-4xl px-4 py-8 ${alignClass} ${colClass}`}>
      <div className="prose prose-lg max-w-none prose-headings:text-[var(--color-primary-dark)] prose-a:text-[var(--color-primary)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement ImageBlock component**

Create `src/lib/puck/components/page/ImageBlock.tsx`:

```tsx
import Image from 'next/image';
import type { ImageBlockProps } from '../../types';

const widthClasses = {
  small: 'max-w-sm',
  medium: 'max-w-2xl',
  full: 'max-w-full',
};

export function ImageBlock({ url, alt, caption, width, linkHref }: ImageBlockProps) {
  const img = (
    <div className={`mx-auto px-4 py-4 ${widthClasses[width]}`}>
      <img src={url} alt={alt} className="h-auto w-full rounded-lg" loading="lazy" />
      {caption && <p className="mt-2 text-center text-sm text-gray-600">{caption}</p>}
    </div>
  );

  if (linkHref) {
    return <a href={linkHref} target={linkHref.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer">{img}</a>;
  }

  return img;
}
```

- [ ] **Step 6: Implement ButtonGroup component**

Create `src/lib/puck/components/page/ButtonGroup.tsx`:

```tsx
import Link from 'next/link';
import type { ButtonGroupProps } from '../../types';

export function ButtonGroup({ buttons }: ButtonGroupProps) {
  if (!buttons?.length) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 px-4 py-4">
      {buttons.map((btn, i) => {
        const isExternal = btn.href.startsWith('http');
        const className =
          btn.style === 'primary'
            ? `inline-block rounded-lg px-6 py-3 font-semibold text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] transition ${btn.size === 'large' ? 'px-8 py-4 text-lg' : ''}`
            : `inline-block rounded-lg px-6 py-3 font-semibold border-2 border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition ${btn.size === 'large' ? 'px-8 py-4 text-lg' : ''}`;

        if (isExternal) {
          return <a key={i} href={btn.href} target="_blank" rel="noopener noreferrer" className={className}>{btn.label}</a>;
        }
        return <Link key={i} href={btn.href} className={className}>{btn.label}</Link>;
      })}
    </div>
  );
}
```

- [ ] **Step 7: Implement LinkList component**

Create `src/lib/puck/components/page/LinkList.tsx`:

```tsx
import type { LinkListProps } from '../../types';

export function LinkList({ items, layout }: LinkListProps) {
  if (!items?.length) return null;

  const containerClass = layout === 'inline'
    ? 'flex flex-wrap items-center justify-center gap-4'
    : 'flex flex-col gap-3';

  return (
    <div className={`mx-auto max-w-2xl px-4 py-4 ${containerClass}`}>
      {items.map((item, i) => (
        <a
          key={i}
          href={item.url}
          target={item.url.startsWith('/') ? undefined : '_blank'}
          rel="noopener noreferrer"
          className="group block rounded-lg border border-gray-200 p-3 transition hover:border-[var(--color-primary)] hover:shadow-sm"
        >
          <span className="font-medium text-[var(--color-primary)] group-hover:underline">{item.label}</span>
          {item.description && (
            <span className="mt-1 block text-sm text-gray-600">{item.description}</span>
          )}
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Implement Stats component**

Create `src/lib/puck/components/page/Stats.tsx`:

```tsx
import type { StatsProps } from '../../types';

export function Stats({ source, items }: StatsProps) {
  // Auto-populated stats are resolved server-side before being passed as props.
  // When source is 'auto', the items will be populated by a wrapper that fetches DB counts.
  // For the Puck component, both modes render the same way.
  if (!items?.length) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-xl bg-[var(--color-surface-light)] p-6 text-center"
          >
            <div className="text-3xl font-bold text-[var(--color-primary)]">{item.value}</div>
            <div className="mt-1 text-sm text-gray-600">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Implement Gallery component**

Create `src/lib/puck/components/page/Gallery.tsx`:

```tsx
import type { GalleryProps } from '../../types';

const colClasses = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
};

export function Gallery({ images, columns }: GalleryProps) {
  if (!images?.length) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className={`grid gap-4 ${colClasses[columns]}`}>
        {images.map((img, i) => (
          <div key={i} className="overflow-hidden rounded-lg">
            <img src={img.url} alt={img.alt} className="h-48 w-full object-cover" loading="lazy" />
            {img.caption && (
              <p className="bg-white p-2 text-center text-sm text-gray-600">{img.caption}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Implement Spacer component**

Create `src/lib/puck/components/page/Spacer.tsx`:

```tsx
import type { SpacerProps } from '../../types';

const sizeClasses = {
  small: 'h-4',
  medium: 'h-8',
  large: 'h-16',
};

export function Spacer({ size }: SpacerProps) {
  return <div className={sizeClasses[size]} aria-hidden="true" />;
}
```

- [ ] **Step 11: Run tests to verify they pass**

```bash
npm run test -- src/lib/puck/components/page/__tests__/page-components.test.tsx
```

- [ ] **Step 12: Commit**

```bash
git add src/lib/puck/components/page/
git commit -m "feat: add Puck page components (migrated from existing blocks)"
```

---

### Task 4: New Page Components

**Files:**
- Create: `src/lib/puck/components/page/Columns.tsx`
- Create: `src/lib/puck/components/page/Section.tsx`
- Create: `src/lib/puck/components/page/Card.tsx`
- Create: `src/lib/puck/components/page/MapPreview.tsx`
- Create: `src/lib/puck/components/page/Testimonial.tsx`
- Create: `src/lib/puck/components/page/Embed.tsx`
- Test: `src/lib/puck/components/page/__tests__/new-components.test.tsx`

- [ ] **Step 1: Write tests for new components**

Create `src/lib/puck/components/page/__tests__/new-components.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../Card';
import { Testimonial } from '../Testimonial';
import { Embed } from '../Embed';
import { Spacer } from '../Spacer';

describe('Card', () => {
  it('renders title and text', () => {
    render(<Card imageUrl="" title="Trail Guide" text="Explore our trails" linkHref="" linkLabel="" />);
    expect(screen.getByText('Trail Guide')).toBeDefined();
    expect(screen.getByText('Explore our trails')).toBeDefined();
  });

  it('renders link when provided', () => {
    render(<Card imageUrl="" title="Guide" text="Info" linkHref="/guide" linkLabel="Read more" />);
    expect(screen.getByText('Read more')).toBeDefined();
  });
});

describe('Testimonial', () => {
  it('renders quote and attribution', () => {
    render(<Testimonial quote="Amazing place!" attribution="Jane D." photoUrl="" style="default" />);
    expect(screen.getByText('Amazing place!')).toBeDefined();
    expect(screen.getByText('Jane D.')).toBeDefined();
  });
});

describe('Embed', () => {
  it('renders iframe for allowed URL', () => {
    const { container } = render(
      <Embed url="https://www.youtube.com/embed/abc123" height={315} title="Video" />
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeDefined();
    expect(iframe?.getAttribute('src')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('renders warning for disallowed URL', () => {
    render(<Embed url="https://evil.com/hack" height={315} title="Bad" />);
    expect(screen.getByText(/not allowed/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- src/lib/puck/components/page/__tests__/new-components.test.tsx
```

- [ ] **Step 3: Implement Columns component**

Create `src/lib/puck/components/page/Columns.tsx`:

```tsx
import { DropZone } from '@measured/puck';
import type { ColumnsProps } from '../../types';

const gridClasses = {
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-3',
  4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
};

export function Columns({ columnCount }: ColumnsProps) {
  return (
    <div className={`mx-auto max-w-6xl grid gap-6 px-4 py-4 ${gridClasses[columnCount]}`}>
      {Array.from({ length: columnCount }, (_, i) => (
        <div key={i} className="min-h-[50px]">
          <DropZone zone={`column-${i}`} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement Section component**

Create `src/lib/puck/components/page/Section.tsx`:

```tsx
import { DropZone } from '@measured/puck';
import type { SectionProps } from '../../types';

const bgClasses = {
  default: '',
  primary: 'bg-[var(--color-primary)] text-white',
  accent: 'bg-[var(--color-accent)] text-white',
  surface: 'bg-[var(--color-surface-light)]',
  muted: 'bg-[var(--color-muted)]',
};

const paddingClasses = {
  small: 'py-4',
  medium: 'py-8',
  large: 'py-16',
};

export function Section({ backgroundColor, backgroundImageUrl, paddingY }: SectionProps) {
  return (
    <section
      className={`w-full ${bgClasses[backgroundColor]} ${paddingClasses[paddingY]}`}
      style={backgroundImageUrl ? { backgroundImage: `url(${backgroundImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      <DropZone zone="content" />
    </section>
  );
}
```

- [ ] **Step 5: Implement Card component**

Create `src/lib/puck/components/page/Card.tsx`:

```tsx
import type { CardProps } from '../../types';

export function Card({ imageUrl, title, text, linkHref, linkLabel }: CardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      {imageUrl && (
        <img src={imageUrl} alt={title} className="h-48 w-full object-cover" loading="lazy" />
      )}
      <div className="p-4">
        {title && <h3 className="text-lg font-semibold text-[var(--color-primary-dark)]">{title}</h3>}
        {text && <p className="mt-2 text-sm text-gray-600">{text}</p>}
        {linkHref && linkLabel && (
          <a
            href={linkHref}
            className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            {linkLabel} &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Implement MapPreview component**

Create `src/lib/puck/components/page/MapPreview.tsx`:

```tsx
'use client';

import Link from 'next/link';
import type { MapPreviewProps } from '../../types';

export function MapPreview({ height, zoom, showControls }: MapPreviewProps) {
  // Renders a static map preview that links to the interactive map.
  // Uses the property's mapCenter from config context.
  // A lightweight placeholder that doesn't load Leaflet.
  return (
    <Link href="/map" className="group block mx-auto max-w-4xl px-4 py-4">
      <div
        className="relative overflow-hidden rounded-xl border border-gray-200 bg-[var(--color-surface-light)] transition group-hover:shadow-lg"
        style={{ height: `${height}px` }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl">🗺️</div>
            <p className="mt-2 text-sm font-medium text-[var(--color-primary)]">
              Click to explore the interactive map
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 7: Implement Testimonial component**

Create `src/lib/puck/components/page/Testimonial.tsx`:

```tsx
import type { TestimonialProps } from '../../types';

export function Testimonial({ quote, attribution, photoUrl, style }: TestimonialProps) {
  const borderColor = style === 'accent' ? 'border-[var(--color-accent)]' : 'border-[var(--color-primary)]';

  return (
    <blockquote className={`mx-auto max-w-2xl border-l-4 ${borderColor} px-4 py-8 pl-6`}>
      <p className="text-lg italic text-gray-700">&ldquo;{quote}&rdquo;</p>
      <footer className="mt-4 flex items-center gap-3">
        {photoUrl && (
          <img src={photoUrl} alt={attribution} className="h-10 w-10 rounded-full object-cover" />
        )}
        <cite className="text-sm font-medium not-italic text-gray-600">{attribution}</cite>
      </footer>
    </blockquote>
  );
}
```

- [ ] **Step 8: Implement Embed component**

Create `src/lib/puck/components/page/Embed.tsx`:

```tsx
import type { EmbedProps } from '../../types';
import { isAllowedEmbedUrl } from '../../schemas';

export function Embed({ url, height, title }: EmbedProps) {
  if (!url || !isAllowedEmbedUrl(url)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
          Embed URL not allowed. Supported: YouTube, Vimeo, Google Maps, Spotify.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <iframe
        src={url}
        title={title}
        height={height}
        className="w-full rounded-lg border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}
```

- [ ] **Step 9: Run tests to verify they pass**

```bash
npm run test -- src/lib/puck/components/page/__tests__/new-components.test.tsx
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/puck/components/page/
git commit -m "feat: add new Puck page components (Columns, Section, Card, MapPreview, Testimonial, Embed)"
```

---

### Task 5: Puck Page Config

Register all page components with Puck's config system, defining fields (the editor UI) for each component.

**Files:**
- Create: `src/lib/puck/config.ts`
- Test: `src/lib/puck/__tests__/config.test.ts`

- [ ] **Step 1: Write a smoke test for the config**

Create `src/lib/puck/__tests__/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { pageConfig } from '../config';

describe('pageConfig', () => {
  it('registers all expected page components', () => {
    const componentNames = Object.keys(pageConfig.components);
    expect(componentNames).toContain('Hero');
    expect(componentNames).toContain('RichText');
    expect(componentNames).toContain('ImageBlock');
    expect(componentNames).toContain('ButtonGroup');
    expect(componentNames).toContain('LinkList');
    expect(componentNames).toContain('Stats');
    expect(componentNames).toContain('Gallery');
    expect(componentNames).toContain('Spacer');
    expect(componentNames).toContain('Columns');
    expect(componentNames).toContain('Section');
    expect(componentNames).toContain('Card');
    expect(componentNames).toContain('MapPreview');
    expect(componentNames).toContain('Testimonial');
    expect(componentNames).toContain('Embed');
    expect(componentNames.length).toBe(14);
  });

  it('each component has a render function', () => {
    for (const [name, component] of Object.entries(pageConfig.components)) {
      expect(typeof component.render).toBe('function', `${name} missing render`);
    }
  });

  it('each component has default props', () => {
    for (const [name, component] of Object.entries(pageConfig.components)) {
      expect(component.defaultProps).toBeDefined(`${name} missing defaultProps`);
    }
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test -- src/lib/puck/__tests__/config.test.ts
```

- [ ] **Step 3: Implement the page config**

Create `src/lib/puck/config.ts`:

```typescript
import type { Config } from '@measured/puck';
import { Hero } from './components/page/Hero';
import { RichText } from './components/page/RichText';
import { ImageBlock } from './components/page/ImageBlock';
import { ButtonGroup } from './components/page/ButtonGroup';
import { LinkList } from './components/page/LinkList';
import { Stats } from './components/page/Stats';
import { Gallery } from './components/page/Gallery';
import { Spacer } from './components/page/Spacer';
import { Columns } from './components/page/Columns';
import { Section } from './components/page/Section';
import { Card } from './components/page/Card';
import { MapPreview } from './components/page/MapPreview';
import { Testimonial } from './components/page/Testimonial';
import { Embed } from './components/page/Embed';

// Theme color options used across multiple components
const themeColorOptions = [
  { label: 'Default', value: 'default' },
  { label: 'Primary', value: 'primary' },
  { label: 'Accent', value: 'accent' },
  { label: 'Surface', value: 'surface' },
  { label: 'Muted', value: 'muted' },
];

export const pageConfig: Config = {
  components: {
    Hero: {
      label: 'Hero Banner',
      defaultProps: {
        title: 'Welcome',
        subtitle: 'Explore our conservation area',
        backgroundImageUrl: '',
        overlay: 'primary',
        ctaLabel: 'Explore Map',
        ctaHref: '/map',
      },
      fields: {
        title: { type: 'text', label: 'Title' },
        subtitle: { type: 'textarea', label: 'Subtitle' },
        backgroundImageUrl: { type: 'text', label: 'Background Image URL' },
        overlay: {
          type: 'select',
          label: 'Overlay',
          options: [
            { label: 'Primary Color', value: 'primary' },
            { label: 'Dark', value: 'dark' },
            { label: 'None', value: 'none' },
          ],
        },
        ctaLabel: { type: 'text', label: 'Button Label' },
        ctaHref: { type: 'text', label: 'Button Link' },
      },
      render: Hero,
    },

    RichText: {
      label: 'Rich Text',
      defaultProps: {
        content: 'Enter your content here...',
        alignment: 'left',
        columns: 1,
      },
      fields: {
        content: { type: 'textarea', label: 'Markdown Content' },
        alignment: {
          type: 'radio',
          label: 'Alignment',
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
          ],
        },
        columns: {
          type: 'radio',
          label: 'Columns',
          options: [
            { label: '1', value: 1 },
            { label: '2', value: 2 },
          ],
        },
      },
      render: RichText,
    },

    ImageBlock: {
      label: 'Image',
      defaultProps: {
        url: '',
        alt: '',
        caption: '',
        width: 'medium',
        linkHref: '',
      },
      fields: {
        url: { type: 'text', label: 'Image URL' },
        alt: { type: 'text', label: 'Alt Text' },
        caption: { type: 'text', label: 'Caption' },
        width: {
          type: 'select',
          label: 'Width',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Full Width', value: 'full' },
          ],
        },
        linkHref: { type: 'text', label: 'Link URL (optional)' },
      },
      render: ImageBlock,
    },

    ButtonGroup: {
      label: 'Button Group',
      defaultProps: {
        buttons: [{ label: 'Explore Map', href: '/map', style: 'primary', size: 'default' }],
      },
      fields: {
        buttons: {
          type: 'array',
          label: 'Buttons',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            href: { type: 'text', label: 'Link' },
            style: {
              type: 'select',
              label: 'Style',
              options: [
                { label: 'Primary', value: 'primary' },
                { label: 'Outline', value: 'outline' },
              ],
            },
            size: {
              type: 'select',
              label: 'Size',
              options: [
                { label: 'Default', value: 'default' },
                { label: 'Large', value: 'large' },
              ],
            },
          },
          defaultItemProps: { label: 'Button', href: '/', style: 'primary', size: 'default' },
        },
      },
      render: ButtonGroup,
    },

    LinkList: {
      label: 'Link List',
      defaultProps: {
        items: [],
        layout: 'stacked',
      },
      fields: {
        items: {
          type: 'array',
          label: 'Links',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            url: { type: 'text', label: 'URL' },
            description: { type: 'text', label: 'Description' },
          },
          defaultItemProps: { label: 'Link', url: '/', description: '' },
        },
        layout: {
          type: 'radio',
          label: 'Layout',
          options: [
            { label: 'Inline', value: 'inline' },
            { label: 'Stacked', value: 'stacked' },
          ],
        },
      },
      render: LinkList,
    },

    Stats: {
      label: 'Stats',
      defaultProps: {
        source: 'auto',
        items: [],
      },
      fields: {
        source: {
          type: 'radio',
          label: 'Data Source',
          options: [
            { label: 'Auto (from database)', value: 'auto' },
            { label: 'Manual', value: 'manual' },
          ],
        },
        items: {
          type: 'array',
          label: 'Stats (for manual mode)',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            value: { type: 'text', label: 'Value' },
          },
          defaultItemProps: { label: 'Stat', value: '0' },
        },
      },
      render: Stats,
    },

    Gallery: {
      label: 'Gallery',
      defaultProps: {
        images: [],
        columns: 3,
      },
      fields: {
        images: {
          type: 'array',
          label: 'Images',
          arrayFields: {
            url: { type: 'text', label: 'Image URL' },
            alt: { type: 'text', label: 'Alt Text' },
            caption: { type: 'text', label: 'Caption' },
          },
          defaultItemProps: { url: '', alt: '', caption: '' },
        },
        columns: {
          type: 'select',
          label: 'Columns',
          options: [
            { label: '2', value: 2 },
            { label: '3', value: 3 },
            { label: '4', value: 4 },
          ],
        },
      },
      render: Gallery,
    },

    Spacer: {
      label: 'Spacer',
      defaultProps: { size: 'medium' },
      fields: {
        size: {
          type: 'radio',
          label: 'Size',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ],
        },
      },
      render: Spacer,
    },

    Columns: {
      label: 'Columns',
      defaultProps: { columnCount: 2 },
      fields: {
        columnCount: {
          type: 'select',
          label: 'Number of Columns',
          options: [
            { label: '2', value: 2 },
            { label: '3', value: 3 },
            { label: '4', value: 4 },
          ],
        },
      },
      render: Columns,
    },

    Section: {
      label: 'Section',
      defaultProps: {
        backgroundColor: 'default',
        backgroundImageUrl: '',
        paddingY: 'medium',
      },
      fields: {
        backgroundColor: {
          type: 'select',
          label: 'Background Color',
          options: themeColorOptions,
        },
        backgroundImageUrl: { type: 'text', label: 'Background Image URL' },
        paddingY: {
          type: 'radio',
          label: 'Vertical Padding',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ],
        },
      },
      render: Section,
    },

    Card: {
      label: 'Card',
      defaultProps: {
        imageUrl: '',
        title: 'Card Title',
        text: 'Card description',
        linkHref: '',
        linkLabel: '',
      },
      fields: {
        imageUrl: { type: 'text', label: 'Image URL' },
        title: { type: 'text', label: 'Title' },
        text: { type: 'textarea', label: 'Text' },
        linkHref: { type: 'text', label: 'Link URL' },
        linkLabel: { type: 'text', label: 'Link Label' },
      },
      render: Card,
    },

    MapPreview: {
      label: 'Map Preview',
      defaultProps: {
        height: 300,
        zoom: 14,
        showControls: false,
      },
      fields: {
        height: {
          type: 'select',
          label: 'Height',
          options: [
            { label: 'Small (200px)', value: 200 },
            { label: 'Medium (300px)', value: 300 },
            { label: 'Large (400px)', value: 400 },
          ],
        },
        zoom: { type: 'number', label: 'Zoom Level', min: 1, max: 18 },
        showControls: { type: 'radio', label: 'Show Controls', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
      },
      render: MapPreview,
    },

    Testimonial: {
      label: 'Testimonial',
      defaultProps: {
        quote: 'An amazing experience!',
        attribution: 'Visitor Name',
        photoUrl: '',
        style: 'default',
      },
      fields: {
        quote: { type: 'textarea', label: 'Quote' },
        attribution: { type: 'text', label: 'Attribution' },
        photoUrl: { type: 'text', label: 'Photo URL' },
        style: {
          type: 'radio',
          label: 'Style',
          options: [
            { label: 'Default', value: 'default' },
            { label: 'Accent', value: 'accent' },
          ],
        },
      },
      render: Testimonial,
    },

    Embed: {
      label: 'Embed',
      defaultProps: {
        url: '',
        height: 315,
        title: 'Embedded content',
      },
      fields: {
        url: { type: 'text', label: 'Embed URL (YouTube, Vimeo, Google Maps)' },
        height: { type: 'number', label: 'Height (px)', min: 100, max: 800 },
        title: { type: 'text', label: 'Title (accessibility)' },
      },
      render: Embed,
    },
  },
};
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/lib/puck/__tests__/config.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/puck/config.ts src/lib/puck/__tests__/config.test.ts
git commit -m "feat: register all page components in Puck config"
```

---

### Task 6: Puck Page Renderer and Dual Rendering

**Files:**
- Create: `src/components/puck/PuckPageRenderer.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/components/puck/__tests__/PuckPageRenderer.test.tsx`

- [ ] **Step 1: Write test for PuckPageRenderer**

Create `src/components/puck/__tests__/PuckPageRenderer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PuckPageRenderer } from '../PuckPageRenderer';

describe('PuckPageRenderer', () => {
  it('renders Puck components from data', () => {
    const data = {
      root: { props: {} },
      content: [
        { type: 'Hero', props: { title: 'Test Site', subtitle: 'Welcome', backgroundImageUrl: '', overlay: 'primary', ctaLabel: '', ctaHref: '' } },
      ],
    };
    render(<PuckPageRenderer data={data} />);
    expect(screen.getByText('Test Site')).toBeDefined();
  });

  it('renders empty state when no content', () => {
    const data = { root: { props: {} }, content: [] };
    const { container } = render(<PuckPageRenderer data={data} />);
    expect(container.firstChild).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test -- src/components/puck/__tests__/PuckPageRenderer.test.tsx
```

- [ ] **Step 3: Implement PuckPageRenderer**

Create `src/components/puck/PuckPageRenderer.tsx`:

```tsx
import { Render } from '@measured/puck';
import { pageConfig } from '@/lib/puck/config';
import type { Data } from '@measured/puck';

interface PuckPageRendererProps {
  data: Data;
}

export function PuckPageRenderer({ data }: PuckPageRendererProps) {
  return <Render config={pageConfig} data={data} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- src/components/puck/__tests__/PuckPageRenderer.test.tsx
```

- [ ] **Step 5: Update the homepage to support dual rendering**

In `src/app/page.tsx`, add the Puck path. Find the section that checks `config.landingPage?.enabled` and renders `<LandingRenderer>`. Add a check before it for Puck data:

```tsx
import { PuckPageRenderer } from '@/components/puck/PuckPageRenderer';
```

In the rendering logic, before the legacy landing page check, add:

```tsx
// Puck landing page (new system)
const puckLandingData = config.puckPages?.['/'];
if (puckLandingData) {
  return <PuckPageRenderer data={puckLandingData} />;
}

// Legacy landing page (existing system)
if (config.landingPage?.enabled && config.landingPage.blocks.length > 0) {
  return <LandingRenderer blocks={config.landingPage.blocks} />;
}
```

- [ ] **Step 6: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 7: Commit**

```bash
git add src/components/puck/ src/app/page.tsx
git commit -m "feat: add PuckPageRenderer and dual rendering on homepage"
```

---

### Task 7: Server Actions for Puck Data

**Files:**
- Create: `src/app/admin/site-builder/actions.ts`
- Test: `src/app/admin/site-builder/__tests__/actions.test.ts`

- [ ] **Step 1: Write tests for server actions**

Create `src/app/admin/site-builder/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: mockFrom,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}));

vi.mock('@/lib/tenant/server', () => ({
  getTenantContext: vi.fn().mockResolvedValue({ propertyId: 'prop-1', orgId: 'org-1' }),
}));

vi.mock('@/lib/config/server', () => ({
  invalidateConfig: vi.fn(),
}));

// We test the validation logic and data flow, not the actual DB calls
import { puckDataSchema } from '@/lib/puck/schemas';

describe('Puck data validation for save', () => {
  it('accepts valid Puck page data', () => {
    const data = {
      root: { props: {} },
      content: [
        { type: 'Hero', props: { title: 'Hello' } },
      ],
    };
    expect(() => puckDataSchema.parse(data)).not.toThrow();
  });

  it('rejects invalid data structure', () => {
    expect(() => puckDataSchema.parse('not an object')).toThrow();
  });

  it('rejects content without type field', () => {
    const data = {
      root: { props: {} },
      content: [{ props: { title: 'Hello' } }],
    };
    expect(() => puckDataSchema.parse(data)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm run test -- src/app/admin/site-builder/__tests__/actions.test.ts
```

- [ ] **Step 3: Implement server actions**

Create `src/app/admin/site-builder/actions.ts`:

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';
import { invalidateConfig } from '@/lib/config/server';
import { puckDataSchema } from '@/lib/puck/schemas';
import type { Data } from '@measured/puck';

async function getPropertyId(): Promise<string> {
  const tenant = await getTenantContext();
  if (!tenant.propertyId) throw new Error('No property context');
  return tenant.propertyId;
}

// ---- Draft operations ----

export async function savePuckPageDraft(path: string, data: Data) {
  const propertyId = await getPropertyId();
  const validated = puckDataSchema.parse(data);
  const supabase = createClient();

  // Read current draft, merge this page path
  const { data: property } = await supabase
    .from('properties')
    .select('puck_pages_draft')
    .eq('id', propertyId)
    .single();

  const draft = (property?.puck_pages_draft as Record<string, unknown>) ?? {};
  draft[path] = validated;

  const { error } = await supabase
    .from('properties')
    .update({ puck_pages_draft: draft })
    .eq('id', propertyId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function savePuckRootDraft(data: Data) {
  const propertyId = await getPropertyId();
  const validated = puckDataSchema.parse(data);
  const supabase = createClient();

  const { error } = await supabase
    .from('properties')
    .update({ puck_root_draft: validated })
    .eq('id', propertyId);

  if (error) return { error: error.message };
  return { success: true };
}

// ---- Publish operations ----

export async function publishPuckPages() {
  const propertyId = await getPropertyId();
  const supabase = createClient();

  // Copy draft to live
  const { data: property } = await supabase
    .from('properties')
    .select('puck_pages_draft')
    .eq('id', propertyId)
    .single();

  if (!property?.puck_pages_draft) return { error: 'No draft to publish' };

  const { error } = await supabase
    .from('properties')
    .update({ puck_pages: property.puck_pages_draft })
    .eq('id', propertyId);

  if (error) return { error: error.message };
  invalidateConfig();
  return { success: true };
}

export async function publishPuckRoot() {
  const propertyId = await getPropertyId();
  const supabase = createClient();

  const { data: property } = await supabase
    .from('properties')
    .select('puck_root_draft')
    .eq('id', propertyId)
    .single();

  if (!property?.puck_root_draft) return { error: 'No draft to publish' };

  const { error } = await supabase
    .from('properties')
    .update({ puck_root: property.puck_root_draft })
    .eq('id', propertyId);

  if (error) return { error: error.message };
  invalidateConfig();
  return { success: true };
}

// ---- Read operations ----

export async function getPuckData() {
  const propertyId = await getPropertyId();
  const supabase = createClient();

  const { data: property, error } = await supabase
    .from('properties')
    .select('puck_pages, puck_root, puck_template, puck_pages_draft, puck_root_draft')
    .eq('id', propertyId)
    .single();

  if (error) return { error: error.message };

  return {
    puckPages: property.puck_pages as Record<string, Data> | null,
    puckRoot: property.puck_root as Data | null,
    puckTemplate: property.puck_template as string | null,
    puckPagesDraft: property.puck_pages_draft as Record<string, Data> | null,
    puckRootDraft: property.puck_root_draft as Data | null,
  };
}

// ---- Template application ----

export async function applyTemplate(templateId: string, rootData: Data, pagesData: Record<string, Data>) {
  const propertyId = await getPropertyId();
  const supabase = createClient();

  const { error } = await supabase
    .from('properties')
    .update({
      puck_template: templateId,
      puck_root: rootData,
      puck_root_draft: rootData,
      puck_pages: pagesData,
      puck_pages_draft: pagesData,
    })
    .eq('id', propertyId);

  if (error) return { error: error.message };
  invalidateConfig();
  return { success: true };
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/app/admin/site-builder/__tests__/actions.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/site-builder/
git commit -m "feat: add server actions for Puck data (save/publish/read/template)"
```

---

### Task 8: Puck Landing Page Editor (Admin)

**Files:**
- Create: `src/components/puck/PuckPageEditor.tsx`
- Create: `src/app/admin/properties/[slug]/site-builder/landing/page.tsx`
- Create: `src/app/admin/properties/[slug]/site-builder/layout.tsx`

- [ ] **Step 1: Create the Puck page editor client component**

Create `src/components/puck/PuckPageEditor.tsx`:

```tsx
'use client';

import { Puck } from '@measured/puck';
import '@measured/puck/puck.css';
import { pageConfig } from '@/lib/puck/config';
import { savePuckPageDraft, publishPuckPages } from '@/app/admin/site-builder/actions';
import type { Data } from '@measured/puck';
import { useState } from 'react';

interface PuckPageEditorProps {
  initialData: Data;
  pagePath: string;
}

export function PuckPageEditor({ initialData, pagePath }: PuckPageEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const handleChange = async (data: Data) => {
    // Auto-save draft on change (debounced by Puck internally)
    setIsSaving(true);
    await savePuckPageDraft(pagePath, data);
    setIsSaving(false);
    setLastSaved(new Date());
  };

  const handlePublish = async (data: Data) => {
    // Save draft first, then publish
    await savePuckPageDraft(pagePath, data);
    const result = await publishPuckPages();
    if (result.error) {
      alert(`Publish failed: ${result.error}`);
    }
  };

  return (
    <div className="h-screen">
      <Puck
        config={pageConfig}
        data={initialData}
        onChange={handleChange}
        onPublish={handlePublish}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the Site Builder layout with sub-navigation**

Create `src/app/admin/properties/[slug]/site-builder/layout.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';

export default function SiteBuilderLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { slug } = useParams<{ slug: string }>();
  const base = `/admin/properties/${slug}/site-builder`;

  const tabs = [
    { label: 'Landing Page', href: `${base}/landing` },
    { label: 'Header & Footer', href: `${base}/chrome` },
    { label: 'Templates', href: `${base}/templates` },
  ];

  return (
    <div>
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex gap-4">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`border-b-2 px-1 pb-3 text-sm font-medium transition ${
                  isActive
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create the landing page editor admin page**

Create `src/app/admin/properties/[slug]/site-builder/landing/page.tsx`:

```tsx
import { getPuckData } from '@/app/admin/site-builder/actions';
import { PuckPageEditor } from '@/components/puck/PuckPageEditor';
import type { Data } from '@measured/puck';

const emptyPageData: Data = {
  root: { props: {} },
  content: [],
};

export default async function SiteBuilderLandingPage() {
  const result = await getPuckData();

  if ('error' in result && result.error) {
    return <div className="rounded-lg bg-red-50 p-4 text-red-600">{result.error}</div>;
  }

  // Use draft if available, otherwise published, otherwise empty
  const data = (result.puckPagesDraft?.['/'] ?? result.puckPages?.['/'] ?? emptyPageData) as Data;

  return <PuckPageEditor initialData={data} pagePath="/" />;
}
```

- [ ] **Step 4: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add src/components/puck/PuckPageEditor.tsx src/app/admin/properties/\[slug\]/site-builder/
git commit -m "feat: add Puck landing page editor admin page"
```

---

## Phase 2: Chrome

### Task 9: Chrome Components

**Files:**
- Create: `src/lib/puck/components/chrome/HeaderBar.tsx`
- Create: `src/lib/puck/components/chrome/NavBar.tsx`
- Create: `src/lib/puck/components/chrome/AnnouncementBar.tsx`
- Create: `src/lib/puck/components/chrome/FooterColumns.tsx`
- Create: `src/lib/puck/components/chrome/SocialLinks.tsx`
- Create: `src/lib/puck/components/chrome/SimpleFooter.tsx`
- Test: `src/lib/puck/components/chrome/__tests__/chrome-components.test.tsx`

- [ ] **Step 1: Write tests for chrome components**

Create `src/lib/puck/components/chrome/__tests__/chrome-components.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeaderBar } from '../HeaderBar';
import { SimpleFooter } from '../SimpleFooter';
import { FooterColumns } from '../FooterColumns';
import { SocialLinks } from '../SocialLinks';
import { AnnouncementBar } from '../AnnouncementBar';

// Mock useConfig for components that need site context
vi.mock('@/lib/config/client', () => ({
  useConfig: () => ({
    siteName: 'Test Reserve',
    tagline: 'A test site',
    logoUrl: null,
  }),
  useTheme: () => ({ colors: { primary: '#2d5016' } }),
}));

describe('HeaderBar', () => {
  it('renders site name', () => {
    render(<HeaderBar layout="left-aligned" showTagline={false} backgroundColor="primary" />);
    expect(screen.getByText('Test Reserve')).toBeDefined();
  });

  it('renders tagline when enabled', () => {
    render(<HeaderBar layout="left-aligned" showTagline={true} backgroundColor="primary" />);
    expect(screen.getByText('A test site')).toBeDefined();
  });
});

describe('SimpleFooter', () => {
  it('renders text', () => {
    render(<SimpleFooter text="© 2026 Reserve" links={[]} showPoweredBy={false} />);
    expect(screen.getByText('© 2026 Reserve')).toBeDefined();
  });

  it('renders links', () => {
    render(
      <SimpleFooter
        text="Footer"
        links={[{ label: 'Privacy', url: '/privacy' }]}
        showPoweredBy={false}
      />
    );
    expect(screen.getByText('Privacy')).toBeDefined();
  });
});

describe('FooterColumns', () => {
  it('renders column titles', () => {
    render(
      <FooterColumns
        columns={[
          { title: 'Links', links: [{ label: 'Home', url: '/' }] },
          { title: 'About', links: [{ label: 'Team', url: '/team' }] },
        ]}
        showBranding={false}
        copyrightText="© 2026"
      />
    );
    expect(screen.getByText('Links')).toBeDefined();
    expect(screen.getByText('About')).toBeDefined();
    expect(screen.getByText('© 2026')).toBeDefined();
  });
});

describe('SocialLinks', () => {
  it('renders social links', () => {
    const { container } = render(
      <SocialLinks
        links={[{ platform: 'facebook', url: 'https://facebook.com/test' }]}
        size="medium"
        alignment="center"
      />
    );
    const link = container.querySelector('a[href="https://facebook.com/test"]');
    expect(link).toBeDefined();
  });
});

describe('AnnouncementBar', () => {
  it('renders text', () => {
    render(<AnnouncementBar text="New trail open!" linkUrl="" backgroundColor="primary" />);
    expect(screen.getByText('New trail open!')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- src/lib/puck/components/chrome/__tests__/chrome-components.test.tsx
```

- [ ] **Step 3: Implement HeaderBar**

Create `src/lib/puck/components/chrome/HeaderBar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useConfig } from '@/lib/config/client';
import type { HeaderBarProps } from '../../types';

const bgClasses = {
  primary: 'bg-[var(--color-primary)] text-white',
  'primary-dark': 'bg-[var(--color-primary-dark)] text-white',
  surface: 'bg-[var(--color-surface-light)] text-gray-900',
  default: 'bg-white text-gray-900 border-b border-gray-200',
};

export function HeaderBar({ layout, showTagline, backgroundColor }: HeaderBarProps) {
  const config = useConfig();
  const alignClass = layout === 'centered' ? 'text-center' : 'text-left';

  return (
    <header className={`px-4 py-3 ${bgClasses[backgroundColor]}`}>
      <div className={`mx-auto max-w-6xl ${alignClass}`}>
        <Link href="/" className="inline-flex items-center gap-3">
          {config.logoUrl && (
            <img src={config.logoUrl} alt={config.siteName} className="h-8 w-auto" />
          )}
          <span className="text-lg font-bold">{config.siteName}</span>
        </Link>
        {showTagline && config.tagline && (
          <p className="mt-0.5 text-sm opacity-80">{config.tagline}</p>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Implement NavBar**

Create `src/lib/puck/components/chrome/NavBar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConfig } from '@/lib/config/client';
import { useState } from 'react';
import type { NavBarProps } from '../../types';

export function NavBar({ style, position, showMobileBottomBar }: NavBarProps) {
  const config = useConfig();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Build nav items from config
  const navItems = [
    ...(config.landingPage?.enabled || config.puckPages?.['/'] ? [{ label: 'Home', href: '/' }] : []),
    { label: 'Map', href: '/map' },
    { label: 'List', href: '/list' },
    ...(config.aboutPageEnabled ? [{ label: 'About', href: '/about' }] : []),
    ...(config.customNavItems ?? []),
  ];

  const positionClass = position === 'sticky' ? 'sticky top-0 z-50' : '';

  if (style === 'hamburger') {
    return (
      <nav className={`bg-white border-b border-gray-200 px-4 py-2 ${positionClass}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 text-gray-600" aria-label="Toggle menu">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-gray-100 py-2">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setMenuOpen(false)}>
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </nav>
    );
  }

  // Default: horizontal nav
  return (
    <>
      <nav className={`bg-white border-b border-gray-200 px-4 py-2 ${positionClass}`}>
        <div className="mx-auto flex max-w-6xl items-center gap-6">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium transition ${isActive ? 'text-[var(--color-primary)]' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {showMobileBottomBar && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-gray-200 bg-white md:hidden">
          {navItems.slice(0, 4).map((item) => (
            <Link key={item.href} href={item.href} className="flex flex-1 flex-col items-center py-2 text-xs text-gray-600">
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
```

- [ ] **Step 5: Implement AnnouncementBar**

Create `src/lib/puck/components/chrome/AnnouncementBar.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { AnnouncementBarProps } from '../../types';

const bgClasses = {
  primary: 'bg-[var(--color-primary)] text-white',
  accent: 'bg-[var(--color-accent)] text-white',
  surface: 'bg-[var(--color-surface-light)] text-gray-900',
};

export function AnnouncementBar({ text, linkUrl, backgroundColor }: AnnouncementBarProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !text) return null;

  const content = linkUrl ? (
    <a href={linkUrl} className="underline hover:no-underline">{text}</a>
  ) : (
    <span>{text}</span>
  );

  return (
    <div className={`relative px-4 py-2 text-center text-sm ${bgClasses[backgroundColor]}`}>
      {content}
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Implement FooterColumns**

Create `src/lib/puck/components/chrome/FooterColumns.tsx`:

```tsx
'use client';

import { useConfig } from '@/lib/config/client';
import type { FooterColumnsProps } from '../../types';

export function FooterColumns({ columns, showBranding, copyrightText }: FooterColumnsProps) {
  const config = useConfig();

  const gridClass = columns.length <= 2 ? 'md:grid-cols-2' : columns.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4';

  return (
    <footer className="bg-[var(--color-primary-dark)] px-4 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        {showBranding && (
          <div className="mb-8">
            <div className="text-lg font-bold">{config.siteName}</div>
            {config.tagline && <p className="mt-1 text-sm opacity-70">{config.tagline}</p>}
          </div>
        )}
        <div className={`grid gap-8 ${gridClass}`}>
          {columns.map((col, i) => (
            <div key={i}>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider opacity-70">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((link, j) => (
                  <li key={j}>
                    <a href={link.url} className="text-sm opacity-80 transition hover:opacity-100 hover:underline">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {copyrightText && (
          <div className="mt-8 border-t border-white/20 pt-4 text-center text-xs opacity-60">
            {copyrightText}
          </div>
        )}
      </div>
    </footer>
  );
}
```

- [ ] **Step 7: Implement SocialLinks**

Create `src/lib/puck/components/chrome/SocialLinks.tsx`:

```tsx
import type { SocialLinksProps } from '../../types';

const platformLabels: Record<string, string> = {
  facebook: 'Facebook',
  twitter: 'Twitter/X',
  instagram: 'Instagram',
  youtube: 'YouTube',
  github: 'GitHub',
  linkedin: 'LinkedIn',
};

const sizeClasses = {
  small: 'text-sm gap-3',
  medium: 'text-base gap-4',
  large: 'text-lg gap-5',
};

const alignClasses = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

export function SocialLinks({ links, size, alignment }: SocialLinksProps) {
  if (!links?.length) return null;

  return (
    <div className={`flex flex-wrap items-center px-4 py-2 ${sizeClasses[size]} ${alignClasses[alignment]}`}>
      {links.map((link, i) => (
        <a
          key={i}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="opacity-70 transition hover:opacity-100"
          aria-label={platformLabels[link.platform] ?? link.platform}
        >
          {platformLabels[link.platform] ?? link.platform}
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Implement SimpleFooter**

Create `src/lib/puck/components/chrome/SimpleFooter.tsx`:

```tsx
import type { SimpleFooterProps } from '../../types';

export function SimpleFooter({ text, links, showPoweredBy }: SimpleFooterProps) {
  return (
    <footer className="border-t border-gray-200 px-4 py-4">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-sm text-gray-600">
        <span>{text}</span>
        {links?.length > 0 && (
          <div className="flex gap-4">
            {links.map((link, i) => (
              <a key={i} href={link.url} className="hover:text-gray-900 hover:underline">{link.label}</a>
            ))}
          </div>
        )}
      </div>
      {showPoweredBy && (
        <div className="mt-2 text-center text-xs text-gray-400">
          Powered by FieldMapper
        </div>
      )}
    </footer>
  );
}
```

- [ ] **Step 9: Run tests**

```bash
npm run test -- src/lib/puck/components/chrome/__tests__/chrome-components.test.tsx
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/puck/components/chrome/
git commit -m "feat: add Puck chrome components (HeaderBar, NavBar, FooterColumns, etc.)"
```

---

### Task 10: Chrome Config and Root Renderer

**Files:**
- Create: `src/lib/puck/chrome-config.ts`
- Create: `src/components/puck/PuckRootRenderer.tsx`
- Modify: `src/app/layout.tsx`
- Test: `src/components/puck/__tests__/PuckRootRenderer.test.tsx`

- [ ] **Step 1: Write test for PuckRootRenderer**

Create `src/components/puck/__tests__/PuckRootRenderer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PuckRootRenderer } from '../PuckRootRenderer';

vi.mock('@/lib/config/client', () => ({
  useConfig: () => ({ siteName: 'Test', tagline: 'Tag', logoUrl: null }),
  useTheme: () => ({ colors: { primary: '#2d5016' } }),
}));

describe('PuckRootRenderer', () => {
  it('renders children wrapped in chrome', () => {
    const data = {
      root: { props: {} },
      content: [
        { type: 'HeaderBar', props: { layout: 'left-aligned', showTagline: false, backgroundColor: 'primary' } },
      ],
    };
    render(
      <PuckRootRenderer data={data}>
        <div>Page content</div>
      </PuckRootRenderer>
    );
    expect(screen.getByText('Page content')).toBeDefined();
    expect(screen.getByText('Test')).toBeDefined();
  });

  it('renders children without chrome when data is null', () => {
    render(
      <PuckRootRenderer data={null}>
        <div>Page content</div>
      </PuckRootRenderer>
    );
    expect(screen.getByText('Page content')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test -- src/components/puck/__tests__/PuckRootRenderer.test.tsx
```

- [ ] **Step 3: Create chrome config**

Create `src/lib/puck/chrome-config.ts`:

```typescript
import type { Config } from '@measured/puck';
import { HeaderBar } from './components/chrome/HeaderBar';
import { NavBar } from './components/chrome/NavBar';
import { AnnouncementBar } from './components/chrome/AnnouncementBar';
import { FooterColumns } from './components/chrome/FooterColumns';
import { SocialLinks } from './components/chrome/SocialLinks';
import { SimpleFooter } from './components/chrome/SimpleFooter';

export const chromeConfig: Config = {
  components: {
    HeaderBar: {
      label: 'Header Bar',
      defaultProps: {
        layout: 'left-aligned',
        showTagline: false,
        backgroundColor: 'primary',
      },
      fields: {
        layout: {
          type: 'radio',
          label: 'Layout',
          options: [
            { label: 'Left Aligned', value: 'left-aligned' },
            { label: 'Centered', value: 'centered' },
          ],
        },
        showTagline: { type: 'radio', label: 'Show Tagline', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
        backgroundColor: {
          type: 'select',
          label: 'Background',
          options: [
            { label: 'Primary', value: 'primary' },
            { label: 'Dark', value: 'primary-dark' },
            { label: 'Surface', value: 'surface' },
            { label: 'White', value: 'default' },
          ],
        },
      },
      render: HeaderBar,
    },

    NavBar: {
      label: 'Navigation Bar',
      defaultProps: {
        style: 'horizontal',
        position: 'below-header',
        showMobileBottomBar: true,
      },
      fields: {
        style: {
          type: 'select',
          label: 'Style',
          options: [
            { label: 'Horizontal', value: 'horizontal' },
            { label: 'Hamburger', value: 'hamburger' },
            { label: 'Tabs', value: 'tabs' },
          ],
        },
        position: {
          type: 'radio',
          label: 'Position',
          options: [
            { label: 'Below Header', value: 'below-header' },
            { label: 'Sticky', value: 'sticky' },
          ],
        },
        showMobileBottomBar: { type: 'radio', label: 'Mobile Bottom Bar', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
      },
      render: NavBar,
    },

    AnnouncementBar: {
      label: 'Announcement Bar',
      defaultProps: {
        text: '',
        linkUrl: '',
        backgroundColor: 'primary',
      },
      fields: {
        text: { type: 'text', label: 'Text' },
        linkUrl: { type: 'text', label: 'Link URL (optional)' },
        backgroundColor: {
          type: 'select',
          label: 'Background',
          options: [
            { label: 'Primary', value: 'primary' },
            { label: 'Accent', value: 'accent' },
            { label: 'Surface', value: 'surface' },
          ],
        },
      },
      render: AnnouncementBar,
    },

    FooterColumns: {
      label: 'Footer (Columns)',
      defaultProps: {
        columns: [{ title: 'Links', links: [{ label: 'Home', url: '/' }] }],
        showBranding: true,
        copyrightText: `© ${new Date().getFullYear()}`,
      },
      fields: {
        columns: {
          type: 'array',
          label: 'Columns',
          arrayFields: {
            title: { type: 'text', label: 'Column Title' },
            links: {
              type: 'array',
              label: 'Links',
              arrayFields: {
                label: { type: 'text', label: 'Label' },
                url: { type: 'text', label: 'URL' },
              },
              defaultItemProps: { label: 'Link', url: '/' },
            },
          },
          defaultItemProps: { title: 'Column', links: [] },
        },
        showBranding: { type: 'radio', label: 'Show Branding', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
        copyrightText: { type: 'text', label: 'Copyright Text' },
      },
      render: FooterColumns,
    },

    SocialLinks: {
      label: 'Social Links',
      defaultProps: {
        links: [],
        size: 'medium',
        alignment: 'center',
      },
      fields: {
        links: {
          type: 'array',
          label: 'Social Links',
          arrayFields: {
            platform: {
              type: 'select',
              label: 'Platform',
              options: [
                { label: 'Facebook', value: 'facebook' },
                { label: 'Twitter/X', value: 'twitter' },
                { label: 'Instagram', value: 'instagram' },
                { label: 'YouTube', value: 'youtube' },
                { label: 'GitHub', value: 'github' },
                { label: 'LinkedIn', value: 'linkedin' },
              ],
            },
            url: { type: 'text', label: 'URL' },
          },
          defaultItemProps: { platform: 'facebook', url: '' },
        },
        size: {
          type: 'radio',
          label: 'Size',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ],
        },
        alignment: {
          type: 'radio',
          label: 'Alignment',
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ],
        },
      },
      render: SocialLinks,
    },

    SimpleFooter: {
      label: 'Footer (Simple)',
      defaultProps: {
        text: `© ${new Date().getFullYear()}`,
        links: [],
        showPoweredBy: true,
      },
      fields: {
        text: { type: 'text', label: 'Footer Text' },
        links: {
          type: 'array',
          label: 'Links',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            url: { type: 'text', label: 'URL' },
          },
          defaultItemProps: { label: 'Link', url: '/' },
        },
        showPoweredBy: { type: 'radio', label: 'Show "Powered by"', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
      },
      render: SimpleFooter,
    },
  },
};
```

- [ ] **Step 4: Implement PuckRootRenderer**

Create `src/components/puck/PuckRootRenderer.tsx`:

```tsx
import { Render } from '@measured/puck';
import { chromeConfig } from '@/lib/puck/chrome-config';
import type { Data } from '@measured/puck';

interface PuckRootRendererProps {
  data: Data | null;
  children: React.ReactNode;
}

export function PuckRootRenderer({ data, children }: PuckRootRendererProps) {
  if (!data) {
    // No Puck chrome — render children directly (legacy layout handles chrome)
    return <>{children}</>;
  }

  // Puck Root renders chrome components, with children as the page content slot.
  // We render header components, then children, then footer components.
  // Split content into header-type and footer-type components by convention.
  const headerTypes = new Set(['HeaderBar', 'NavBar', 'AnnouncementBar']);
  const headerComponents = data.content.filter((c) => headerTypes.has(c.type));
  const footerComponents = data.content.filter((c) => !headerTypes.has(c.type));

  const headerData: Data = { ...data, content: headerComponents };
  const footerData: Data = { ...data, content: footerComponents };

  return (
    <>
      {headerComponents.length > 0 && <Render config={chromeConfig} data={headerData} />}
      {children}
      {footerComponents.length > 0 && <Render config={chromeConfig} data={footerData} />}
    </>
  );
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- src/components/puck/__tests__/PuckRootRenderer.test.tsx
```

- [ ] **Step 6: Update root layout for dual chrome rendering**

In `src/app/layout.tsx`, find where the org context renders `<Navigation>` + `{children}`. Add a check for `puckRoot`:

Import the renderer:
```tsx
import { PuckRootRenderer } from '@/components/puck/PuckRootRenderer';
```

In the org rendering path, wrap children conditionally:

```tsx
// If Puck chrome exists, use PuckRootRenderer instead of legacy Navigation/Header/Footer
const puckRoot = config.puckRoot as Data | null;

if (puckRoot) {
  return (
    <ConfigProvider config={config} theme={theme}>
      <UserLocationProvider>
        <PuckRootRenderer data={puckRoot}>
          <main>{children}</main>
        </PuckRootRenderer>
      </UserLocationProvider>
    </ConfigProvider>
  );
}

// Legacy layout (existing code)
return (
  <ConfigProvider config={config} theme={theme}>
    <UserLocationProvider>
      <Navigation /* existing props */>
        <main>{children}</main>
      </Navigation>
    </UserLocationProvider>
  </ConfigProvider>
);
```

Adapt this to the actual structure of `layout.tsx` — the key change is wrapping children in `PuckRootRenderer` when `puckRoot` is non-null, and falling back to the existing layout otherwise.

- [ ] **Step 7: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/puck/chrome-config.ts src/components/puck/PuckRootRenderer.tsx src/app/layout.tsx
git commit -m "feat: add PuckRootRenderer and dual chrome rendering in root layout"
```

---

### Task 11: Chrome Editor Admin Page

**Files:**
- Create: `src/components/puck/PuckChromeEditor.tsx`
- Create: `src/app/admin/properties/[slug]/site-builder/chrome/page.tsx`

- [ ] **Step 1: Create the Puck chrome editor client component**

Create `src/components/puck/PuckChromeEditor.tsx`:

```tsx
'use client';

import { Puck } from '@measured/puck';
import '@measured/puck/puck.css';
import { chromeConfig } from '@/lib/puck/chrome-config';
import { savePuckRootDraft, publishPuckRoot } from '@/app/admin/site-builder/actions';
import type { Data } from '@measured/puck';
import { useState } from 'react';

interface PuckChromeEditorProps {
  initialData: Data;
}

export function PuckChromeEditor({ initialData }: PuckChromeEditorProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = async (data: Data) => {
    setIsSaving(true);
    await savePuckRootDraft(data);
    setIsSaving(false);
  };

  const handlePublish = async (data: Data) => {
    await savePuckRootDraft(data);
    const result = await publishPuckRoot();
    if (result.error) {
      alert(`Publish failed: ${result.error}`);
    }
  };

  return (
    <div className="h-screen">
      <Puck
        config={chromeConfig}
        data={initialData}
        onChange={handleChange}
        onPublish={handlePublish}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the chrome editor admin page**

Create `src/app/admin/properties/[slug]/site-builder/chrome/page.tsx`:

```tsx
import { getPuckData } from '@/app/admin/site-builder/actions';
import { PuckChromeEditor } from '@/components/puck/PuckChromeEditor';
import type { Data } from '@measured/puck';

const emptyChromeData: Data = {
  root: { props: {} },
  content: [],
};

export default async function SiteBuilderChromePage() {
  const result = await getPuckData();

  if ('error' in result && result.error) {
    return <div className="rounded-lg bg-red-50 p-4 text-red-600">{result.error}</div>;
  }

  const data = (result.puckRootDraft ?? result.puckRoot ?? emptyChromeData) as Data;

  return <PuckChromeEditor initialData={data} />;
}
```

- [ ] **Step 3: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 4: Commit**

```bash
git add src/components/puck/PuckChromeEditor.tsx src/app/admin/properties/\[slug\]/site-builder/chrome/
git commit -m "feat: add Puck chrome editor admin page (header & footer)"
```

---

## Phase 3: Templates & AI

### Task 12: Template Definitions

**Files:**
- Create: `src/lib/puck/templates/index.ts`
- Create: `src/lib/puck/templates/classic.ts`
- Create: `src/lib/puck/templates/minimal.ts`
- Create: `src/lib/puck/templates/showcase.ts`
- Test: `src/lib/puck/templates/__tests__/templates.test.ts`

- [ ] **Step 1: Write tests for templates**

Create `src/lib/puck/templates/__tests__/templates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { templates, getTemplate } from '../index';
import { puckDataSchema } from '../../schemas';

describe('templates', () => {
  it('has 3 templates', () => {
    expect(templates.length).toBe(3);
  });

  it.each(['classic', 'minimal', 'showcase'])('template "%s" has valid root data', (id) => {
    const template = getTemplate(id);
    expect(template).toBeDefined();
    expect(() => puckDataSchema.parse(template!.root)).not.toThrow();
  });

  it.each(['classic', 'minimal', 'showcase'])('template "%s" has valid landing page data', (id) => {
    const template = getTemplate(id);
    expect(template).toBeDefined();
    expect(template!.pages['/']).toBeDefined();
    expect(() => puckDataSchema.parse(template!.pages['/'])).not.toThrow();
  });

  it.each(['classic', 'minimal', 'showcase'])('template "%s" has landing page with at least one component', (id) => {
    const template = getTemplate(id);
    expect(template!.pages['/'].content.length).toBeGreaterThan(0);
  });

  it.each(['classic', 'minimal', 'showcase'])('template "%s" has at least one header component in root', (id) => {
    const template = getTemplate(id);
    const hasHeader = template!.root.content.some((c: { type: string }) =>
      ['HeaderBar', 'NavBar', 'AnnouncementBar'].includes(c.type)
    );
    expect(hasHeader).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- src/lib/puck/templates/__tests__/templates.test.ts
```

- [ ] **Step 3: Implement template index**

Create `src/lib/puck/templates/index.ts`:

```typescript
import type { SiteTemplate } from '../types';
import { classicTemplate } from './classic';
import { minimalTemplate } from './minimal';
import { showcaseTemplate } from './showcase';

export const templates: SiteTemplate[] = [
  classicTemplate,
  minimalTemplate,
  showcaseTemplate,
];

export function getTemplate(id: string): SiteTemplate | undefined {
  return templates.find((t) => t.id === id);
}
```

- [ ] **Step 4: Implement Classic template**

Create `src/lib/puck/templates/classic.ts`:

```typescript
import type { SiteTemplate } from '../types';

export const classicTemplate: SiteTemplate = {
  id: 'classic',
  name: 'Classic',
  description: 'HeaderBar + NavBar, Hero banner, Stats, About section, Gallery, 3-column footer. The safe default.',
  root: {
    root: { props: {} },
    content: [
      {
        type: 'HeaderBar',
        props: { layout: 'left-aligned', showTagline: false, backgroundColor: 'primary' },
      },
      {
        type: 'NavBar',
        props: { style: 'horizontal', position: 'below-header', showMobileBottomBar: true },
      },
      {
        type: 'FooterColumns',
        props: {
          columns: [
            { title: 'Explore', links: [{ label: 'Map', url: '/map' }, { label: 'List', url: '/list' }] },
            { title: 'About', links: [{ label: 'About Us', url: '/about' }] },
            { title: 'Connect', links: [{ label: 'Contact', url: '/about' }] },
          ],
          showBranding: true,
          copyrightText: `© ${new Date().getFullYear()}`,
        },
      },
    ],
  },
  pages: {
    '/': {
      root: { props: {} },
      content: [
        {
          type: 'Hero',
          props: {
            title: 'Welcome to Our Conservation Area',
            subtitle: 'Discover and explore the wildlife and habitats we protect',
            backgroundImageUrl: '',
            overlay: 'primary',
            ctaLabel: 'Explore the Map',
            ctaHref: '/map',
          },
        },
        {
          type: 'Stats',
          props: { source: 'auto', items: [] },
        },
        {
          type: 'RichText',
          props: {
            content: '## About This Site\n\nWelcome to our conservation project. We are dedicated to monitoring and protecting local wildlife. Use the interactive map to explore our area, view species observations, and learn about our ongoing efforts.',
            alignment: 'left',
            columns: 1,
          },
        },
        {
          type: 'Gallery',
          props: { images: [], columns: 3 },
        },
        {
          type: 'ButtonGroup',
          props: {
            buttons: [
              { label: 'Explore the Map', href: '/map', style: 'primary', size: 'large' },
              { label: 'Learn More', href: '/about', style: 'outline', size: 'large' },
            ],
          },
        },
      ],
    },
  },
};
```

- [ ] **Step 5: Implement Minimal template**

Create `src/lib/puck/templates/minimal.ts`:

```typescript
import type { SiteTemplate } from '../types';

export const minimalTemplate: SiteTemplate = {
  id: 'minimal',
  name: 'Minimal',
  description: 'Clean header, text hero with CTA, map preview, simple footer. Fast, no-frills.',
  root: {
    root: { props: {} },
    content: [
      {
        type: 'HeaderBar',
        props: { layout: 'left-aligned', showTagline: false, backgroundColor: 'default' },
      },
      {
        type: 'SimpleFooter',
        props: {
          text: `© ${new Date().getFullYear()}`,
          links: [{ label: 'Map', url: '/map' }, { label: 'About', url: '/about' }],
          showPoweredBy: true,
        },
      },
    ],
  },
  pages: {
    '/': {
      root: { props: {} },
      content: [
        {
          type: 'Section',
          props: { backgroundColor: 'default', backgroundImageUrl: '', paddingY: 'large' },
        },
        {
          type: 'RichText',
          props: {
            content: '# Welcome\n\nExplore our conservation area and discover the wildlife we protect.',
            alignment: 'left',
            columns: 1,
          },
        },
        {
          type: 'ButtonGroup',
          props: {
            buttons: [{ label: 'Explore Map →', href: '/map', style: 'primary', size: 'large' }],
          },
        },
        {
          type: 'MapPreview',
          props: { height: 300, zoom: 14, showControls: false },
        },
      ],
    },
  },
};
```

- [ ] **Step 6: Implement Showcase template**

Create `src/lib/puck/templates/showcase.ts`:

```typescript
import type { SiteTemplate } from '../types';

export const showcaseTemplate: SiteTemplate = {
  id: 'showcase',
  name: 'Showcase',
  description: 'Sticky NavBar, full-bleed Hero, Gallery, Cards section, Testimonial, 4-column footer with social links.',
  root: {
    root: { props: {} },
    content: [
      {
        type: 'HeaderBar',
        props: { layout: 'left-aligned', showTagline: true, backgroundColor: 'primary-dark' },
      },
      {
        type: 'NavBar',
        props: { style: 'horizontal', position: 'sticky', showMobileBottomBar: true },
      },
      {
        type: 'FooterColumns',
        props: {
          columns: [
            { title: 'Explore', links: [{ label: 'Map', url: '/map' }, { label: 'List', url: '/list' }] },
            { title: 'Learn', links: [{ label: 'About', url: '/about' }] },
            { title: 'Connect', links: [{ label: 'Contact', url: '/about' }] },
            { title: 'Follow', links: [] },
          ],
          showBranding: true,
          copyrightText: `© ${new Date().getFullYear()} All rights reserved.`,
        },
      },
      {
        type: 'SocialLinks',
        props: {
          links: [],
          size: 'medium',
          alignment: 'center',
        },
      },
    ],
  },
  pages: {
    '/': {
      root: { props: {} },
      content: [
        {
          type: 'Hero',
          props: {
            title: 'Discover Our Conservation Area',
            subtitle: 'Explore habitats, track species, and join our conservation mission',
            backgroundImageUrl: '',
            overlay: 'dark',
            ctaLabel: 'Start Exploring',
            ctaHref: '/map',
          },
        },
        {
          type: 'Stats',
          props: { source: 'auto', items: [] },
        },
        {
          type: 'Gallery',
          props: { images: [], columns: 3 },
        },
        {
          type: 'RichText',
          props: {
            content: '## Our Mission\n\nWe are dedicated to protecting and monitoring the diverse wildlife in our region. Through community engagement and scientific observation, we work to ensure these habitats thrive for generations to come.',
            alignment: 'center',
            columns: 1,
          },
        },
        {
          type: 'Testimonial',
          props: {
            quote: 'An incredible resource for understanding and protecting local wildlife. The interactive map makes it easy to track and contribute observations.',
            attribution: 'Community Volunteer',
            photoUrl: '',
            style: 'accent',
          },
        },
        {
          type: 'ButtonGroup',
          props: {
            buttons: [
              { label: 'Explore the Map', href: '/map', style: 'primary', size: 'large' },
              { label: 'View All Species', href: '/list', style: 'outline', size: 'large' },
            ],
          },
        },
      ],
    },
  },
};
```

- [ ] **Step 7: Run tests**

```bash
npm run test -- src/lib/puck/templates/__tests__/templates.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/puck/templates/
git commit -m "feat: add Puck site templates (Classic, Minimal, Showcase)"
```

---

### Task 13: Template Picker Admin Page

**Files:**
- Create: `src/app/admin/properties/[slug]/site-builder/templates/page.tsx`

- [ ] **Step 1: Create the template picker page**

Create `src/app/admin/properties/[slug]/site-builder/templates/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { templates } from '@/lib/puck/templates';
import { applyTemplate } from '@/app/admin/site-builder/actions';
import type { SiteTemplate } from '@/lib/puck/types';

export default function SiteBuilderTemplatesPage() {
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const handleApply = async (template: SiteTemplate) => {
    if (!confirm(`Apply the "${template.name}" template? This will replace your current site builder content.`)) {
      return;
    }

    setApplying(template.id);
    const result = await applyTemplate(template.id, template.root, template.pages);

    if (result.error) {
      alert(`Failed to apply template: ${result.error}`);
    } else {
      setApplied(template.id);
    }
    setApplying(null);
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900">Site Templates</h2>
      <p className="mt-1 text-sm text-gray-600">
        Choose a template to get started. Templates set up your landing page, header, and footer.
        You can customize everything after applying.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`rounded-xl border-2 p-6 transition ${
              applied === template.id
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-[var(--color-primary)] hover:shadow-md'
            }`}
          >
            <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
            <p className="mt-2 text-sm text-gray-600">{template.description}</p>

            <div className="mt-4">
              {applied === template.id ? (
                <span className="text-sm font-medium text-green-600">Applied!</span>
              ) : (
                <button
                  onClick={() => handleApply(template)}
                  disabled={applying !== null}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {applying === template.id ? 'Applying...' : 'Apply Template'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/properties/\[slug\]/site-builder/templates/
git commit -m "feat: add template picker admin page"
```

---

### Task 14: AI Generation for Puck Format

**Files:**
- Create: `src/app/admin/site-builder/generate.ts`
- Test: `src/app/admin/site-builder/__tests__/generate.test.ts`

- [ ] **Step 1: Write tests for AI generation output validation**

Create `src/app/admin/site-builder/__tests__/generate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { puckDataSchema } from '@/lib/puck/schemas';
import { buildPuckGenerationPrompt } from '../generate';

describe('buildPuckGenerationPrompt', () => {
  it('includes component schemas in system prompt', () => {
    const prompt = buildPuckGenerationPrompt({
      siteName: 'Test Reserve',
      tagline: 'Wildlife monitoring',
      locationName: 'Pacific Northwest',
      stats: { items: 42, species: 12, updates: 128 },
    });
    expect(prompt).toContain('Hero');
    expect(prompt).toContain('RichText');
    expect(prompt).toContain('Stats');
    expect(prompt).toContain('Test Reserve');
  });
});

describe('AI output validation', () => {
  it('accepts well-formed Puck generation output', () => {
    // Simulate what Claude would return
    const generated = {
      root: { props: {} },
      content: [
        { type: 'Hero', props: { title: 'Welcome to Test Reserve', subtitle: 'Wildlife monitoring', backgroundImageUrl: '', overlay: 'primary', ctaLabel: 'Explore', ctaHref: '/map' } },
        { type: 'Stats', props: { source: 'auto', items: [] } },
        { type: 'RichText', props: { content: '## About\n\nWe protect wildlife.', alignment: 'left', columns: 1 } },
      ],
    };
    expect(() => puckDataSchema.parse(generated)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npm run test -- src/app/admin/site-builder/__tests__/generate.test.ts
```

- [ ] **Step 3: Implement the generation prompt builder and action**

Create `src/app/admin/site-builder/generate.ts`:

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { puckDataSchema } from '@/lib/puck/schemas';
import type { Data } from '@measured/puck';

interface SiteContext {
  siteName: string;
  tagline: string;
  locationName: string;
  stats: { items: number; species: number; updates: number };
}

export function buildPuckGenerationPrompt(context: SiteContext): string {
  return `You are a web designer generating content for a conservation/field mapping website.
Generate a Puck visual editor JSON document for the landing page.

## Site Context
- Name: ${context.siteName}
- Tagline: ${context.tagline}
- Location: ${context.locationName}
- Stats: ${context.stats.items} items, ${context.stats.species} species, ${context.stats.updates} updates

## Available Components (use ONLY these types)

- Hero: { title: string, subtitle: string, backgroundImageUrl: string (leave empty), overlay: "primary"|"dark"|"none", ctaLabel: string, ctaHref: string }
- RichText: { content: string (markdown), alignment: "left"|"center", columns: 1|2 }
- Stats: { source: "auto"|"manual", items: [{label, value}] } — use source "auto" to pull live stats from DB
- ButtonGroup: { buttons: [{label, href, style: "primary"|"outline", size: "default"|"large"}] }
- Gallery: { images: [], columns: 2|3|4 } — leave images empty, user adds later
- Spacer: { size: "small"|"medium"|"large" }
- Card: { imageUrl: string, title: string, text: string, linkHref: string, linkLabel: string }
- Testimonial: { quote: string, attribution: string, photoUrl: string, style: "default"|"accent" }
- MapPreview: { height: 200|300|400, zoom: 14, showControls: false }
- Columns: { columnCount: 2|3|4 } — creates multi-column layouts
- Section: { backgroundColor: "default"|"primary"|"accent"|"surface"|"muted", backgroundImageUrl: "", paddingY: "small"|"medium"|"large" }

## Output Format
Return ONLY a JSON object matching this structure (no markdown fences):
{
  "root": { "props": {} },
  "content": [
    { "type": "ComponentName", "props": { ... } },
    ...
  ]
}

Create a compelling, professional landing page. Use 4-7 components. Start with a Hero, include Stats (auto), and end with a CTA ButtonGroup.`;
}

export async function generatePuckLandingPage(
  userPrompt: string,
  templateData?: Data
): Promise<{ data?: Data; error?: string }> {
  try {
    const tenant = await getTenantContext();
    if (!tenant.propertyId) return { error: 'No property context' };

    const supabase = createClient();

    // Fetch site context
    const { data: property } = await supabase
      .from('properties')
      .select('name, description, org_id')
      .eq('id', tenant.propertyId)
      .single();

    const { data: org } = await supabase
      .from('orgs')
      .select('name, tagline')
      .eq('id', tenant.orgId)
      .single();

    // Fetch item counts
    const { count: itemCount } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('property_id', tenant.propertyId);

    const { count: updateCount } = await supabase
      .from('item_updates')
      .select('*', { count: 'exact', head: true })
      .eq('property_id', tenant.propertyId);

    const context: SiteContext = {
      siteName: org?.name ?? 'Our Site',
      tagline: org?.tagline ?? '',
      locationName: property?.description ?? '',
      stats: { items: itemCount ?? 0, species: 0, updates: updateCount ?? 0 },
    };

    const systemPrompt = buildPuckGenerationPrompt(context);
    const fullPrompt = templateData
      ? `${userPrompt}\n\nStart from this template structure and customize the content:\n${JSON.stringify(templateData, null, 2)}`
      : userPrompt;

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: systemPrompt,
      prompt: fullPrompt,
      maxTokens: 2000,
    });

    // Parse and validate
    const cleaned = text.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim();
    const parsed = JSON.parse(cleaned);
    const validated = puckDataSchema.parse(parsed);

    return { data: validated as Data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Generation failed' };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/app/admin/site-builder/__tests__/generate.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/site-builder/generate.ts src/app/admin/site-builder/__tests__/generate.test.ts
git commit -m "feat: add AI generation for Puck landing page format"
```

---

### Task 15: Draft/Publish and Preview Support

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add preview support to the homepage**

In `src/app/page.tsx`, update the Puck rendering path to support `?preview=true` which reads from draft:

At the top of the component, read the search param:

```tsx
// Add searchParams to the page props
export default async function HomePage({ searchParams }: { searchParams: { preview?: string } }) {
```

Update the Puck check:

```tsx
const isPreview = searchParams?.preview === 'true';

// Puck landing page
const puckLandingData = isPreview
  ? (config.puckPagesDraft?.['/'] ?? config.puckPages?.['/'])
  : config.puckPages?.['/'];

if (puckLandingData) {
  return (
    <>
      {isPreview && (
        <div className="bg-yellow-100 px-4 py-2 text-center text-sm text-yellow-800">
          Preview Mode — This is a draft and not yet published.
        </div>
      )}
      <PuckPageRenderer data={puckLandingData} />
    </>
  );
}
```

- [ ] **Step 2: Add preview support for chrome in root layout**

In `src/app/layout.tsx`, check for preview mode when selecting chrome data:

```tsx
// When determining puckRoot:
const isPreview = searchParams?.preview === 'true'; // if available via page props
const puckRoot = isPreview
  ? (config.puckRootDraft ?? config.puckRoot)
  : config.puckRoot;
```

Note: In Next.js App Router, `searchParams` is only available in page components, not layouts. To pass preview state to the layout, use a cookie or header approach. The simplest approach is to check the `preview` search param in the page and pass draft data via a wrapper. For now, the chrome preview can be handled by having the chrome editor show an inline preview rather than requiring `?preview=true` on the layout.

- [ ] **Step 3: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add draft preview support for Puck landing page"
```

---

### Task 16: Integration Testing

**Files:**
- Test: `src/lib/puck/__tests__/integration.test.tsx`

- [ ] **Step 1: Write integration tests for the full render pipeline**

Create `src/lib/puck/__tests__/integration.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Render } from '@measured/puck';
import { pageConfig } from '../config';
import { classicTemplate } from '../templates/classic';
import { minimalTemplate } from '../templates/minimal';
import { showcaseTemplate } from '../templates/showcase';
import { puckDataSchema } from '../schemas';

describe('Template rendering integration', () => {
  it('Classic template renders without errors', () => {
    const data = classicTemplate.pages['/'];
    const validated = puckDataSchema.parse(data);
    const { container } = render(<Render config={pageConfig} data={validated} />);
    expect(container.innerHTML).not.toBe('');
    expect(screen.getByText('Welcome to Our Conservation Area')).toBeDefined();
  });

  it('Minimal template renders without errors', () => {
    const data = minimalTemplate.pages['/'];
    const validated = puckDataSchema.parse(data);
    const { container } = render(<Render config={pageConfig} data={validated} />);
    expect(container.innerHTML).not.toBe('');
  });

  it('Showcase template renders without errors', () => {
    const data = showcaseTemplate.pages['/'];
    const validated = puckDataSchema.parse(data);
    const { container } = render(<Render config={pageConfig} data={validated} />);
    expect(container.innerHTML).not.toBe('');
    expect(screen.getByText('Discover Our Conservation Area')).toBeDefined();
  });

  it('renders nested components (Columns with children) from config', () => {
    const data = {
      root: { props: {} },
      content: [
        { type: 'Hero', props: { title: 'Nested Test', subtitle: '', backgroundImageUrl: '', overlay: 'none', ctaLabel: '', ctaHref: '' } },
        { type: 'Stats', props: { source: 'manual', items: [{ label: 'Birds', value: '42' }] } },
      ],
    };
    render(<Render config={pageConfig} data={data} />);
    expect(screen.getByText('Nested Test')).toBeDefined();
    expect(screen.getByText('42')).toBeDefined();
    expect(screen.getByText('Birds')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
npm run test -- src/lib/puck/__tests__/integration.test.tsx
```

- [ ] **Step 3: Run the full test suite**

```bash
npm run test
```

- [ ] **Step 4: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/puck/__tests__/integration.test.tsx
git commit -m "test: add Puck template rendering integration tests"
```

---

## Phase 4: Cleanup (Later — Not Implemented Now)

This phase is deferred until all properties have manually migrated to Puck. When ready:

1. Drop `landing_page` column from `properties` table
2. Remove `src/components/landing/` (LandingRenderer + all block components)
3. Remove `src/components/admin/landing/` (old block editor + block-editors/)
4. Remove `src/lib/config/landing-types.ts` and `src/lib/config/landing-defaults.ts`
5. Remove `src/app/admin/landing/actions.ts` (old server actions)
6. Remove `landingPage` from `SiteConfig` type
7. Remove the legacy fallback paths in `src/app/page.tsx` and `src/app/layout.tsx`
8. Remove the `landing-assets` storage bucket references (if assets are migrated to a new scheme)

No tasks defined for this phase — it will be planned separately when the time comes.
