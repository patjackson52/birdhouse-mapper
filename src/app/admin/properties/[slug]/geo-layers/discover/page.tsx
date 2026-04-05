'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import dynamic from 'next/dynamic';
import type { FeatureCollection } from 'geojson';

const DiscoverWizard = dynamic(() => import('@/components/geo/DiscoverWizard'), {
  ssr: false,
  loading: () => <p className="text-gray-500 p-4">Loading discovery wizard...</p>,
});

interface PropertyData {
  id: string;
  name: string;
  slug: string;
  org_id: string;
  map_default_lat: number;
  map_default_lng: number;
  map_default_zoom: number;
  boundary_layer_id: string | null;
}

export default function DiscoverPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: prop } = await supabase
        .from('properties')
        .select('id, name, slug, org_id, map_default_lat, map_default_lng, map_default_zoom, boundary_layer_id')
        .eq('slug', slug)
        .single();

      if (!prop) {
        setLoading(false);
        return;
      }

      setProperty(prop);

      if (prop.boundary_layer_id) {
        const { data: layer } = await supabase
          .from('geo_layers')
          .select('geojson')
          .eq('id', prop.boundary_layer_id)
          .single();

        if (layer) {
          setBoundaryGeoJSON(layer.geojson as FeatureCollection);
        }
      }

      setLoading(false);
    }

    load();
  }, [slug]);

  if (loading) {
    return <p className="text-gray-500 p-4">Loading...</p>;
  }

  if (!property) {
    return <p className="text-red-600 p-4">Property not found.</p>;
  }

  return (
    <DiscoverWizard
      orgId={property.org_id}
      propertyId={property.id}
      propertyName={property.name}
      propertySlug={property.slug}
      boundaryGeoJSON={boundaryGeoJSON}
      mapCenter={[property.map_default_lat, property.map_default_lng]}
      mapZoom={property.map_default_zoom}
    />
  );
}
