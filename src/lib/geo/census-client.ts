const CENSUS_GEOCODER_BASE = 'https://geocoding.geo.census.gov/geocoder';

export interface GeocodeResult {
  lat: number;
  lng: number;
  matchedAddress: string;
}

export interface CountyFipsResult {
  fips: string;
  county_name: string;
  state_fips: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    const params = new URLSearchParams({
      address,
      benchmark: 'Public_AR_Current',
      format: 'json',
    });
    const res = await fetch(`${CENSUS_GEOCODER_BASE}/locations/onelineaddress?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    const matches = data?.result?.addressMatches;
    if (!matches || matches.length === 0) return null;

    const match = matches[0];
    return {
      lat: match.coordinates.y,
      lng: match.coordinates.x,
      matchedAddress: match.matchedAddress,
    };
  } catch {
    return null;
  }
}

export async function resolveCountyFips(
  lat: number,
  lng: number
): Promise<CountyFipsResult | null> {
  try {
    const params = new URLSearchParams({
      x: String(lng),
      y: String(lat),
      benchmark: 'Public_AR_Current',
      vintage: 'Current_Current',
      layers: 'Counties',
      format: 'json',
    });
    const res = await fetch(`${CENSUS_GEOCODER_BASE}/geographies/coordinates?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    const counties = data?.result?.geographies?.Counties;
    if (!counties || counties.length === 0) return null;

    const county = counties[0];
    return {
      fips: county.GEOID,
      county_name: county.NAME,
      state_fips: county.STATE,
    };
  } catch {
    return null;
  }
}
