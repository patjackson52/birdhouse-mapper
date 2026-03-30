import type { ParsedFileData } from './types';

// Map of file extension → MIME type
const SUPPORTED_EXTENSIONS: Record<string, string> = {
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  geojson: 'application/geo+json',
  kml: 'application/vnd.google-earth.kml+xml',
  kmz: 'application/vnd.google-earth.kmz',
  gpx: 'application/gpx+xml',
  zip: 'application/zip',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const GEO_MIME_TYPES = new Set([
  'application/geo+json',
  'application/vnd.google-earth.kml+xml',
  'application/vnd.google-earth.kmz',
  'application/gpx+xml',
  'application/zip',
  'application/x-zip-compressed',
]);

const GEO_EXTENSIONS = new Set(['geojson', 'kml', 'kmz', 'gpx', 'zip']);

const BINARY_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.google-earth.kmz',
]);

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
]);

const MAX_TEXT_CHARS = 50_000;
const MAX_SAMPLE_ROWS = 10;

export function getSupportedMimeTypes(): string[] {
  return Object.values(SUPPORTED_EXTENSIONS);
}

export function getSupportedExtensions(): string[] {
  return Object.keys(SUPPORTED_EXTENSIONS);
}

export function isGeoFile(fileName: string, mimeType: string): boolean {
  if (GEO_MIME_TYPES.has(mimeType)) return true;
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return GEO_EXTENSIONS.has(ext);
}

function getExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function resolveType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = getExtension(file.name);
  return SUPPORTED_EXTENSIONS[ext] ?? file.type ?? 'application/octet-stream';
}

async function parseCSV(file: File): Promise<Pick<ParsedFileData, 'headers' | 'sampleRows'>> {
  const Papa = (await import('papaparse')).default;
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      preview: MAX_SAMPLE_ROWS,
      skipEmptyLines: true,
      complete(results) {
        const headers = results.meta.fields ?? [];
        const sampleRows = (results.data as Record<string, string>[]).map((row) =>
          headers.map((h) => String(row[h] ?? ''))
        );
        resolve({ headers, sampleRows });
      },
      error(err) {
        reject(err);
      },
    });
  });
}

async function parseXLSX(file: File): Promise<Pick<ParsedFileData, 'headers' | 'sampleRows'>> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], sampleRows: [] };
  const sheet = workbook.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length === 0) return { headers: [], sampleRows: [] };
  const headers = rows[0].map(String);
  const sampleRows = rows.slice(1, MAX_SAMPLE_ROWS + 1).map((r) => r.map(String));
  return { headers, sampleRows };
}

function parseGeoJSON(text: string): GeoJSON.Feature[] {
  const parsed = JSON.parse(text);
  if (parsed.type === 'FeatureCollection') {
    return parsed.features as GeoJSON.Feature[];
  }
  if (parsed.type === 'Feature') {
    return [parsed as GeoJSON.Feature];
  }
  // bare geometry
  return [{ type: 'Feature', geometry: parsed as GeoJSON.Geometry, properties: {} }];
}

function kmlPlacemarkToFeature(placemark: Element): GeoJSON.Feature | null {
  const name = placemark.querySelector('name')?.textContent ?? '';
  const description = placemark.querySelector('description')?.textContent ?? null;

  // Point
  const pointEl = placemark.querySelector('Point > coordinates');
  if (pointEl) {
    const [lng, lat, alt] = pointEl.textContent!.trim().split(',').map(Number);
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: alt !== undefined ? [lng, lat, alt] : [lng, lat],
      } as GeoJSON.Geometry,
      properties: { name, description },
    };
  }

  // LineString
  const lineEl = placemark.querySelector('LineString > coordinates');
  if (lineEl) {
    const coords = lineEl.textContent!.trim().split(/\s+/).map((c) => {
      const [lng, lat] = c.split(',').map(Number);
      return [lng, lat] as [number, number];
    });
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords } as GeoJSON.Geometry,
      properties: { name, description },
    };
  }

  // Polygon
  const polyEl = placemark.querySelector('Polygon outerBoundaryIs LinearRing coordinates');
  if (polyEl) {
    const coords = polyEl.textContent!.trim().split(/\s+/).map((c) => {
      const [lng, lat] = c.split(',').map(Number);
      return [lng, lat] as [number, number];
    });
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords] } as GeoJSON.Geometry,
      properties: { name, description },
    };
  }

  return null;
}

function parseKML(text: string): GeoJSON.Feature[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const placemarks = Array.from(doc.querySelectorAll('Placemark'));
  return placemarks.flatMap((p) => {
    const f = kmlPlacemarkToFeature(p);
    return f ? [f] : [];
  });
}

function parseGPX(text: string): GeoJSON.Feature[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const features: GeoJSON.Feature[] = [];

  // Waypoints
  const wpts = Array.from(doc.querySelectorAll('wpt'));
  for (const wpt of wpts) {
    const lat = parseFloat(wpt.getAttribute('lat') ?? '0');
    const lng = parseFloat(wpt.getAttribute('lon') ?? '0');
    const name = wpt.querySelector('name')?.textContent ?? '';
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] } as GeoJSON.Geometry,
      properties: { name },
    });
  }

  // Tracks
  const trks = Array.from(doc.querySelectorAll('trk'));
  for (const trk of trks) {
    const name = trk.querySelector('name')?.textContent ?? '';
    const trkpts = Array.from(trk.querySelectorAll('trkpt'));
    const coords: [number, number][] = trkpts.map((pt) => [
      parseFloat(pt.getAttribute('lon') ?? '0'),
      parseFloat(pt.getAttribute('lat') ?? '0'),
    ]);
    if (coords.length > 0) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords } as GeoJSON.Geometry,
        properties: { name },
      });
    }
  }

  // Routes
  const rtes = Array.from(doc.querySelectorAll('rte'));
  for (const rte of rtes) {
    const name = rte.querySelector('name')?.textContent ?? '';
    const rtepts = Array.from(rte.querySelectorAll('rtept'));
    const coords: [number, number][] = rtepts.map((pt) => [
      parseFloat(pt.getAttribute('lon') ?? '0'),
      parseFloat(pt.getAttribute('lat') ?? '0'),
    ]);
    if (coords.length > 0) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords } as GeoJSON.Geometry,
        properties: { name },
      });
    }
  }

  return features;
}

async function toBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function parseFileForAnalysis(file: File): Promise<ParsedFileData> {
  const mimeType = resolveType(file);
  const base: Omit<ParsedFileData, 'textContent' | 'headers' | 'sampleRows' | 'geoFeatures' | 'base64Content'> = {
    fileName: file.name,
    mimeType,
    fileSize: file.size,
    sourceType: 'file',
  };

  // CSV
  if (mimeType === 'text/csv' || mimeType === 'text/tab-separated-values') {
    const { headers, sampleRows } = await parseCSV(file);
    return { ...base, headers, sampleRows };
  }

  // XLSX / XLS
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) {
    const { headers, sampleRows } = await parseXLSX(file);
    return { ...base, headers, sampleRows };
  }

  // GeoJSON
  if (mimeType === 'application/geo+json' || getExtension(file.name) === 'geojson') {
    const text = await file.text();
    const geoFeatures = parseGeoJSON(text);
    return { ...base, geoFeatures };
  }

  // KML
  if (mimeType === 'application/vnd.google-earth.kml+xml' || getExtension(file.name) === 'kml') {
    const text = await file.text();
    const geoFeatures = parseKML(text);
    return { ...base, geoFeatures };
  }

  // GPX
  if (mimeType === 'application/gpx+xml' || getExtension(file.name) === 'gpx') {
    const text = await file.text();
    const geoFeatures = parseGPX(text);
    return { ...base, geoFeatures };
  }

  // Binary (images, PDFs, DOCX, PPTX, KMZ)
  if (BINARY_MIME_TYPES.has(mimeType)) {
    const base64Content = await toBase64(file);
    return { ...base, base64Content };
  }

  // Plain text, Markdown, JSON
  if (TEXT_MIME_TYPES.has(mimeType) || mimeType.startsWith('text/')) {
    const text = await file.text();
    return { ...base, textContent: text.slice(0, MAX_TEXT_CHARS) };
  }

  // Fallback: try as text
  try {
    const text = await file.text();
    return { ...base, textContent: text.slice(0, MAX_TEXT_CHARS) };
  } catch {
    const base64Content = await toBase64(file);
    return { ...base, base64Content };
  }
}
