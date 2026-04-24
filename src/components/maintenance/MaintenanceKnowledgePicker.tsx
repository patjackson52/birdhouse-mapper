'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addKnowledgeToProject } from '@/lib/maintenance/actions';
import { useFocusTrap } from './useFocusTrap';

interface KnowledgeOption {
  id: string;
  title: string;
  excerpt: string | null;
  visibility: 'org' | 'public';
  tags: string[];
  updatedAt: string;
}

interface Props {
  projectId: string;
  orgId: string;
  alreadyLinkedIds: string[];
  onClose: () => void;
}

type VisFilter = 'all' | 'org' | 'public';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MaintenanceKnowledgePicker({
  projectId,
  orgId,
  alreadyLinkedIds,
  onClose,
}: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, onClose);

  const [items, setItems] = useState<KnowledgeOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visFilter, setVisFilter] = useState<VisFilter>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const res = await supabase
        .from('knowledge_items')
        .select('id, title, excerpt, visibility, tags, updated_at')
        .eq('org_id', orgId)
        .order('title');
      if (cancelled) return;
      if (res.error) {
        setLoadError(res.error.message);
        setItems([]);
        return;
      }
      const raw = (res.data ?? []) as Array<{
        id: string;
        title: string;
        excerpt: string | null;
        visibility: 'org' | 'public';
        tags: string[] | null;
        updated_at: string;
      }>;
      const options: KnowledgeOption[] = raw
        .filter((k) => !alreadyLinkedIds.includes(k.id))
        .map((k) => ({
          id: k.id,
          title: k.title,
          excerpt: k.excerpt,
          visibility: k.visibility,
          tags: k.tags ?? [],
          updatedAt: k.updated_at,
        }));
      setItems(options);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [orgId, alreadyLinkedIds]);

  const allTags = useMemo(() => {
    if (!items) return [] as string[];
    return Array.from(new Set(items.flatMap((k) => k.tags))).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [] as KnowledgeOption[];
    const q = search.trim().toLowerCase();
    return items.filter((k) => {
      if (visFilter !== 'all' && k.visibility !== visFilter) return false;
      if (tagFilter && !k.tags.includes(tagFilter)) return false;
      if (q) {
        const inTitle = k.title.toLowerCase().includes(q);
        const inExcerpt = (k.excerpt ?? '').toLowerCase().includes(q);
        if (!inTitle && !inExcerpt) return false;
      }
      return true;
    });
  }, [items, search, visFilter, tagFilter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    if (selected.size === 0) return;
    setSaving(true);
    setSaveError(null);
    const result = await addKnowledgeToProject({
      projectId,
      knowledgeIds: Array.from(selected),
    });
    setSaving(false);
    if ('error' in result) {
      setSaveError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  const total = items?.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Link knowledge articles"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-parchment rounded-2xl shadow-2xl w-full max-w-[600px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-sage-light flex items-center justify-between">
          <div>
            <h2 className="font-heading text-forest-dark text-[17px]">Link knowledge articles</h2>
            <div className="text-[11px] text-gray-600 mt-0.5">
              {filtered.length} available
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-900 text-xl leading-none px-2"
          >
            ✕
          </button>
        </div>

        {/* Search + chips */}
        <div className="px-5 pt-3 pb-2">
          <input
            className="input-field"
            placeholder="Search articles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
            {([
              { id: 'all', label: 'All' },
              { id: 'org', label: 'Org only' },
              { id: 'public', label: 'Public' },
            ] as const).map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={visFilter === o.id}
                className="chip"
                onClick={() => setVisFilter(o.id)}
              >
                {o.label}
              </button>
            ))}
            {allTags.length > 0 && (
              <span className="w-px h-4 bg-sage-light mx-1" aria-hidden />
            )}
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tagFilter === t}
                className="chip"
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
              >
                #{t}
              </button>
            ))}
          </div>
        </div>

        {/* Create-new callout */}
        <div className="mx-5 my-2 p-2.5 rounded-xl border border-dashed border-golden bg-golden/5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-sm">
              +
            </div>
            <div>
              <div className="text-[13px] font-medium text-forest-dark">Need a new article?</div>
              <div className="text-[11px] text-gray-600">
                Opens the full editor in a new tab — this picker stays open.
              </div>
            </div>
          </div>
          <a
            href="/admin/knowledge/new"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs whitespace-nowrap"
          >
            Create new ↗
          </a>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto px-5 pb-3">
          {items === null ? (
            <div className="p-8 text-center text-sm text-gray-600">Loading…</div>
          ) : loadError ? (
            <div className="p-8 text-center text-sm text-red-700">
              Couldn&apos;t load articles. {loadError}
            </div>
          ) : total === 0 ? (
            <div className="p-8 text-center text-sm text-gray-600">
              No knowledge articles yet. Use &ldquo;Create new&rdquo; above to get started.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-600">No articles match.</div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((k) => {
                const isSel = selected.has(k.id);
                return (
                  <li key={k.id}>
                    <button
                      type="button"
                      onClick={() => toggle(k.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        isSel
                          ? 'border-forest bg-forest/5'
                          : 'border-sage-light bg-white hover:bg-sage-light/30'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSel}
                          readOnly
                          tabIndex={-1}
                          aria-hidden
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[14px] font-medium text-forest-dark">
                              {k.title}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full text-[10px] px-1.5 py-0.5 font-medium ${
                                k.visibility === 'public'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {k.visibility === 'public' ? 'Public' : 'Org'}
                            </span>
                          </div>
                          {k.excerpt && (
                            <div className="text-[11px] text-gray-600 leading-relaxed">
                              {k.excerpt}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {k.tags.map((t) => (
                              <span key={t} className="text-[10px] text-gray-500">
                                #{t}
                              </span>
                            ))}
                            <span className="text-[10px] text-gray-500 ml-auto">
                              Updated {formatDate(k.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {saveError && (
          <div className="px-5 py-2 text-[13px] text-red-700 bg-red-50 border-t border-red-100">
            {saveError}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-sage-light flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-primary"
            disabled={saving || selected.size === 0}
          >
            {saving ? 'Linking…' : `Link ${selected.size || ''}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
