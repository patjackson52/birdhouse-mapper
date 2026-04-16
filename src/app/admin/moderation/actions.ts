'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';
import type { VaultItem } from '@/lib/vault/types';

export async function getPendingItems(): Promise<{ items?: VaultItem[]; error?: string }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated.' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { data, error } = await supabase
    .from('vault_items')
    .select('*')
    .eq('org_id', tenant.orgId)
    .in('moderation_status', ['pending', 'flagged_for_review'])
    .order('created_at', { ascending: true });

  if (error) return { error: error.message };
  return { items: (data ?? []) as VaultItem[] };
}

export async function approveItem(
  vaultItemId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated.' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { data: item, error: fetchError } = await supabase
    .from('vault_items')
    .select('*')
    .eq('id', vaultItemId)
    .single();

  if (fetchError || !item) return { error: 'Item not found' };

  if (item.storage_bucket === 'vault-private') {
    const { data: fileData } = await supabase.storage
      .from('vault-private')
      .download(item.storage_path);

    if (fileData) {
      const buffer = new Uint8Array(await fileData.arrayBuffer());
      await supabase.storage.from('vault-public').upload(item.storage_path, buffer, {
        contentType: item.mime_type || 'application/octet-stream',
        upsert: false,
      });
      await supabase.storage.from('vault-private').remove([item.storage_path]);
    }
  }

  const { error: updateError } = await supabase
    .from('vault_items')
    .update({
      moderation_status: 'approved',
      storage_bucket: 'vault-public',
      moderated_at: new Date().toISOString(),
    })
    .eq('id', vaultItemId);

  if (updateError) return { error: updateError.message };
  return { success: true };
}

export async function rejectItem(
  vaultItemId: string,
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated.' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { data: item, error: fetchError } = await supabase
    .from('vault_items')
    .select('*')
    .eq('id', vaultItemId)
    .single();

  if (fetchError || !item) return { error: 'Item not found' };

  await supabase.storage.from(item.storage_bucket).remove([item.storage_path]);

  const { error: updateError } = await supabase
    .from('vault_items')
    .update({
      moderation_status: 'rejected',
      rejection_reason: reason,
      moderated_at: new Date().toISOString(),
    })
    .eq('id', vaultItemId);

  if (updateError) return { error: updateError.message };

  await supabase.from('moderation_actions').insert({
    org_id: tenant.orgId,
    user_id: item.uploaded_by,
    action: 'takedown',
    reason,
    vault_item_id: vaultItemId,
    acted_by: user.id,
  });

  return { success: true };
}

export async function banContributor(
  userId: string,
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated.' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { error: updateError } = await supabase
    .from('org_memberships')
    .update({ status: 'banned' })
    .eq('user_id', userId)
    .eq('org_id', tenant.orgId);

  if (updateError) return { error: updateError.message };

  await supabase.from('moderation_actions').insert({
    org_id: tenant.orgId,
    user_id: userId,
    action: 'ban',
    reason,
    acted_by: user.id,
  });

  return { success: true };
}
