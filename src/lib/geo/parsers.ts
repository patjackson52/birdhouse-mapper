import type { FeatureCollection, Feature, Position } from 'geojson';
import type { GeoSourceFormat, ParsedGeoLayer, GeoValidationResult } from './types';
import bbox from '@turf/bbox';
import { featureCollection } from '@turf/helpers';

const VALID_GEOMETRY_TYPES = new Set([
  'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon',
]);

const FORMAT_BY_EXTENSION: Record<string, GeoSourceFormat> = {
  geojson: 'geojson',
  kml: 'kml',
  kmz: 'kmz',
  zip: 'shapefile',
};

const FORMAT_BY_MIME: Record<string, GeoSourceFormat> = {
  'application/geo+json': 'geojson',
  'application/vnd.google-earth.kml+xml': 'kml',
  'application/vnd.google-earth.kmz': 'kmz',
  'application/zip': 'shapefile',
  'application/x-zip-compressed': 'shapefile',
};

export function detectGeoFormat(fileName: string, mimeType: string): GeoSourceFormat | null {
  if (FORMAT_BY_MIME[mimeType]) return FORMAT_BY_MIME[mimeType];
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return FORMAT_BY_EXTENSION[ext] ?? null;
}

/** Extract all coordinate arrays from a geometry for validation */
function extractCoordinates(geometry: GeoJSON.Geometry): Position[] {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates];
    case 'MultiPoint':
    case 'LineString':
      return geometry.coordinates;
    case 'MultiLineString':
    case 'Polygon':
      return geometry.coordinates.flat();
    case 'MultiPolygon':
      return geometry.coordinates.flat(2);
    default:
      return [];
  }
}

export function validateGeoJSON(fc: FeatureCollection): GeoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < fc.features.length; i++) {
    const feature = fc.features[i];
    const geomType = feature.geometry?.type;

    if (!geomType || !VALID_GEOMETRY_TYPES.has(geomType)) {
      errors.push(`Feature ${i}: unsupported geometry type "${geomType}". Supported: ${[...VALID_GEOMETRY_TYPES].join(', ')}`);
      continue;
    }

    const coords = extractCoordinates(feature.geometry);
    for (const [lng, lat] of coords) {
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        errors.push(`Feature ${i}: coordinates out of range (lng: ${lng}, lat: ${lat}). Expected lng -180..180, lat -90..90`);
        break; // one error per feature is enough
      }
    }
  }

  if (fc.features.length > 1000) {
    warnings.push(`${fc.features.length} features detected. Large datasets may impact performance. Consider simplifying.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    featureCount: fc.features.length,
  };
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

async function parseGeoJSON(file: File): Promise<FeatureCollection> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (parsed.type === 'FeatureCollection') return parsed;
  if (parsed.type === 'Feature') {
    return { type: 'FeatureCollection', features: [parsed] };
  }
  // Bare geometry
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: parsed, properties: {} }] };
}

async function parseKML(file: File): Promise<FeatureCollection> {
  const { kml: kmlToGeoJSON } = await import('@tmcw/togeojson');
  const text = await file.text();
  const dom = new DOMParser().parseFromString(text, 'application/xml');
  return kmlToGeoJSON(dom) as FeatureCollection;
}

async function parseKMZ(file: File): Promise<FeatureCollection> {
  const JSZip = (await import('jszip')).default;
  const { kml: kmlToGeoJSON } = await import('@tmcw/togeojson');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const kmlFile = Object.keys(zip.files).find((name) => name.endsWith('.kml'));
  if (!kmlFile) throw new Error('KMZ archive does not contain a .kml file');
  const kmlText = await zip.files[kmlFile].async('string');
  const dom = new DOMParser().parseFromString(kmlText, 'application/xml');
  return kmlToGeoJSON(dom) as FeatureCollection;
}

async function parseShapefile(file: File): Promise<FeatureCollection> {
  const shp = await import('shpjs');
  const buffer = await file.arrayBuffer();
  const result = await shp.default(buffer);
  // shpjs can return a single FeatureCollection or an array of them (multiple layers in zip)
  if (Array.isArray(result)) {
    // Merge all features into one collection
    const allFeatures: Feature[] = result.flatMap((fc) => fc.features);
    return { type: 'FeatureCollection', features: allFeatures };
  }
  return result;
}

export async function parseGeoFile(file: File): Promise<ParsedGeoLayer> {
  const format = detectGeoFormat(file.name, file.type);
  if (!format) throw new Error(`Unsupported geo file format: ${file.name}`);

  let fc: FeatureCollection;
  switch (format) {
    case 'geojson':
      fc = await parseGeoJSON(file);
      break;
    case 'kml':
      fc = await parseKML(file);
      break;
    case 'kmz':
      fc = await parseKMZ(file);
      break;
    case 'shapefile':
      fc = await parseShapefile(file);
      break;
  }

  const geometryTypes = [...new Set(fc.features.map((f) => f.geometry?.type).filter(Boolean))];
  const computedBbox = bbox(featureCollection(fc.features)) as [number, number, number, number];

  return {
    name: stripExtension(file.name),
    sourceFormat: format,
    sourceFilename: file.name,
    geojson: fc,
    featureCount: fc.features.length,
    bbox: computedBbox,
    geometryTypes,
  };
}
