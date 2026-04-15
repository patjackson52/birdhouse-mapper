import type { ModerationStatus, ModerationScores } from '@/lib/moderation/types';

export type VaultCategory = 'photo' | 'document' | 'branding' | 'geospatial';
export type VaultVisibility = 'public' | 'private';

export interface VaultItem {
  id: string;
  org_id: string;
  uploaded_by: string;
  storage_bucket: 'vault-public' | 'vault-private';
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  category: VaultCategory;
  visibility: VaultVisibility;
  is_ai_context: boolean;
  ai_priority: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  moderation_status: ModerationStatus;
  moderation_scores: ModerationScores | null;
  rejection_reason: string | null;
  moderated_at: string | null;
}

export interface VaultQuota {
  org_id: string;
  max_storage_bytes: number;
  current_storage_bytes: number;
}

export interface UploadToVaultInput {
  orgId: string;
  file: { name: string; type: string; size: number; base64: string };
  category: VaultCategory;
  visibility: VaultVisibility;
  isAiContext?: boolean;
  aiPriority?: number;
  metadata?: Record<string, unknown>;
  moderateAsPublicContribution?: boolean;
  orgModerationMode?: 'auto_approve' | 'manual_review';
}
