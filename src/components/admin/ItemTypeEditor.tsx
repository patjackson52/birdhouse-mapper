'use client';

import { useState } from 'react';
import type { ItemType, IconValue } from '@/lib/types';
import { IconPicker, IconRenderer } from '@/components/shared/IconPicker';
import CustomFieldEditor from './CustomFieldEditor';
import UpdateTypeEditor from './UpdateTypeEditor';

interface ItemTypeEditorProps {
  itemType: ItemType;
  itemCount: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSave: (updates: { name: string; icon: IconValue; color: string; sort_order: number }) => Promise<void>;
  onDelete: () => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export default function ItemTypeEditor({
  itemType, itemCount, isExpanded, onToggleExpand,
  onSave, onDelete, onMoveUp, onMoveDown, isFirst, isLast,
}: ItemTypeEditorProps) {
  const [name, setName] = useState(itemType.name);
  const [icon, setIcon] = useState<IconValue>(itemType.icon);
  const [color, setColor] = useState(itemType.color);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await onSave({ name, icon, color, sort_order: itemType.sort_order });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (itemCount > 0) {
      setError(`Cannot delete: ${itemCount} item${itemCount === 1 ? '' : 's'} use this type.`);
      return;
    }
    if (!confirm(`Delete "${itemType.name}" and all its custom fields and update types?`)) return;
    setError('');
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.');
    }
  }

  return (
    <div className="card">
      {/* Collapsed header */}
      <div className="flex items-center gap-3 cursor-pointer" onClick={onToggleExpand}>
        <IconRenderer icon={itemType.icon} size={20} />
        <span className="font-medium text-forest-dark flex-1">{itemType.name}</span>
        <div className="w-5 h-5 rounded-full border border-sage-light" style={{ backgroundColor: itemType.color }} />
        <span className="text-xs text-sage bg-sage-light px-2 py-0.5 rounded-full">
          {itemCount} item{itemCount === 1 ? '' : 's'}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            disabled={isFirst}
            className="text-sage hover:text-forest-dark disabled:opacity-30 text-sm px-1"
            title="Move up"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            disabled={isLast}
            className="text-sage hover:text-forest-dark disabled:opacity-30 text-sm px-1"
            title="Move down"
          >
            ▼
          </button>
        </div>
        <svg
          className={`w-4 h-4 text-sage transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-sage-light space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">Icon</label>
              <IconPicker value={icon} onChange={(v) => setIcon(v || { set: 'emoji', name: '📍' })} />
            </div>
            <div>
              <label className="label">Color</label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="input-field h-10" />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving...' : 'Save Type'}
            </button>
            <button onClick={handleDelete} className="text-sm text-red-600 hover:text-red-800 px-3 py-2">
              Delete Type
            </button>
          </div>

          <div className="space-y-6 pt-4 border-t border-sage-light">
            <CustomFieldEditor itemTypeId={itemType.id} />
            <UpdateTypeEditor itemTypeId={itemType.id} />
          </div>
        </div>
      )}
    </div>
  );
}
