import { geocodeAddress, resolveCountyFips } from './census-client';
import { searchArcGISHub, fetchFeatureServerFields, queryParcelsByPoint, queryParcelsByEnvelope } from './arcgis-client';
import { matchFields } from './field-matcher';
import type { ParcelCandidate, ParcelLookupResult, CountyGISConfig, FieldMap } from './types';
import bbox from '@turf/bbox';

export interface ParcelLookupInput {
  address: string;
  registryLookup: (fips: string) => Promise<CountyGISConfig | null>;
  registrySave: (config: Omit<CountyGISConfig, 'id' | 'last_verified_at'>) => Promise<void>;
}

const ADJACENT_BUFFER_DEGREES = 0.01; // ~800m

export async function runParcelLookup(input: ParcelLookupInput): Promise<ParcelLookupResult> {
  const emptyResult = (status: ParcelLookupResult['status'], error_message?: string): ParcelLookupResult => ({
    status,
    parcels: [],
    source: null,
    county_fips: null,
    county_name: null,
    error_message,
  });

  // Step 1: Geocode
  const geo = await geocodeAddress(input.address);
  if (!geo) return emptyResult('not_found', 'Could not geocode address. Check the address and try again.');

  // Step 2: Resolve county FIPS
  const fipsResult = await resolveCountyFips(geo.lat, geo.lng);
  if (!fipsResult) return emptyResult('not_found', 'Could not determine county for this location.');

  // Step 3: Resolve ArcGIS endpoint
  let config = await input.registryLookup(fipsResult.fips);

  if (!config) {
    config = await discoverEndpoint(fipsResult.county_name, fipsResult.state_fips, fipsResult.fips);
    if (config) {
      await input.registrySave(config);
    }
  }

  if (!config) {
    const countyLabel = fipsResult.county_name.toLowerCase().includes('county')
      ? fipsResult.county_name
      : `${fipsResult.county_name} County`;
    return emptyResult('not_found', `No parcel data source found for ${countyLabel}.`);
  }

  // Step 4: Query parcels at point
  const features = await queryParcelsByPoint(config.parcel_layer_url, geo.lat, geo.lng);
  if (features.length === 0) {
    return {
      status: 'not_found',
      parcels: [],
      source: 'county_arcgis',
      county_fips: fipsResult.fips,
      county_name: fipsResult.county_name,
      error_message: 'No parcels found at this location.',
    };
  }

  const baseParcels = features.map((f) => featureToCandidate(f, config!.field_map, config!.parcel_layer_url));

  // Step 5: Multi-parcel detection
  const ownerField = config.field_map.owner_name;
  const baseOwner = ownerField ? features[0].properties?.[ownerField] : null;

  let allParcels = baseParcels;

  if (baseOwner && ownerField) {
    const baseBbox = bbox({ type: 'FeatureCollection', features });
    const bufferedBbox: [number, number, number, number] = [
      baseBbox[0] - ADJACENT_BUFFER_DEGREES,
      baseBbox[1] - ADJACENT_BUFFER_DEGREES,
      baseBbox[2] + ADJACENT_BUFFER_DEGREES,
      baseBbox[3] + ADJACENT_BUFFER_DEGREES,
    ];

    const whereClause = `${ownerField} LIKE '%${escapeArcGIS(baseOwner)}%'`;
    const adjacentFeatures = await queryParcelsByEnvelope(
      config.parcel_layer_url,
      bufferedBbox,
      whereClause
    );

    if (adjacentFeatures.length > 0) {
      const parcelIdField = config.field_map.parcel_id;
      const seenApns = new Set(baseParcels.map((p) => p.apn));
      const additional = adjacentFeatures
        .filter((f) => {
          const apn = String(f.properties?.[parcelIdField] ?? '');
          return apn && !seenApns.has(apn);
        })
        .map((f) => featureToCandidate(f, config!.field_map, config!.parcel_layer_url));

      allParcels = [...baseParcels, ...additional];
    }
  }

  return {
    status: allParcels.length > 1 ? 'multiple' : 'found',
    parcels: allParcels,
    source: 'county_arcgis',
    county_fips: fipsResult.fips,
    county_name: fipsResult.county_name,
  };
}

function featureToCandidate(
  feature: GeoJSON.Feature,
  fieldMap: FieldMap,
  sourceUrl: string
): ParcelCandidate {
  const props = feature.properties ?? {};
  return {
    apn: String(props[fieldMap.parcel_id] ?? ''),
    geometry: feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
    acres: fieldMap.acres ? Number(props[fieldMap.acres]) || null : null,
    owner_of_record: fieldMap.owner_name ? String(props[fieldMap.owner_name] ?? '') || null : null,
    site_address: fieldMap.site_address ? String(props[fieldMap.site_address] ?? '') || null : null,
    source_url: sourceUrl,
  };
}

const STATE_FIPS_TO_ABBR: Record<string, string> = {
  '53': 'WA', '06': 'CA', '41': 'OR', '36': 'NY', '48': 'TX',
  '12': 'FL', '17': 'IL', '42': 'PA', '39': 'OH', '26': 'MI',
  '13': 'GA', '37': 'NC', '34': 'NJ', '51': 'VA', '25': 'MA',
  '04': 'AZ', '18': 'IN', '47': 'TN', '29': 'MO', '24': 'MD',
  '55': 'WI', '27': 'MN', '08': 'CO', '01': 'AL', '45': 'SC',
  '22': 'LA', '21': 'KY', '40': 'OK', '09': 'CT',
  '56': 'WY', '16': 'ID', '15': 'HI', '02': 'AK', '23': 'ME',
  '33': 'NH', '44': 'RI', '30': 'MT', '10': 'DE', '46': 'SD',
  '38': 'ND', '50': 'VT', '11': 'DC', '54': 'WV', '31': 'NE',
  '20': 'KS', '35': 'NM', '32': 'NV', '28': 'MS', '05': 'AR',
  '49': 'UT', '19': 'IA',
};

async function discoverEndpoint(
  countyName: string,
  stateFips: string,
  fips: string
): Promise<CountyGISConfig | null> {
  const stateAbbr = STATE_FIPS_TO_ABBR[stateFips] ?? '';
  const hubResults = await searchArcGISHub(countyName, stateAbbr);

  for (const result of hubResults) {
    const layerUrl = result.url.replace(/\/?$/, '/0');
    const meta = await fetchFeatureServerFields(layerUrl);
    if (!meta) continue;

    if (!meta.geometryType.includes('Polygon')) continue;

    const match = matchFields(meta.fields);
    if (!match) continue;

    return {
      id: '',
      fips,
      county_name: countyName,
      state: stateAbbr,
      parcel_layer_url: layerUrl,
      address_layer_url: null,
      field_map: match.field_map,
      discovery_method: 'auto',
      confidence: match.confidence,
      last_verified_at: null,
    };
  }

  return null;
}

function escapeArcGIS(value: string): string {
  return value
    .replace(/'/g, "''")
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}
