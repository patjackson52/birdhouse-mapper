'use server';

import { createClient } from '@/lib/supabase/server';
import { invalidateConfig } from '@/lib/config/server';
import { puckDataSchema } from '@/lib/puck/schemas';
import { sanitizePuckDataForWrite } from '@/lib/puck/sanitize-data';
import { validatePageSlug, type PageMeta } from '@/lib/puck/page-utils';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function getPropertyId(): Promise<{ propertyId: string } | { error: string }> {
  const supabase = createClient();
  const { data: org, error } = await supabase
    .from('orgs')
    .select('id, default_property_id')
    .limit(1)
    .single();
  if (error || !org?.default_property_id) {
    return { error: `Failed to find property: ${error?.message ?? 'no default property'}` };
  }
  return { propertyId: org.default_property_id };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

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
    puckPageMeta: property.puck_page_meta as Record<string, PageMeta> | null,
  };
}

// ---------------------------------------------------------------------------
// Save drafts
// ---------------------------------------------------------------------------

export async function savePuckPageDraft(path: string, data: unknown) {
  const parseResult = puckDataSchema.safeParse(data);
  if (!parseResult.success) {
    return { error: 'Invalid puck data: ' + parseResult.error.message };
  }

  const result = await getPropertyId();
  if ('error' in result) return result;

  const supabase = createClient();

  // Read existing draft pages so we can merge
  const { data: property, error: readError } = await supabase
    .from('properties')
    .select('puck_pages_draft')
    .eq('id', result.propertyId)
    .single();

  if (readError) {
    return { error: `Failed to read existing draft: ${readError.message}` };
  }

  const existing =
    property?.puck_pages_draft && typeof property.puck_pages_draft === 'object'
      ? (property.puck_pages_draft as Record<string, unknown>)
      : {};

  const sanitized = sanitizePuckDataForWrite(parseResult.data as Parameters<typeof sanitizePuckDataForWrite>[0]);
  const merged = { ...existing, [path]: sanitized };

  const { error } = await supabase
    .from('properties')
    .update({ puck_pages_draft: merged })
    .eq('id', result.propertyId);

  if (error) return { error: error.message };
  invalidateConfig();
  return { success: true as const };
}

export async function savePuckRootDraft(data: unknown) {
  const parseResult = puckDataSchema.safeParse(data);
  if (!parseResult.success) {
    return { error: 'Invalid puck data: ' + parseResult.error.message };
  }

  const result = await getPropertyId();
  if ('error' in result) return result;

  const supabase = createClient();
  const sanitized = sanitizePuckDataForWrite(parseResult.data as Parameters<typeof sanitizePuckDataForWrite>[0]);
  const { error } = await supabase
    .from('properties')
    .update({ puck_root_draft: sanitized as unknown as Record<string, unknown> })
    .eq('id', result.propertyId);

  if (error) return { error: error.message };
  invalidateConfig();
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export async function publishPuckPages() {
  const result = await getPropertyId();
  if ('error' in result) return result;

  const supabase = createClient();

  const { data: property, error: readError } = await supabase
    .from('properties')
    .select('puck_pages_draft')
    .eq('id', result.propertyId)
    .single();

  if (readError || !property) {
    return { error: `Failed to read draft: ${readError?.message ?? 'not found'}` };
  }

  // Defense-in-depth: re-sanitize even though draft was sanitized on save.
  // Idempotent — clean data passes through unchanged.
  const draft = property.puck_pages_draft as Record<string, unknown> | null;
  let sanitizedPages: Record<string, unknown> | null = null;
  if (draft && typeof draft === 'object') {
    sanitizedPages = {};
    for (const [pagePath, pageData] of Object.entries(draft)) {
      sanitizedPages[pagePath] = sanitizePuckDataForWrite(
        pageData as Parameters<typeof sanitizePuckDataForWrite>[0]
      );
    }
  }

  const { error } = await supabase
    .from('properties')
    .update({ puck_pages: sanitizedPages })
    .eq('id', result.propertyId);

  if (error) return { error: error.message };

  invalidateConfig();
  return { success: true as const };
}

export async function publishPuckRoot() {
  const result = await getPropertyId();
  if ('error' in result) return result;

  const supabase = createClient();

  const { data: property, error: readError } = await supabase
    .from('properties')
    .select('puck_root_draft')
    .eq('id', result.propertyId)
    .single();

  if (readError || !property) {
    return { error: `Failed to read draft: ${readError?.message ?? 'not found'}` };
  }

  // Defense-in-depth: re-sanitize. Idempotent.
  const sanitizedRoot = property.puck_root_draft
    ? sanitizePuckDataForWrite(
        property.puck_root_draft as Parameters<typeof sanitizePuckDataForWrite>[0]
      )
    : null;

  const { error } = await supabase
    .from('properties')
    .update({ puck_root: sanitizedRoot as unknown as Record<string, unknown> | null })
    .eq('id', result.propertyId);

  if (error) return { error: error.message };

  invalidateConfig();
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Page CRUD helpers
// ---------------------------------------------------------------------------

async function getPropertyPageData(propertyId: string) {
  const supabase = createClient();
  const { data: property, error } = await supabase
    .from('properties')
    .select('puck_pages, puck_pages_draft, puck_page_meta')
    .eq('id', propertyId)
    .single();

  if (error || !property) {
    return { error: `Failed to read page data: ${error?.message ?? 'not found'}` };
  }

  return {
    puckPages: (property.puck_pages ?? {}) as Record<string, unknown>,
    puckPagesDraft: (property.puck_pages_draft ?? {}) as Record<string, unknown>,
    puckPageMeta: (property.puck_page_meta ?? {}) as Record<string, PageMeta>,
  };
}

// ---------------------------------------------------------------------------
// Page CRUD
// ---------------------------------------------------------------------------

const EMPTY_PUCK_DATA = { root: { props: {} }, content: [] };

export async function createPage(title: string, slug: string, isLandingPage: boolean) {
  const result = await getPropertyId();
  if ('error' in result) return result;

  const pageData = await getPropertyPageData(result.propertyId);
  if ('error' in pageData) return pageData;

  const { puckPages, puckPagesDraft, puckPageMeta } = pageData;

  const slugError = validatePageSlug(slug, puckPageMeta);
  if (slugError) return { error: slugError };

  const path = `/${slug}`;
  const now = new Date().toISOString();

  const newMeta: PageMeta = { title, slug, createdAt: now };

  const updatedPages = { ...puckPages };
  const updatedDraft = { ...puckPagesDraft };
  const updatedMeta = { ...puckPageMeta };

  if (isLandingPage) {
    // If `/` already has content, move it to a free slug
    if (updatedPages['/'] || updatedDraft['/']) {
      let displacedSlug = 'home';
      let displacedPath = `/${displacedSlug}`;
      let counter = 1;
      while (displacedPath in updatedMeta || displacedPath in updatedDraft) {
        displacedSlug = `home-${counter++}`;
        displacedPath = `/${displacedSlug}`;
      }
      updatedPages[displacedPath] = updatedPages['/'] ?? EMPTY_PUCK_DATA;
      updatedDraft[displacedPath] = updatedDraft['/'] ?? EMPTY_PUCK_DATA;
      updatedMeta[displacedPath] = { title: 'Home', slug: displacedSlug, createdAt: now };
    }
    // Place new page at `/` (draft only — must be published explicitly)
    updatedDraft['/'] = EMPTY_PUCK_DATA;
    updatedMeta['/'] = { ...newMeta, slug };
  } else {
    // Draft only — must be published explicitly
    updatedDraft[path] = EMPTY_PUCK_DATA;
    updatedMeta[path] = newMeta;
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('properties')
    .update({
      puck_pages: updatedPages,
      puck_pages_draft: updatedDraft,
      puck_page_meta: updatedMeta as unknown as Record<string, unknown>,
    })
    .eq('id', result.propertyId);

  if (error) return { error: error.message };

  invalidateConfig();
  return { success: true as const };
}

export async function deletePage(path: string) {
  if (path === '/') {
    return { error: 'Cannot delete the landing page' };
  }

  const result = await getPropertyId();
  if ('error' in result) return result;

  const pageData = await getPropertyPageData(result.propertyId);
  if ('error' in pageData) return pageData;

  const { puckPages, puckPagesDraft, puckPageMeta } = pageData;

  if (!(path in puckPageMeta) && !(path in puckPagesDraft) && !(path in puckPages)) {
    return { error: 'Page not found' };
  }

  const updatedPages = { ...puckPages };
  const updatedDraft = { ...puckPagesDraft };
  const updatedMeta = { ...puckPageMeta };

  delete updatedPages[path];
  delete updatedDraft[path];
  delete updatedMeta[path];

  const supabase = createClient();
  const { error } = await supabase
    .from('properties')
    .update({
      puck_pages: updatedPages,
      puck_pages_draft: updatedDraft,
      puck_page_meta: updatedMeta as unknown as Record<string, unknown>,
    })
    .eq('id', result.propertyId);

  if (error) return { error: error.message };

  invalidateConfig();
  return { success: true as const };
}

export async function setLandingPage(path: string) {
  if (path === '/') {
    return { error: 'This page is already the landing page' };
  }

  const result = await getPropertyId();
  if ('error' in result) return result;

  const pageData = await getPropertyPageData(result.propertyId);
  if ('error' in pageData) return pageData;

  const { puckPages, puckPagesDraft, puckPageMeta } = pageData;

  const updatedPages = { ...puckPages };
  const updatedDraft = { ...puckPagesDraft };
  const updatedMeta = { ...puckPageMeta };

  // Swap content between path and `/` in all columns
  const oldLandingPages = updatedPages['/'];
  const oldLandingDraft = updatedDraft['/'];
  const oldLandingMeta = updatedMeta['/'];

  updatedPages['/'] = updatedPages[path] ?? EMPTY_PUCK_DATA;
  updatedDraft['/'] = updatedDraft[path] ?? EMPTY_PUCK_DATA;
  updatedMeta['/'] = updatedMeta[path]
    ? { ...updatedMeta[path] }
    : { title: 'Home', slug: '', createdAt: new Date().toISOString() };

  if (oldLandingPages || oldLandingDraft || oldLandingMeta) {
    updatedPages[path] = oldLandingPages ?? EMPTY_PUCK_DATA;
    updatedDraft[path] = oldLandingDraft ?? EMPTY_PUCK_DATA;
    updatedMeta[path] = oldLandingMeta
      ? { ...oldLandingMeta }
      : { title: 'Home', slug: path.slice(1), createdAt: new Date().toISOString() };
  } else {
    delete updatedPages[path];
    delete updatedDraft[path];
    delete updatedMeta[path];
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('properties')
    .update({
      puck_pages: updatedPages,
      puck_pages_draft: updatedDraft,
      puck_page_meta: updatedMeta as unknown as Record<string, unknown>,
    })
    .eq('id', result.propertyId);

  if (error) return { error: error.message };

  invalidateConfig();
  return { success: true as const };
}

export async function updatePageMeta(
  path: string,
  updates: { title?: string; slug?: string }
) {
  if (path === '/' && updates.slug) {
    return { error: 'Cannot change the slug of the landing page. Use setLandingPage instead.' };
  }

  const result = await getPropertyId();
  if ('error' in result) return result;

  const pageData = await getPropertyPageData(result.propertyId);
  if ('error' in pageData) return pageData;

  const { puckPages, puckPagesDraft, puckPageMeta } = pageData;

  if (!(path in puckPageMeta)) {
    return { error: 'Page not found' };
  }

  const updatedPages = { ...puckPages };
  const updatedDraft = { ...puckPagesDraft };
  const updatedMeta = { ...puckPageMeta };

  const currentMeta = { ...updatedMeta[path] };

  if (updates.title !== undefined) {
    currentMeta.title = updates.title;
  }

  if (updates.slug !== undefined && updates.slug !== currentMeta.slug) {
    const slugError = validatePageSlug(updates.slug, updatedMeta);
    if (slugError) return { error: slugError };

    const newPath = `/${updates.slug}`;

    // Move content to new path
    updatedPages[newPath] = updatedPages[path] ?? EMPTY_PUCK_DATA;
    updatedDraft[newPath] = updatedDraft[path] ?? EMPTY_PUCK_DATA;
    delete updatedPages[path];
    delete updatedDraft[path];
    delete updatedMeta[path];

    currentMeta.slug = updates.slug;
    updatedMeta[newPath] = currentMeta;
  } else {
    updatedMeta[path] = currentMeta;
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('properties')
    .update({
      puck_pages: updatedPages,
      puck_pages_draft: updatedDraft,
      puck_page_meta: updatedMeta as unknown as Record<string, unknown>,
    })
    .eq('id', result.propertyId);

  if (error) return { error: error.message };

  invalidateConfig();
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Apply template
// ---------------------------------------------------------------------------

export async function applyTemplate(
  templateId: string,
  rootData: unknown,
  pagesData: Record<string, unknown>
) {
  const rootParse = puckDataSchema.safeParse(rootData);
  if (!rootParse.success) {
    return { error: 'Invalid root data: ' + rootParse.error.message };
  }

  // Validate each page entry
  for (const [pagePath, pageData] of Object.entries(pagesData)) {
    const pageParse = puckDataSchema.safeParse(pageData);
    if (!pageParse.success) {
      return { error: `Invalid page data for "${pagePath}": ${pageParse.error.message}` };
    }
  }

  const result = await getPropertyId();
  if ('error' in result) return result;

  const supabase = createClient();
  const { error } = await supabase
    .from('properties')
    .update({
      puck_template: templateId,
      puck_root: rootParse.data as unknown as Record<string, unknown>,
      puck_root_draft: rootParse.data as unknown as Record<string, unknown>,
      puck_pages: pagesData as Record<string, unknown>,
      puck_pages_draft: pagesData as Record<string, unknown>,
    })
    .eq('id', result.propertyId);

  if (error) return { error: error.message };

  invalidateConfig();
  return { success: true as const };
}
