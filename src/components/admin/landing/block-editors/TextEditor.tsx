'use client';

import type { TextBlock } from '@/lib/config/landing-types';

interface TextEditorProps {
  block: TextBlock;
  onChange: (block: TextBlock) => void;
}

export default function TextEditor({ block, onChange }: TextEditorProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-700">Content (Markdown)</label>
        <textarea
          value={block.content}
          onChange={(e) => onChange({ ...block, content: e.target.value })}
          rows={6}
          className="mt-1 w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none font-mono"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">Alignment</label>
        <div className="flex gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="radio"
              name={`alignment-${block.id}`}
              checked={(block.alignment ?? 'left') === 'left'}
              onChange={() => onChange({ ...block, alignment: 'left' })}
            />
            Left
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="radio"
              name={`alignment-${block.id}`}
              checked={block.alignment === 'center'}
              onChange={() => onChange({ ...block, alignment: 'center' })}
            />
            Center
          </label>
        </div>
      </div>
    </div>
  );
}
