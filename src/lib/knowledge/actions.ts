'use server';

import { createClient } from '@/lib/supabase/server';
import type { KnowledgeItem, CreateKnowledgeInput, UpdateKnowledgeInput, KnowledgeFilters } from './types';
import { generateSlug } from './helpers';

export async function createKnowledgeItem(
  input: CreateKnowledgeInput
): Promise<{ success: true; item: KnowledgeItem } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  const slug = generateSlug(input.title);

  const { data: item, error: insertError } = await supabase
    .from('knowledge_items')
    .insert({
      org_id: input.orgId,
      title: input.title,
      slug,
      body: input.body ?? null,
      body_html: input.bodyHtml ?? null,
      excerpt: input.excerpt ?? null,
      cover_image_url: input.coverImageUrl ?? null,
      tags: input.tags ?? [],
      visibility: input.visibility ?? 'org',
      is_ai_context: input.isAiContext ?? true,
      ai_priority: input.aiPriority ?? null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('*')
    .single();

  if (insertError || !item) {
    return { error: `Failed to create knowledge item: ${insertError?.message ?? 'unknown'}` };
  }

  return { success: true, item: item as KnowledgeItem };
}

export async function updateKnowledgeItem(
  id: string,
  updates: UpdateKnowledgeInput
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  const dbUpdates: Record<string, unknown> = { updated_by: user.id };
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.body !== undefined) dbUpdates.body = updates.body;
  if (updates.bodyHtml !== undefined) dbUpdates.body_html = updates.bodyHtml;
  if (updates.excerpt !== undefined) dbUpdates.excerpt = updates.excerpt;
  if (updates.coverImageUrl !== undefined) dbUpdates.cover_image_url = updates.coverImageUrl;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.visibility !== undefined) dbUpdates.visibility = updates.visibility;
  if (updates.isAiContext !== undefined) dbUpdates.is_ai_context = updates.isAiContext;
  if (updates.aiPriority !== undefined) dbUpdates.ai_priority = updates.aiPriority;

  const { error } = await supabase
    .from('knowledge_items')
    .update(dbUpdates)
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function deleteKnowledgeItem(
  id: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  const { error } = await supabase
    .from('knowledge_items')
    .delete()
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function getKnowledgeItem(
  idOrSlug: string,
  orgId?: string
): Promise<{ item: KnowledgeItem | null; error: string | null }> {
  const supabase = createClient();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

  let query = supabase.from('knowledge_items').select('*');

  if (isUuid) {
    query = query.eq('id', idOrSlug);
  } else {
    query = query.eq('slug', idOrSlug);
    if (orgId) query = query.eq('org_id', orgId);
  }

  const { data, error } = await query.single();

  if (error) {
    return { item: null, error: error.message };
  }

  return { item: data as KnowledgeItem, error: null };
}

export async function getKnowledgeItems(
  orgId: string,
  filters?: KnowledgeFilters
): Promise<{ items: KnowledgeItem[]; error: string | null }> {
  const supabase = createClient();

  let query = supabase
    .from('knowledge_items')
    .select('*')
    .order('updated_at', { ascending: false });

  if (orgId) {
    query = query.eq('org_id', orgId);
  }

  if (filters?.search) {
    query = query.ilike('title', `%${filters.search}%`);
  }
  if (filters?.tags && filters.tags.length > 0) {
    query = query.overlaps('tags', filters.tags);
  }
  if (filters?.visibility) {
    query = query.eq('visibility', filters.visibility);
  }
  if (filters?.isAiContext !== undefined) {
    query = query.eq('is_ai_context', filters.isAiContext);
  }

  const { data, error } = await query;

  if (error) {
    return { items: [], error: error.message };
  }

  return { items: (data ?? []) as KnowledgeItem[], error: null };
}

export async function linkKnowledgeToItem(
  knowledgeItemId: string,
  itemId: string,
  orgId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_item_items')
    .insert({ knowledge_item_id: knowledgeItemId, item_id: itemId, org_id: orgId });
  if (error) return { error: error.message };
  return { success: true };
}

export async function unlinkKnowledgeFromItem(
  knowledgeItemId: string,
  itemId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_item_items')
    .delete()
    .eq('knowledge_item_id', knowledgeItemId)
    .eq('item_id', itemId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function linkKnowledgeToUpdate(
  knowledgeItemId: string,
  updateId: string,
  orgId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_item_updates')
    .insert({ knowledge_item_id: knowledgeItemId, update_id: updateId, org_id: orgId });
  if (error) return { error: error.message };
  return { success: true };
}

export async function unlinkKnowledgeFromUpdate(
  knowledgeItemId: string,
  updateId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_item_updates')
    .delete()
    .eq('knowledge_item_id', knowledgeItemId)
    .eq('update_id', updateId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function linkKnowledgeToEntity(
  knowledgeItemId: string,
  entityId: string,
  orgId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_item_entities')
    .insert({ knowledge_item_id: knowledgeItemId, entity_id: entityId, org_id: orgId });
  if (error) return { error: error.message };
  return { success: true };
}

export async function unlinkKnowledgeFromEntity(
  knowledgeItemId: string,
  entityId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_item_entities')
    .delete()
    .eq('knowledge_item_id', knowledgeItemId)
    .eq('entity_id', entityId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function getLinkedKnowledge(
  targetType: 'item' | 'update' | 'entity',
  targetId: string
): Promise<{ items: KnowledgeItem[]; error: string | null }> {
  const supabase = createClient();

  const tableMap = {
    item: { table: 'knowledge_item_items', fk: 'item_id' },
    update: { table: 'knowledge_item_updates', fk: 'update_id' },
    entity: { table: 'knowledge_item_entities', fk: 'entity_id' },
  };

  const { table, fk } = tableMap[targetType];

  const { data: links, error: linkError } = await supabase
    .from(table)
    .select('knowledge_item_id')
    .eq(fk, targetId);

  if (linkError) {
    return { items: [], error: linkError.message };
  }

  if (!links || links.length === 0) {
    return { items: [], error: null };
  }

  const ids = links.map((l: any) => l.knowledge_item_id);
  const { data, error } = await supabase
    .from('knowledge_items')
    .select('*')
    .in('id', ids)
    .order('updated_at', { ascending: false });

  if (error) {
    return { items: [], error: error.message };
  }

  return { items: (data ?? []) as KnowledgeItem[], error: null };
}

export async function addAttachment(
  knowledgeItemId: string,
  vaultItemId: string,
  sortOrder = 0
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_attachments')
    .insert({ knowledge_item_id: knowledgeItemId, vault_item_id: vaultItemId, sort_order: sortOrder });
  if (error) return { error: error.message };
  return { success: true };
}

export async function removeAttachment(
  knowledgeItemId: string,
  vaultItemId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_attachments')
    .delete()
    .eq('knowledge_item_id', knowledgeItemId)
    .eq('vault_item_id', vaultItemId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function reorderAttachments(
  knowledgeItemId: string,
  orderedVaultItemIds: string[]
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();

  for (let i = 0; i < orderedVaultItemIds.length; i++) {
    const { error } = await supabase
      .from('knowledge_attachments')
      .update({ sort_order: i })
      .eq('knowledge_item_id', knowledgeItemId)
      .eq('vault_item_id', orderedVaultItemIds[i]);

    if (error) {
      return { error: error.message };
    }
  }

  return { success: true };
}

export async function getAttachments(
  knowledgeItemId: string
): Promise<{ attachments: Array<{ vault_item_id: string; sort_order: number; file_name: string; mime_type: string | null; file_size: number }>; error: string | null }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('knowledge_attachments')
    .select('vault_item_id, sort_order, vault_items(file_name, mime_type, file_size)')
    .eq('knowledge_item_id', knowledgeItemId)
    .order('sort_order', { ascending: true });

  if (error) {
    return { attachments: [], error: error.message };
  }

  const attachments = (data ?? []).map((row: any) => ({
    vault_item_id: row.vault_item_id,
    sort_order: row.sort_order,
    file_name: row.vault_items?.file_name ?? '',
    mime_type: row.vault_items?.mime_type ?? null,
    file_size: row.vault_items?.file_size ?? 0,
  }));

  return { attachments, error: null };
}
