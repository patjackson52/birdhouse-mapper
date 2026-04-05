'use server';

import { createClient } from '@/lib/supabase/server';
import type { GeoLayer } from '@/lib/geo/types';
import type { Feature, FeatureCollection } from 'geojson';
import { MAX_CANDIDATE_LAYERS } from '@/lib/geo/constants';
import { bboxOverlaps } from '@/lib/geo/discovery';

type Bbox = [number, number, number, number];

/**
 * Find org layers whose bbox overlaps the search area, excluding layers already assigned to the property.
 * Returns full GeoLayer records (including geojson) for client-side intersection.
 */
export async function findCandidateLayers(
  orgId: string,
  propertyId: string,
  searchBbox: Bbox,
): Promise<{ success: true; layers: GeoLayer[] } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Get IDs of layers already assigned to this property
  const { data: existing } = await supabase
    .from('geo_layer_properties')
    .select('geo_layer_id')
    .eq('property_id', propertyId);

  const excludeIds = (existing ?? []).map((r: { geo_layer_id: string }) => r.geo_layer_id);

  // Fetch all org layers (we filter by bbox client-side since JSONB bbox isn't indexable via SQL operators easily)
  const { data: allLayers, error } = await supabase
    .from('geo_layers')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return { error: error.message };

  // Filter by bbox overlap and exclude already-assigned, then limit
  const candidates = (allLayers as GeoLayer[])
    .filter((layer) => {
      if (!layer.bbox) return false;
      if (excludeIds.includes(layer.id)) return false;
      return bboxOverlaps(layer.bbox, searchBbox);
    })
    .slice(0, MAX_CANDIDATE_LAYERS);

  return { success: true, layers: candidates };
}

interface CreateDiscoveredLayerInput {
  orgId: string;
  propertyId: string;
  name: string;
  features: Feature[];
}

/**
 * Create a new geo_layers record from selected features and assign it to the property.
 * Features should already have _source_layer_id/_source_layer_name in their properties.
 */
export async function createDiscoveredLayer(
  input: CreateDiscoveredLayerInput,
): Promise<{ success: true; layerId: string } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const fc: FeatureCollection = {
    type: 'FeatureCollection',
    features: input.features,
  };

  // Compute bbox from features
  const { default: turfBbox } = await import('@turf/bbox');
  const bbox = turfBbox(fc) as Bbox;

  // Collect unique source names from provenance
  const sourceNames = new Set(
    input.features
      .map((f) => f.properties?._source_layer_name)
      .filter(Boolean)
  );

  const { data, error: insertError } = await supabase
    .from('geo_layers')
    .insert({
      org_id: input.orgId,
      name: input.name,
      description: `Discovered from ${sourceNames.size} source layer(s)`,
      color: '#3b82f6',
      opacity: 0.6,
      source_format: 'geojson',
      source_filename: 'discovered',
      geojson: fc,
      feature_count: input.features.length,
      bbox,
      is_property_boundary: false,
      created_by: user.id,
      status: 'published',
      source: 'discovered',
    })
    .select('id')
    .single();

  if (insertError) return { error: insertError.message };

  // Assign to property
  const { error: assignError } = await supabase
    .from('geo_layer_properties')
    .insert({
      geo_layer_id: data.id,
      property_id: input.propertyId,
      org_id: input.orgId,
      visible_default: true,
    });

  if (assignError) return { error: assignError.message };

  return { success: true, layerId: data.id };
}
