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
  try {
    const query = `${countyName} ${state} parcel polygon`;
    const params = new URLSearchParams({
      q: query,
      type: 'Feature Service',
      num: '20',
      f: 'json',
    });
    const res = await fetch(`${ARCGIS_HUB_SEARCH}?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    const results: HubSearchResult[] = (data.results ?? [])
      .filter((r: { title: string; type: string }) => {
        const titleLower = r.title.toLowerCase();
        return PARCEL_KEYWORDS.some((kw) => titleLower.includes(kw));
      })
      .map((r: { title: string; url: string }) => ({
        title: r.title,
        url: r.url,
      }));

    return results;
  } catch {
    return [];
  }
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
