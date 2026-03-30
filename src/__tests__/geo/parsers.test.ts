import { describe, it, expect } from 'vitest';
import { parseGeoFile, detectGeoFormat, validateGeoJSON } from '@/lib/geo/parsers';

describe('detectGeoFormat', () => {
  it('detects .geojson files', () => {
    expect(detectGeoFormat('zones.geojson', 'application/geo+json')).toBe('geojson');
  });

  it('detects .json files with geo content type', () => {
    expect(detectGeoFormat('data.json', 'application/geo+json')).toBe('geojson');
  });

  it('detects .kml files', () => {
    expect(detectGeoFormat('map.kml', 'application/vnd.google-earth.kml+xml')).toBe('kml');
  });

  it('detects .kmz files', () => {
    expect(detectGeoFormat('map.kmz', 'application/vnd.google-earth.kmz')).toBe('kmz');
  });

  it('detects .zip files as shapefile', () => {
    expect(detectGeoFormat('parcels.zip', 'application/zip')).toBe('shapefile');
  });

  it('returns null for non-geo files', () => {
    expect(detectGeoFormat('photo.jpg', 'image/jpeg')).toBeNull();
  });
});

describe('validateGeoJSON', () => {
  it('accepts a valid FeatureCollection', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-70.2, 43.5] },
        properties: { name: 'Test' },
      }],
    };
    const result = validateGeoJSON(fc as GeoJSON.FeatureCollection);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.featureCount).toBe(1);
  });

  it('rejects coordinates out of range', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [200, 43.5] },
        properties: {},
      }],
    };
    const result = validateGeoJSON(fc as GeoJSON.FeatureCollection);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('range');
  });

  it('warns on high feature count', () => {
    const features = Array.from({ length: 1001 }, (_, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [-70 + i * 0.001, 43.5] },
      properties: {},
    }));
    const fc = { type: 'FeatureCollection' as const, features };
    const result = validateGeoJSON(fc);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('1001');
  });

  it('rejects unsupported geometry types', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'GeometryCollection', geometries: [] },
        properties: {},
      }],
    };
    const result = validateGeoJSON(fc as GeoJSON.FeatureCollection);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('GeometryCollection');
  });
});

describe('parseGeoFile', () => {
  it('parses a GeoJSON file', async () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-70, 43], [-70, 44], [-69, 44], [-69, 43], [-70, 43]]] }, properties: { zone: 'wetland' } },
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-71, 43], [-71, 44], [-70, 44], [-70, 43], [-71, 43]]] }, properties: { zone: 'forest' } },
      ],
    });
    const file = new File([geojson], 'zones.geojson', { type: 'application/geo+json' });
    const result = await parseGeoFile(file);
    expect(result.name).toBe('zones');
    expect(result.sourceFormat).toBe('geojson');
    expect(result.featureCount).toBe(2);
    expect(result.geojson.features).toHaveLength(2);
    expect(result.bbox).toBeDefined();
    expect(result.geometryTypes).toContain('Polygon');
  });

  it('parses a KML file', async () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Test Point</name>
      <Point><coordinates>-70.2,43.5,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;
    const file = new File([kml], 'markers.kml', { type: 'application/vnd.google-earth.kml+xml' });
    const result = await parseGeoFile(file);
    expect(result.sourceFormat).toBe('kml');
    expect(result.featureCount).toBe(1);
    expect(result.geojson.features[0].geometry.type).toBe('Point');
  });

  it('parses a single Feature GeoJSON (wraps in FeatureCollection)', async () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-70.2, 43.5] },
      properties: { name: 'Single' },
    });
    const file = new File([geojson], 'single.geojson', { type: 'application/geo+json' });
    const result = await parseGeoFile(file);
    expect(result.geojson.type).toBe('FeatureCollection');
    expect(result.featureCount).toBe(1);
  });

  it('throws on unsupported format', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await expect(parseGeoFile(file)).rejects.toThrow('Unsupported');
  });
});
