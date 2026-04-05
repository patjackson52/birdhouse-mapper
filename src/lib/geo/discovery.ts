import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import intersect from '@turf/intersect';
import { featureCollection } from '@turf/helpers';

type Bbox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

/**
 * Check if two bounding boxes overlap.
 * Bbox format: [minLng, minLat, maxLng, maxLat]
 */
export function bboxOverlaps(a: Bbox, b: Bbox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/**
 * Return features from `layer` that intersect the search area polygon.
 * Points: point-in-polygon. Polygons: turf intersect (clips). Lines: vertex-in-polygon.
 */
export function intersectFeaturesWithArea(
  layer: FeatureCollection,
  searchArea: Feature<Polygon | MultiPolygon>,
): Feature[] {
  const result: Feature[] = [];

  for (const feature of layer.features) {
    const geomType = feature.geometry.type;

    if (geomType === 'Point') {
      if (booleanPointInPolygon(feature.geometry.coordinates, searchArea)) {
        result.push(feature);
      }
    } else if (geomType === 'MultiPoint') {
      const coords = feature.geometry.coordinates;
      if (coords.some((c: number[]) => booleanPointInPolygon(c, searchArea))) {
        result.push(feature);
      }
    } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
      const clipped = intersect(
        featureCollection([feature as Feature<Polygon | MultiPolygon>, searchArea])
      );
      if (clipped) {
        clipped.properties = { ...feature.properties };
        result.push(clipped);
      }
    } else if (geomType === 'LineString') {
      const coords = feature.geometry.coordinates;
      if (coords.some((c: number[]) => booleanPointInPolygon(c, searchArea))) {
        result.push(feature);
      }
    } else if (geomType === 'MultiLineString') {
      const coords = feature.geometry.coordinates.flat();
      if (coords.some((c: number[]) => booleanPointInPolygon(c, searchArea))) {
        result.push(feature);
      }
    }
  }

  return result;
}

/**
 * Return a copy of the feature with source provenance injected into properties.
 * Does not mutate the original.
 */
export function injectProvenance(
  feature: Feature,
  sourceLayerId: string,
  sourceLayerName: string,
): Feature {
  return {
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      _source_layer_id: sourceLayerId,
      _source_layer_name: sourceLayerName,
    },
  };
}
