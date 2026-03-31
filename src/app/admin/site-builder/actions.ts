'use server';

import { createClient } from '@/lib/supabase/server';
import { invalidateConfig } from '@/lib/config/server';
import { puckDataSchema } from '@/lib/puck/schemas';

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
    .select('puck_pages, puck_root, puck_template, puck_pages_draft, puck_root_draft')
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

  const merged = { ...existing, [path]: parseResult.data };

  const { error } = await supabase
    .from('properties')
    .update({ puck_pages_draft: merged })
    .eq('id', result.propertyId);

  if (error) return { error: error.message };
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
  const { error } = await supabase
    .from('properties')
    .update({ puck_root_draft: parseResult.data as unknown as Record<string, unknown> })
    .eq('id', result.propertyId);

  if (error) return { error: error.message };
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

  const { error } = await supabase
    .from('properties')
    .update({ puck_pages: property.puck_pages_draft })
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

  const { error } = await supabase
    .from('properties')
    .update({ puck_root: property.puck_root_draft })
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
