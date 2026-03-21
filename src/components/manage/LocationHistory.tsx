'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { LocationHistory as LocationHistoryType, Profile } from '@/lib/types';
import { formatShortDate } from '@/lib/utils';

interface LocationHistoryProps {
  itemId: string;
  onRevert: (latitude: number, longitude: number) => void;
}

export default function LocationHistory({ itemId, onRevert }: LocationHistoryProps) {
  const [history, setHistory] = useState<LocationHistoryType[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const { data: historyData } = await supabase
        .from('location_history')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false });

      if (!historyData || historyData.length === 0) {
        setLoading(false);
        return;
      }

      setHistory(historyData);

      const creatorIds = [...new Set(historyData.map((h) => h.created_by))];
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .in('id', creatorIds);

      if (profileData) {
        const profileMap: Record<string, Profile> = {};
        for (const p of profileData) {
          profileMap[p.id] = p;
        }
        setProfiles(profileMap);
      }

      setLoading(false);
    }

    fetchData();
  }, [itemId]);

  if (loading) return null;

  // If only 1 entry (original location, no moves), show nothing
  if (history.length <= 1) return null;

  return (
    <div className="space-y-4">
      {history.map((entry, index) => (
        <div key={entry.id} className="relative pl-8">
          {/* Timeline line */}
          {index < history.length - 1 && (
            <div className="absolute left-3 top-8 bottom-0 w-px bg-sage-light" />
          )}
          {/* Timeline dot */}
          <div
            className={`absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full ${
              index === 0 ? 'bg-forest' : 'bg-sage-light'
            }`}
          />
          {/* Content */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-forest">
                {entry.latitude.toFixed(4)}, {entry.longitude.toFixed(4)}
              </span>
              <span className="text-xs text-sage">
                {formatShortDate(entry.created_at)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {profiles[entry.created_by]?.display_name && (
                <span className="text-sm text-forest-dark/80">
                  {profiles[entry.created_by].display_name}
                </span>
              )}
              {index === 0 ? (
                <span className="text-xs bg-forest/10 text-forest px-1.5 py-0.5 rounded-full">
                  Current
                </span>
              ) : (
                <button
                  className="btn-secondary text-xs py-1"
                  onClick={() => onRevert(entry.latitude, entry.longitude)}
                >
                  Revert
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
