'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addItemsToProject } from '@/lib/maintenance/actions';
import { useRouter } from 'next/navigation';

interface ItemOption {
  id: string;
  name: string;
}

interface Props {
  projectId: string;
  propertyId: string;
  alreadyLinkedIds: string[];
  onClose: () => void;
}

export function MaintenanceItemPickerInterim({
  projectId,
  propertyId,
  alreadyLinkedIds,
  onClose,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<ItemOption[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('items')
      .select('id, name')
      .eq('property_id', propertyId)
      .order('name')
      .then(({ data }) => {
        setItems(
          (data ?? [])
            .filter((i) => !alreadyLinkedIds.includes(i.id as string))
            .map((i) => ({ id: i.id as string, name: (i.name as string) ?? 'Unnamed' })),
        );
      });
  }, [propertyId, alreadyLinkedIds]);

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
    const result = await addItemsToProject({
      projectId,
      itemIds: Array.from(selected),
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
          <h2 className="font-heading text-forest-dark text-lg">Add items</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800" aria-label="Close">✕</button>
        </div>
        <div className="overflow-auto flex-1 p-4">
          {items === null ? (
            <div className="text-sm text-gray-600">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-gray-600">All items are already linked.</div>
          ) : (
            <ul className="space-y-1">
              {items.map((it) => (
                <li key={it.id}>
                  <label className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-sage-light/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(it.id)}
                      onChange={() => toggle(it.id)}
                    />
                    <span className="text-sm">{it.name}</span>
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
