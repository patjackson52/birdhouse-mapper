'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';
import { uploadToVault, deleteFromVault } from '@/lib/vault/actions';

export interface ImageAsset {
  id: string;
  storagePath: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  category: 'image' | 'document';
  description?: string;
  uploadedAt: string;
}

export async function uploadImageAsset(
  formData: FormData
): Promise<{ asset: ImageAsset | null; error: string | null }> {
  const supabase = createClient();
  const file = formData.get('file') as File;
  const category = formData.get('category') as 'image' | 'document';
  const description = formData.get('description') as string | null;

  if (!file) return { asset: null, error: 'No file provided' };

  if (file.size > 10 * 1024 * 1024) {
    return { asset: null, error: 'File exceeds 10MB limit' };
  }

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { asset: null, error: 'No org context' };

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const result = await uploadToVault({
    orgId: tenant.orgId,
    file: { name: file.name, type: file.type, size: file.size, base64 },
    category: category === 'image' ? 'photo' : 'document',
    visibility: 'public',
  });

  if ('error' in result) {
    return { asset: null, error: result.error };
  }

  const vaultItem = result.item;
  const { data: { publicUrl } } = supabase.storage
    .from(vaultItem.storage_bucket)
    .getPublicUrl(vaultItem.storage_path);

  const asset: ImageAsset = {
    id: vaultItem.id,
    storagePath: vaultItem.id,
    publicUrl,
    fileName: vaultItem.file_name,
    mimeType: vaultItem.mime_type ?? file.type,
    category,
    description: description || '',
    uploadedAt: vaultItem.created_at,
  };

  return { asset, error: null };
}

export async function deleteImageAsset(vaultItemId: string) {
  const result = await deleteFromVault(vaultItemId);
  if ('error' in result) {
    return { error: result.error };
  }
  return { error: null };
}
