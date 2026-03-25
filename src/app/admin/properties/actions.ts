'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';

export async function createProperty(formData: { name: string; slug: string; description?: string }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(formData.slug)) {
    return { error: 'Slug must be lowercase letters, numbers, and hyphens' };
  }

  const { data, error } = await supabase
    .from('properties')
    .insert({
      org_id: tenant.orgId,
      name: formData.name.trim(),
      slug: formData.slug.trim().toLowerCase(),
      description: formData.description?.trim() || null,
      is_active: false,
      created_by: user.id,
    })
    .select('slug')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'A property with this slug already exists' };
    return { error: error.message };
  }

  return { success: true, slug: data.slug };
}

export async function archiveProperty(propertyId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { error } = await supabase
    .from('properties')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', propertyId)
    .eq('org_id', tenant.orgId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function unarchiveProperty(propertyId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { error } = await supabase
    .from('properties')
    .update({ deleted_at: null })
    .eq('id', propertyId)
    .eq('org_id', tenant.orgId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function getProperties() {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context', properties: [] };

  const { data, error } = await supabase
    .from('properties')
    .select('id, name, slug, description, is_active, deleted_at, created_at')
    .eq('org_id', tenant.orgId)
    .order('created_at', { ascending: true });

  if (error) return { error: error.message, properties: [] };
  return { properties: data || [] };
}
