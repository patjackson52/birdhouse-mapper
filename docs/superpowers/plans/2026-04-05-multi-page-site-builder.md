# Multi-Page Site Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Puck site builder from a single landing page to a multi-page CMS with page creation, management, custom routing, and dynamic link suggestions.

**Architecture:** New `puck_page_meta` JSONB column stores page metadata. Site builder IA changes from a fixed "Landing Page" tab to a pages list view with per-page editor sub-routes. A catch-all `[...slug]` route renders custom pages publicly. The existing `linkField` is extended with dynamic page suggestions.

**Tech Stack:** Next.js 14, Supabase PostgreSQL, Puck Editor, Tailwind CSS, Vitest, Playwright

---

### Task 1: Database Migration — Add `puck_page_meta` Column

**Files:**
- Create: `supabase/migrations/032_puck_page_meta.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add page metadata column to properties table
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS puck_page_meta JSONB DEFAULT '{}';

-- Backfill: for properties that already have puck_pages with a "/" key,
-- we don't add a meta entry for "/" since the landing page is implicit.
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: Migration applies cleanly, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/032_puck_page_meta.sql
git commit -m "feat: add puck_page_meta column to properties table (#142)"
```

---

### Task 2: Config Types & Server — Expose `puckPageMeta`

**Files:**
- Modify: `src/lib/config/types.ts`
- Modify: `src/lib/config/server.ts`

- [ ] **Step 1: Add `puckPageMeta` to SiteConfig**

In `src/lib/config/types.ts`, add the field to the `SiteConfig` interface after `puckRootDraft`:

```typescript
puckPageMeta: Record<string, { title: string; slug: string; createdAt: string }> | null;
```

Add `puck_page_meta` to the `property` parameter of `buildSiteConfig`:

```typescript
puck_page_meta: unknown | null;
```

Add to the return object:

```typescript
puckPageMeta: property.puck_page_meta as Record<string, { title: string; slug: string; createdAt: string }> | null ?? null,
```

- [ ] **Step 2: Add `puck_page_meta` to the property select in config/server.ts**

In `src/lib/config/server.ts`, add `puck_page_meta` to the `.select()` call on the properties query (after `puck_root_draft`):

```typescript
.select('id, name, pwa_name, description, map_default_lat, map_default_lng, map_default_zoom, map_style, custom_map, about_content, about_page_enabled, footer_text, footer_links, custom_nav_items, landing_page, logo_url, puck_pages, puck_root, puck_template, puck_pages_draft, puck_root_draft, puck_page_meta')
```

- [ ] **Step 3: Run type check**

Run: `npm run type-check`
Expected: PASS (no type errors)

- [ ] **Step 4: Commit**

```bash
git add src/lib/config/types.ts src/lib/config/server.ts
git commit -m "feat: expose puckPageMeta in site config (#142)"
```

---

### Task 3: Slug Utilities — `slugify` and `RESERVED_SLUGS`

**Files:**
- Create: `src/lib/puck/page-utils.ts`
- Create: `src/lib/puck/__tests__/page-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/puck/__tests__/page-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { slugify, isReservedSlug, validatePageSlug } from '../page-utils';

describe('slugify', () => {
  it('converts title to lowercase slug', () => {
    expect(slugify('Volunteer Opportunities')).toBe('volunteer-opportunities');
  });

  it('strips special characters', () => {
    expect(slugify('Events & Activities!')).toBe('events-activities');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('my---page')).toBe('my-page');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('-hello-')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});

describe('isReservedSlug', () => {
  it('rejects reserved slugs', () => {
    expect(isReservedSlug('map')).toBe(true);
    expect(isReservedSlug('list')).toBe(true);
    expect(isReservedSlug('about')).toBe(true);
    expect(isReservedSlug('admin')).toBe(true);
    expect(isReservedSlug('auth')).toBe(true);
    expect(isReservedSlug('api')).toBe(true);
    expect(isReservedSlug('p')).toBe(true);
  });

  it('allows non-reserved slugs', () => {
    expect(isReservedSlug('events')).toBe(false);
    expect(isReservedSlug('volunteer')).toBe(false);
    expect(isReservedSlug('contact')).toBe(false);
  });
});

describe('validatePageSlug', () => {
  it('returns error for reserved slugs', () => {
    expect(validatePageSlug('map', {})).toBe('This URL is reserved by the system');
  });

  it('returns error for duplicate slugs', () => {
    const existing = { '/events': { title: 'Events', slug: 'events', createdAt: '2026-01-01' } };
    expect(validatePageSlug('events', existing)).toBe('A page with this URL already exists');
  });

  it('returns error for empty slug', () => {
    expect(validatePageSlug('', {})).toBe('URL slug is required');
  });

  it('returns null for valid slug', () => {
    expect(validatePageSlug('volunteer', {})).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/puck/__tests__/page-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/puck/page-utils.ts`:

```typescript
export const RESERVED_SLUGS = new Set([
  'map', 'list', 'about', 'admin', 'auth', 'api', 'p',
]);

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

export interface PageMeta {
  title: string;
  slug: string;
  createdAt: string;
}

/**
 * Validate a page slug. Returns an error message or null if valid.
 */
export function validatePageSlug(
  slug: string,
  existingMeta: Record<string, PageMeta>
): string | null {
  if (!slug) return 'URL slug is required';
  if (RESERVED_SLUGS.has(slug)) return 'This URL is reserved by the system';
  const path = `/${slug}`;
  if (path in existingMeta) return 'A page with this URL already exists';
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/puck/__tests__/page-utils.test.ts`
Expected: PASS (all 12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/puck/page-utils.ts src/lib/puck/__tests__/page-utils.test.ts
git commit -m "feat: add slugify and page slug validation utilities (#142)"
```

---

### Task 4: Server Actions — Page CRUD

**Files:**
- Modify: `src/app/admin/site-builder/actions.ts`
- Create: `src/app/admin/site-builder/__tests__/page-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/admin/site-builder/__tests__/page-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockLimit = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      select: (...args: any[]) => {
        mockSelect(...args);
        return {
          eq: (...eqArgs: any[]) => {
            mockEq(...eqArgs);
            return {
              single: () => {
                mockSingle();
                return { data: mockSingleData, error: null };
              },
            };
          },
          limit: (...limitArgs: any[]) => {
            mockLimit(...limitArgs);
            return {
              single: () => {
                mockSingle();
                return { data: mockOrgData, error: null };
              },
            };
          },
        };
      },
      update: (...args: any[]) => {
        mockUpdate(...args);
        return {
          eq: () => {
            mockEq();
            return { error: null };
          },
        };
      },
    }),
  }),
}));

vi.mock('@/lib/config/server', () => ({
  invalidateConfig: vi.fn(),
}));

let mockOrgData: any = { id: 'org-1', default_property_id: 'prop-1' };
let mockSingleData: any = {
  puck_pages: {},
  puck_pages_draft: {},
  puck_page_meta: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockOrgData = { id: 'org-1', default_property_id: 'prop-1' };
  mockSingleData = {
    puck_pages: {},
    puck_pages_draft: {},
    puck_page_meta: {},
  };
});

describe('createPage', () => {
  it('rejects reserved slugs', async () => {
    const { createPage } = await import('../actions');
    const result = await createPage('Map Page', 'map', false);
    expect(result).toEqual({ error: 'This URL is reserved by the system' });
  });

  it('rejects duplicate slugs', async () => {
    mockSingleData = {
      puck_pages: {},
      puck_pages_draft: {},
      puck_page_meta: { '/events': { title: 'Events', slug: 'events', createdAt: '2026-01-01' } },
    };
    const { createPage } = await import('../actions');
    const result = await createPage('Events', 'events', false);
    expect(result).toEqual({ error: 'A page with this URL already exists' });
  });

  it('creates page with correct data', async () => {
    const { createPage } = await import('../actions');
    const result = await createPage('Events', 'events', false);
    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        puck_pages_draft: { '/events': { root: { props: {} }, content: [] } },
        puck_page_meta: { '/events': expect.objectContaining({ title: 'Events', slug: 'events' }) },
      })
    );
  });
});

describe('deletePage', () => {
  it('rejects deleting landing page', async () => {
    const { deletePage } = await import('../actions');
    const result = await deletePage('/');
    expect(result).toEqual({ error: 'Cannot delete the landing page. Reassign it first.' });
  });

  it('removes page from all columns', async () => {
    mockSingleData = {
      puck_pages: { '/': {}, '/events': {} },
      puck_pages_draft: { '/': {}, '/events': {} },
      puck_page_meta: { '/events': { title: 'Events', slug: 'events', createdAt: '2026-01-01' } },
    };
    const { deletePage } = await import('../actions');
    const result = await deletePage('/events');
    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        puck_pages: { '/': {} },
        puck_pages_draft: { '/': {} },
        puck_page_meta: {},
      })
    );
  });
});

describe('setLandingPage', () => {
  it('swaps content between target path and /', async () => {
    mockSingleData = {
      puck_pages: { '/': { content: ['home'] }, '/events': { content: ['events'] } },
      puck_pages_draft: { '/': { content: ['home-draft'] }, '/events': { content: ['events-draft'] } },
      puck_page_meta: { '/events': { title: 'Events', slug: 'events', createdAt: '2026-01-01' } },
    };
    const { setLandingPage } = await import('../actions');
    const result = await setLandingPage('/events');
    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        puck_pages: expect.objectContaining({
          '/': { content: ['events'] },
          '/events': { content: ['home'] },
        }),
      })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/app/admin/site-builder/__tests__/page-actions.test.ts`
Expected: FAIL — `createPage`, `deletePage`, `setLandingPage` not exported

- [ ] **Step 3: Write the implementation**

Add to `src/app/admin/site-builder/actions.ts`:

```typescript
import { validatePageSlug, type PageMeta } from '@/lib/puck/page-utils';

// Add puck_page_meta to getPuckData
export async function getPuckData() {
  const result = await getPropertyId();
  if ('error' in result) return result;

  const supabase = createClient();
  const { data: property, error } = await supabase
    .from('properties')
    .select('puck_pages, puck_root, puck_template, puck_pages_draft, puck_root_draft, puck_page_meta')
    .eq('id', result.propertyId)
    .single();

  if (error || !property) {
    return { error: `Failed to read puck data: ${error?.message ?? 'not found'}` };
  }

  return {
    puckPages: property.puck_pages,
    puckRoot: property.puck_root,
    puckTemplate: property.puck_template,
    puckPagesDraft: property.puck_pages_draft,
    puckRootDraft: property.puck_root_draft,
    puckPageMeta: property.puck_page_meta,
  };
}

// ---------------------------------------------------------------------------
// Page management
// ---------------------------------------------------------------------------

async function getPropertyPageData(): Promise<
  | { error: string }
  | {
      propertyId: string;
      puckPages: Record<string, unknown>;
      puckPagesDraft: Record<string, unknown>;
      puckPageMeta: Record<string, PageMeta>;
    }
> {
  const result = await getPropertyId();
  if ('error' in result) return result;

  const supabase = createClient();
  const { data: property, error } = await supabase
    .from('properties')
    .select('puck_pages, puck_pages_draft, puck_page_meta')
    .eq('id', result.propertyId)
    .single();

  if (error || !property) {
    return { error: `Failed to read property: ${error?.message ?? 'not found'}` };
  }

  return {
    propertyId: result.propertyId,
    puckPages: (property.puck_pages as Record<string, unknown>) ?? {},
    puckPagesDraft: (property.puck_pages_draft as Record<string, unknown>) ?? {},
    puckPageMeta: (property.puck_page_meta as Record<string, PageMeta>) ?? {},
  };
}

export async function createPage(title: string, slug: string, isLandingPage: boolean) {
  const propResult = await getPropertyPageData();
  if ('error' in propResult) return propResult;

  const { propertyId, puckPagesDraft, puckPageMeta } = propResult;

  const validationError = validatePageSlug(slug, puckPageMeta);
  if (validationError) return { error: validationError };

  const emptyPage = { root: { props: {} }, content: [] };
  const now = new Date().toISOString().split('T')[0];
  const path = isLandingPage ? '/' : `/${slug}`;

  const newMeta = { ...puckPageMeta };
  const newDraft = { ...puckPagesDraft };

  if (isLandingPage && puckPagesDraft['/']) {
    // Move current landing page to /home (or a slug from existing meta)
    const displacedSlug = 'home';
    const displacedPath = `/${displacedSlug}`;
    newDraft[displacedPath] = puckPagesDraft['/'];
    newMeta[displacedPath] = { title: 'Home', slug: displacedSlug, createdAt: now };
  }

  newDraft[path] = emptyPage;
  if (path !== '/') {
    newMeta[path] = { title, slug, createdAt: now };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('properties')
    .update({ puck_pages_draft: newDraft, puck_page_meta: newMeta })
    .eq('id', propertyId);

  if (error) return { error: error.message };
  invalidateConfig();
  return { success: true as const };
}

export async function deletePage(path: string) {
  if (path === '/') {
    return { error: 'Cannot delete the landing page. Reassign it first.' };
  }

  const propResult = await getPropertyPageData();
  if ('error' in propResult) return propResult;

  const { propertyId, puckPages, puckPagesDraft, puckPageMeta } = propResult;

  const newPages = { ...puckPages };
  const newDraft = { ...puckPagesDraft };
  const newMeta = { ...puckPageMeta };
  delete newPages[path];
  delete newDraft[path];
  delete newMeta[path];

  const supabase = createClient();
  const { error } = await supabase
    .from('properties')
    .update({ puck_pages: newPages, puck_pages_draft: newDraft, puck_page_meta: newMeta })
    .eq('id', propertyId);

  if (error) return { error: error.message };
  invalidateConfig();
  return { success: true as const };
}

export async function setLandingPage(path: string) {
  if (path === '/') return { success: true as const };

  const propResult = await getPropertyPageData();
  if ('error' in propResult) return propResult;

  const { propertyId, puckPages, puckPagesDraft, puckPageMeta } = propResult;

  const targetMeta = puckPageMeta[path];
  if (!targetMeta) return { error: 'Page not found' };

  // Swap content in published pages
  const newPages = { ...puckPages };
  const oldLanding = newPages['/'];
  newPages['/'] = newPages[path] ?? {};
  if (oldLanding) {
    newPages[path] = oldLanding;
  } else {
    delete newPages[path];
  }

  // Swap content in draft pages
  const newDraft = { ...puckPagesDraft };
  const oldLandingDraft = newDraft['/'];
  newDraft['/'] = newDraft[path] ?? {};
  if (oldLandingDraft) {
    newDraft[path] = oldLandingDraft;
  } else {
    delete newDraft[path];
  }

  // Swap meta: target becomes implicit (/), old landing gets target's path
  const newMeta = { ...puckPageMeta };
  delete newMeta[path];
  if (oldLanding || oldLandingDraft) {
    const slug = path.slice(1); // remove leading /
    newMeta[path] = { title: 'Home', slug, createdAt: new Date().toISOString().split('T')[0] };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('properties')
    .update({ puck_pages: newPages, puck_pages_draft: newDraft, puck_page_meta: newMeta })
    .eq('id', propertyId);

  if (error) return { error: error.message };
  invalidateConfig();
  return { success: true as const };
}

export async function updatePageMeta(
  path: string,
  updates: { title?: string; slug?: string }
) {
  const propResult = await getPropertyPageData();
  if ('error' in propResult) return propResult;

  const { propertyId, puckPages, puckPagesDraft, puckPageMeta } = propResult;

  const current = puckPageMeta[path];
  if (!current) return { error: 'Page not found' };

  const newSlug = updates.slug ?? current.slug;
  const newTitle = updates.title ?? current.title;
  const newPath = `/${newSlug}`;

  // If slug changed, validate and move content
  if (newPath !== path) {
    const validationError = validatePageSlug(newSlug, puckPageMeta);
    if (validationError) return { error: validationError };

    const newPages = { ...puckPages };
    const newDraft = { ...puckPagesDraft };
    const newMeta = { ...puckPageMeta };

    // Move content to new path
    if (path in newPages) {
      newPages[newPath] = newPages[path];
      delete newPages[path];
    }
    if (path in newDraft) {
      newDraft[newPath] = newDraft[path];
      delete newDraft[path];
    }
    delete newMeta[path];
    newMeta[newPath] = { title: newTitle, slug: newSlug, createdAt: current.createdAt };

    const supabase = createClient();
    const { error } = await supabase
      .from('properties')
      .update({ puck_pages: newPages, puck_pages_draft: newDraft, puck_page_meta: newMeta })
      .eq('id', propertyId);

    if (error) return { error: error.message };
  } else {
    // Title-only update
    const newMeta = { ...puckPageMeta };
    newMeta[path] = { ...current, title: newTitle };

    const supabase = createClient();
    const { error } = await supabase
      .from('properties')
      .update({ puck_page_meta: newMeta })
      .eq('id', propertyId);

    if (error) return { error: error.message };
  }

  invalidateConfig();
  return { success: true as const };
}
```

Note: The actual implementation replaces the existing `getPuckData` function body to include `puck_page_meta`. All other existing functions remain unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/app/admin/site-builder/__tests__/page-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Run type check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/site-builder/actions.ts src/app/admin/site-builder/__tests__/page-actions.test.ts
git commit -m "feat: add page CRUD server actions (#142)"
```

---

### Task 5: Pages List View UI

**Files:**
- Create: `src/app/admin/properties/[slug]/site-builder/pages/page.tsx`
- Modify: `src/app/admin/properties/[slug]/site-builder/layout.tsx`

- [ ] **Step 1: Create the pages list component**

Create `src/app/admin/properties/[slug]/site-builder/pages/page.tsx`:

```typescript
import { getPuckData } from '@/app/admin/site-builder/actions';
import { PagesListClient } from './PagesListClient';
import type { Data } from '@puckeditor/core';

export default async function SiteBuilderPagesPage() {
  const result = await getPuckData();

  if ('error' in result && result.error) {
    return <div className="rounded-lg bg-red-50 p-4 text-red-600">{result.error}</div>;
  }

  const puckPages = ('puckPages' in result ? result.puckPages : null) as Record<string, unknown> | null;
  const puckPagesDraft = ('puckPagesDraft' in result ? result.puckPagesDraft : null) as Record<string, unknown> | null;
  const puckPageMeta = ('puckPageMeta' in result ? result.puckPageMeta : null) as Record<string, { title: string; slug: string; createdAt: string }> | null;

  return (
    <PagesListClient
      puckPages={puckPages ?? {}}
      puckPagesDraft={puckPagesDraft ?? {}}
      puckPageMeta={puckPageMeta ?? {}}
    />
  );
}
```

- [ ] **Step 2: Create the client component**

Create `src/app/admin/properties/[slug]/site-builder/pages/PagesListClient.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { createPage, deletePage, setLandingPage } from '@/app/admin/site-builder/actions';
import { slugify } from '@/lib/puck/page-utils';
import type { PageMeta } from '@/lib/puck/page-utils';
import { NewPageModal } from './NewPageModal';

interface PagesListClientProps {
  puckPages: Record<string, unknown>;
  puckPagesDraft: Record<string, unknown>;
  puckPageMeta: Record<string, PageMeta>;
}

export function PagesListClient({ puckPages, puckPagesDraft, puckPageMeta }: PagesListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { slug } = useParams<{ slug: string }>();
  const [showNewPageModal, setShowNewPageModal] = useState(false);
  const [menuOpenPath, setMenuOpenPath] = useState<string | null>(null);

  const base = pathname.includes('/p/')
    ? `/p/${slug}/admin/site-builder`
    : `/admin/properties/${slug}/site-builder`;

  // Build page list: landing page + all meta entries
  const pages: Array<{ path: string; title: string; slug: string; isLanding: boolean; isPublished: boolean }> = [];

  // Landing page is always present if there's any draft or published content at "/"
  if (puckPagesDraft['/'] || puckPages['/']) {
    pages.push({
      path: '/',
      title: 'Home',
      slug: '',
      isLanding: true,
      isPublished: !!puckPages['/'],
    });
  }

  // Other pages from meta
  for (const [path, meta] of Object.entries(puckPageMeta)) {
    pages.push({
      path,
      title: meta.title,
      slug: meta.slug,
      isLanding: false,
      isPublished: !!puckPages[path],
    });
  }

  async function handleCreatePage(title: string, slugValue: string, isLandingPage: boolean) {
    const result = await createPage(title, slugValue, isLandingPage);
    if ('error' in result && result.error) {
      alert(result.error);
      return;
    }
    setShowNewPageModal(false);
    router.refresh();
  }

  async function handleDeletePage(path: string) {
    if (!confirm(`Delete "${puckPageMeta[path]?.title ?? path}"? This cannot be undone.`)) return;
    const result = await deletePage(path);
    if ('error' in result && result.error) {
      alert(result.error);
      return;
    }
    setMenuOpenPath(null);
    router.refresh();
  }

  async function handleSetLanding(path: string) {
    const result = await setLandingPage(path);
    if ('error' in result && result.error) {
      alert(result.error);
      return;
    }
    setMenuOpenPath(null);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">All Pages</h2>
        <button
          onClick={() => setShowNewPageModal(true)}
          className="btn-primary"
        >
          + New Page
        </button>
      </div>

      {pages.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No pages yet. Create your first page to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <div
              key={page.path}
              className="card relative cursor-pointer transition hover:shadow-md"
              onClick={() => {
                const editorPath = page.path === '/'
                  ? `${base}/pages/home`
                  : `${base}/pages${page.path}`;
                router.push(editorPath);
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">
                    {page.isLanding && <span className="mr-1">🏠</span>}
                    {page.title}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {page.path === '/' ? '/' : page.path}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      page.isPublished
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {page.isPublished ? 'Published' : 'Draft'}
                  </span>
                  {!page.isLanding && (
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenPath(menuOpenPath === page.path ? null : page.path);
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        aria-label="Page actions"
                      >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                      {menuOpenPath === page.path && (
                        <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetLanding(page.path);
                            }}
                            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Set as landing page
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePage(page.path);
                            }}
                            className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewPageModal && (
        <NewPageModal
          existingMeta={puckPageMeta}
          onSubmit={handleCreatePage}
          onClose={() => setShowNewPageModal(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the NewPageModal component**

Create `src/app/admin/properties/[slug]/site-builder/pages/NewPageModal.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { slugify, validatePageSlug, type PageMeta } from '@/lib/puck/page-utils';

interface NewPageModalProps {
  existingMeta: Record<string, PageMeta>;
  onSubmit: (title: string, slug: string, isLandingPage: boolean) => void;
  onClose: () => void;
}

export function NewPageModal({ existingMeta, onSubmit, onClose }: NewPageModalProps) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [isLandingPage, setIsLandingPage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(title));
    }
  }, [title, slugTouched]);

  const validationError = slug ? validatePageSlug(slug, existingMeta) : null;
  const canSubmit = title.trim() && slug.trim() && !validationError && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    await onSubmit(title.trim(), slug.trim(), isLandingPage);
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">New Page</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder="e.g. Events, Volunteer, Contact"
              autoFocus
            />
          </div>
          <div>
            <label className="label">URL Slug</label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500">/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
                className="input-field"
                placeholder="events"
              />
            </div>
            {validationError && (
              <p className="mt-1 text-xs text-red-600">{validationError}</p>
            )}
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isLandingPage}
                onChange={(e) => setIsLandingPage(e.target.checked)}
                className="rounded border-gray-300"
              />
              Set as landing page
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit} className="btn-primary">
              {submitting ? 'Creating...' : 'Create Page'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update the site builder layout tabs**

In `src/app/admin/properties/[slug]/site-builder/layout.tsx`, change the tabs array:

Replace:
```typescript
const tabs = [
  { label: 'Landing Page', href: `${base}/landing` },
  { label: 'Header & Footer', href: `${base}/chrome` },
  { label: 'Templates', href: `${base}/templates` },
];
```

With:
```typescript
const tabs = [
  { label: 'Pages', href: `${base}/pages` },
  { label: 'Header & Footer', href: `${base}/chrome` },
  { label: 'Templates', href: `${base}/templates` },
];
```

- [ ] **Step 5: Add redirect from old `/landing` route**

Create `src/app/admin/properties/[slug]/site-builder/landing/page.tsx` (replace existing):

```typescript
import { redirect } from 'next/navigation';

export default function LandingRedirect() {
  redirect('../pages');
}
```

- [ ] **Step 6: Run type check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/properties/[slug]/site-builder/pages/ src/app/admin/properties/[slug]/site-builder/layout.tsx src/app/admin/properties/[slug]/site-builder/landing/page.tsx
git commit -m "feat: add pages list view and new page modal (#142)"
```

---

### Task 6: Per-Page Editor Route

**Files:**
- Create: `src/app/admin/properties/[slug]/site-builder/pages/[...path]/page.tsx`

- [ ] **Step 1: Create the dynamic page editor route**

Create `src/app/admin/properties/[slug]/site-builder/pages/[...path]/page.tsx`:

```typescript
import { getPuckData } from '@/app/admin/site-builder/actions';
import { PuckPageEditor } from '@/components/puck/PuckPageEditor';
import Link from 'next/link';
import type { Data } from '@puckeditor/core';

const emptyPageData: Data = {
  root: { props: {} },
  content: [],
};

interface PageEditorProps {
  params: { slug: string; path: string[] };
}

export default async function SiteBuilderPageEditor({ params }: PageEditorProps) {
  const { slug, path: pathSegments } = await params;

  // "home" maps to "/", everything else maps to "/segment"
  const pagePath = pathSegments[0] === 'home'
    ? '/'
    : `/${pathSegments.join('/')}`;

  const result = await getPuckData();

  if ('error' in result && result.error) {
    return <div className="rounded-lg bg-red-50 p-4 text-red-600">{result.error}</div>;
  }

  const puckPagesDraft = 'puckPagesDraft' in result
    ? (result.puckPagesDraft as Record<string, unknown> | null)
    : null;
  const puckPages = 'puckPages' in result
    ? (result.puckPages as Record<string, unknown> | null)
    : null;
  const puckPageMeta = 'puckPageMeta' in result
    ? (result.puckPageMeta as Record<string, { title: string }> | null)
    : null;

  const data = (puckPagesDraft?.[pagePath] ?? puckPages?.[pagePath] ?? emptyPageData) as Data;
  const pageTitle = pagePath === '/' ? 'Home' : (puckPageMeta?.[pagePath]?.title ?? pagePath);

  // Derive back link base
  const backHref = `/admin/properties/${slug}/site-builder/pages`;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link href={backHref} className="text-gray-500 hover:text-gray-700">
          ← Pages
        </Link>
        <span className="text-gray-400">/</span>
        <span className="font-medium text-gray-900">{pageTitle}</span>
      </div>
      <PuckPageEditor initialData={data} pagePath={pagePath} />
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/properties/[slug]/site-builder/pages/[...path]/page.tsx
git commit -m "feat: add per-page editor route for site builder (#142)"
```

---

### Task 7: Public Catch-All Route

**Files:**
- Create: `src/app/[...slug]/page.tsx`

- [ ] **Step 1: Create the catch-all route**

Create `src/app/[...slug]/page.tsx`:

```typescript
import { notFound } from 'next/navigation';
import { getConfig } from '@/lib/config/server';
import { PuckPageRenderer } from '@/components/puck/PuckPageRenderer';
import { PreviewReloadListener } from '@/components/puck/PreviewReloadListener';
import type { Data } from '@puckeditor/core';

interface CatchAllPageProps {
  params: { slug: string[] };
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function CatchAllPage({ params, searchParams }: CatchAllPageProps) {
  const { slug: segments } = await params;
  const path = `/${segments.join('/')}`;
  const isPreview = searchParams?.preview === 'true';

  const config = await getConfig();

  const pageData = isPreview
    ? (config.puckPagesDraft?.[path] ?? config.puckPages?.[path])
    : config.puckPages?.[path];

  if (!pageData) {
    notFound();
  }

  return (
    <main className="pb-20 md:pb-0">
      {isPreview && (
        <>
          <PreviewReloadListener />
          <div className="bg-yellow-100 px-4 py-2 text-center text-sm text-yellow-800">
            Preview Mode — This is a draft and not yet published.
          </div>
        </>
      )}
      <PuckPageRenderer data={pageData as Data} />
    </main>
  );
}
```

- [ ] **Step 2: Verify existing routes still take precedence**

Run: `npm run build`
Expected: Build succeeds. Routes like `/map`, `/list`, `/about`, `/admin` still resolve to their explicit route handlers, not the catch-all.

- [ ] **Step 3: Commit**

```bash
git add src/app/[...slug]/page.tsx
git commit -m "feat: add public catch-all route for custom pages (#142)"
```

---

### Task 8: Extend Link Field with Custom Page Suggestions

**Files:**
- Modify: `src/lib/puck/fields/PuckSuggestionsProvider.tsx`
- Modify: `src/lib/puck/fields/LinkField.tsx`
- Modify: `src/lib/puck/fields/__tests__/LinkField.test.tsx`
- Modify: `src/components/puck/PuckPageEditor.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/puck/fields/__tests__/LinkField.test.tsx` at the end of the file:

```typescript
describe('custom page suggestions', () => {
  it('shows Custom Pages group when provider has page links', async () => {
    const puckData = { root: { props: {} }, content: [] };
    const pageLinks = [
      { href: '/events', label: 'Events' },
      { href: '/volunteer', label: 'Volunteer' },
    ];
    render(
      <PuckSuggestionsProvider data={puckData} pageLinks={pageLinks}>
        <LinkField value="" onChange={vi.fn()} />
      </PuckSuggestionsProvider>
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.getByText('Custom Pages')).toBeDefined();
    expect(screen.getByText('Events')).toBeDefined();
    expect(screen.getByText('Volunteer')).toBeDefined();
  });

  it('filters custom pages by typing', async () => {
    const puckData = { root: { props: {} }, content: [] };
    const pageLinks = [
      { href: '/events', label: 'Events' },
      { href: '/volunteer', label: 'Volunteer' },
    ];
    render(
      <PuckSuggestionsProvider data={puckData} pageLinks={pageLinks}>
        <LinkField value="" onChange={vi.fn()} />
      </PuckSuggestionsProvider>
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'vol' } });
    expect(screen.getByText('Volunteer')).toBeDefined();
    expect(screen.queryByText('Events')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/puck/fields/__tests__/LinkField.test.tsx`
Expected: FAIL — `PuckSuggestionsProvider` doesn't accept `pageLinks` prop

- [ ] **Step 3: Update PuckSuggestionsProvider**

In `src/lib/puck/fields/PuckSuggestionsProvider.tsx`, add `pageLinks` to the context:

```typescript
'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { extractExternalLinks, type LinkSuggestion } from './link-suggestions';

interface SuggestionsContextValue {
  externalLinks: LinkSuggestion[];
  pageLinks: LinkSuggestion[];
}

const SuggestionsContext = createContext<SuggestionsContextValue>({
  externalLinks: [],
  pageLinks: [],
});

interface PuckSuggestionsProviderProps {
  data: any;
  pageLinks?: LinkSuggestion[];
  children: ReactNode;
}

export function PuckSuggestionsProvider({ data, pageLinks = [], children }: PuckSuggestionsProviderProps) {
  const externalLinks = useMemo(() => extractExternalLinks(data), [data]);
  const value = useMemo(() => ({ externalLinks, pageLinks }), [externalLinks, pageLinks]);

  return (
    <SuggestionsContext.Provider value={value}>
      {children}
    </SuggestionsContext.Provider>
  );
}

export function useLinkSuggestions(): SuggestionsContextValue {
  return useContext(SuggestionsContext);
}
```

- [ ] **Step 4: Update LinkField to show Custom Pages group**

In `src/lib/puck/fields/LinkField.tsx`, update the suggestions logic. After the existing line:

```typescript
const { externalLinks } = useLinkSuggestions();
```

Change to:

```typescript
const { externalLinks, pageLinks } = useLinkSuggestions();
```

Add filtered page links after `filteredExternal`:

```typescript
const filteredCustomPages = pageLinks.filter(
  (r) =>
    !href ||
    r.label.toLowerCase().includes(href.toLowerCase()) ||
    r.href.toLowerCase().includes(href.toLowerCase())
);
```

Update `allSuggestions`:

```typescript
const allSuggestions: LinkSuggestion[] = [...filteredPages, ...filteredCustomPages, ...filteredExternal];
```

In the JSX dropdown, add a "Custom Pages" section between the "Pages" and "Previously Used" sections:

```tsx
{filteredCustomPages.length > 0 && (
  <>
    <li className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50">
      Custom Pages
    </li>
    {filteredCustomPages.map((suggestion, i) => {
      const globalIndex = filteredPages.length + i;
      return (
        <li
          key={suggestion.href}
          id={`${listboxId}-option-${globalIndex}`}
          role="option"
          aria-selected={activeIndex === globalIndex}
          className={`flex cursor-pointer items-center justify-between px-2 py-1.5 text-xs ${
            activeIndex === globalIndex
              ? 'bg-blue-50 text-blue-700'
              : 'hover:bg-gray-50'
          }`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => selectSuggestion(suggestion)}
        >
          <span>{suggestion.label}</span>
          <span className="text-[10px] text-gray-400">
            {suggestion.href}
          </span>
        </li>
      );
    })}
  </>
)}
```

Update the `filteredExternal` global index calculation to account for custom pages:

```typescript
const globalIndex = filteredPages.length + filteredCustomPages.length + i;
```

Also update `showExternal`:

```typescript
const showExternal = filteredExternal.length > 0;
```

- [ ] **Step 5: Update PuckPageEditor to pass pageLinks**

In `src/components/puck/PuckPageEditor.tsx`, update the props interface:

```typescript
interface PuckPageEditorProps {
  initialData: Data;
  pagePath: string;
  pageLinks?: Array<{ href: string; label: string }>;
}
```

Update the component signature and the provider:

```typescript
export function PuckPageEditor({ initialData, pagePath, pageLinks = [] }: PuckPageEditorProps) {
```

Update the JSX:

```tsx
<PuckSuggestionsProvider data={puckData} pageLinks={pageLinks}>
```

- [ ] **Step 6: Pass pageLinks from the page editor route**

In `src/app/admin/properties/[slug]/site-builder/pages/[...path]/page.tsx`, build pageLinks from puckPageMeta and pass to PuckPageEditor:

```typescript
const pageLinks = Object.entries(puckPageMeta ?? {}).map(([path, meta]) => ({
  href: path,
  label: meta.title,
}));
// Also add landing page if it exists
if (puckPagesDraft?.['/'] || puckPages?.['/']) {
  pageLinks.unshift({ href: '/', label: 'Home' });
}
```

Pass to the editor:

```tsx
<PuckPageEditor initialData={data} pagePath={pagePath} pageLinks={pageLinks} />
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test -- src/lib/puck/fields/__tests__/LinkField.test.tsx`
Expected: PASS (all tests including new ones)

- [ ] **Step 8: Run type check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/puck/fields/PuckSuggestionsProvider.tsx src/lib/puck/fields/LinkField.tsx src/lib/puck/fields/__tests__/LinkField.test.tsx src/components/puck/PuckPageEditor.tsx src/app/admin/properties/[slug]/site-builder/pages/[...path]/page.tsx
git commit -m "feat: extend link field with custom page suggestions (#142)"
```

---

### Task 9: Duplicate `/p/[slug]/admin` Routes

**Files:**
- Create: `src/app/p/[slug]/admin/site-builder/pages/page.tsx`
- Create: `src/app/p/[slug]/admin/site-builder/pages/[...path]/page.tsx`
- Modify: `src/app/p/[slug]/admin/site-builder/landing/page.tsx` (if exists)

The site builder has two route trees (`/admin/properties/[slug]/` and `/p/[slug]/admin/`). The new pages routes need to exist in both.

- [ ] **Step 1: Check if the `/p/[slug]/admin/site-builder` routes exist**

Run: `ls src/app/p/[slug]/admin/site-builder/ 2>/dev/null || echo "not found"`

If the routes exist, create equivalent page files that re-export or duplicate the logic from the main admin routes. If they use a shared layout, just create the page files:

For `src/app/p/[slug]/admin/site-builder/pages/page.tsx`:
```typescript
export { default } from '@/app/admin/properties/[slug]/site-builder/pages/page';
```

For `src/app/p/[slug]/admin/site-builder/pages/[...path]/page.tsx`:
```typescript
export { default } from '@/app/admin/properties/[slug]/site-builder/pages/[...path]/page';
```

For `src/app/p/[slug]/admin/site-builder/landing/page.tsx` (redirect):
```typescript
export { default } from '@/app/admin/properties/[slug]/site-builder/landing/page';
```

- [ ] **Step 2: Run type check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/p/
git commit -m "feat: add pages routes to /p/[slug]/admin site builder (#142)"
```

---

### Task 10: E2E Tests — Page Management

**Files:**
- Create: `e2e/tests/site-builder/pages.spec.ts`

- [ ] **Step 1: Write the E2E test**

Create `e2e/tests/site-builder/pages.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Site Builder Pages', () => {
  test.use({ storageState: ADMIN_AUTH });

  const pagesUrl = `/admin/properties/${TEST_DATA.property.slug}/site-builder/pages`;

  test('pages list loads', async ({ page }) => {
    await page.goto(pagesUrl);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=All Pages')).toBeVisible({ timeout: 10000 });
  });

  test('can create a new page', async ({ page }) => {
    await page.goto(pagesUrl);
    await page.waitForLoadState('networkidle');

    // Click new page button
    await page.click('text=+ New Page');
    await expect(page.locator('text=New Page').first()).toBeVisible();

    // Fill title
    await page.fill('input[placeholder*="Events"]', 'Test Page');
    // Slug should auto-populate
    await expect(page.locator('input[placeholder="events"]')).toHaveValue('test-page');

    // Submit
    await page.click('text=Create Page');
    await page.waitForLoadState('networkidle');

    // Verify page appears in list
    await expect(page.locator('text=Test Page')).toBeVisible();
    await expect(page.locator('text=/test-page')).toBeVisible();
  });

  test('can navigate to page editor', async ({ page }) => {
    await page.goto(pagesUrl);
    await page.waitForLoadState('networkidle');

    // Click on a page card (Home should always exist if landing page is set)
    const firstCard = page.locator('.card').first();
    await firstCard.click();

    // Should see the Puck editor or back link
    await expect(page.locator('text=← Pages')).toBeVisible({ timeout: 10000 });
  });

  test('visiting non-existent public page returns 404', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist-xyz');
    expect(response?.status()).toBe(404);
  });
});
```

- [ ] **Step 2: Run the E2E test**

Run: `npm run test:e2e -- --grep "Site Builder Pages"`
Expected: Tests pass (or some may need adjustment based on seed data state). Review results and fix any issues.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/site-builder/pages.spec.ts
git commit -m "test: add E2E tests for multi-page site builder (#142)"
```

---

### Task 11: Update Existing Tests

**Files:**
- Modify: `e2e/tests/admin/landing-editor.spec.ts`
- Modify: `e2e/tests/site-builder/preview.spec.ts`

- [ ] **Step 1: Update landing editor test**

The old `/landing` route now redirects to `/pages`. Update `e2e/tests/admin/landing-editor.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Landing Page Editor', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('landing editor redirects to pages list', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/site-builder/landing`);
    await page.waitForLoadState('networkidle');
    // Should redirect to pages list
    await expect(page).toHaveURL(/\/site-builder\/pages/);
  });
});
```

- [ ] **Step 2: Verify preview test still passes**

Run: `npm run test:e2e -- --grep "Site Builder Preview"`
Expected: PASS (preview route is unchanged)

- [ ] **Step 3: Run all existing tests**

Run: `npm run test`
Expected: All unit tests pass.

Run: `npm run test:e2e:smoke`
Expected: Smoke tests pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/admin/landing-editor.spec.ts
git commit -m "test: update landing editor test for pages redirect (#142)"
```

---

### Task 12: Preview Route Updates

**Files:**
- Modify: `src/app/admin/properties/[slug]/site-builder/layout.tsx`

- [ ] **Step 1: Update preview to support multi-page**

In `src/app/admin/properties/[slug]/site-builder/layout.tsx`, the preview button currently always opens `/?preview=true`. Update `handlePreview` to be path-aware. Since the layout doesn't know which page is being edited, keep the current behavior (preview always shows the landing page). Individual page editors can add their own preview button if needed.

No changes required for now — the preview window shows the full site including all published pages via the catch-all route. The existing behavior is sufficient for MVP.

- [ ] **Step 2: Commit** (skip if no changes)

No commit needed for this task.
