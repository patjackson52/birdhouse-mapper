'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Birdhouse, BirdhouseWithDetails } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import DetailPanel from '@/components/birdhouse/DetailPanel';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const BirdMap = dynamic(() => import('@/components/map/BirdMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-sage-light">
      <LoadingSpinner />
    </div>
  ),
});

export default function HomePage() {
  const [birdhouses, setBirdhouses] = useState<Birdhouse[]>([]);
  const [selectedBirdhouse, setSelectedBirdhouse] = useState<BirdhouseWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBirdhouses() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('birdhouses')
        .select('*')
        .neq('status', 'removed')
        .order('created_at', { ascending: true });

      if (!error && data) {
        setBirdhouses(data);
      }
      setLoading(false);
    }

    fetchBirdhouses();
  }, []);

  async function handleMarkerClick(birdhouse: Birdhouse) {
    const supabase = createClient();

    // Fetch updates with photos
    const { data: updates } = await supabase
      .from('birdhouse_updates')
      .select('*')
      .eq('birdhouse_id', birdhouse.id)
      .order('update_date', { ascending: false });

    const { data: photos } = await supabase
      .from('photos')
      .select('*')
      .eq('birdhouse_id', birdhouse.id);

    setSelectedBirdhouse({
      ...birdhouse,
      updates: (updates || []).map((u) => ({ ...u, photos: [] })),
      photos: photos || [],
    });
  }

  if (loading) {
    return (
      <div className="h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-3.5rem-4rem)] md:h-[calc(100vh-4rem)]">
      <BirdMap birdhouses={birdhouses} onMarkerClick={handleMarkerClick} />

      {/* List view link */}
      <Link
        href="/list"
        className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-sage-light/60 px-3 py-2 text-xs font-medium text-forest-dark hover:bg-sage-light transition-colors"
      >
        View as List
      </Link>

      {/* Detail panel */}
      <DetailPanel
        birdhouse={selectedBirdhouse}
        onClose={() => setSelectedBirdhouse(null)}
      />
    </div>
  );
}
