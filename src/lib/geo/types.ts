import type { Feature, FeatureCollection, Geometry } from 'geojson';

export type GeoSourceFormat = 'geojson' | 'shapefile' | 'kml' | 'kmz';

export type GeoLayerStatus = 'draft' | 'published';
export type GeoLayerSource = 'manual' | 'ai' | 'discovered' | 'parcel_lookup';

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

// --- Parcel Lookup Types ---

export interface FieldMap {
  parcel_id: string;
  owner_name?: string;
  site_address?: string;
  house_number?: string;
  street_name?: string;
  acres?: string;
  address_link_field?: string;
}

export interface CountyGISConfig {
  id: string;
  fips: string;
  county_name: string;
  state: string;
  parcel_layer_url: string;
  address_layer_url: string | null;
  field_map: FieldMap;
  discovery_method: 'manual' | 'auto';
  confidence: 'high' | 'medium' | 'low';
  last_verified_at: string | null;
}

export interface ParcelCandidate {
  apn: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  acres: number | null;
  owner_of_record: string | null;
  site_address: string | null;
  source_url: string;
}

export type ParcelLookupStatus = 'found' | 'multiple' | 'not_found' | 'error';

export interface ParcelLookupResult {
  status: ParcelLookupStatus;
  parcels: ParcelCandidate[];
  source: 'county_arcgis' | null;
  county_fips: string | null;
  county_name: string | null;
  error_message?: string;
}
