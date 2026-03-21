# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-generated, block-based landing pages that serve as the public homepage for Field Mapper sites, with a full admin editor for customization.

**Architecture:** Landing page content is stored as an ordered array of typed blocks in the existing `site_config` table (key: `landing_page`). Block renderer components use the existing CSS variable theme system. AI generation uses the Vercel AI SDK (`generateObject()` with Zod schemas) to produce validated block JSON. Assets are stored in a `landing-assets` Supabase Storage bucket.

**Tech Stack:** Next.js 14 (App Router), Supabase (Storage + RLS), Vercel AI SDK (`ai` + `@ai-sdk/anthropic`), `react-markdown` + `remark-gfm`, Zod, Tailwind CSS with CSS variable theme system.

**Spec:** `docs/superpowers/specs/2026-03-21-landing-page-design.md`

---

## File Structure

### New Files

```
src/lib/config/landing-types.ts        # LandingPageConfig, LandingAsset, all block type interfaces
src/lib/config/landing-defaults.ts     # createDefaultLandingPage() helper
src/lib/landing/schemas.ts             # Zod schemas for block validation + generateObject()
src/lib/landing/stats.ts               # fetchLandingStats() with unstable_cache

src/components/landing/LandingRenderer.tsx    # Maps block[] → components
src/components/landing/blocks/HeroBlock.tsx
src/components/landing/blocks/TextBlock.tsx
src/components/landing/blocks/ImageBlock.tsx
src/components/landing/blocks/ButtonBlock.tsx
src/components/landing/blocks/LinksBlock.tsx
src/components/landing/blocks/StatsBlock.tsx
src/components/landing/blocks/GalleryBlock.tsx
src/components/landing/blocks/SpacerBlock.tsx

src/components/landing/LandingRendererPreview.tsx  # Client-safe preview (no async StatsBlock)
src/components/map/HomeMapView.tsx     # Client wrapper extracting map logic from page.tsx
src/app/map/page.tsx                   # /map route — current map page logic

src/components/admin/landing/AssetManager.tsx   # Image/doc/link upload + management
src/components/admin/landing/AssetPicker.tsx     # Modal for selecting images in block editors
src/components/admin/landing/BlockList.tsx       # Ordered block list with expand/collapse/reorder
src/components/admin/landing/BlockEditor.tsx     # Dispatches to per-type editor
src/components/admin/landing/GenerateSection.tsx # Prompt textarea + generate/regenerate buttons
src/components/admin/landing/HomepageToggle.tsx  # Landing Page vs Map toggle
src/components/admin/landing/block-editors/HeroEditor.tsx
src/components/admin/landing/block-editors/TextEditor.tsx
src/components/admin/landing/block-editors/ImageEditor.tsx
src/components/admin/landing/block-editors/ButtonEditor.tsx
src/components/admin/landing/block-editors/LinksEditor.tsx
src/components/admin/landing/block-editors/StatsEditor.tsx
src/components/admin/landing/block-editors/GalleryEditor.tsx
src/components/admin/landing/block-editors/SpacerEditor.tsx

src/app/admin/landing/page.tsx         # Admin landing page editor
src/app/admin/landing/actions.ts       # Server actions: save, generate, upload/delete assets

supabase/migrations/007_landing_assets.sql   # Storage bucket + RLS

src/__tests__/landing/block-renderers.test.tsx  # Block renderer unit tests
src/__tests__/landing/schemas.test.ts           # Zod schema validation tests
src/__tests__/landing/stats.test.ts             # Stats fetching tests
src/__tests__/landing/landing-page.test.tsx      # Landing page route logic tests
```

### Modified Files

```
src/lib/config/types.ts         # Add landingPage to SiteConfig + CONFIG_KEY_MAP
src/lib/config/defaults.ts      # Add landingPage: null to DEFAULT_CONFIG
src/lib/config/server.ts        # Add backfill logic for existing sites
src/app/page.tsx                # Rewrite as server component (landing page renderer + map fallback)
src/components/layout/Navigation.tsx  # Conditional Home/Map links when landing page enabled
src/app/admin/layout.tsx        # Add "Landing Page" link to admin nav
src/app/setup/actions.ts        # Add setupSaveLandingPage server action
src/app/setup/page.tsx          # Call landing page creation during setup launch
src/app/about/page.tsx          # Upgrade to react-markdown
package.json                    # Add new dependencies
```

---

## Chunk 1: Foundation (Types, Config, Dependencies, Migration)

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install ai @ai-sdk/anthropic react-markdown remark-gfm zod
```

- [ ] **Step 2: Verify installation**

```bash
npm ls ai @ai-sdk/anthropic react-markdown remark-gfm zod
```

Expected: All packages listed with versions, no UNMET PEER DEP errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add landing page dependencies (ai sdk, react-markdown, zod)"
```

---

### Task 2: Add landing page types

**Files:**
- Create: `src/lib/config/landing-types.ts`
- Modify: `src/lib/config/types.ts`

- [ ] **Step 1: Create landing page type definitions**

Create `src/lib/config/landing-types.ts` with all interfaces from the spec:

```typescript
export interface LandingPageConfig {
  enabled: boolean;
  blocks: LandingBlock[];
  generatedFrom?: string;
  assets: LandingAsset[];
}

export interface LandingAsset {
  id: string;
  storagePath: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  category: 'image' | 'document';
  description?: string;
  uploadedAt: string;
}

export type LandingBlock =
  | HeroBlock
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | LinksBlock
  | StatsBlock
  | GalleryBlock
  | SpacerBlock;

export interface BlockBase {
  id: string;
  type: string;
}

export interface HeroBlock extends BlockBase {
  type: 'hero';
  title: string;
  subtitle?: string;
  backgroundImageUrl?: string;
  overlay?: boolean;
}

export interface TextBlock extends BlockBase {
  type: 'text';
  content: string;
  alignment?: 'left' | 'center';
}

export interface ImageBlock extends BlockBase {
  type: 'image';
  url: string;
  alt: string;
  caption?: string;
  width?: 'small' | 'medium' | 'full';
}

export interface ButtonBlock extends BlockBase {
  type: 'button';
  label: string;
  href: string;
  style?: 'primary' | 'outline';
  size?: 'default' | 'large';
}

export interface LinksBlock extends BlockBase {
  type: 'links';
  items: { label: string; url: string; description?: string }[];
  layout?: 'inline' | 'stacked';
}

export interface StatsBlock extends BlockBase {
  type: 'stats';
  source: 'manual' | 'auto';
  items?: { label: string; value: string }[];
}

export interface GalleryBlock extends BlockBase {
  type: 'gallery';
  images: { url: string; alt: string; caption?: string }[];
  columns?: 2 | 3 | 4;
}

export interface SpacerBlock extends BlockBase {
  type: 'spacer';
  size: 'small' | 'medium' | 'large';
}
```

- [ ] **Step 2: Add `landingPage` to `SiteConfig` interface**

In `src/lib/config/types.ts`, add to the `SiteConfig` interface (after `setupComplete: boolean;`):

```typescript
  landingPage: LandingPageConfig | null;
```

Add the import at the top:

```typescript
import type { LandingPageConfig } from './landing-types';
```

- [ ] **Step 3: Add `landing_page` to `CONFIG_KEY_MAP`**

In `src/lib/config/types.ts`, add to the `CONFIG_KEY_MAP` object:

```typescript
  landing_page: 'landingPage',
```

- [ ] **Step 4: Add default to `DEFAULT_CONFIG`**

In `src/lib/config/defaults.ts`, add to the `DEFAULT_CONFIG` object (after `setupComplete: false,`):

```typescript
  landingPage: null,
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/config/landing-types.ts src/lib/config/types.ts src/lib/config/defaults.ts
git commit -m "feat: add landing page type definitions and config integration"
```

---

### Task 3: Add Zod schemas for block validation

**Files:**
- Create: `src/lib/landing/schemas.ts`
- Create: `src/__tests__/landing/schemas.test.ts`

- [ ] **Step 1: Write schema validation tests**

Create `src/__tests__/landing/schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { landingBlocksSchema } from '@/lib/landing/schemas';

describe('landingBlocksSchema', () => {
  it('validates a valid hero block', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'hero', title: 'Hello', subtitle: 'World' },
    ]);
    expect(result.success).toBe(true);
  });

  it('validates a valid text block', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'text', content: '# Hello' },
    ]);
    expect(result.success).toBe(true);
  });

  it('validates a valid button block', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'button', label: 'Click', href: '/map' },
    ]);
    expect(result.success).toBe(true);
  });

  it('validates a stats block with auto source', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'stats', source: 'auto' },
    ]);
    expect(result.success).toBe(true);
  });

  it('validates a stats block with manual source and items', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'stats', source: 'manual', items: [{ label: 'Count', value: '42' }] },
    ]);
    expect(result.success).toBe(true);
  });

  it('validates a complete block array with multiple types', () => {
    const blocks = [
      { id: '1', type: 'hero', title: 'Welcome' },
      { id: '2', type: 'text', content: 'Description' },
      { id: '3', type: 'image', url: 'img.jpg', alt: 'Photo' },
      { id: '4', type: 'button', label: 'Go', href: '/map' },
      { id: '5', type: 'links', items: [{ label: 'Link', url: 'https://example.com' }] },
      { id: '6', type: 'stats', source: 'auto' },
      { id: '7', type: 'gallery', images: [{ url: 'a.jpg', alt: 'A' }] },
      { id: '8', type: 'spacer', size: 'medium' },
    ];
    const result = landingBlocksSchema.safeParse(blocks);
    expect(result.success).toBe(true);
  });

  it('rejects invalid block type', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'invalid', content: 'test' },
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects hero block missing title', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'hero' },
    ]);
    expect(result.success).toBe(false);
  });

  it('applies default values for optional fields', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'button', label: 'Click', href: '/map' },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      const button = result.data[0];
      if (button.type === 'button') {
        expect(button.style).toBe('primary');
        expect(button.size).toBe('default');
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/landing/schemas.test.ts
```

Expected: FAIL — module `@/lib/landing/schemas` not found.

- [ ] **Step 3: Create Zod schemas**

Create `src/lib/landing/schemas.ts`:

```typescript
import { z } from 'zod';

const heroBlockSchema = z.object({
  id: z.string(),
  type: z.literal('hero'),
  title: z.string(),
  subtitle: z.string().optional(),
  backgroundImageUrl: z.string().optional(),
  overlay: z.boolean().default(true),
});

const textBlockSchema = z.object({
  id: z.string(),
  type: z.literal('text'),
  content: z.string(),
  alignment: z.enum(['left', 'center']).default('left'),
});

const imageBlockSchema = z.object({
  id: z.string(),
  type: z.literal('image'),
  url: z.string(),
  alt: z.string(),
  caption: z.string().optional(),
  width: z.enum(['small', 'medium', 'full']).default('medium'),
});

const buttonBlockSchema = z.object({
  id: z.string(),
  type: z.literal('button'),
  label: z.string(),
  href: z.string(),
  style: z.enum(['primary', 'outline']).default('primary'),
  size: z.enum(['default', 'large']).default('default'),
});

const linksBlockSchema = z.object({
  id: z.string(),
  type: z.literal('links'),
  items: z.array(z.object({
    label: z.string(),
    url: z.string(),
    description: z.string().optional(),
  })),
  layout: z.enum(['inline', 'stacked']).default('stacked'),
});

const statsBlockSchema = z.object({
  id: z.string(),
  type: z.literal('stats'),
  source: z.enum(['manual', 'auto']),
  items: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).optional(),
});

const galleryBlockSchema = z.object({
  id: z.string(),
  type: z.literal('gallery'),
  images: z.array(z.object({
    url: z.string(),
    alt: z.string(),
    caption: z.string().optional(),
  })),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
});

const spacerBlockSchema = z.object({
  id: z.string(),
  type: z.literal('spacer'),
  size: z.enum(['small', 'medium', 'large']),
});

const landingBlockSchema = z.discriminatedUnion('type', [
  heroBlockSchema,
  textBlockSchema,
  imageBlockSchema,
  buttonBlockSchema,
  linksBlockSchema,
  statsBlockSchema,
  galleryBlockSchema,
  spacerBlockSchema,
]);

export const landingBlocksSchema = z.array(landingBlockSchema);

/**
 * Schema for AI generation — same structure but without `id` field
 * (IDs are added post-generation).
 */
export const generationBlocksSchema = z.array(
  z.discriminatedUnion('type', [
    heroBlockSchema.omit({ id: true }),
    textBlockSchema.omit({ id: true }),
    imageBlockSchema.omit({ id: true }),
    buttonBlockSchema.omit({ id: true }),
    linksBlockSchema.omit({ id: true }),
    statsBlockSchema.omit({ id: true }),
    galleryBlockSchema.omit({ id: true }),
    spacerBlockSchema.omit({ id: true }),
  ])
);

```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/landing/schemas.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/schemas.ts src/__tests__/landing/schemas.test.ts
git commit -m "feat: add Zod schemas for landing page block validation"
```

---

### Task 4: Add backfill logic for existing sites

**Files:**
- Modify: `src/lib/config/server.ts`
- Create: `src/lib/config/landing-defaults.ts`

- [ ] **Step 1: Create default landing page builder**

Create `src/lib/config/landing-defaults.ts`:

```typescript
import type { LandingPageConfig } from './landing-types';

/**
 * Creates a default landing page config from site config values.
 * Used during setup (enabled: true) and backfill for existing sites (enabled: false).
 */
export function createDefaultLandingPage(
  siteName: string,
  tagline: string,
  locationName: string,
  enabled: boolean
): LandingPageConfig {
  const locationText = locationName ? ` at ${locationName}` : '';
  return {
    enabled,
    blocks: [
      {
        id: crypto.randomUUID(),
        type: 'hero' as const,
        title: siteName,
        subtitle: tagline,
      },
      {
        id: crypto.randomUUID(),
        type: 'text' as const,
        content: `Welcome to ${siteName}${locationText}. Explore our interactive map to discover and track points of interest in the field.`,
      },
      {
        id: crypto.randomUUID(),
        type: 'stats' as const,
        source: 'auto' as const,
      },
      {
        id: crypto.randomUUID(),
        type: 'button' as const,
        label: 'Explore the Map',
        href: '/map',
        style: 'primary' as const,
        size: 'large' as const,
      },
    ],
    assets: [],
  };
}
```

- [ ] **Step 2: Add backfill logic to `getConfig()`**

In `src/lib/config/server.ts`, add import at top:

```typescript
import { createDefaultLandingPage } from './landing-defaults';
```

Inside the `getConfig` cached function, after the `for (const row of data)` loop and before `return config;`, add:

```typescript
    // Backfill landing page for existing sites that were set up before this feature
    if (config.landingPage === null && config.setupComplete) {
      config.landingPage = createDefaultLandingPage(
        config.siteName,
        config.tagline,
        config.locationName,
        false // existing sites: disabled by default
      );
    }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/config/landing-defaults.ts src/lib/config/server.ts
git commit -m "feat: add landing page backfill logic for existing sites"
```

---

### Task 5: Create Supabase storage migration

**Files:**
- Create: `supabase/migrations/007_landing_assets.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/007_landing_assets.sql`:

```sql
-- Create landing-assets storage bucket for landing page images and documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('landing-assets', 'landing-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Note: The landing_page key is a NEW key in site_config, not part of the original seed.
-- Server actions use upsert (not update) since the row may not exist yet.
-- The site_config table has a unique constraint on the `key` column.

-- Public SELECT: anyone can view landing page images
CREATE POLICY "Public read access for landing assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'landing-assets');

-- Admin INSERT: only authenticated admin users can upload
-- Note: Admin role check is enforced at the application layer (middleware).
-- This policy allows any authenticated user to insert, matching the pattern
-- used by item-photos bucket. The /admin/* middleware prevents non-admins.
CREATE POLICY "Authenticated users can upload landing assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'landing-assets');

-- Admin DELETE: only authenticated users can delete
CREATE POLICY "Authenticated users can delete landing assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'landing-assets');
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/007_landing_assets.sql
git commit -m "feat: add landing-assets storage bucket migration with RLS"
```

---

### Task 6: Add landing page creation to setup wizard

**Files:**
- Modify: `src/app/setup/actions.ts`
- Modify: `src/app/setup/page.tsx`

- [ ] **Step 1: Add `setupSaveLandingPage` server action**

In `src/app/setup/actions.ts`, add import at top:

```typescript
import { createDefaultLandingPage } from '@/lib/config/landing-defaults';
```

Add new server action at the end of the file:

```typescript
export async function setupSaveLandingPage(
  siteName: string,
  tagline: string,
  locationName: string
) {
  const supabase = createServiceClient();

  const landingPage = createDefaultLandingPage(siteName, tagline, locationName, true);

  const { error } = await supabase
    .from('site_config')
    .upsert({ key: 'landing_page', value: landingPage });

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
```

- [ ] **Step 2: Call landing page creation in setup launch handler**

In `src/app/setup/page.tsx`, find the `handleLaunch` function (around line 106). Add import at top of file:

```typescript
import { setupSaveLandingPage } from './actions';
```

Inside `handleLaunch`, add the landing page creation call **BEFORE** `setupComplete()` (not after — `setupComplete` invalidates the config cache, and we need the landing page to exist before that happens):

```typescript
      // Create default landing page (must be before setupComplete which invalidates cache)
      await setupSaveLandingPage(siteName, tagline, locationName);
```

The `siteName`, `tagline`, and `locationName` variables should already be in scope from the component state.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/setup/actions.ts src/app/setup/page.tsx
git commit -m "feat: create default landing page during site setup"
```

---

## Chunk 2: Block Renderer Components

### Task 7: Create LandingRenderer and simple block components

**Files:**
- Create: `src/components/landing/LandingRenderer.tsx`
- Create: `src/components/landing/blocks/SpacerBlock.tsx`
- Create: `src/components/landing/blocks/ButtonBlock.tsx`
- Create: `src/components/landing/blocks/ImageBlock.tsx`
- Create: `src/components/landing/blocks/LinksBlock.tsx`
- Create: `src/__tests__/landing/block-renderers.test.tsx`

- [ ] **Step 1: Write failing tests for simple block renderers**

Create `src/__tests__/landing/block-renderers.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingRenderer } from '@/components/landing/LandingRenderer';
import type { LandingBlock } from '@/lib/config/landing-types';

describe('LandingRenderer', () => {
  it('renders nothing for empty blocks array', () => {
    const { container } = render(<LandingRenderer blocks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a spacer block', () => {
    const blocks: LandingBlock[] = [
      { id: '1', type: 'spacer', size: 'medium' },
    ];
    const { container } = render(<LandingRenderer blocks={blocks} />);
    expect(container.querySelector('[data-block-type="spacer"]')).toBeTruthy();
  });

  it('renders a button block with link', () => {
    const blocks: LandingBlock[] = [
      { id: '1', type: 'button', label: 'Go to Map', href: '/map', style: 'primary', size: 'large' },
    ];
    render(<LandingRenderer blocks={blocks} />);
    const link = screen.getByRole('link', { name: 'Go to Map' });
    expect(link).toHaveAttribute('href', '/map');
  });

  it('renders an image block with alt text', () => {
    const blocks: LandingBlock[] = [
      { id: '1', type: 'image', url: '/test.jpg', alt: 'Test image', width: 'medium' },
    ];
    render(<LandingRenderer blocks={blocks} />);
    expect(screen.getByAltText('Test image')).toBeTruthy();
  });

  it('renders a links block with multiple items', () => {
    const blocks: LandingBlock[] = [
      {
        id: '1', type: 'links',
        items: [
          { label: 'Example', url: 'https://example.com' },
          { label: 'Test', url: 'https://test.com', description: 'A test site' },
        ],
        layout: 'stacked',
      },
    ];
    render(<LandingRenderer blocks={blocks} />);
    expect(screen.getByText('Example')).toBeTruthy();
    expect(screen.getByText('Test')).toBeTruthy();
    expect(screen.getByText('A test site')).toBeTruthy();
  });

  it('renders image block without broken img when url is empty', () => {
    const blocks: LandingBlock[] = [
      { id: '1', type: 'image', url: '', alt: 'Missing', width: 'medium' },
    ];
    const { container } = render(<LandingRenderer blocks={blocks} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/landing/block-renderers.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create SpacerBlock component**

Create `src/components/landing/blocks/SpacerBlock.tsx`:

```typescript
import type { SpacerBlock as SpacerBlockType } from '@/lib/config/landing-types';

const sizeClasses = {
  small: 'py-4',
  medium: 'py-8',
  large: 'py-16',
};

export function SpacerBlock({ block }: { block: SpacerBlockType }) {
  return <div data-block-type="spacer" className={sizeClasses[block.size]} />;
}
```

- [ ] **Step 4: Create ButtonBlock component**

Create `src/components/landing/blocks/ButtonBlock.tsx`:

```typescript
import Link from 'next/link';
import type { ButtonBlock as ButtonBlockType } from '@/lib/config/landing-types';

export function ButtonBlock({ block }: { block: ButtonBlockType }) {
  const style = block.style ?? 'primary';
  const size = block.size ?? 'default';

  const baseClasses = 'inline-block rounded-lg font-semibold transition-colors text-center';
  const sizeClasses = size === 'large' ? 'px-8 py-4 text-lg' : 'px-6 py-3 text-base';
  const styleClasses = style === 'primary'
    ? 'bg-forest text-white hover:bg-forest-dark'
    : 'border-2 border-forest text-forest hover:bg-forest hover:text-white';

  const isExternal = block.href.startsWith('http');

  if (isExternal) {
    return (
      <div data-block-type="button" className="text-center py-4">
        <a href={block.href} target="_blank" rel="noopener noreferrer"
          className={`${baseClasses} ${sizeClasses} ${styleClasses}`}>
          {block.label}
        </a>
      </div>
    );
  }

  return (
    <div data-block-type="button" className="text-center py-4">
      <Link href={block.href} className={`${baseClasses} ${sizeClasses} ${styleClasses}`}>
        {block.label}
      </Link>
    </div>
  );
}
```

- [ ] **Step 5: Create ImageBlock component**

Create `src/components/landing/blocks/ImageBlock.tsx`:

```typescript
import type { ImageBlock as ImageBlockType } from '@/lib/config/landing-types';

const widthClasses = {
  small: 'max-w-sm',
  medium: 'max-w-2xl',
  full: 'max-w-full',
};

export function ImageBlock({ block }: { block: ImageBlockType }) {
  const width = block.width ?? 'medium';

  // Graceful degradation: skip rendering if URL is empty/missing
  if (!block.url) return null;

  return (
    <figure data-block-type="image" className={`mx-auto ${widthClasses[width]} py-4`}>
      <img
        src={block.url}
        alt={block.alt}
        className="w-full rounded-lg"
        loading="lazy"
      />
      {block.caption && (
        <figcaption className="text-center text-sm text-sage mt-2">
          {block.caption}
        </figcaption>
      )}
    </figure>
  );
}
```

- [ ] **Step 6: Create LinksBlock component**

Create `src/components/landing/blocks/LinksBlock.tsx`:

```typescript
import type { LinksBlock as LinksBlockType } from '@/lib/config/landing-types';

export function LinksBlock({ block }: { block: LinksBlockType }) {
  const layout = block.layout ?? 'stacked';

  const containerClasses = layout === 'inline'
    ? 'flex flex-wrap justify-center gap-4 py-4'
    : 'flex flex-col gap-3 py-4 max-w-2xl mx-auto';

  return (
    <div data-block-type="links" className={containerClasses}>
      {block.items.map((item, i) => (
        <a
          key={i}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`group ${layout === 'stacked' ? 'block p-4 rounded-lg bg-sage-light hover:bg-forest/10 transition-colors' : 'text-forest hover:text-forest-dark underline'}`}
        >
          <span className="font-medium text-forest-dark group-hover:text-forest">
            {item.label}
          </span>
          {item.description && layout === 'stacked' && (
            <span className="block text-sm text-sage mt-1">{item.description}</span>
          )}
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Create LandingRenderer**

Create `src/components/landing/LandingRenderer.tsx`:

```typescript
import type { LandingBlock } from '@/lib/config/landing-types';
import { SpacerBlock } from './blocks/SpacerBlock';
import { ButtonBlock } from './blocks/ButtonBlock';
import { ImageBlock } from './blocks/ImageBlock';
import { LinksBlock } from './blocks/LinksBlock';

function BlockComponent({ block }: { block: LandingBlock }) {
  switch (block.type) {
    case 'spacer':
      return <SpacerBlock block={block} />;
    case 'button':
      return <ButtonBlock block={block} />;
    case 'image':
      return <ImageBlock block={block} />;
    case 'links':
      return <LinksBlock block={block} />;
    case 'hero':
    case 'text':
    case 'stats':
    case 'gallery':
      // TODO: Implement in next tasks
      return <div data-block-type={block.type} />;
    default:
      return null;
  }
}

export function LandingRenderer({ blocks }: { blocks: LandingBlock[] }) {
  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.map((block) => (
        <BlockComponent key={block.id} block={block} />
      ))}
    </>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/landing/block-renderers.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/landing/ src/__tests__/landing/block-renderers.test.tsx
git commit -m "feat: add LandingRenderer with spacer, button, image, links blocks"
```

---

### Task 8: Create HeroBlock, TextBlock, GalleryBlock components

**Files:**
- Create: `src/components/landing/blocks/HeroBlock.tsx`
- Create: `src/components/landing/blocks/TextBlock.tsx`
- Create: `src/components/landing/blocks/GalleryBlock.tsx`
- Modify: `src/components/landing/LandingRenderer.tsx`
- Modify: `src/__tests__/landing/block-renderers.test.tsx`

- [ ] **Step 1: Add tests for hero, text, and gallery blocks**

Append to `src/__tests__/landing/block-renderers.test.tsx`:

```typescript
describe('HeroBlock', () => {
  it('renders title and subtitle', () => {
    const blocks: LandingBlock[] = [
      { id: '1', type: 'hero', title: 'Welcome', subtitle: 'To our site' },
    ];
    render(<LandingRenderer blocks={blocks} />);
    expect(screen.getByText('Welcome')).toBeTruthy();
    expect(screen.getByText('To our site')).toBeTruthy();
  });
});

describe('TextBlock', () => {
  it('renders markdown content', () => {
    const blocks: LandingBlock[] = [
      { id: '1', type: 'text', content: 'Hello **world**' },
    ];
    render(<LandingRenderer blocks={blocks} />);
    expect(screen.getByText('world')).toBeTruthy();
  });
});

describe('GalleryBlock', () => {
  it('renders multiple images', () => {
    const blocks: LandingBlock[] = [
      {
        id: '1', type: 'gallery',
        images: [
          { url: '/a.jpg', alt: 'Image A' },
          { url: '/b.jpg', alt: 'Image B' },
        ],
        columns: 2,
      },
    ];
    render(<LandingRenderer blocks={blocks} />);
    expect(screen.getByAltText('Image A')).toBeTruthy();
    expect(screen.getByAltText('Image B')).toBeTruthy();
  });

  it('skips images with empty URLs in gallery', () => {
    const blocks: LandingBlock[] = [
      {
        id: '1', type: 'gallery',
        images: [
          { url: '', alt: 'Missing' },
          { url: '/b.jpg', alt: 'Image B' },
        ],
      },
    ];
    render(<LandingRenderer blocks={blocks} />);
    expect(screen.queryByAltText('Missing')).toBeNull();
    expect(screen.getByAltText('Image B')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
npx vitest run src/__tests__/landing/block-renderers.test.tsx
```

Expected: New tests FAIL (hero/text/gallery not implemented yet).

- [ ] **Step 3: Create HeroBlock component**

Create `src/components/landing/blocks/HeroBlock.tsx`:

```typescript
import type { HeroBlock as HeroBlockType } from '@/lib/config/landing-types';

export function HeroBlock({ block }: { block: HeroBlockType }) {
  const overlay = block.overlay ?? true;

  return (
    <div
      data-block-type="hero"
      className="relative flex items-center justify-center min-h-[300px] bg-forest-dark text-white"
      style={block.backgroundImageUrl ? {
        backgroundImage: `url(${block.backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : undefined}
    >
      {overlay && block.backgroundImageUrl && (
        <div className="absolute inset-0 bg-black/40" />
      )}
      <div className="relative z-10 text-center px-6 py-16">
        <h1 className="font-heading text-4xl md:text-5xl font-bold mb-4">
          {block.title}
        </h1>
        {block.subtitle && (
          <p className="text-lg md:text-xl opacity-90 max-w-2xl mx-auto">
            {block.subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create TextBlock component**

Create `src/components/landing/blocks/TextBlock.tsx`:

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TextBlock as TextBlockType } from '@/lib/config/landing-types';

export function TextBlock({ block }: { block: TextBlockType }) {
  const alignment = block.alignment ?? 'left';

  return (
    <div
      data-block-type="text"
      className={`max-w-3xl mx-auto px-6 py-4 ${alignment === 'center' ? 'text-center' : ''}`}
    >
      <div className="prose prose-forest max-w-none text-forest-dark/80">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {block.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create GalleryBlock component**

Create `src/components/landing/blocks/GalleryBlock.tsx`:

```typescript
import type { GalleryBlock as GalleryBlockType } from '@/lib/config/landing-types';

const columnClasses = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
};

export function GalleryBlock({ block }: { block: GalleryBlockType }) {
  const columns = block.columns ?? 3;
  const validImages = block.images.filter((img) => img.url);

  if (validImages.length === 0) return null;

  return (
    <div data-block-type="gallery" className={`grid ${columnClasses[columns]} gap-4 px-6 py-4 max-w-5xl mx-auto`}>
      {validImages.map((img, i) => (
        <figure key={i} className="overflow-hidden rounded-lg">
          <img
            src={img.url}
            alt={img.alt}
            className="w-full aspect-square object-cover"
            loading="lazy"
          />
          {img.caption && (
            <figcaption className="text-center text-sm text-sage mt-2 px-2">
              {img.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Update LandingRenderer to wire in new blocks**

In `src/components/landing/LandingRenderer.tsx`, add imports:

```typescript
import { HeroBlock } from './blocks/HeroBlock';
import { TextBlock } from './blocks/TextBlock';
import { GalleryBlock } from './blocks/GalleryBlock';
```

Replace the TODO cases in the switch:

```typescript
    case 'hero':
      return <HeroBlock block={block} />;
    case 'text':
      return <TextBlock block={block} />;
    case 'gallery':
      return <GalleryBlock block={block} />;
    case 'stats':
      // TODO: Implement in next task
      return <div data-block-type={block.type} />;
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/landing/block-renderers.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/landing/ src/__tests__/landing/block-renderers.test.tsx
git commit -m "feat: add hero, text, gallery block renderer components"
```

---

### Task 9: Create StatsBlock component

**Files:**
- Create: `src/lib/landing/stats.ts`
- Create: `src/components/landing/blocks/StatsBlock.tsx`
- Modify: `src/components/landing/LandingRenderer.tsx`

- [ ] **Step 1: Create stats fetching utility**

Create `src/lib/landing/stats.ts`:

```typescript
import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

const STATS_CACHE_TAG = 'landing-stats';

interface StatItem {
  label: string;
  value: string;
}

function createStatsClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Fetches live stats from the database for the StatsBlock auto mode.
 * Cached for 60 seconds. Smart-filtered: only returns stats with count > 0.
 * Returns null if fewer than 2 stats qualify (block should be hidden).
 */
export const fetchLandingStats = unstable_cache(
  async (): Promise<StatItem[] | null> => {
    const supabase = createStatsClient();

    const [itemRes, typeRes, updateRes, speciesRes] = await Promise.all([
      supabase.from('items').select('id', { count: 'exact', head: true }).neq('status', 'removed'),
      supabase.from('item_types').select('id', { count: 'exact', head: true }),
      supabase.from('item_updates').select('id', { count: 'exact', head: true }),
      supabase.from('species').select('id', { count: 'exact', head: true }),
    ]);

    const stats: StatItem[] = [];
    if (itemRes.count && itemRes.count > 0) stats.push({ label: 'Items', value: String(itemRes.count) });
    if (typeRes.count && typeRes.count > 0) stats.push({ label: 'Types', value: String(typeRes.count) });
    if (updateRes.count && updateRes.count > 0) stats.push({ label: 'Updates', value: String(updateRes.count) });
    if (speciesRes.count && speciesRes.count > 0) stats.push({ label: 'Species', value: String(speciesRes.count) });

    // Hide block if fewer than 2 stats qualify
    if (stats.length < 2) return null;

    return stats;
  },
  [STATS_CACHE_TAG],
  { revalidate: 60, tags: [STATS_CACHE_TAG] }
);
```

- [ ] **Step 2: Create StatsBlock component**

Create `src/components/landing/blocks/StatsBlock.tsx`:

```typescript
import type { StatsBlock as StatsBlockType } from '@/lib/config/landing-types';
import { fetchLandingStats } from '@/lib/landing/stats';

export async function StatsBlock({ block }: { block: StatsBlockType }) {
  let items: { label: string; value: string }[] | null = null;

  if (block.source === 'auto') {
    items = await fetchLandingStats();
    if (!items) return null; // fewer than 2 stats — hide block
  } else {
    items = block.items ?? [];
    if (items.length === 0) return null;
  }

  return (
    <div data-block-type="stats" className="bg-sage-light py-8">
      <div className="flex flex-wrap justify-center gap-8 md:gap-16 max-w-4xl mx-auto px-6">
        {items.map((item, i) => (
          <div key={i} className="text-center">
            <div className="text-3xl font-bold text-forest-dark">{item.value}</div>
            <div className="text-sm text-sage uppercase tracking-wide mt-1">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update LandingRenderer to wire in StatsBlock**

In `src/components/landing/LandingRenderer.tsx`, add import:

```typescript
import { StatsBlock } from './blocks/StatsBlock';
```

Replace the stats TODO case:

```typescript
    case 'stats':
      return <StatsBlock block={block} />;
```

Note: StatsBlock is an async server component. LandingRenderer must be used in a server component context (which it will be — the public landing page is a server component).

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/stats.ts src/components/landing/blocks/StatsBlock.tsx src/components/landing/LandingRenderer.tsx
git commit -m "feat: add StatsBlock with auto mode and smart filtering"
```

---

## Chunk 3: Routing and Navigation

### Task 10: Move map to /map route

**Files:**
- Create: `src/app/map/page.tsx`
- Create: `src/components/map/HomeMapView.tsx`

- [ ] **Step 1: Create HomeMapView client component**

Extract the map page logic into a reusable client component. Create `src/components/map/HomeMapView.tsx` — copy the entire contents of the current `src/app/page.tsx` but rename the default export to `HomeMapView` and remove the `"use client"` directive (it will be a regular client component imported by pages that need it).

Actually, keep `"use client"` since it IS a client component. Copy the full `src/app/page.tsx` content into `src/components/map/HomeMapView.tsx` with these changes:

1. Keep `"use client"` at top
2. Rename `HomePage` to `HomeMapView` and export it as named export
3. Rename `HomePageContent` to `HomeMapViewContent`
4. Remove the `Suspense` wrapper from the exported component (let the page handle Suspense)

The component should export:

```typescript
export function HomeMapView() {
  return (
    <Suspense fallback={...}>
      <HomeMapViewContent />
    </Suspense>
  );
}
```

Keep all the existing logic (items fetch, marker click, detail panel, etc.) exactly the same.

- [ ] **Step 2: Create /map route**

Create `src/app/map/page.tsx`:

```typescript
import { HomeMapView } from '@/components/map/HomeMapView';

export default function MapPage() {
  return <HomeMapView />;
}
```

- [ ] **Step 3: Verify the /map route works**

```bash
npm run build
```

Expected: Build succeeds without errors. The /map page should render the same map view as the current home page.

- [ ] **Step 4: Commit**

```bash
git add src/components/map/HomeMapView.tsx src/app/map/page.tsx
git commit -m "feat: add /map route with extracted HomeMapView component"
```

---

### Task 11: Rewrite / as landing page with map fallback

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/__tests__/landing/landing-page.test.tsx`

- [ ] **Step 1: Rewrite `src/app/page.tsx` as server component**

Replace the entire contents of `src/app/page.tsx` with:

```typescript
import { redirect } from 'next/navigation';
import { getConfig } from '@/lib/config/server';
import { LandingRenderer } from '@/components/landing/LandingRenderer';
import { HomeMapView } from '@/components/map/HomeMapView';

interface HomePageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = searchParams;
  const config = await getConfig();

  // Forward any query params to /map (preserves deep links like ?item=123)
  if (Object.keys(params).length > 0) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        query.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => query.append(key, v));
      }
    }
    redirect(`/map?${query.toString()}`);
  }

  // Landing page enabled — render blocks
  if (config.landingPage?.enabled && config.landingPage.blocks.length > 0) {
    return (
      <main className="pb-20 md:pb-0">
        <LandingRenderer blocks={config.landingPage.blocks} />
      </main>
    );
  }

  // Fallback — render map (current behavior)
  return <HomeMapView />;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Verify build succeeds**

```bash
npm run build
```

Expected: Build succeeds. The page now conditionally renders landing page or map.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: rewrite / as server component with landing page + map fallback"
```

---

### Task 12: Update navigation for conditional Home/Map links

**Files:**
- Modify: `src/components/layout/Navigation.tsx`

- [ ] **Step 1: Read current Navigation.tsx to understand structure**

Read `src/components/layout/Navigation.tsx` fully to understand the link structure before modifying.

- [ ] **Step 2: Add landing page awareness to navigation**

The Navigation component uses `useConfig()`. Modify it to:

1. Check `config.landingPage?.enabled`
2. When landing page is enabled:
   - Show "Home" linking to `/` (instead of "Map")
   - Show "Map" linking to `/map`
   - Keep "List" and "About" as-is
3. When landing page is disabled:
   - Show "Map" linking to `/` (current behavior)
   - Do NOT show a separate "Map" link to `/map`
   - Keep "List" and "About" as-is

Update both desktop nav links, mobile menu links, and mobile bottom tab bar.

Also update the admin nav: in the admin layout at `src/app/admin/layout.tsx`, add a "Landing Page" link:

```typescript
<Link
  href="/admin/landing"
  className={`text-sm transition-colors ${
    pathname.startsWith('/admin/landing')
      ? 'text-white font-medium'
      : 'text-white/60 hover:text-white'
  }`}
>
  Landing Page
</Link>
```

Add it after the "Settings" link in the admin nav.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Navigation.tsx src/app/admin/layout.tsx
git commit -m "feat: update navigation with conditional Home/Map links and admin landing page link"
```

---

## Chunk 4: Asset Management

### Task 13: Create asset upload/management server actions

**Files:**
- Create: `src/app/admin/landing/actions.ts`

- [ ] **Step 1: Create server actions for asset management and config saving**

Create `src/app/admin/landing/actions.ts`:

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { invalidateConfig } from '@/lib/config/server';
import { revalidateTag } from 'next/cache';
import type { LandingPageConfig, LandingAsset } from '@/lib/config/landing-types';

export async function saveLandingPageConfig(config: LandingPageConfig) {
  const supabase = createClient();

  const { error } = await supabase
    .from('site_config')
    .upsert({ key: 'landing_page', value: config as unknown as Record<string, unknown> });

  if (error) {
    return { error: error.message };
  }

  invalidateConfig();
  revalidateTag('landing-stats');
  return { error: null };
}

export async function uploadLandingAsset(
  formData: FormData
): Promise<{ asset: LandingAsset | null; error: string | null }> {
  const supabase = createClient();
  const file = formData.get('file') as File;
  const category = formData.get('category') as 'image' | 'document';
  const description = formData.get('description') as string | null;

  if (!file) return { asset: null, error: 'No file provided' };

  const id = crypto.randomUUID();
  const prefix = category === 'image' ? 'images' : 'documents';
  const ext = file.name.split('.').pop() || '';
  const storagePath = `${prefix}/${id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('landing-assets')
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) {
    return { asset: null, error: uploadError.message };
  }

  const { data: { publicUrl } } = supabase.storage
    .from('landing-assets')
    .getPublicUrl(storagePath);

  const asset: LandingAsset = {
    id,
    storagePath,
    publicUrl,
    fileName: file.name,
    mimeType: file.type,
    category,
    description: description || undefined,
    uploadedAt: new Date().toISOString(),
  };

  return { asset, error: null };
}

export async function deleteLandingAsset(storagePath: string) {
  const supabase = createClient();

  const { error } = await supabase.storage
    .from('landing-assets')
    .remove([storagePath]);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/landing/actions.ts
git commit -m "feat: add server actions for landing page config and asset management"
```

---

### Task 14: Create AssetManager component

**Files:**
- Create: `src/components/admin/landing/AssetManager.tsx`

- [ ] **Step 1: Create the asset management UI**

Create `src/components/admin/landing/AssetManager.tsx`:

This component receives `assets` and `onAssetsChange` props. It renders three sections:

1. **Images** — thumbnail grid of uploaded images with description labels, delete buttons, and an "Add image" button that triggers a file input (accepts image/*). On upload, calls `uploadLandingAsset()` server action with `category: 'image'`, then calls `onAssetsChange` to add the new asset.

2. **Documents** — list of file chips with filename and delete button. "Add document" button triggers file input (accepts .pdf,.txt,.md). Same upload flow.

3. **Reference Links** — list of label+URL pairs with delete buttons. "Add link" button shows inline inputs for label and URL. Links are stored in a separate `referenceLinks` prop (not in assets array, since they're not files).

Key implementation details:
- Use `resizeImage()` from `src/lib/utils.ts` to resize images to 2000px max before upload
- Convert resized blob back to File for FormData
- Show loading state during upload
- Call `deleteLandingAsset()` server action on delete, then `onAssetsChange` to remove from array
- Enforce max 20 assets limit in UI

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/landing/AssetManager.tsx
git commit -m "feat: add AssetManager component for landing page asset uploads"
```

---

### Task 15: Create AssetPicker modal

**Files:**
- Create: `src/components/admin/landing/AssetPicker.tsx`

- [ ] **Step 1: Create the asset picker modal**

Create `src/components/admin/landing/AssetPicker.tsx`:

Props:
- `assets: LandingAsset[]` — image assets to show
- `onSelect: (url: string) => void` — called with public URL when an asset is selected
- `onUpload: (asset: LandingAsset) => void` — called when a new image is uploaded
- `onClose: () => void`

UI: Modal overlay with three tabs:
1. **Uploaded Assets** — grid of image thumbnails. Click to select. Selected has a blue border + checkmark.
2. **Upload New** — file input for uploading a new image. On upload, add to assets and select.
3. **External URL** — text input for pasting an external image URL.

Bottom bar: Cancel and Select buttons.

Key details:
- Use existing upload flow (resizeImage → FormData → uploadLandingAsset)
- The modal renders a fixed-position overlay with a centered panel
- Close on overlay click or Cancel button

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/landing/AssetPicker.tsx
git commit -m "feat: add AssetPicker modal for selecting landing page images"
```

---

## Chunk 5: AI Generation

### Task 16: Create AI generation server action

**Files:**
- Modify: `src/app/admin/landing/actions.ts`

- [ ] **Step 1: Add generate landing page action**

Add to `src/app/admin/landing/actions.ts`:

```typescript
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { getConfig } from '@/lib/config/server';
import { generationBlocksSchema } from '@/lib/landing/schemas';
import type { LandingBlock } from '@/lib/config/landing-types';

export async function generateLandingPage(
  userPrompt: string,
  assets: LandingAsset[],
  referenceLinks: { label: string; url: string }[]
): Promise<{ blocks: LandingBlock[] | null; error: string | null }> {
  try {
    const config = await getConfig();
    const supabase = createClient();

    // Gather site context
    const [itemRes, typeRes, updateRes, speciesRes] = await Promise.all([
      supabase.from('items').select('id', { count: 'exact', head: true }).neq('status', 'removed'),
      supabase.from('item_types').select('name'),
      supabase.from('item_updates').select('id', { count: 'exact', head: true }),
      supabase.from('species').select('id', { count: 'exact', head: true }),
    ]);

    // Build image content blocks for Claude vision
    const imageAssets = assets.filter(a => a.category === 'image');
    const imageContentParts: Array<{ type: 'image'; image: string; mimeType: string } | { type: 'text'; text: string }> = [];

    for (const img of imageAssets) {
      const { data } = await supabase.storage
        .from('landing-assets')
        .download(img.storagePath);
      if (data) {
        const base64 = Buffer.from(await data.arrayBuffer()).toString('base64');
        imageContentParts.push({
          type: 'image',
          image: base64,
          mimeType: img.mimeType,
        });
        if (img.description) {
          imageContentParts.push({
            type: 'text',
            text: `[Image above: ${img.description}] (asset id: ${img.id})`,
          });
        }
      }
    }

    // Extract document text
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
        } else {
          // PDF and others: just note the filename for MVP
          documentContext += `\n--- Document: ${doc.fileName} (content not extractable) ---\n`;
        }
      }
    }

    // Reference links context
    const linkContext = referenceLinks.length > 0
      ? '\nReference links:\n' + referenceLinks.map(l => `- ${l.label}: ${l.url}`).join('\n')
      : '';

    const systemPrompt = `You are a landing page designer for a field mapping application.
Generate a JSON array of content blocks for a landing page.

SITE CONTEXT:
- Name: "${config.siteName}"
- Location: "${config.locationName}"
- Tagline: "${config.tagline}"
- Tracks ${itemRes.count ?? 0} items across types: ${typeRes.data?.map(t => t.name).join(', ') || 'none yet'}
- ${updateRes.count ?? 0} field updates recorded
- ${speciesRes.count ?? 0} species tracked
${linkContext}
${documentContext ? '\nDOCUMENT CONTEXT:\n' + documentContext : ''}

AVAILABLE IMAGES (reference by asset id in image/hero/gallery blocks):
${imageAssets.map(img => `- id: "${img.id}" — ${img.description || img.fileName}`).join('\n') || '(none uploaded)'}

Guidelines:
- Start with a hero block with a compelling title
- Include descriptive text blocks with markdown
- Add a prominent button block linking to "/map"
- Use a stats block with source:"auto" to show live project numbers
- Keep it concise: 4-8 blocks total
- For image/hero/gallery blocks, set url/backgroundImageUrl to the asset id from AVAILABLE IMAGES (system resolves to public URLs). If no images available, use "placeholder"
- Incorporate reference links naturally into links blocks or inline markdown
- Use document context to write accurate, detailed descriptions
- Generate descriptive alt text for all image blocks for accessibility`;

    const { object: blocks } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: generationBlocksSchema,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          ...imageContentParts,
          { type: 'text', text: userPrompt },
        ],
      }],
      maxTokens: 2000,
    });

    // Add UUIDs and resolve asset IDs to public URLs
    const assetMap = new Map(assets.map(a => [a.id, a.publicUrl]));
    const processedBlocks: LandingBlock[] = blocks.map((block) => {
      const withId = { ...block, id: crypto.randomUUID() } as LandingBlock;

      // Resolve asset IDs to public URLs
      if ('url' in withId && typeof withId.url === 'string' && assetMap.has(withId.url)) {
        (withId as Record<string, unknown>).url = assetMap.get(withId.url)!;
      }
      if (withId.type === 'hero' && withId.backgroundImageUrl && assetMap.has(withId.backgroundImageUrl)) {
        withId.backgroundImageUrl = assetMap.get(withId.backgroundImageUrl)!;
      }
      if (withId.type === 'gallery') {
        withId.images = withId.images.map(img =>
          assetMap.has(img.url) ? { ...img, url: assetMap.get(img.url)! } : img
        );
      }

      return withId;
    });

    return { blocks: processedBlocks, error: null };
  } catch (err) {
    console.error('Landing page generation failed:', err);
    return { blocks: null, error: err instanceof Error ? err.message : 'Generation failed' };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/landing/actions.ts
git commit -m "feat: add AI generation server action using Vercel AI SDK"
```

---

## Chunk 6: Admin Editor

### Task 17: Create block editor sub-components

**Files:**
- Create: `src/components/admin/landing/HomepageToggle.tsx`
- Create: `src/components/admin/landing/GenerateSection.tsx`
- Create: `src/components/admin/landing/BlockEditor.tsx`
- Create: `src/components/admin/landing/block-editors/HeroEditor.tsx`
- Create: `src/components/admin/landing/block-editors/TextEditor.tsx`
- Create: `src/components/admin/landing/block-editors/ImageEditor.tsx`
- Create: `src/components/admin/landing/block-editors/ButtonEditor.tsx`
- Create: `src/components/admin/landing/block-editors/LinksEditor.tsx`
- Create: `src/components/admin/landing/block-editors/StatsEditor.tsx`
- Create: `src/components/admin/landing/block-editors/GalleryEditor.tsx`
- Create: `src/components/admin/landing/block-editors/SpacerEditor.tsx`

- [ ] **Step 1: Create HomepageToggle component**

Create `src/components/admin/landing/HomepageToggle.tsx`:

Props: `enabled: boolean`, `onChange: (enabled: boolean) => void`

Renders a segmented control with "Landing Page" and "Map" options. Clicking toggles the `enabled` state.

- [ ] **Step 2: Create GenerateSection component**

Create `src/components/admin/landing/GenerateSection.tsx`:

Props:
- `prompt: string`, `onPromptChange: (prompt: string) => void`
- `hasBlocks: boolean` — determines if button says "Generate" or "Regenerate"
- `onGenerate: () => void`
- `isGenerating: boolean`

Renders:
- Textarea with placeholder "Describe your landing page..."
- Generate/Regenerate button (disabled while generating, shows spinner)

- [ ] **Step 3: Create per-type block editors**

Each editor receives `block` and `onChange` props. They render form fields specific to their block type.

`HeroEditor.tsx`: title input, subtitle input, background image button (opens AssetPicker), overlay toggle checkbox.

`TextEditor.tsx`: textarea for markdown content, alignment radio buttons (left/center).

`ImageEditor.tsx`: image selection button (opens AssetPicker), alt text input, caption input, width select dropdown.

`ButtonEditor.tsx`: label input, href input, style select (primary/outline), size select (default/large).

`LinksEditor.tsx`: list of link items, each with label input, URL input, optional description input. Add/remove buttons.

`StatsEditor.tsx`: radio toggle between auto and manual. When manual, shows editable list of label+value pairs.

`GalleryEditor.tsx`: shows current images as thumbnails with captions. "Add image" button opens AssetPicker. Column count select. Remove button per image.

`SpacerEditor.tsx`: size select dropdown (small/medium/large).

- [ ] **Step 4: Create BlockEditor dispatcher**

Create `src/components/admin/landing/BlockEditor.tsx`:

Props: `block: LandingBlock`, `onChange: (block: LandingBlock) => void`, `assets: LandingAsset[]`, `onAssetsChange: (assets: LandingAsset[]) => void`

Switch on `block.type` to render the appropriate editor. Passes `assets` and `onAssetsChange` through for editors that need the AssetPicker.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/landing/
git commit -m "feat: add block editor sub-components for admin landing page editor"
```

---

### Task 18: Create BlockList component

**Files:**
- Create: `src/components/admin/landing/BlockList.tsx`

- [ ] **Step 1: Create the block list with expand/collapse and reorder**

Create `src/components/admin/landing/BlockList.tsx`:

Props:
- `blocks: LandingBlock[]`
- `onBlocksChange: (blocks: LandingBlock[]) => void`
- `assets: LandingAsset[]`
- `onAssetsChange: (assets: LandingAsset[]) => void`

State: `expandedBlockId: string | null`

Renders:
- Vertical list of blocks
- Each block shows:
  - Block type badge (colored by type)
  - Collapsed summary (hero.title, text first line, button.label, etc.)
  - Click to expand/collapse inline editor (BlockEditor component)
  - Up/down arrow buttons for reorder (swap adjacent blocks in array)
  - Delete button with `window.confirm()` confirmation
- "Add Block" dropdown at bottom — select from all 8 block types, creates block with defaults and random UUID
- Enforce max 50 blocks limit

Block type badge colors: hero=blue, text=green, image=purple, button=violet, links=teal, stats=amber, gallery=pink, spacer=gray.

Summary text per type:
- hero: `block.title`
- text: first 60 chars of `block.content`
- image: `block.alt || 'Image'`
- button: `${block.label} → ${block.href}`
- links: `${block.items.length} link(s)`
- stats: `${block.source === 'auto' ? 'Auto (live from database)' : `Manual (${block.items?.length ?? 0} items)`}`
- gallery: `${block.images.length} image(s)`
- spacer: `${block.size} spacer`

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/landing/BlockList.tsx
git commit -m "feat: add BlockList component with expand/collapse and reorder"
```

---

### Task 19: Create admin landing page editor

**Files:**
- Create: `src/app/admin/landing/page.tsx`

- [ ] **Step 1: Create the admin editor page**

Create `src/app/admin/landing/page.tsx`:

This is a `"use client"` component that orchestrates the full editor.

State:
- `config: LandingPageConfig` — loaded from server on mount
- `blocks: LandingBlock[]` — working copy of blocks being edited
- `assets: LandingAsset[]` — working copy of assets
- `referenceLinks: { label: string; url: string }[]`
- `prompt: string` — generation prompt
- `previousBlocks: LandingBlock[] | null` — stashed for undo
- `isGenerating: boolean`
- `isSaving: boolean`
- `message: { type: 'success' | 'error'; text: string } | null`
- `activeView: 'editor' | 'preview'` — for mobile tab toggle

Layout:
- On desktop (md+): two-column flex layout. Left: editor panel (max-w-lg, overflow-y-auto). Right: live preview (flex-1, overflow-y-auto).
- On mobile: tab toggle between "Editor" and "Preview" views.

Editor panel (top to bottom):
1. `<HomepageToggle>` — controls `config.enabled`
2. `<AssetManager>` — images, documents, reference links
3. `<GenerateSection>` — prompt + generate button
4. If `previousBlocks` is not null, show "Undo Regeneration" button
5. `<BlockList>` — block editing
6. Save button at bottom

Generate flow:
1. If blocks exist and user clicks "Regenerate", show `window.confirm('This will replace all current blocks. Continue?')`
2. Stash current blocks in `previousBlocks`
3. Set `isGenerating: true`
4. Call `generateLandingPage(prompt, assets, referenceLinks)` server action
5. On success: set `blocks` to result, clear generating state
6. On failure: show error toast, restore `previousBlocks` if it was a regenerate

Save flow:
1. Build `LandingPageConfig` from state
2. Call `saveLandingPageConfig(config)` server action
3. Show success/error message

Live preview:
- Render `<LandingRenderer blocks={blocks} />` in an isolated container
- Note: Since `StatsBlock` is async (server component), the preview may need to use a client-side-only version that shows placeholder stats. Create a simple wrapper that renders manual stats for preview or skips the async fetch.

**Important**: For the live preview, the `StatsBlock` async server component cannot be used directly in a client component. Options:
- Render all non-async blocks in the preview, and for stats blocks, show a static placeholder like "Stats (auto — live in published page)"
- Or create a `StatsBlockPreview` client component that shows sample data

Use the placeholder approach for simplicity.

- [ ] **Step 2: Create separate LandingRendererPreview for client context**

The `LandingRenderer` imports `StatsBlock` which is an async server component. It cannot be used inside a client component (`'use client'`). Create a separate client-safe preview component.

Create `src/components/landing/LandingRendererPreview.tsx`:

```typescript
'use client';

import type { LandingBlock } from '@/lib/config/landing-types';
import { SpacerBlock } from './blocks/SpacerBlock';
import { ButtonBlock } from './blocks/ButtonBlock';
import { ImageBlock } from './blocks/ImageBlock';
import { LinksBlock } from './blocks/LinksBlock';
import { HeroBlock } from './blocks/HeroBlock';
import { TextBlock } from './blocks/TextBlock';
import { GalleryBlock } from './blocks/GalleryBlock';

function PreviewBlockComponent({ block }: { block: LandingBlock }) {
  switch (block.type) {
    case 'spacer': return <SpacerBlock block={block} />;
    case 'button': return <ButtonBlock block={block} />;
    case 'image': return <ImageBlock block={block} />;
    case 'links': return <LinksBlock block={block} />;
    case 'hero': return <HeroBlock block={block} />;
    case 'text': return <TextBlock block={block} />;
    case 'gallery': return <GalleryBlock block={block} />;
    case 'stats':
      // Stats blocks are async server components — show placeholder in preview
      return (
        <div data-block-type="stats" className="bg-sage-light py-8">
          <div className="text-center text-sage text-sm">
            {block.source === 'auto' ? 'Live stats will appear here' : 'Manual stats preview'}
          </div>
        </div>
      );
    default: return null;
  }
}

export function LandingRendererPreview({ blocks }: { blocks: LandingBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <>
      {blocks.map((block) => (
        <PreviewBlockComponent key={block.id} block={block} />
      ))}
    </>
  );
}
```

The admin editor page imports `LandingRendererPreview` (client-safe) instead of `LandingRenderer` (server component with async StatsBlock).

Note: `SpacerBlock`, `ButtonBlock`, `ImageBlock`, `LinksBlock`, `HeroBlock`, `TextBlock`, and `GalleryBlock` are all synchronous components that work in both server and client contexts. Only `StatsBlock` is async and needs the placeholder treatment.

- [ ] **Step 3: Load initial config from server**

The page needs initial data. Add a server action to fetch the current landing page config:

In `src/app/admin/landing/actions.ts`, add:

```typescript
export async function getLandingPageConfig(): Promise<LandingPageConfig | null> {
  const config = await getConfig();
  return config.landingPage;
}
```

The client page calls this on mount in a `useEffect`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Verify build succeeds**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/landing/page.tsx src/app/admin/landing/actions.ts src/components/landing/LandingRendererPreview.tsx
git commit -m "feat: add admin landing page editor with two-column layout and live preview"
```

---

## Chunk 7: About Page Upgrade and Final Polish

### Task 20: Upgrade about page to use react-markdown

**Files:**
- Modify: `src/app/about/page.tsx`

- [ ] **Step 1: Rewrite about page with react-markdown**

Replace the contents of `src/app/about/page.tsx`:

```typescript
import { getConfig } from '@/lib/config/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default async function AboutPage() {
  const config = await getConfig();

  return (
    <div className="pb-20 md:pb-0">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-heading text-3xl font-semibold text-forest-dark mb-6">
          About
        </h1>
        <div className="prose prose-forest max-w-none text-forest-dark/80">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {config.aboutContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles and build succeeds**

```bash
npx tsc --noEmit && npm run build
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/about/page.tsx
git commit -m "feat: upgrade about page to use react-markdown"
```

---

### Task 21: Run full test suite and verify

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Run full build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Verify TypeScript strict mode**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address any issues found in final verification"
```

Only commit if there were actual fixes needed.

---

## Summary

| Chunk | Tasks | Description |
|-------|-------|-------------|
| 1: Foundation | 1-6 | Dependencies, types, schemas, config backfill, migration, setup |
| 2: Block Renderers | 7-9 | All 8 block components + LandingRenderer |
| 3: Routing | 10-12 | /map route, / rewrite, navigation updates |
| 4: Asset Management | 13-15 | Server actions, AssetManager, AssetPicker |
| 5: AI Generation | 16 | Vercel AI SDK generateObject() action |
| 6: Admin Editor | 17-19 | Block editors, BlockList, full editor page |
| 7: Polish | 20-21 | About page upgrade, final verification |
