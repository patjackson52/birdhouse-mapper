'use client';

import { useEffect, useState } from 'react';
import { useNetworkStatus } from '@/lib/offline/network';
import { createClient } from '@/lib/supabase/client';
import type { SpeciesResult } from '@/lib/types';

interface SpeciesPickerProps {
  entityTypeId: string;
  entityTypeName: string;
  orgId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  lat?: number;
  lng?: number;
}

export default function SpeciesPicker({
  entityTypeId,
  entityTypeName,
  orgId,
  selectedIds,
  onChange,
  lat,
  lng,
}: SpeciesPickerProps) {
  const { isOnline } = useNetworkStatus();
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [nearby, setNearby] = useState<SpeciesResult[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [results, setResults] = useState<SpeciesResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (!isFocused) return;
    if (lat === undefined || lng === undefined) return;
    if (!isOnline) return;

    let cancelled = false;
    setNearbyLoading(true);
    fetch(`/api/species/nearby?lat=${lat}&lng=${lng}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((json: SpeciesResult[]) => {
        if (!cancelled) setNearby(Array.isArray(json) ? json : []);
      })
      .catch(() => {
        if (!cancelled) setNearby([]);
      })
      .finally(() => {
        if (!cancelled) setNearbyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isFocused, lat, lng, isOnline]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      return;
    }
    if (!isOnline) return;

    const handle = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/species/search?q=${encodeURIComponent(trimmed)}`
        );
        const json = res.ok ? await res.json() : [];
        setResults(Array.isArray(json) ? json : []);
      } catch {
        setResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [query, isOnline]);

  const showNearby = isFocused && query.trim().length === 0 && nearby.length > 0;
  const showEmptyState =
    isFocused && query.trim().length === 0 && nearby.length === 0 && !nearbyLoading;

  async function handleSelect(species: SpeciesResult) {
    const supabase = createClient();
    const externalId = String(species.id);

    const { data: existing } = await supabase
      .from('entities')
      .select('id')
      .eq('entity_type_id', entityTypeId)
      .eq('external_id', externalId)
      .maybeSingle();

    let entityId: string | null = existing?.id ?? null;

    if (!entityId) {
      const { data: inserted, error } = await supabase
        .from('entities')
        .insert({
          entity_type_id: entityTypeId,
          org_id: orgId,
          name: species.common_name,
          description: species.name,
          external_id: externalId,
          photo_path: null,
          custom_field_values: {
            scientific_name: species.name,
            photo_url: species.photo_url,
            wikipedia_url: species.wikipedia_url,
            observations_count: species.observations_count,
          },
        })
        .select('id')
        .single();

      if (error || !inserted) return;
      entityId = inserted.id;
    }

    if (entityId && !selectedIds.includes(entityId)) {
      onChange([...selectedIds, entityId]);
    }
    setQuery('');
    setIsFocused(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 150)}
        placeholder={`Search ${entityTypeName.toLowerCase()}...`}
        className="input-field"
        disabled={!isOnline}
      />

      {!isOnline && (
        <p className="text-xs text-sage mt-1">
          Search requires internet connection.
        </p>
      )}

      {isFocused && query.trim().length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-sage-light rounded-lg shadow-lg">
          {searchLoading && (
            <div className="px-3 py-2 text-xs text-sage">Searching...</div>
          )}
          {!searchLoading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-sage">No matches.</div>
          )}
          {results.map((s) => (
            <button
              type="button"
              key={s.id}
              onMouseDown={(e) => {
                e.preventDefault();
                void handleSelect(s);
              }}
              className="w-full text-left px-3 py-2 text-sm text-forest-dark hover:bg-sage-light"
            >
              <div className="font-medium">{s.common_name}</div>
              <div className="text-xs italic text-sage">
                {s.name}
                {s.observations_count > 0 && (
                  <span className="not-italic ml-2 text-[10px]">
                    ({s.observations_count.toLocaleString()} observations)
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {showNearby && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-sage-light rounded-lg shadow-lg">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-sage border-b border-sage-light">
            Recently seen nearby
          </div>
          {nearby.map((s) => (
            <button
              type="button"
              key={s.id}
              onMouseDown={(e) => {
                e.preventDefault();
                void handleSelect(s);
              }}
              className="w-full text-left px-3 py-2 text-sm text-forest-dark hover:bg-sage-light"
            >
              <div className="font-medium">{s.common_name}</div>
              <div className="text-xs italic text-sage">{s.name}</div>
            </button>
          ))}
        </div>
      )}

      {showEmptyState && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-sage-light rounded-lg shadow-lg px-3 py-2 text-xs text-sage">
          Type to search species...
        </div>
      )}
    </div>
  );
}
