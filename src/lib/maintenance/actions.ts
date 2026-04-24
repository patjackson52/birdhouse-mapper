'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  createMaintenanceProjectSchema,
  updateMaintenanceProjectSchema,
  linkItemsSchema,
  linkKnowledgeSchema,
  setItemCompletionSchema,
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

async function revalidateForProject(supabase: ReturnType<typeof createClient>, projectId: string) {
  const { data: project } = await supabase
    .from('maintenance_projects')
    .select('property_id')
    .eq('id', projectId)
    .single();
  if (!project?.property_id) return;
  const { data: prop } = await supabase
    .from('properties')
    .select('slug')
    .eq('id', project.property_id)
    .single();
  if (prop?.slug) revalidatePath(`/admin/properties/${prop.slug}/maintenance/${projectId}`);
}

export async function addItemsToProject(input: unknown): Promise<Ok<{}> | Err> {
  const parsed = linkItemsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { data: project } = await supabase
    .from('maintenance_projects')
    .select('org_id')
    .eq('id', parsed.data.projectId)
    .single();
  if (!project) return { error: 'Project not found.' };

  const rows = parsed.data.itemIds.map((item_id) => ({
    maintenance_project_id: parsed.data.projectId,
    item_id,
    org_id: project.org_id,
  }));

  const { error } = await supabase
    .from('maintenance_project_items')
    .upsert(rows, { onConflict: 'maintenance_project_id,item_id', ignoreDuplicates: true });
  if (error) return { error: `Add items failed: ${error.message}` };

  await revalidateForProject(supabase, parsed.data.projectId);
  return { success: true };
}

export async function removeItemFromProject(
  projectId: string,
  itemId: string,
): Promise<Ok<{}> | Err> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('maintenance_project_items')
    .delete()
    .eq('maintenance_project_id', projectId)
    .eq('item_id', itemId);
  if (error) return { error: `Remove failed: ${error.message}` };

  await revalidateForProject(supabase, projectId);
  return { success: true };
}

export async function setItemCompletion(input: unknown): Promise<Ok<{}> | Err> {
  const parsed = setItemCompletionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('maintenance_project_items')
    .update({
      completed_at: parsed.data.completed ? new Date().toISOString() : null,
      completed_by: parsed.data.completed ? user.id : null,
    })
    .eq('maintenance_project_id', parsed.data.projectId)
    .eq('item_id', parsed.data.itemId);
  if (error) return { error: `Update failed: ${error.message}` };

  await revalidateForProject(supabase, parsed.data.projectId);
  return { success: true };
}

export async function addKnowledgeToProject(input: unknown): Promise<Ok<{}> | Err> {
  const parsed = linkKnowledgeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { data: project } = await supabase
    .from('maintenance_projects')
    .select('org_id')
    .eq('id', parsed.data.projectId)
    .single();
  if (!project) return { error: 'Project not found.' };

  const rows = parsed.data.knowledgeIds.map((knowledge_item_id) => ({
    maintenance_project_id: parsed.data.projectId,
    knowledge_item_id,
    org_id: project.org_id,
  }));

  const { error } = await supabase
    .from('maintenance_project_knowledge')
    .upsert(rows, { onConflict: 'maintenance_project_id,knowledge_item_id', ignoreDuplicates: true });
  if (error) return { error: `Add knowledge failed: ${error.message}` };

  await revalidateForProject(supabase, parsed.data.projectId);
  return { success: true };
}

export async function removeKnowledgeFromProject(
  projectId: string,
  knowledgeId: string,
): Promise<Ok<{}> | Err> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('maintenance_project_knowledge')
    .delete()
    .eq('maintenance_project_id', projectId)
    .eq('knowledge_item_id', knowledgeId);
  if (error) return { error: `Remove failed: ${error.message}` };

  await revalidateForProject(supabase, projectId);
  return { success: true };
}
