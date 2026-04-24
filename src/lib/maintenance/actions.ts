'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  createMaintenanceProjectSchema,
  updateMaintenanceProjectSchema,
} from './schemas';

type Ok<T extends object> = { success: true } & T;
type Err = { error: string };

export async function createMaintenanceProject(
  input: unknown,
): Promise<Ok<{ id: string; propertySlug: string }> | Err> {
  const parsed = createMaintenanceProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  // Need the property slug to revalidate the list route.
  const { data: prop, error: propErr } = await supabase
    .from('properties')
    .select('slug')
    .eq('id', parsed.data.propertyId)
    .single();
  if (propErr || !prop) return { error: 'Property not found.' };

  const { data, error } = await supabase
    .from('maintenance_projects')
    .insert({
      org_id: parsed.data.orgId,
      property_id: parsed.data.propertyId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      scheduled_for: parsed.data.scheduledFor ?? null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single();
  if (error || !data) return { error: `Create failed: ${error?.message ?? 'unknown'}` };

  revalidatePath(`/admin/properties/${prop.slug}/maintenance`);
  return { success: true, id: data.id as string, propertySlug: prop.slug as string };
}

export async function updateMaintenanceProject(
  id: string,
  input: unknown,
): Promise<Ok<{}> | Err> {
  const parsed = updateMaintenanceProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const updates: Record<string, unknown> = { updated_by: user.id };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.scheduledFor !== undefined) updates.scheduled_for = parsed.data.scheduledFor;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;

  const { data: project, error } = await supabase
    .from('maintenance_projects')
    .update(updates)
    .eq('id', id)
    .select('property_id')
    .single();
  if (error || !project) return { error: `Update failed: ${error?.message ?? 'unknown'}` };

  const { data: prop } = await supabase
    .from('properties')
    .select('slug')
    .eq('id', project.property_id)
    .single();
  if (prop?.slug) {
    revalidatePath(`/admin/properties/${prop.slug}/maintenance`);
    revalidatePath(`/admin/properties/${prop.slug}/maintenance/${id}`);
  }
  return { success: true };
}

export async function deleteMaintenanceProject(id: string): Promise<Ok<{}> | Err> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { data: project } = await supabase
    .from('maintenance_projects')
    .select('property_id')
    .eq('id', id)
    .single();

  const { error } = await supabase.from('maintenance_projects').delete().eq('id', id);
  if (error) return { error: `Delete failed: ${error.message}` };

  if (project?.property_id) {
    const { data: prop } = await supabase
      .from('properties')
      .select('slug')
      .eq('id', project.property_id)
      .single();
    if (prop?.slug) revalidatePath(`/admin/properties/${prop.slug}/maintenance`);
  }
  return { success: true };
}
