'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  uploadAiContextItem,
  analyzeAiContextItem,
  deleteAiContextItem,
  processUrlContext,
  rebuildOrgSummary,
  vaultItemToAiContext,
} from '@/lib/ai-context/actions';
import { parseFileForAnalysis } from '@/lib/ai-context/parsers';
import type { AiContextItem, AiContextSummary } from '@/lib/ai-context/types';
import type { VaultItem } from '@/lib/vault/types';
import OrgProfileCard from '@/components/ai-context/OrgProfileCard';
import AiContextTable from '@/components/ai-context/AiContextTable';
import VaultPicker from '@/components/vault/VaultPicker';
import ProcessingProgress, { type ProcessingItem } from '@/components/ai-context/ProcessingProgress';

type ItemWithGeoCount = AiContextItem & { geo_count: number };

export default function AiContextPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemWithGeoCount[]>([]);
  const [summary, setSummary] = useState<AiContextSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload / processing state
  const [uploading, setUploading] = useState(false);
  const [showVaultPicker, setShowVaultPicker] = useState(false);
  const [processingItems, setProcessingItems] = useState<ProcessingItem[]>([]);
  const [summaryReady, setSummaryReady] = useState(false);

  // Delete confirm state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const orgIdRef = useRef<string | null>(null);

  const loadData = useCallback(async (currentOrgId: string) => {
    const supabase = createClient();

    // Fetch vault items that are ai_context
    const { data: vaultItems } = await supabase
      .from('vault_items')
      .select('*')
      .eq('org_id', currentOrgId)
      .eq('is_ai_context', true)
      .order('created_at', { ascending: false });

    // Fetch geo counts per item
    const { data: geoCounts } = await supabase
      .from('ai_context_geo_features')
      .select('source_item_id')
      .eq('org_id', currentOrgId);

    const geoCountMap: Record<string, number> = {};
    if (geoCounts) {
      for (const row of geoCounts) {
        geoCountMap[row.source_item_id] = (geoCountMap[row.source_item_id] ?? 0) + 1;
      }
    }

    const enriched: ItemWithGeoCount[] = (vaultItems ?? []).map((vaultItem: VaultItem) => ({
      ...vaultItemToAiContext(vaultItem),
      geo_count: geoCountMap[vaultItem.id] ?? 0,
    }));

    setItems(enriched);

    // Fetch summary
    const { data: summaryData } = await supabase
      .from('ai_context_summary')
      .select('*')
      .eq('org_id', currentOrgId)
      .single();

    setSummary(summaryData as AiContextSummary | null);
  }, []);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: membership } = await supabase
        .from('org_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!membership) {
        setLoading(false);
        return;
      }

      const id = membership.org_id as string;
      setOrgId(id);
      orgIdRef.current = id;
      await loadData(id);
      setLoading(false);
    }

    init();
  }, [loadData]);

  const MAX_FILE_SIZE_MB = 9;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  async function handleFilesSelected(files: File[]) {
    if (!orgId || files.length === 0) return;

    // Client-side size guard (server limit is 10 MB including base64 overhead)
    const oversized = files.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized.length > 0) {
      setError(
        `File${oversized.length > 1 ? 's' : ''} too large (max ${MAX_FILE_SIZE_MB} MB): ${oversized.map((f) => f.name).join(', ')}`
      );
      return;
    }

    setUploading(true);
    setSummaryReady(false);
    setError(null);
    setShowVaultPicker(false);

    // Build initial processing items list (pending)
    const pendingItems: ProcessingItem[] = files.map((f) => ({
      id: crypto.randomUUID(),
      fileName: f.name,
      mimeType: f.type || 'application/octet-stream',
      status: 'pending',
      contentSummary: null,
      geoCount: 0,
    }));
    setProcessingItems(pendingItems);

    const batchId = crypto.randomUUID();
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const tempId = pendingItems[i].id;

      // Mark as processing
      setProcessingItems((prev) =>
        prev.map((p) => (p.id === tempId ? { ...p, status: 'processing' } : p))
      );

      try {
        // Parse file client-side
        const parsedData = await parseFileForAnalysis(file);

        // Convert to base64 for upload
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let j = 0; j < bytes.byteLength; j++) {
          binary += String.fromCharCode(bytes[j]);
        }
        const base64 = btoa(binary);

        // Upload to vault via server action
        const uploadResult = await uploadAiContextItem(
          orgId,
          {
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            base64,
          },
          'file',
          batchId
        );

        if ('error' in uploadResult) {
          setProcessingItems((prev) =>
            prev.map((p) => (p.id === tempId ? { ...p, status: 'error' } : p))
          );
          errors.push(`${file.name}: ${uploadResult.error}`);
          continue;
        }

        const itemId = uploadResult.itemId;

        // Analyze
        const analysisResult = await analyzeAiContextItem(itemId, parsedData);

        if ('error' in analysisResult) {
          setProcessingItems((prev) =>
            prev.map((p) => (p.id === tempId ? { ...p, status: 'error' } : p))
          );
          errors.push(`${file.name}: ${analysisResult.error}`);
          continue;
        }

        const result = analysisResult.result;
        setProcessingItems((prev) =>
          prev.map((p) =>
            p.id === tempId
              ? {
                  ...p,
                  status: 'complete',
                  contentSummary: result.content_summary,
                  geoCount: result.geo_features?.length ?? 0,
                }
              : p
          )
        );
      } catch (err) {
        setProcessingItems((prev) =>
          prev.map((p) => (p.id === tempId ? { ...p, status: 'error' } : p))
        );
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Rebuild org summary
    const summaryResult = await rebuildOrgSummary(orgId);
    if ('success' in summaryResult) {
      setSummary(summaryResult.summary);
      setSummaryReady(true);
    }

    if (errors.length > 0) {
      setError(errors.join('\n'));
    }

    setUploading(false);

    // Reload items list
    await loadData(orgId);
  }

  async function handleUrlSubmit(urls: string[]) {
    const url = urls[urls.length - 1]; // process the most recently added URL
    if (!orgId) return;

    setUploading(true);
    setSummaryReady(false);
    setError(null);
    setShowVaultPicker(false);

    const pendingItem: ProcessingItem = {
      id: crypto.randomUUID(),
      fileName: url,
      mimeType: 'text/html',
      status: 'processing',
      contentSummary: null,
      geoCount: 0,
    };
    setProcessingItems([pendingItem]);

    const result = await processUrlContext(orgId, url, null);

    if ('error' in result) {
      setProcessingItems((prev) =>
        prev.map((p) => (p.id === pendingItem.id ? { ...p, status: 'error' } : p))
      );
      setError(result.error);
    } else {
      setProcessingItems((prev) =>
        prev.map((p) => (p.id === pendingItem.id ? { ...p, status: 'complete' } : p))
      );

      const summaryResult = await rebuildOrgSummary(orgId);
      if ('success' in summaryResult) {
        setSummary(summaryResult.summary);
        setSummaryReady(true);
      }
    }

    setUploading(false);
    await loadData(orgId);
  }

  async function handleDelete(id: string) {
    if (!orgId) return;
    setDeletingId(id);
    setError(null);

    const result = await deleteAiContextItem(id);

    if ('error' in result) {
      setError(result.error);
    } else {
      // Rebuild summary if items remain
      const remaining = items.filter((item) => item.id !== id);
      if (remaining.some((item) => item.processing_status === 'complete')) {
        const summaryResult = await rebuildOrgSummary(orgId);
        if ('success' in summaryResult) {
          setSummary(summaryResult.summary);
        }
      } else {
        setSummary(null);
      }

      await loadData(orgId);
    }

    setDeletingId(null);
    setConfirmDeleteId(null);
  }

  async function handleDownload(item: AiContextItem) {
    if (!item.storage_path) return;

    // Find the matching vault item to get the correct bucket
    const supabase = createClient();
    const { data: vaultItem } = await supabase
      .from('vault_items')
      .select('storage_bucket, storage_path')
      .eq('id', item.id)
      .single();

    const bucket = vaultItem?.storage_bucket ?? 'vault-private';
    const path = vaultItem?.storage_path ?? item.storage_path;

    const { data, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(path);

    if (downloadError || !data) {
      setError(`Download failed: ${downloadError?.message ?? 'Unknown error'}`);
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Handle files selected via VaultPicker (already uploaded — just analyze)
  async function handleVaultPickerSelect(vaultItems: VaultItem[]) {
    if (!orgId || vaultItems.length === 0) return;

    setShowVaultPicker(false);
    setUploading(true);
    setSummaryReady(false);
    setError(null);

    const pendingItems: ProcessingItem[] = vaultItems.map((vi) => ({
      id: vi.id,
      fileName: vi.file_name,
      mimeType: vi.mime_type ?? 'application/octet-stream',
      status: 'processing' as const,
      contentSummary: null,
      geoCount: 0,
    }));
    setProcessingItems(pendingItems);

    const errors: string[] = [];

    for (const vaultItem of vaultItems) {
      // Download the file to parse it client-side isn't possible here (server action)
      // We create a minimal parsedData from vault item metadata
      const parsedData: import('@/lib/ai-context/types').ParsedFileData = {
        fileName: vaultItem.file_name,
        mimeType: vaultItem.mime_type ?? 'application/octet-stream',
        fileSize: vaultItem.file_size,
        sourceType: 'file',
      };

      const analysisResult = await analyzeAiContextItem(vaultItem.id, parsedData);

      if ('error' in analysisResult) {
        setProcessingItems((prev) =>
          prev.map((p) => (p.id === vaultItem.id ? { ...p, status: 'error' } : p))
        );
        errors.push(`${vaultItem.file_name}: ${analysisResult.error}`);
      } else {
        const result = analysisResult.result;
        setProcessingItems((prev) =>
          prev.map((p) =>
            p.id === vaultItem.id
              ? {
                  ...p,
                  status: 'complete',
                  contentSummary: result.content_summary,
                  geoCount: result.geo_features?.length ?? 0,
                }
              : p
          )
        );
      }
    }

    // Rebuild org summary
    const summaryResult = await rebuildOrgSummary(orgId);
    if ('success' in summaryResult) {
      setSummary(summaryResult.summary);
      setSummaryReady(true);
    }

    if (errors.length > 0) {
      setError(errors.join('\n'));
    }

    setUploading(false);
    await loadData(orgId);
  }

  const totalGeoCount = items.reduce((sum, item) => sum + item.geo_count, 0);
  const completeCount = items.filter((item) => item.processing_status === 'complete').length;

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-32 bg-sage-light rounded" />
          <div className="h-48 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-forest-dark">AI Context</h1>
          <p className="text-sm text-sage mt-1">
            Upload files, URLs, and text to build your organization&apos;s AI knowledge base.
          </p>
        </div>
      </div>

      {/* Org Profile Card */}
      <OrgProfileCard summary={summary} />

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-1 text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Upload section */}
      <section className="card space-y-4">
        <h2 className="font-heading text-base font-semibold text-forest-dark">Add Context</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => setShowVaultPicker(true)}
            disabled={uploading}
            className="btn-primary disabled:opacity-50"
          >
            Upload or Select Files
          </button>
          <p className="text-sm text-sage self-center">
            Upload documents, images, or geo files to your Data Vault for AI analysis.
          </p>
        </div>
      </section>

      {/* VaultPicker modal */}
      {showVaultPicker && orgId && (
        <VaultPicker
          orgId={orgId}
          defaultUploadCategory="document"
          defaultUploadVisibility="private"
          defaultIsAiContext={true}
          multiple={true}
          onSelect={handleVaultPickerSelect}
          onClose={() => setShowVaultPicker(false)}
        />
      )}

      {/* Processing progress */}
      {processingItems.length > 0 && (
        <section className="card">
          <h2 className="font-heading text-base font-semibold text-forest-dark mb-4">
            Processing
          </h2>
          <ProcessingProgress
            items={processingItems}
            summaryReady={summaryReady}
            orgProfile={summary?.org_profile ?? null}
          />
        </section>
      )}

      {/* Geo layers detection banner */}
      {totalGeoCount > 0 && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 flex items-center gap-3">
          <span className="text-xl">🗺️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-purple-900">
              {totalGeoCount} geo feature{totalGeoCount !== 1 ? 's' : ''} detected in uploaded files
            </p>
            <p className="text-xs text-purple-700 truncate">
              {items.filter(i => i.geo_count > 0).map(i => `${i.file_name} (${i.geo_count})`).join(' · ')}
            </p>
          </div>
          <a
            href="/admin/geo-layers"
            className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          >
            View in Geo Layers →
          </a>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDeleteId && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">
            Delete this file? This will also remove its AI analysis and any extracted geo features.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleDelete(confirmDeleteId)}
              disabled={deletingId === confirmDeleteId}
              className="text-sm bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deletingId === confirmDeleteId ? 'Deleting...' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="text-sm text-stone-500 hover:text-stone-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Files table */}
      <section>
        <h2 className="font-heading text-base font-semibold text-forest-dark mb-3">
          Uploaded Files
        </h2>
        <AiContextTable
          items={items}
          onDelete={(id) => setConfirmDeleteId(id)}
          onDownload={handleDownload}
          canManage={true}
          canDownload={true}
        />
      </section>

      {/* Footer stats */}
      {items.length > 0 && (
        <div className="flex items-center gap-6 text-sm text-sage pt-2 border-t border-sage-light">
          <span>
            <span className="font-medium text-forest-dark">{items.length}</span>{' '}
            {items.length === 1 ? 'file' : 'files'} total
          </span>
          <span>
            <span className="font-medium text-forest-dark">{completeCount}</span> analyzed
          </span>
          {totalGeoCount > 0 && (
            <span>
              <span className="font-medium text-forest-dark">{totalGeoCount}</span> geo features
            </span>
          )}
          {summary && (
            <span className="text-xs text-sage italic">
              Summary last updated{' '}
              {new Date(summary.last_rebuilt_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
