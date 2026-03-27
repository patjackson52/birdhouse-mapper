import { describe, it, expect } from 'vitest';
import { parseFileForAnalysis, getSupportedMimeTypes, isGeoFile } from '@/lib/ai-context/parsers';

describe('getSupportedMimeTypes', () => {
  it('returns a set of accepted MIME types', () => {
    const types = getSupportedMimeTypes();
    expect(types).toContain('text/csv');
    expect(types).toContain('application/pdf');
    expect(types).toContain('image/jpeg');
    expect(types).toContain('application/geo+json');
  });
});

describe('isGeoFile', () => {
  it('identifies GeoJSON files', () => {
    expect(isGeoFile('data.geojson', 'application/geo+json')).toBe(true);
  });
  it('identifies KML files', () => {
    expect(isGeoFile('map.kml', 'application/vnd.google-earth.kml+xml')).toBe(true);
  });
  it('identifies GPX files', () => {
    expect(isGeoFile('track.gpx', 'application/gpx+xml')).toBe(true);
  });
  it('rejects non-geo files', () => {
    expect(isGeoFile('photo.jpg', 'image/jpeg')).toBe(false);
  });
});

describe('parseFileForAnalysis', () => {
  it('parses CSV text into headers and sample rows', async () => {
    const csvContent = 'name,lat,lng\nNest 1,43.5,-70.2\nNest 2,43.6,-70.3';
    const file = new File([csvContent], 'nests.csv', { type: 'text/csv' });
    const result = await parseFileForAnalysis(file);
    expect(result.fileName).toBe('nests.csv');
    expect(result.mimeType).toBe('text/csv');
    expect(result.sourceType).toBe('file');
    expect(result.headers).toEqual(['name', 'lat', 'lng']);
    expect(result.sampleRows).toHaveLength(2);
    expect(result.sampleRows![0]).toEqual(['Nest 1', '43.5', '-70.2']);
  });

  it('parses GeoJSON into features', async () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-70.2, 43.5] }, properties: { name: 'Nest 1' } }],
    });
    const file = new File([geojson], 'points.geojson', { type: 'application/geo+json' });
    const result = await parseFileForAnalysis(file);
    expect(result.geoFeatures).toHaveLength(1);
    expect(result.geoFeatures![0].geometry.type).toBe('Point');
  });

  it('parses plain text as textContent', async () => {
    const text = 'Our organization monitors shorebird populations along the Maine coast.';
    const file = new File([text], 'notes.txt', { type: 'text/plain' });
    const result = await parseFileForAnalysis(file);
    expect(result.textContent).toBe(text);
    expect(result.sourceType).toBe('file');
  });

  it('encodes images as base64', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222]);
    const file = new File([pngBytes], 'photo.png', { type: 'image/png' });
    const result = await parseFileForAnalysis(file);
    expect(result.base64Content).toBeDefined();
    expect(result.base64Content!.length).toBeGreaterThan(0);
  });

  it('parses JSON files as textContent', async () => {
    const json = JSON.stringify({ species: ['Piping Plover', 'Least Tern'] });
    const file = new File([json], 'species.json', { type: 'application/json' });
    const result = await parseFileForAnalysis(file);
    expect(result.textContent).toBeDefined();
  });
});
