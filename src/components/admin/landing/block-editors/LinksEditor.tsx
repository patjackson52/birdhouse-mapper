'use client';

import type { LinksBlock } from '@/lib/config/landing-types';

interface LinksEditorProps {
  block: LinksBlock;
  onChange: (block: LinksBlock) => void;
}

export default function LinksEditor({ block, onChange }: LinksEditorProps) {
  const items = block.items ?? [];

  function updateItem(index: number, field: string, value: string) {
    const updated = items.map((item, i) =>
      i === index ? { ...item, [field]: value || (field === 'description' ? undefined : '') } : item
    );
    onChange({ ...block, items: updated });
  }

  function removeItem(index: number) {
    onChange({ ...block, items: items.filter((_, i) => i !== index) });
  }

  function addItem() {
    onChange({ ...block, items: [...items, { label: '', url: '' }] });
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="bg-gray-50 border border-gray-200 rounded p-2 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={item.label}
              onChange={(e) => updateItem(i, 'label', e.target.value)}
              placeholder="Label"
              className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            <input
              type="text"
              value={item.url}
              onChange={(e) => updateItem(i, 'url', e.target.value)}
              placeholder="URL"
              className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="text-gray-400 hover:text-red-600 text-lg leading-none px-1"
              aria-label="Remove link"
            >
              &times;
            </button>
          </div>
          <input
            type="text"
            value={item.description ?? ''}
            onChange={(e) => updateItem(i, 'description', e.target.value)}
            placeholder="Description (optional)"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-1 bg-white"
      >
        + Add Link
      </button>
    </div>
  );
}
