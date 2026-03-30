import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import intersect from '@turf/intersect';
import { featureCollection } from '@turf/helpers';

interface ItemWithLocation {
  id: string;
  latitude: number;
  longitude: number;
}

/** Get the first Polygon or MultiPolygon from a FeatureCollection (used as boundary) */
function getBoundaryPolygon(boundary: FeatureCollection): Feature<Polygon | MultiPolygon> | null {
  for (const feature of boundary.features) {
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      return feature as Feature<Polygon | MultiPolygon>;
    }
  }
  return null;
}

/** Filter items to only those within the boundary polygon */
export function filterItemsByBoundary<T extends ItemWithLocation>(
  items: T[],
  boundary: FeatureCollection,
): T[] {
  const polygon = getBoundaryPolygon(boundary);
  if (!polygon) return items;

  return items.filter((item) =>
    booleanPointInPolygon([item.longitude, item.latitude], polygon)
  );
}

/** Clip a layer's features to a boundary polygon */
export function clipLayerToBoundary(
  layer: FeatureCollection,
  boundary: FeatureCollection,
): FeatureCollection {
  const polygon = getBoundaryPolygon(boundary);
  if (!polygon) return layer;

  const clippedFeatures: Feature[] = [];

  for (const feature of layer.features) {
    const geomType = feature.geometry.type;

    if (geomType === 'Point' || geomType === 'MultiPoint') {
      if (geomType === 'Point') {
        if (booleanPointInPolygon(feature.geometry.coordinates, polygon)) {
          clippedFeatures.push(feature);
        }
      } else {
        const coords = feature.geometry.coordinates;
        if (coords.some((c: number[]) => booleanPointInPolygon(c, polygon))) {
          clippedFeatures.push(feature);
        }
      }
    } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
      const clipped = intersect(featureCollection([feature as Feature<Polygon | MultiPolygon>, polygon]));
      if (clipped) {
        clipped.properties = { ...feature.properties };
        clippedFeatures.push(clipped);
      }
    } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
      const coords = geomType === 'LineString'
        ? feature.geometry.coordinates
        : feature.geometry.coordinates.flat();
      if (coords.some((c: number[]) => booleanPointInPolygon(c, polygon))) {
        clippedFeatures.push(feature);
      }
    }
  }

  return { type: 'FeatureCollection', features: clippedFeatures };
}
