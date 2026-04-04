'use client';

import { useState, useEffect } from 'react';
import { getKnowledgeItems } from '@/lib/knowledge/actions';

interface KnowledgeTagPickerFieldProps {
  value: string[];
  onChange: (val: string[]) => void;
}

export function KnowledgeTagPickerField({ value, onChange }: KnowledgeTagPickerFieldProps) {
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getKnowledgeItems('').then(({ items }) => {
      const tags = Array.from(new Set(items.flatMap((i) => i.tags))).sort();
      setAllTags(tags);
      setLoading(false);
    });
  }, []);

  const selected = new Set(value ?? []);

  function toggle(tag: string) {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange(Array.from(next));
  }

  if (loading) {
    return <div className="text-xs text-gray-400 py-2">Loading tags…</div>;
  }

  if (allTags.length === 0) {
    return <div className="text-xs text-gray-400 py-2">No tags found. Add tags to knowledge articles first.</div>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {allTags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => toggle(tag)}
          className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
            selected.has(tag)
              ? 'bg-sage text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
