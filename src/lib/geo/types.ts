import type { Feature, FeatureCollection, Geometry } from 'geojson';

export type GeoSourceFormat = 'geojson' | 'shapefile' | 'kml' | 'kmz';

export interface GeoLayer {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  color: string;
  opacity: number;
  source_format: GeoSourceFormat;
  source_filename: string;
  geojson: FeatureCollection;
  feature_count: number;
  bbox: [number, number, number, number] | null; // [minLng, minLat, maxLng, maxLat]
  is_property_boundary: boolean;
  created_at: string;
  created_by: string | null;
}

export interface GeoLayerProperty {
  geo_layer_id: string;
  property_id: string;
  org_id: string;
  visible_default: boolean;
}

/** Lightweight version of GeoLayer without the full geojson payload — used in list views */
export interface GeoLayerSummary {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  color: string;
  opacity: number;
  source_format: GeoSourceFormat;
  source_filename: string;
  feature_count: number;
  bbox: [number, number, number, number] | null;
  is_property_boundary: boolean;
  created_at: string;
  created_by: string | null;
}

/** Result of parsing an uploaded geo file, before storage */
export interface ParsedGeoLayer {
  name: string;
  sourceFormat: GeoSourceFormat;
  sourceFilename: string;
  geojson: FeatureCollection;
  featureCount: number;
  bbox: [number, number, number, number];
  geometryTypes: string[]; // unique geometry types found (e.g. ['Polygon', 'MultiPolygon'])
}

/** Validation result from geo file parsing */
export interface GeoValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  featureCount: number;
}
