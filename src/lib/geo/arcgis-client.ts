const ARCGIS_HUB_SEARCH = 'https://www.arcgis.com/sharing/rest/search';

const PARCEL_KEYWORDS = ['parcel', 'tax', 'lot', 'cadastral', 'assessor'];

export interface HubSearchResult {
  title: string;
  url: string;
}

export interface FeatureServerMeta {
  fields: string[];
  geometryType: string;
}

export async function searchArcGISHub(
  countyName: string,
  state: string
): Promise<HubSearchResult[]> {
  // Try multiple query variations — Hub search results vary significantly by phrasing
  const queries = [
    `${countyName} County ${state} parcel`,
    `${countyName} ${state} parcel polygon`,
    `${countyName} County tax parcel`,
    `${countyName} parcel boundary`,
  ];

  const seen = new Set<string>();
  const allResults: HubSearchResult[] = [];

  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        q: query,
        type: 'Feature Service',
        num: '20',
        f: 'json',
      });
      const res = await fetch(`${ARCGIS_HUB_SEARCH}?${params}`);
      if (!res.ok) continue;

      const data = await res.json();
      for (const r of data.results ?? []) {
        const titleLower = (r.title ?? '').toLowerCase();
        const hasKeyword = PARCEL_KEYWORDS.some((kw) => titleLower.includes(kw));
        if (hasKeyword && r.url && !seen.has(r.url)) {
          seen.add(r.url);
          allResults.push({ title: r.title, url: r.url });
        }
      }
    } catch {
      continue;
    }

    // Stop early if we have enough candidates
    if (allResults.length >= 5) break;
  }

  return allResults;
}

export async function fetchFeatureServerFields(
  layerUrl: string
): Promise<FeatureServerMeta | null> {
  try {
    const res = await fetch(`${layerUrl}?f=json`);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.fields) return null;

    return {
      fields: data.fields.map((f: { name: string }) => f.name),
      geometryType: data.geometryType ?? '',
    };
  } catch {
    return null;
  }
}

export async function queryParcelsByPoint(
  layerUrl: string,
  lat: number,
  lng: number
): Promise<GeoJSON.Feature[]> {
  try {
    const params = new URLSearchParams({
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      outSR: '4326',
      f: 'geojson',
    });
    const res = await fetch(`${layerUrl}/query?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    return data.features ?? [];
  } catch {
    return [];
  }
}

export async function queryParcelsByEnvelope(
  layerUrl: string,
  bbox: [number, number, number, number],
  where?: string
): Promise<GeoJSON.Feature[]> {
  try {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const params = new URLSearchParams({
      geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      where: where ?? '1=1',
      outFields: '*',
      outSR: '4326',
      f: 'geojson',
    });
    const res = await fetch(`${layerUrl}/query?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    return data.features ?? [];
  } catch {
    return [];
  }
}
