'use client';

import type { StatsBlock } from '@/lib/config/landing-types';

interface StatsEditorProps {
  block: StatsBlock;
  onChange: (block: StatsBlock) => void;
}

export default function StatsEditor({ block, onChange }: StatsEditorProps) {
  const items = block.items ?? [];

  function updateItem(index: number, field: 'label' | 'value', val: string) {
    const updated = items.map((item, i) =>
      i === index ? { ...item, [field]: val } : item
    );
    onChange({ ...block, items: updated });
  }

  function removeItem(index: number) {
    onChange({ ...block, items: items.filter((_, i) => i !== index) });
  }

  function addItem() {
    onChange({ ...block, items: [...items, { label: '', value: '' }] });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">Data Source</label>
        <div className="flex gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="radio"
              name={`stats-source-${block.id}`}
              checked={block.source === 'auto'}
              onChange={() => onChange({ ...block, source: 'auto' })}
            />
            Auto (live data)
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="radio"
              name={`stats-source-${block.id}`}
              checked={block.source === 'manual'}
              onChange={() => onChange({ ...block, source: 'manual' })}
            />
            Manual
          </label>
        </div>
      </div>

      {block.source === 'manual' && (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={item.label}
                onChange={(e) => updateItem(i, 'label', e.target.value)}
                placeholder="Label"
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              <input
                type="text"
                value={item.value}
                onChange={(e) => updateItem(i, 'value', e.target.value)}
                placeholder="Value"
                className="w-24 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="text-gray-400 hover:text-red-600 text-lg leading-none px-1"
                aria-label="Remove stat"
              >
                &times;
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addItem}
            className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-1 bg-white"
          >
            + Add Stat
          </button>
        </div>
      )}
    </div>
  );
}
