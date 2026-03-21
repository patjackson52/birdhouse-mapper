'use client';

import type { ButtonBlock } from '@/lib/config/landing-types';

interface ButtonEditorProps {
  block: ButtonBlock;
  onChange: (block: ButtonBlock) => void;
}

export default function ButtonEditor({ block, onChange }: ButtonEditorProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-700">Label</label>
        <input
          type="text"
          value={block.label}
          onChange={(e) => onChange({ ...block, label: e.target.value })}
          className="mt-1 w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700">URL (href)</label>
        <input
          type="text"
          value={block.href}
          onChange={(e) => onChange({ ...block, href: e.target.value })}
          className="mt-1 w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700">Style</label>
        <select
          value={block.style ?? 'primary'}
          onChange={(e) => onChange({ ...block, style: e.target.value as 'primary' | 'outline' })}
          className="mt-1 w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="primary">Primary</option>
          <option value="outline">Outline</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700">Size</label>
        <select
          value={block.size ?? 'default'}
          onChange={(e) => onChange({ ...block, size: e.target.value as 'default' | 'large' })}
          className="mt-1 w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="default">Default</option>
          <option value="large">Large</option>
        </select>
      </div>
    </div>
  );
}
