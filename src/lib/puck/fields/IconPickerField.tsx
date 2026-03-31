'use client';

import { useState, useEffect, useCallback } from 'react';
import type { IconValue } from './link-utils';
import { IconRenderer } from '../icons/IconRenderer';
import { searchIcons, getLucideIcons, getHeroicons, type IconEntry } from '../icons/icon-catalog';

interface IconPickerFieldProps {
  value: IconValue | undefined;
  onChange: (value: IconValue | undefined) => void;
}

type IconSet = 'all' | 'lucide' | 'heroicons';

export function IconPickerField({ value, onChange }: IconPickerFieldProps) {
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
      } else {
        const set = iconSet === 'all' ? undefined : iconSet;
        if (!set || set === 'lucide') {
          const lucide = await getLucideIcons();
          if (!set) {
            const heroicons = await getHeroicons();
            setResults([...lucide.slice(0, 100), ...heroicons.slice(0, 100)]);
          } else {
            setResults(lucide.slice(0, 200));
          }
        } else {
          const heroicons = await getHeroicons();
          setResults(heroicons.slice(0, 200));
        }
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
    onChange({
      set: entry.set,
      name: entry.name,
      style: entry.set === 'heroicons' ? 'outline' : undefined,
    });
    setIsOpen(false);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 rounded border border-gray-300 px-3 py-1.5 text-xs hover:border-blue-400 transition-colors w-full"
        >
          {value ? (
            <>
              <IconRenderer icon={value} size={16} />
              <span>{value.name}</span>
              <span className="text-gray-400 ml-auto">{value.set}</span>
            </>
          ) : (
            <span className="text-gray-400">No icon</span>
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-xs text-gray-400 hover:text-gray-600 shrink-0"
            aria-label="Clear icon"
          >
            Clear
          </button>
        )}
      </div>

      {isOpen && (
        <div className="border border-gray-200 rounded-lg bg-white shadow-lg p-3 space-y-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons..."
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
            autoFocus
          />

          <div className="flex gap-1">
            {(['all', 'lucide', 'heroicons'] as IconSet[]).map((set) => (
              <button
                key={set}
                type="button"
                onClick={() => setIconSet(set)}
                className={`text-xs px-2 py-0.5 rounded ${
                  iconSet === set ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {set === 'all' ? 'All' : set === 'lucide' ? 'Lucide' : 'Heroicons'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
            {loading ? (
              <div className="col-span-8 text-center text-xs text-gray-400 py-4">Loading...</div>
            ) : results.length === 0 ? (
              <div className="col-span-8 text-center text-xs text-gray-400 py-4">No icons found</div>
            ) : (
              results.map((entry) => (
                <button
                  key={`${entry.set}-${entry.name}`}
                  type="button"
                  onClick={() => handleSelect(entry)}
                  className="flex items-center justify-center h-8 w-8 rounded hover:bg-blue-50 transition-colors"
                  title={`${entry.name} (${entry.set})`}
                >
                  <IconRenderer
                    icon={{ set: entry.set, name: entry.name, style: entry.set === 'heroicons' ? 'outline' : undefined }}
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
