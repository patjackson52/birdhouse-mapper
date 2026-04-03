'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { generateHTML } from '@tiptap/html';
import { getEditorExtensions } from '@/lib/editor/extensions';
import { createKnowledgeItem, updateKnowledgeItem, addAttachment, removeAttachment, getAttachments } from '@/lib/knowledge/actions';
import { generateExcerpt } from '@/lib/knowledge/helpers';
import VaultPicker from '@/components/vault/VaultPicker';
import type { KnowledgeItem } from '@/lib/knowledge/types';
import type { VaultItem } from '@/lib/vault/types';
import type { JSONContent } from '@tiptap/core';

const RichTextEditor = dynamic(() => import('@/lib/editor/RichTextEditor'), { ssr: false });

interface KnowledgeEditorProps {
  orgId: string;
  item?: KnowledgeItem;
  onSaved?: (item: KnowledgeItem) => void;
}

interface AttachmentRow {
  vault_item_id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  sort_order: number;
}

export default function KnowledgeEditor({ orgId, item, onSaved }: KnowledgeEditorProps) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState<JSONContent | null>(item?.body ?? null);
  const [tags, setTags] = useState<string[]>(item?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState(item?.cover_image_url ?? '');
  const [visibility, setVisibility] = useState<'org' | 'public'>(item?.visibility ?? 'org');
  const [isAiContext, setIsAiContext] = useState(item?.is_ai_context ?? true);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAttachments, setLoadedAttachments] = useState(false);

  // Load existing attachments on first render for edit mode
  if (item && !loadedAttachments) {
    setLoadedAttachments(true);
    getAttachments(item.id).then(({ attachments: data }) => {
      setAttachments(data);
    });
  }

  const handleBodyChange = useCallback((json: JSONContent) => {
    setBody(json);
  }, []);

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleCoverSelect(items: VaultItem[]) {
    if (items.length > 0) {
      const selected = items[0];
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vault-public/${selected.storage_path}`;
      setCoverImageUrl(url);
    }
    setShowCoverPicker(false);
  }

  async function handleAttachSelect(items: VaultItem[]) {
    if (item && items.length > 0) {
      for (const vi of items) {
        const result = await addAttachment(item.id, vi.id, attachments.length);
        if ('success' in result) {
          setAttachments((prev) => [
            ...prev,
            { vault_item_id: vi.id, file_name: vi.file_name, mime_type: vi.mime_type, file_size: vi.file_size, sort_order: prev.length },
          ]);
        }
      }
    }
    setShowAttachPicker(false);
  }

  async function handleRemoveAttachment(vaultItemId: string) {
    if (!item) return;
    const result = await removeAttachment(item.id, vaultItemId);
    if ('success' in result) {
      setAttachments((prev) => prev.filter((a) => a.vault_item_id !== vaultItemId));
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const bodyHtml = body ? generateHTML(body, getEditorExtensions()) : '';
    const excerpt = bodyHtml ? generateExcerpt(bodyHtml) : '';

    if (item) {
      // Update existing
      const result = await updateKnowledgeItem(item.id, {
        title: title.trim(),
        body: body ?? undefined,
        bodyHtml,
        excerpt,
        coverImageUrl: coverImageUrl || undefined,
        tags,
        visibility,
        isAiContext,
      });

      if ('error' in result) {
        setError(result.error);
      } else if (onSaved) {
        onSaved({ ...item, title: title.trim(), body, body_html: bodyHtml, excerpt, cover_image_url: coverImageUrl, tags, visibility, is_ai_context: isAiContext });
      }
    } else {
      // Create new
      const result = await createKnowledgeItem({
        orgId,
        title: title.trim(),
        body: body ?? undefined,
        bodyHtml,
        excerpt,
        coverImageUrl: coverImageUrl || undefined,
        tags,
        visibility,
        isAiContext,
      });

      if ('error' in result) {
        setError(result.error);
      } else if (onSaved) {
        onSaved(result.item);
      }
    }

    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <label className="label">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Article title…"
          className="input-field text-lg font-semibold"
        />
      </div>

      {/* Cover image */}
      <div>
        <label className="label">Cover Image</label>
        <div className="flex items-center gap-3">
          {coverImageUrl && (
            <img src={coverImageUrl} alt="Cover" className="w-24 h-16 object-cover rounded" />
          )}
          <button type="button" onClick={() => setShowCoverPicker(true)} className="btn-secondary text-sm">
            {coverImageUrl ? 'Change' : 'Add Cover Image'}
          </button>
          {coverImageUrl && (
            <button type="button" onClick={() => setCoverImageUrl('')} className="text-sm text-red-500 hover:text-red-700">
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="label">Tags</label>
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-600">&times;</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="Add a tag…"
            className="input-field text-sm flex-1"
          />
          <button type="button" onClick={addTag} className="btn-secondary text-sm">Add</button>
        </div>
      </div>

      {/* Visibility & AI Context */}
      <div className="flex gap-6">
        <div>
          <label className="label">Visibility</label>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'org' | 'public')} className="input-field text-sm">
            <option value="org">Organization only</option>
            <option value="public">Public</option>
          </select>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            id="ai-context"
            checked={isAiContext}
            onChange={(e) => setIsAiContext(e.target.checked)}
            className="rounded border-sage-light"
          />
          <label htmlFor="ai-context" className="text-sm text-forest-dark">Include in AI context</label>
        </div>
      </div>

      {/* Rich text body */}
      <div>
        <label className="label">Content</label>
        <RichTextEditor
          content={body}
          onChange={handleBodyChange}
          orgId={orgId}
        />
      </div>

      {/* Attachments (only shown in edit mode when item exists) */}
      {item && (
        <div>
          <label className="label">Attachments</label>
          {attachments.length > 0 && (
            <div className="space-y-2 mb-3">
              {attachments.map((a) => (
                <div key={a.vault_item_id} className="flex items-center justify-between bg-parchment/50 rounded-lg px-3 py-2">
                  <span className="text-sm text-forest-dark">{a.file_name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(a.vault_item_id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setShowAttachPicker(true)} className="btn-secondary text-sm">
            Attach File from Vault
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Saving…' : item ? 'Save Changes' : 'Create Article'}
        </button>
      </div>

      {/* Cover image picker */}
      {showCoverPicker && (
        <VaultPicker
          orgId={orgId}
          categoryFilter={['photo']}
          onSelect={handleCoverSelect}
          onClose={() => setShowCoverPicker(false)}
          defaultUploadCategory="photo"
          defaultUploadVisibility="public"
        />
      )}

      {/* Attachment picker */}
      {showAttachPicker && (
        <VaultPicker
          orgId={orgId}
          categoryFilter={['document']}
          multiple
          onSelect={handleAttachSelect}
          onClose={() => setShowAttachPicker(false)}
          defaultUploadCategory="document"
          defaultUploadVisibility="private"
        />
      )}
    </div>
  );
}
