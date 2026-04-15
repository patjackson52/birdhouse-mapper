'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPendingItems, approveItem, rejectItem, banContributor } from './actions';
import type { VaultItem } from '@/lib/vault/types';
import type { ModerationScores } from '@/lib/moderation/types';
import { createClient } from '@/lib/supabase/client';

const REJECTION_REASONS = [
  { value: 'nsfw', label: 'NSFW / Adult content' },
  { value: 'violence', label: 'Violence' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'spam', label: 'Spam / Irrelevant' },
  { value: 'other', label: 'Other' },
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  flagged_for_review: 'bg-orange-100 text-orange-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

function scoreColor(score: number): string {
  if (score >= 0.7) return 'text-red-600 font-semibold';
  if (score >= 0.4) return 'text-orange-500 font-medium';
  return 'text-gray-500';
}

function AiScores({ scores }: { scores: ModerationScores }) {
  const entries = Object.entries(scores).filter(([, v]) => v > 0.05);
  if (entries.length === 0) return <span className="text-xs text-gray-400">No signals</span>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
      {entries.map(([key, val]) => (
        <span key={key} className={`text-xs ${scoreColor(val)}`}>
          {key}: {(val * 100).toFixed(0)}%
        </span>
      ))}
    </div>
  );
}

function Thumbnail({ item }: { item: VaultItem }) {
  const isImage = item.mime_type?.startsWith('image/') ?? false;
  if (!isImage) {
    return (
      <div className="w-20 h-20 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
        <span className="text-xs text-gray-400 text-center px-1">{item.mime_type ?? 'file'}</span>
      </div>
    );
  }

  // For private items (in vault-private bucket), we can't show a thumbnail without
  // a signed URL (async). Show a placeholder to avoid async complexity in render.
  if (item.storage_bucket === 'vault-private') {
    return (
      <div className="w-20 h-20 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
        <span className="text-xs text-gray-400">Private</span>
      </div>
    );
  }

  // Public items — build public URL inline
  const supabase = createClient();
  const { data } = supabase.storage
    .from(item.storage_bucket)
    .getPublicUrl(item.storage_path);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={data.publicUrl}
      alt={item.file_name}
      className="w-20 h-20 object-cover rounded flex-shrink-0"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

function ModerationCard({ item, onAction }: { item: VaultItem; onAction: () => void }) {
  const [rejectReason, setRejectReason] = useState('nsfw');
  const [loading, setLoading] = useState<'approve' | 'reject' | 'ban' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setLoading('approve');
    setError(null);
    const result = await approveItem(item.id);
    if ('error' in result) {
      setError(result.error);
    } else {
      onAction();
    }
    setLoading(null);
  }

  async function handleReject() {
    setLoading('reject');
    setError(null);
    const result = await rejectItem(item.id, rejectReason);
    if ('error' in result) {
      setError(result.error);
    } else {
      onAction();
    }
    setLoading(null);
  }

  async function handleBan() {
    if (!confirm(`Ban the contributor who uploaded "${item.file_name}"? This will prevent them from uploading more content.`)) return;
    setLoading('ban');
    setError(null);
    const result = await banContributor(item.uploaded_by, `Banned after reviewing upload: ${item.file_name}`);
    if ('error' in result) {
      setError(result.error);
    } else {
      onAction();
    }
    setLoading(null);
  }

  return (
    <div className="card p-4">
      <div className="flex gap-4">
        <Thumbnail item={item} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{item.file_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {new Date(item.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[item.moderation_status] ?? 'bg-gray-100 text-gray-600'}`}>
              {item.moderation_status.replace('_', ' ')}
            </span>
          </div>

          {item.moderation_scores && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 font-medium">AI scores:</p>
              <AiScores scores={item.moderation_scores} />
            </div>
          )}

          {error && (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          )}

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              className="btn-primary text-xs px-3 py-1.5"
              onClick={handleApprove}
              disabled={loading !== null}
            >
              {loading === 'approve' ? 'Approving…' : 'Approve'}
            </button>

            <div className="flex items-center gap-1">
              <select
                className="input-field text-xs py-1 px-2 h-auto"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={loading !== null}
              >
                {REJECTION_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button
                className="btn-secondary text-xs px-3 py-1.5"
                onClick={handleReject}
                disabled={loading !== null}
              >
                {loading === 'reject' ? 'Rejecting…' : 'Reject'}
              </button>
            </div>

            <button
              className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              onClick={handleBan}
              disabled={loading !== null}
            >
              {loading === 'ban' ? 'Banning…' : 'Ban User'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="card p-4 animate-pulse">
          <div className="flex gap-4">
            <div className="w-20 h-20 bg-gray-200 rounded flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-200 rounded w-1/4" />
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="flex gap-2 mt-3">
                <div className="h-7 bg-gray-200 rounded w-20" />
                <div className="h-7 bg-gray-200 rounded w-32" />
                <div className="h-7 bg-gray-200 rounded w-20" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ModerationPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'moderation', 'pending'],
    queryFn: async () => {
      const result = await getPendingItems();
      if (result.error) throw new Error(result.error);
      return result.items ?? [];
    },
  });

  function handleAction() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-forest-dark">Moderation Queue</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review and approve or reject flagged content uploads.
        </p>
      </div>

      {isLoading && <LoadingSkeleton />}

      {error && (
        <div className="card p-4 text-red-600 text-sm">
          Failed to load pending items: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && data && data.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-gray-500 text-sm">No items pending review</p>
          <p className="text-gray-400 text-xs mt-1">All uploads have been moderated.</p>
        </div>
      )}

      {!isLoading && data && data.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">{data.length} item{data.length !== 1 ? 's' : ''} pending review</p>
          {data.map((item) => (
            <ModerationCard key={item.id} item={item} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  );
}
