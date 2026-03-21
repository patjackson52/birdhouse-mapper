'use client';

import type { SpacerBlock } from '@/lib/config/landing-types';

interface SpacerEditorProps {
  block: SpacerBlock;
  onChange: (block: SpacerBlock) => void;
}

export default function SpacerEditor({ block, onChange }: SpacerEditorProps) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-700">Size</label>
      <select
        value={block.size}
        onChange={(e) => onChange({ ...block, size: e.target.value as 'small' | 'medium' | 'large' })}
        className="mt-1 w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
      >
        <option value="small">Small</option>
        <option value="medium">Medium</option>
        <option value="large">Large</option>
      </select>
    </div>
  );
}
