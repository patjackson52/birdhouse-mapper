import type { Feature, FeatureCollection, Geometry } from 'geojson';

export type GeoSourceFormat = 'geojson' | 'shapefile' | 'kml' | 'kmz';

export type GeoLayerStatus = 'draft' | 'published';
export type GeoLayerSource = 'manual' | 'ai' | 'discovered';

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
  status: GeoLayerStatus;
  source: GeoLayerSource;
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
  status: GeoLayerStatus;
  source: GeoLayerSource;
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

/** A single feature tagged with its source layer info, used during discovery */
export interface DiscoveredFeature {
  feature: GeoJSON.Feature;
  sourceLayerId: string;
  sourceLayerName: string;
  sourceLayerColor: string;
  /** Other source layers that contain this same feature (duplicates) */
  duplicateSources?: Array<{ layerId: string; layerName: string }>;
}

/** A group of discovered features from a single source layer */
export interface FeatureGroup {
  layerId: string;
  layerName: string;
  layerColor: string;
  sourceFormat: GeoSourceFormat;
  features: DiscoveredFeature[];
}
