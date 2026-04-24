'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addItemsToProject } from '@/lib/maintenance/actions';
import { classifyLastMaintained, type MaintenanceTone } from '@/lib/maintenance/logic';
import { useFocusTrap } from './useFocusTrap';

interface ItemOption {
  id: string;
  name: string;
  lat: number;
  lng: number;
  typeName: string;
  typeIcon: string;
  lastMaintainedAt: string | null;
}

interface Props {
  projectId: string;
  propertyId: string;
  alreadyLinkedIds: string[];
  onClose: () => void;
}

type LastMaintFilter = 'any' | '6mo' | '1y' | 'never';

const LAST_MAINT_OPTIONS: { id: LastMaintFilter; label: string }[] = [
  { id: 'any', label: 'Any time' },
  { id: '6mo', label: 'Not in 6 mo+' },
  { id: '1y', label: 'Not in 1 yr+' },
  { id: 'never', label: 'Never' },
];

const TONE_CLASSES: Record<MaintenanceTone['tone'], { text: string; dot: string }> = {
  fresh: { text: 'text-green-700', dot: 'bg-green-600' },
  normal: { text: 'text-gray-500', dot: 'bg-gray-400' },
  warn: { text: 'text-amber-700', dot: 'bg-amber-600' },
  danger: { text: 'text-red-700', dot: 'bg-red-600' },
};

export function MaintenanceItemPicker({
  projectId,
  propertyId,
  alreadyLinkedIds,
  onClose,
}: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, onClose);

  const [items, setItems] = useState<ItemOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [lastMaint, setLastMaint] = useState<LastMaintFilter>('any');
  const [sortKey, setSortKey] = useState<'name' | 'last'>('name');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const itemsRes = await supabase
        .from('items')
        .select('id, name, latitude, longitude, item_type_id, item_types(name, icon)')
        .eq('property_id', propertyId)
        .order('name');
      if (cancelled) return;
      if (itemsRes.error) {
        setLoadError(itemsRes.error.message);
        setItems([]);
        return;
      }
      const itemsRaw = (itemsRes.data ?? []) as Array<{
        id: string;
        name: string;
        latitude: number;
        longitude: number;
        item_type_id: string;
        item_types: { name?: string; icon?: string } | null;
      }>;
      const itemIds = itemsRaw.map((i) => i.id);

      let lastMaintById = new Map<string, string>();
      if (itemIds.length > 0) {
        const updatesRes = await supabase
          .from('item_updates')
          .select('item_id, created_at, update_types!inner(name)')
          .in('item_id', itemIds)
          .eq('update_types.name', 'Maintenance')
          .order('created_at', { ascending: false });
        if (cancelled) return;
        if (!updatesRes.error) {
          for (const row of (updatesRes.data ?? []) as Array<{
            item_id: string;
            created_at: string;
          }>) {
            if (!lastMaintById.has(row.item_id)) lastMaintById.set(row.item_id, row.created_at);
          }
        }
      }

      const options: ItemOption[] = itemsRaw.map((i) => ({
        id: i.id,
        name: i.name ?? 'Unnamed',
        lat: i.latitude,
        lng: i.longitude,
        typeName: i.item_types?.name ?? 'Unknown',
        typeIcon: i.item_types?.icon ?? '📍',
        lastMaintainedAt: lastMaintById.get(i.id) ?? null,
      }));

      // All types start selected (chip "active" = type is in the filter set)
      const types = new Set(options.map((o) => o.typeName));
      setSelectedTypes(types);
      setItems(options);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const allTypes = useMemo(() => {
    if (!items) return [] as string[];
    return Array.from(new Set(items.map((i) => i.typeName))).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [] as ItemOption[];
    const q = search.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    return items
      .filter((i) => {
        if (alreadyLinkedIds.includes(i.id)) return false;
        if (!selectedTypes.has(i.typeName)) return false;
        if (q && !i.name.toLowerCase().includes(q)) return false;
        if (lastMaint !== 'any') {
          if (lastMaint === 'never') {
            if (i.lastMaintainedAt !== null) return false;
          } else {
            const days =
              i.lastMaintainedAt === null
                ? Infinity
                : Math.floor(
                    (Date.parse(today + 'T00:00:00Z') -
                      Date.parse(i.lastMaintainedAt.slice(0, 10) + 'T00:00:00Z')) /
                      86400000,
                  );
            if (lastMaint === '6mo' && days < 180) return false;
            if (lastMaint === '1y' && days < 365) return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'name') return a.name.localeCompare(b.name);
        const aT = a.lastMaintainedAt ? Date.parse(a.lastMaintainedAt) : 0;
        const bT = b.lastMaintainedAt ? Date.parse(b.lastMaintainedAt) : 0;
        return aT - bT;
      });
  }, [items, search, selectedTypes, lastMaint, sortKey, alreadyLinkedIds]);

  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const someSelected = !allSelected && filtered.some((i) => selected.has(i.id));

  function toggleType(t: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filtered.forEach((i) => next.delete(i.id));
      else filtered.forEach((i) => next.add(i.id));
      return next;
    });
  }

  async function handleConfirm() {
    if (selected.size === 0) return;
    setSaving(true);
    setSaveError(null);
    const result = await addItemsToProject({ projectId, itemIds: Array.from(selected) });
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
      className="fixed inset-0 z-40 bg-black/40 md:flex md:items-center md:justify-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add items to project"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-parchment h-full w-full flex flex-col md:h-auto md:max-h-[90vh] md:max-w-4xl md:rounded-2xl md:shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-sage-light flex items-center justify-between">
          <div>
            <h2 className="font-heading text-forest-dark text-lg">Add items to project</h2>
            <div className="text-[11px] text-gray-600 mt-0.5">
              {filtered.length} of {total} items
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
        <div className="px-5 pt-3 pb-2 border-b border-sage-light">
          <input
            className="input-field"
            placeholder="Search by name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5 mt-3 items-center">
            <span className="text-[11px] text-gray-600 mr-1">Type:</span>
            {allTypes.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={selectedTypes.has(t)}
                className="chip"
                onClick={() => toggleType(t)}
              >
                {t}
              </button>
            ))}
            <span className="w-px h-4 bg-sage-light mx-1.5" aria-hidden />
            <span className="text-[11px] text-gray-600 mr-1">Maintained:</span>
            {LAST_MAINT_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={lastMaint === o.id}
                className="chip"
                onClick={() => setLastMaint(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Select-all bar */}
        <div className="px-5 py-2.5 bg-sage-light/40 border-b border-sage-light flex items-center justify-between text-[13px]">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={toggleSelectAll}
              aria-label="Select all visible"
            />
            <span className="text-forest-dark font-medium">
              {someSelected || allSelected ? `${selected.size} selected` : 'Select all visible'}
            </span>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-600 hover:text-gray-900"
              >
                Clear
              </button>
            )}
          </label>
          <button
            type="button"
            className="text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
            onClick={() => setSortKey(sortKey === 'name' ? 'last' : 'name')}
          >
            Sort: {sortKey === 'name' ? 'Name' : 'Oldest maint.'}
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {items === null ? (
            <div className="p-10 text-center text-sm text-gray-600">Loading…</div>
          ) : loadError ? (
            <div className="p-10 text-center text-sm text-red-700">
              Couldn&apos;t load items. {loadError}
            </div>
          ) : total === 0 ? (
            <div className="p-10 text-center text-sm text-gray-600">
              This property has no items yet.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-600">
              No items match your filters.
            </div>
          ) : (
            <ul>
              {filtered.map((item) => {
                const isSel = selected.has(item.id);
                const last = classifyLastMaintained(item.lastMaintainedAt);
                const toneClass = TONE_CLASSES[last.tone];
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      aria-pressed={isSel}
                      className={`w-full grid grid-cols-[auto_1fr_auto_auto] gap-3.5 items-center px-5 py-3 border-b border-sage-light text-left transition-colors ${
                        isSel ? 'bg-forest/5' : 'hover:bg-sage-light/30'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        readOnly
                        tabIndex={-1}
                        aria-hidden
                      />
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-sage-light/60 text-forest flex items-center justify-center text-lg shrink-0">
                          {item.typeIcon}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[14px] font-medium text-forest-dark truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-gray-600">
                            {item.typeName} · {item.lat.toFixed(3)}, {item.lng.toFixed(3)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right min-w-[120px]">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wide">
                          Last maintained
                        </div>
                        <div className={`text-[13px] font-medium ${toneClass.text}`}>
                          {last.label}
                        </div>
                      </div>
                      <span
                        aria-hidden
                        className={`w-2.5 h-2.5 rounded-full ${toneClass.dot}`}
                      />
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
        <div className="px-5 py-3 border-t border-sage-light flex items-center justify-end gap-2 bg-parchment">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-primary"
            disabled={saving || selected.size === 0}
          >
            {saving
              ? 'Adding…'
              : selected.size === 0
                ? 'Add items'
                : `Add ${selected.size} item${selected.size > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
