'use server';

import { createClient } from '@/lib/supabase/server';
import { moderateImage } from '@/lib/moderation/moderate';
import type { VaultItem, VaultQuota, UploadToVaultInput } from './types';

export async function uploadToVault(
  input: UploadToVaultInput
): Promise<{ success: true; item: VaultItem } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (input.moderateAsPublicContribution) {
    if (!ALLOWED_IMAGE_TYPES.includes(input.file.type)) {
      return { error: 'File type not allowed. Please upload a JPEG, PNG, WebP, or GIF image.' };
    }
  }

  const { data: quota } = await supabase
    .from('vault_quotas')
    .select('current_storage_bytes, max_storage_bytes')
    .eq('org_id', input.orgId)
    .single();

  if (quota && quota.current_storage_bytes + input.file.size > quota.max_storage_bytes) {
    return { error: 'Storage limit reached. Please delete unused files or upgrade your plan.' };
  }

  const bucket = input.moderateAsPublicContribution
    ? 'vault-private'
    : (input.visibility === 'public' ? 'vault-public' : 'vault-private');
  const itemId = crypto.randomUUID();
  const storagePath = `${input.orgId}/${itemId}/${input.file.name}`;

  const binaryBuffer = Buffer.from(input.file.base64, 'base64');
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, binaryBuffer, {
      contentType: input.file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) {
    return { error: `Failed to upload file: ${uploadError.message}` };
  }

  let moderationStatus: string = 'approved';
  let moderationScores: Record<string, unknown> | null = null;
  let rejectionReason: string | null = null;
  let moderatedAt: string | null = null;

  if (input.moderateAsPublicContribution) {
    try {
      const modResult = await moderateImage(input.file.base64, input.file.type);
      moderationScores = modResult.scores as unknown as Record<string, unknown>;
      moderatedAt = new Date().toISOString();

      if (modResult.flagged) {
        await supabase.storage.from(bucket).remove([storagePath]);
        return { error: "Your photo couldn't be posted because it doesn't meet our content guidelines." };
      }

      moderationStatus = input.orgModerationMode === 'auto_approve' ? 'approved' : 'pending';
    } catch {
      moderationStatus = 'flagged_for_review';
      moderatedAt = new Date().toISOString();
    }
  }

  const { data: item, error: insertError } = await supabase
    .from('vault_items')
    .insert({
      id: itemId,
      org_id: input.orgId,
      uploaded_by: user.id,
      storage_bucket: bucket,
      storage_path: storagePath,
      file_name: input.file.name,
      mime_type: input.file.type || null,
      file_size: input.file.size,
      category: input.category,
      visibility: input.visibility,
      is_ai_context: input.isAiContext ?? false,
      ai_priority: input.aiPriority ?? null,
      metadata: input.metadata ?? {},
      moderation_status: moderationStatus,
      moderation_scores: moderationScores,
      rejection_reason: rejectionReason,
      moderated_at: moderatedAt,
    })
    .select('*')
    .single();

  if (insertError || !item) {
    return { error: `Failed to create vault item: ${insertError?.message ?? 'unknown'}` };
  }

  if (moderationStatus === 'approved' && input.visibility === 'public' && input.moderateAsPublicContribution) {
    const { data: fileData } = await supabase.storage.from('vault-private').download(storagePath);
    if (fileData) {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      await supabase.storage.from('vault-public').upload(storagePath, buffer, {
        contentType: input.file.type || 'application/octet-stream',
        upsert: false,
      });
      await supabase.storage.from('vault-private').remove([storagePath]);
      await supabase.from('vault_items').update({
        storage_bucket: 'vault-public',
      }).eq('id', itemId);
    }
  }

  return { success: true, item: item as VaultItem };
}

export async function deleteFromVault(
  vaultItemId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  const { data: item, error: fetchError } = await supabase
    .from('vault_items')
    .select('storage_bucket, storage_path')
    .eq('id', vaultItemId)
    .single();

  if (fetchError || !item) {
    return { error: `Vault item not found: ${fetchError?.message ?? 'unknown'}` };
  }

  const { error: storageError } = await supabase.storage
    .from(item.storage_bucket)
    .remove([item.storage_path]);

  if (storageError) {
    return { error: `Failed to delete file: ${storageError.message}` };
  }

  const { error: deleteError } = await supabase
    .from('vault_items')
    .delete()
    .eq('id', vaultItemId);

  if (deleteError) {
    return { error: `Failed to delete vault item: ${deleteError.message}` };
  }

  return { success: true };
}

export async function updateVaultItem(
  vaultItemId: string,
  updates: {
    file_name?: string;
    visibility?: 'public' | 'private';
    is_ai_context?: boolean;
    ai_priority?: number | null;
  }
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
    .from('vault_items')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', vaultItemId);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function getVaultItems(
  orgId: string,
  filters?: {
    category?: string;
    visibility?: string;
    isAiContext?: boolean;
    search?: string;
    propertyId?: string;
  }
): Promise<{ items: VaultItem[]; error: string | null }> {
  const supabase = createClient();

  let query = supabase
    .from('vault_items')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (filters?.category) {
    query = query.eq('category', filters.category);
  }
  if (filters?.visibility) {
    query = query.eq('visibility', filters.visibility);
  }
  if (filters?.isAiContext !== undefined) {
    query = query.eq('is_ai_context', filters.isAiContext);
  }
  if (filters?.search) {
    query = query.ilike('file_name', `%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return { items: [], error: error.message };
  }

  let items = (data ?? []) as VaultItem[];

  if (filters?.propertyId) {
    const { data: exclusions } = await supabase
      .from('vault_item_property_exclusions')
      .select('vault_item_id')
      .eq('property_id', filters.propertyId);

    const excludedIds = new Set((exclusions ?? []).map((e: any) => e.vault_item_id));
    items = items.filter((item) => !excludedIds.has(item.id));
  }

  return { items, error: null };
}

export async function getVaultQuota(
  orgId: string
): Promise<{ quota: VaultQuota | null; error: string | null }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('vault_quotas')
    .select('*')
    .eq('org_id', orgId)
    .single();

  if (error) {
    return { quota: null, error: error.message };
  }

  return { quota: data as VaultQuota, error: null };
}

export async function setPropertyExclusion(
  vaultItemId: string,
  propertyId: string,
  excluded: boolean
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();

  if (excluded) {
    const { error } = await supabase
      .from('vault_item_property_exclusions')
      .insert({ vault_item_id: vaultItemId, property_id: propertyId });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from('vault_item_property_exclusions')
      .delete()
      .eq('vault_item_id', vaultItemId)
      .eq('property_id', propertyId);
    if (error) return { error: error.message };
  }

  return { success: true };
}
