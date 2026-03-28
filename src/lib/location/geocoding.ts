export interface GeocodeResult {
  lat: number;
  lng: number;
}

export async function geocodeLocation(
  query: string
): Promise<GeocodeResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'birdhouse-mapper/1.0' },
    });
    if (!response.ok) return null;
    const results = await response.json();
    if (!results.length) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch {
    return null;
  }
}
