'use client';

import { useEffect, useState, type ReactElement } from 'react';
import type { SpeciesResult } from '@/lib/types';
import { isCavityNester } from '@/lib/species/cavity-nesters';
import SpeciesCard from './SpeciesCard';
import { useRecentSpecies, type RecentSpeciesEntry } from './useRecentSpecies';

type Tab = 'nearby' | 'recent' | 'all';

interface Filters {
  native: boolean;
  cavityNester: boolean;
}

interface SpeciesPickerGridProps {
  orgId: string;
  entityTypeId: string;
  lat?: number;
  lng?: number;
  isOnline: boolean;
  isStaged: (taxonId: number) => boolean;
  onOpenDetail: (card: SpeciesResult) => void;
  onRecentLoaded: (entries: RecentSpeciesEntry[]) => void;
}

export default function SpeciesPickerGrid({
  orgId,
  entityTypeId,
  lat,
  lng,
  isOnline,
  isStaged,
  onOpenDetail,
  onRecentLoaded,
}: SpeciesPickerGridProps): ReactElement {
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';

  const initialTab: Tab = !isOnline
    ? 'recent'
    : hasCoords
    ? 'nearby'
    : 'recent';

  const [tab, setTab] = useState<Tab>(initialTab);
  const [filters, setFilters] = useState<Filters>({ native: false, cavityNester: false });
  const [query, setQuery] = useState('');

  const [nearby, setNearby] = useState<SpeciesResult[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SpeciesResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const recent = useRecentSpecies(orgId, entityTypeId, true);

  useEffect(() => {
    onRecentLoaded(recent.entries);
  }, [recent.entries, onRecentLoaded]);

  useEffect(() => {
    if (tab !== 'nearby' || !hasCoords || !isOnline) return;

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
  }, [tab, hasCoords, isOnline, lat, lng]);

  useEffect(() => {
    const trimmed = query.trim();
    if (tab !== 'all' || !isOnline || trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const url = new URL('/api/species/search', 'http://localhost');
        url.searchParams.set('q', trimmed);
        if (hasCoords) {
          url.searchParams.set('lat', String(lat));
          url.searchParams.set('lng', String(lng));
        }
        const res = await fetch(url.pathname + url.search);
        const json = res.ok ? await res.json() : [];
        setSearchResults(Array.isArray(json) ? json : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, tab, isOnline, hasCoords, lat, lng]);

  function applyFilters(list: SpeciesResult[]): SpeciesResult[] {
    return list.filter((s) => {
      if (filters.native && s.establishment_means === 'introduced') return false;
      if (filters.cavityNester && !isCavityNester(s.id)) return false;
      return true;
    });
  }

  let cards: SpeciesResult[] = [];
  if (tab === 'nearby') cards = applyFilters(nearby);
  else if (tab === 'recent') cards = applyFilters(recent.entries.map((e) => e.card));
  else cards = applyFilters(searchResults);

  const allTabDisabled = !isOnline;

  return (
    <div className="flex flex-col gap-3">
      {!isOnline && (
        <div
          role="status"
          className="rounded-lg bg-sage-light px-3 py-2 text-xs text-forest-dark"
        >
          Search requires internet connection.
        </div>
      )}

      <input
        type="search"
        className="input-field"
        placeholder="Search species..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setTab('all')}
        disabled={!isOnline}
      />

      <div role="tablist" className="flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'nearby'}
          onClick={() => setTab('nearby')}
          className={tab === 'nearby' ? 'btn-primary' : 'btn-secondary'}
        >
          Nearby
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'recent'}
          onClick={() => setTab('recent')}
          className={tab === 'recent' ? 'btn-primary' : 'btn-secondary'}
        >
          Recent
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'all'}
          onClick={() => !allTabDisabled && setTab('all')}
          disabled={allTabDisabled}
          className={tab === 'all' ? 'btn-primary' : 'btn-secondary'}
        >
          All
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={filters.native}
          onClick={() => setFilters((f) => ({ ...f, native: !f.native }))}
          className={[
            'rounded-full border px-3 py-1 text-xs',
            filters.native
              ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
              : 'border-sage-light text-forest-dark',
          ].join(' ')}
        >
          Native
        </button>
        <button
          type="button"
          aria-pressed={filters.cavityNester}
          onClick={() => setFilters((f) => ({ ...f, cavityNester: !f.cavityNester }))}
          className={[
            'rounded-full border px-3 py-1 text-xs',
            filters.cavityNester
              ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
              : 'border-sage-light text-forest-dark',
          ].join(' ')}
        >
          Cavity nester
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <SpeciesCard
            key={card.id}
            card={card}
            selected={isStaged(card.id)}
            onTap={() => onOpenDetail(card)}
          />
        ))}
      </div>

      {tab === 'nearby' && !hasCoords && (
        <p className="px-1 text-xs text-sage">
          Nearby species require location. Open the map to share your location, or switch to Recent.
        </p>
      )}
      {tab === 'nearby' && hasCoords && !isOnline && (
        <p className="px-1 text-xs text-sage">Nearby species require a connection.</p>
      )}
      {tab === 'nearby' && hasCoords && isOnline && !nearbyLoading && cards.length === 0 && (
        <p className="px-1 text-xs text-sage">No species in this area.</p>
      )}
      {tab === 'all' && query.trim().length < 2 && (
        <p className="px-1 text-xs text-sage">Search for a species above.</p>
      )}
      {tab === 'all' && searchLoading && (
        <p className="px-1 text-xs text-sage">Searching...</p>
      )}
      {tab === 'recent' && !recent.loading && cards.length === 0 && (
        <p className="px-1 text-xs text-sage">No recent selections yet.</p>
      )}
    </div>
  );
}
