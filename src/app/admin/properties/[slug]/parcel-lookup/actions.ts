'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { runParcelLookup } from '@/lib/geo/parcel-lookup';
import { createGeoLayer, assignLayerToProperties, setPropertyBoundary } from '@/app/admin/geo-layers/actions';
import type { CountyGISConfig, ParcelCandidate, ParcelLookupResult } from '@/lib/geo/types';
import type { FeatureCollection, Feature } from 'geojson';
import bbox from '@turf/bbox';

export async function lookupParcel(input: {
  address: string;
  orgId: string;
  propertyId: string;
}): Promise<ParcelLookupResult | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const registryLookup = async (fips: string): Promise<CountyGISConfig | null> => {
    const { data } = await supabase
      .from('county_gis_registry')
      .select('*')
      .eq('fips', fips)
      .single();
    return data ?? null;
  };

  const registrySave = async (config: Omit<CountyGISConfig, 'id' | 'last_verified_at'>) => {
    const serviceClient = createServiceClient();
    await serviceClient.from('county_gis_registry').upsert(
      {
        fips: config.fips,
        county_name: config.county_name,
        state: config.state,
        parcel_layer_url: config.parcel_layer_url,
        address_layer_url: config.address_layer_url,
        field_map: config.field_map,
        discovery_method: config.discovery_method,
        confidence: config.confidence,
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: 'fips' }
    );
  };

  const result = await runParcelLookup({
    address: input.address,
    registryLookup,
    registrySave,
  });

  // Log the lookup
  await supabase.from('parcel_lookups').insert({
    org_id: input.orgId,
    property_id: input.propertyId,
    input_address: input.address,
    county_fips: result.county_fips,
    source: result.source ?? 'county_arcgis',
    status: result.status === 'found' || result.status === 'multiple' ? 'success' : result.status,
    parcels_found: result.parcels.length,
  });

  return result;
}

export async function confirmParcelSelection(input: {
  parcels: ParcelCandidate[];
  propertyId: string;
  orgId: string;
  setAsBoundary: boolean;
  unionForBoundary: boolean;
  layerName: string;
}): Promise<{ success: true; geoLayerId: string } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Build FeatureCollection from selected parcels
  const features: Feature[] = input.parcels.map((p) => ({
    type: 'Feature' as const,
    properties: {
      apn: p.apn,
      acres: p.acres,
      owner_of_record: p.owner_of_record,
      site_address: p.site_address,
      source_url: p.source_url,
    },
    geometry: p.geometry,
  }));

  // If union for boundary, compute merged outline and add as feature
  if (input.unionForBoundary && features.length > 1) {
    try {
      const { default: union } = await import('@turf/union');
      const polygonFeatures = features.filter(
        (f) => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
      ) as Feature<import('geojson').Polygon | import('geojson').MultiPolygon>[];
      if (polygonFeatures.length > 1) {
        const fc2: import('geojson').FeatureCollection<import('geojson').Polygon | import('geojson').MultiPolygon> = {
          type: 'FeatureCollection',
          features: polygonFeatures,
        };
        const merged = union(fc2);
        if (merged) {
          merged.properties = { role: 'boundary_outline' };
          features.push(merged);
        }
      }
    } catch {
      // If union fails, proceed without it
    }
  }

  const fc: FeatureCollection = { type: 'FeatureCollection', features };
  const layerBbox = bbox(fc) as [number, number, number, number];

  const totalAcres = input.parcels.reduce((sum, p) => sum + (p.acres ?? 0), 0);
  const description = `${input.parcels.length} parcel(s), ${totalAcres.toFixed(2)} acres. APNs: ${input.parcels.map((p) => p.apn).join(', ')}`;

  const result = await createGeoLayer({
    orgId: input.orgId,
    name: input.layerName,
    description,
    geojson: fc,
    sourceFormat: 'geojson',
    sourceFilename: 'parcel-lookup',
    color: '#16a34a',
    opacity: 0.5,
    featureCount: features.length,
    bbox: layerBbox,
    isPropertyBoundary: input.setAsBoundary,
    status: 'published',
    source: 'parcel_lookup',
  });

  if ('error' in result) return result;

  // Assign to property
  await assignLayerToProperties(result.layerId, input.orgId, [input.propertyId], true);

  // Set as property boundary if requested
  if (input.setAsBoundary) {
    await setPropertyBoundary(input.propertyId, result.layerId);
  }

  // Update audit log with result
  await supabase
    .from('parcel_lookups')
    .update({ result_geo_layer_id: result.layerId })
    .eq('property_id', input.propertyId)
    .eq('org_id', input.orgId)
    .is('result_geo_layer_id', null)
    .order('created_at', { ascending: false })
    .limit(1);

  return { success: true, geoLayerId: result.layerId };
}
