'use client';

import { useState, useEffect, useCallback } from 'react';
import type { IconValue } from '@/lib/types';
import { normalizeIcon } from '@/lib/types';
import { IconRenderer } from './IconRenderer';
import { searchIcons, getLucideIcons, getHeroicons, getEmojis, type IconEntry } from './icon-catalog';
import { getAllEmojis } from './emoji-catalog';

interface IconPickerProps {
  value: IconValue | undefined;
  onChange: (value: IconValue | undefined) => void;
  className?: string;
}

type IconSet = 'all' | 'lucide' | 'heroicons' | 'emoji';

/** Human-readable name for an emoji icon. */
function emojiDisplayName(emoji: string): string {
  const all = getAllEmojis();
  const entry = all.find((e) => e.emoji === emoji);
  return entry?.name ?? emoji;
}

export function IconPicker({ value, onChange, className }: IconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [iconSet, setIconSet] = useState<IconSet>('all');
  const [results, setResults] = useState<IconEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadIcons = useCallback(async () => {
    setLoading(true);
    try {
      if (query) {
        const set = iconSet === 'all' ? undefined : iconSet;
        setResults(await searchIcons(query, set));
      } else if (iconSet === 'emoji') {
        setResults(getEmojis());
      } else {
        const set = iconSet === 'all' ? undefined : iconSet;
        const batches: IconEntry[][] = [];

        if (!set || set === 'lucide') {
          const lucide = await getLucideIcons();
          batches.push(lucide.slice(0, set ? 200 : 80));
        }
        if (!set || set === 'heroicons') {
          const heroicons = await getHeroicons();
          batches.push(heroicons.slice(0, set ? 200 : 80));
        }
        if (!set) {
          batches.push(getEmojis().slice(0, 40));
        }

        setResults(batches.flat());
      }
    } finally {
      setLoading(false);
    }
  }, [query, iconSet]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(loadIcons, query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [isOpen, loadIcons, query]);

  function handleSelect(entry: IconEntry) {
    if (entry.set === 'emoji') {
      onChange({ set: 'emoji', name: entry.name });
    } else {
      onChange({
        set: entry.set,
        name: entry.name,
        style: entry.set === 'heroicons' ? 'outline' : undefined,
      });
    }
    setIsOpen(false);
    setQuery('');
  }

  const normalizedValue = normalizeIcon(value);
  const displayName = normalizedValue
    ? normalizedValue.set === 'emoji'
      ? emojiDisplayName(normalizedValue.name)
      : normalizedValue.name.replace(/([A-Z])/g, ' $1').trim()
    : null;

  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 input-field text-sm w-full text-left"
        >
          {normalizedValue ? (
            <>
              <IconRenderer icon={normalizedValue} size={18} />
              <span className="text-forest-dark">{displayName}</span>
              <span className="text-sage text-xs ml-auto">{normalizedValue.set}</span>
            </>
          ) : (
            <span className="text-sage">No icon</span>
          )}
        </button>
        {normalizedValue && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-xs text-sage hover:text-forest-dark shrink-0"
            aria-label="Clear icon"
          >
            Clear
          </button>
        )}
      </div>

      {isOpen && (
        <div className="border border-sage-light rounded-lg bg-white shadow-lg p-3 space-y-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons..."
            className="w-full rounded border border-sage-light px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            autoFocus
          />

          <div className="flex gap-1">
            {(['all', 'lucide', 'heroicons', 'emoji'] as IconSet[]).map((set) => (
              <button
                key={set}
                type="button"
                onClick={() => setIconSet(set)}
                className={`text-xs px-2 py-0.5 rounded ${
                  iconSet === set
                    ? 'bg-forest/10 text-forest-dark font-medium'
                    : 'text-sage hover:bg-sage-light'
                }`}
              >
                {set === 'all' ? 'All' : set === 'lucide' ? 'Lucide' : set === 'heroicons' ? 'Heroicons' : 'Emoji'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
            {loading ? (
              <div className="col-span-8 text-center text-xs text-sage py-4">Loading...</div>
            ) : results.length === 0 ? (
              <div className="col-span-8 text-center text-xs text-sage py-4">No icons found</div>
            ) : (
              results.map((entry) => (
                <button
                  key={`${entry.set}-${entry.name}`}
                  type="button"
                  onClick={() => handleSelect(entry)}
                  className="flex items-center justify-center h-8 w-8 rounded hover:bg-forest/10 transition-colors"
                  title={entry.set === 'emoji'
                    ? emojiDisplayName(entry.name)
                    : `${entry.name} (${entry.set})`}
                >
                  <IconRenderer
                    icon={{
                      set: entry.set,
                      name: entry.name,
                      style: entry.set === 'heroicons' ? 'outline' : undefined,
                    }}
                    size={16}
                  />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
