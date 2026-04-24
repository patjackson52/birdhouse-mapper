'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addKnowledgeToProject } from '@/lib/maintenance/actions';
import { useRouter } from 'next/navigation';

interface KnowledgeOption {
  id: string;
  title: string;
  visibility: 'org' | 'public';
}

interface Props {
  projectId: string;
  orgId: string;
  alreadyLinkedIds: string[];
  onClose: () => void;
}

export function MaintenanceKnowledgePickerInterim({
  projectId,
  orgId,
  alreadyLinkedIds,
  onClose,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<KnowledgeOption[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('knowledge_items')
      .select('id, title, visibility')
      .eq('org_id', orgId)
      .order('title')
      .then(({ data }) => {
        setItems(
          (data ?? [])
            .filter((k) => !alreadyLinkedIds.includes(k.id as string))
            .map((k) => ({
              id: k.id as string,
              title: k.title as string,
              visibility: k.visibility as 'org' | 'public',
            })),
        );
      });
  }, [orgId, alreadyLinkedIds]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    const result = await addKnowledgeToProject({
      projectId,
      knowledgeIds: Array.from(selected),
    });
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="card max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-sage-light flex items-center justify-between">
          <h2 className="font-heading text-forest-dark text-lg">Add articles</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800" aria-label="Close">✕</button>
        </div>
        <div className="overflow-auto flex-1 p-4">
          {items === null ? (
            <div className="text-sm text-gray-600">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-gray-600">No articles to link.</div>
          ) : (
            <ul className="space-y-1">
              {items.map((k) => (
                <li key={k.id}>
                  <label className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-sage-light/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(k.id)}
                      onChange={() => toggle(k.id)}
                    />
                    <span className="text-sm flex-1">{k.title}</span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">{k.visibility}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <div className="px-4 py-2 text-[13px] text-red-700 bg-red-50">{error}</div>}
        <div className="p-4 border-t border-sage-light flex items-center justify-between gap-3">
          <span className="text-xs text-gray-600">{selected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
            <button onClick={handleAdd} className="btn-primary" disabled={saving || selected.size === 0}>
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
