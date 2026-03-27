export type AiContextSourceType = 'file' | 'url' | 'text';
export type AiContextProcessingStatus = 'pending' | 'processing' | 'complete' | 'error';
export type GeoFeatureGeometryType = 'point' | 'polygon' | 'linestring';
export type GeoFeatureStatus = 'pending' | 'approved' | 'placed';

export interface AiContextItem {
  id: string;
  org_id: string;
  uploaded_by: string;
  source_type: AiContextSourceType;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  storage_path: string | null;
  content_summary: string | null;
  processing_status: AiContextProcessingStatus;
  processing_error: string | null;
  batch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiContextSummary {
  id: string;
  org_id: string;
  org_profile: string;
  content_map: ContentMapEntry[];
  last_rebuilt_at: string;
  version: number;
}

export interface ContentMapEntry {
  item_id: string;
  filename: string;
  summary: string;
}

export interface AiContextGeoFeature {
  id: string;
  org_id: string;
  source_item_id: string;
  name: string;
  description: string | null;
  geometry_type: GeoFeatureGeometryType;
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
  confidence: number;
  status: GeoFeatureStatus;
  placed_item_id: string | null;
  created_at: string;
}

export interface BatchStatusResponse {
  items: Array<{
    id: string;
    processing_status: AiContextProcessingStatus;
    content_summary: string | null;
    geo_count: number;
  }>;
  summary_ready: boolean;
}

export interface FileAnalysisResult {
  content_summary: string;
  geo_features: Array<{
    name: string;
    description: string | null;
    geometry_type: GeoFeatureGeometryType;
    geometry: GeoJSON.Geometry;
    properties: Record<string, unknown>;
    confidence: number;
  }>;
  suggested_org_metadata: {
    name: string | null;
    tagline: string | null;
    location_name: string | null;
    lat: number | null;
    lng: number | null;
    org_type: string | null;
    purpose: string | null;
  };
}

export interface OnboardingPreFill {
  orgName: string | null;
  tagline: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  zoom: number | null;
  themePreset: string | null;
  itemTypes: Array<{ name: string; icon: string; color: string }> | null;
  entityTypes: Array<{
    name: string;
    icon: string;
    color: string;
    link_to: string[];
    fields: Array<{ name: string; field_type: string; options?: string[]; required?: boolean }>;
  }> | null;
  aboutContent: string | null;
}

export interface ParsedFileData {
  fileName: string;
  mimeType: string;
  fileSize: number;
  sourceType: AiContextSourceType;
  textContent?: string;
  headers?: string[];
  sampleRows?: string[][];
  geoFeatures?: GeoJSON.Feature[];
  base64Content?: string;
  url?: string;
}
