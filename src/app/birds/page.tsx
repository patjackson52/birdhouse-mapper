'use client';

import { useEffect, useState } from 'react';
import type { BirdSpecies } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import BirdCard from '@/components/birds/BirdCard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Footer from '@/components/layout/Footer';

export default function BirdsPage() {
  const [birds, setBirds] = useState<BirdSpecies[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBirds() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('bird_species')
        .select('*')
        .order('common_name', { ascending: true });

      if (!error && data) {
        setBirds(data);
      }
      setLoading(false);
    }

    fetchBirds();
  }, []);

  return (
    <div className="pb-20 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-heading text-3xl font-semibold text-forest-dark mb-2">
            Birds of IslandWood
          </h1>
          <p className="text-sage max-w-2xl">
            These are the bird species found at IslandWood and targeted by our birdhouse
            project. Each birdhouse is designed with specific entrance hole sizes and
            placement to attract particular species.
          </p>
        </div>

        {loading && <LoadingSpinner className="py-12" />}

        {!loading && birds.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sage text-sm">No bird species data available yet.</p>
          </div>
        )}

        {!loading && birds.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {birds.map((bird) => (
              <BirdCard key={bird.id} bird={bird} />
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
