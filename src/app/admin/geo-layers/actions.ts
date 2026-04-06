'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { GeoLayer, GeoLayerSummary, GeoLayerProperty, GeoSourceFormat } from '@/lib/geo/types';
import type { FeatureCollection } from 'geojson';

interface CreateGeoLayerInput {
  orgId: string;
  name: string;
  description?: string;
  geojson: FeatureCollection;
  sourceFormat: GeoSourceFormat;
  sourceFilename: string;
  color: string;
  opacity: number;
  featureCount: number;
  bbox: [number, number, number, number] | null;
  isPropertyBoundary: boolean;
  status?: 'draft' | 'published';
  source?: 'manual' | 'ai' | 'discovered';
}

export async function createGeoLayer(
  input: CreateGeoLayerInput
): Promise<{ success: true; layerId: string } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('geo_layers')
    .insert({
      org_id: input.orgId,
      name: input.name,
      description: input.description ?? null,
      color: input.color,
      opacity: input.opacity,
      source_format: input.sourceFormat,
      source_filename: input.sourceFilename,
      geojson: input.geojson,
      feature_count: input.featureCount,
      bbox: input.bbox,
      is_property_boundary: input.isPropertyBoundary,
      created_by: user.id,
      status: input.status ?? 'draft',
      source: input.source ?? 'manual',
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { success: true, layerId: data.id };
}

export async function listGeoLayers(
  orgId: string
): Promise<{ success: true; layers: GeoLayerSummary[] } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('geo_layers')
    .select('id, org_id, name, description, color, opacity, source_format, source_filename, feature_count, bbox, is_property_boundary, created_at, created_by, status, source')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };
  return { success: true, layers: data as GeoLayerSummary[] };
}

export async function getGeoLayer(
  layerId: string
): Promise<{ success: true; layer: GeoLayer } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('geo_layers')
    .select('*')
    .eq('id', layerId)
    .single();

  if (error) return { error: error.message };
  return { success: true, layer: data as GeoLayer };
}

export async function updateGeoLayer(
  layerId: string,
  updates: { name?: string; description?: string; color?: string; opacity?: number; is_property_boundary?: boolean }
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('geo_layers')
    .update(updates)
    .eq('id', layerId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteGeoLayer(
  layerId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Clear boundary_layer_id on any properties using this layer
  const serviceClient = createServiceClient();
  await serviceClient
    .from('properties')
    .update({ boundary_layer_id: null })
    .eq('boundary_layer_id', layerId);

  const { error } = await supabase
    .from('geo_layers')
    .delete()
    .eq('id', layerId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function assignLayerToProperties(
  layerId: string,
  orgId: string,
  propertyIds: string[],
  visibleDefault: boolean = true
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Remove existing assignments for this layer
  await supabase
    .from('geo_layer_properties')
    .delete()
    .eq('geo_layer_id', layerId);

  if (propertyIds.length === 0) return { success: true };

  const rows = propertyIds.map((propertyId) => ({
    geo_layer_id: layerId,
    property_id: propertyId,
    org_id: orgId,
    visible_default: visibleDefault,
  }));

  const { error } = await supabase
    .from('geo_layer_properties')
    .insert(rows);

  if (error) return { error: error.message };
  return { success: true };
}

export async function getOrgLayerAssignments(
  orgId: string
): Promise<{ success: true; assignments: GeoLayerProperty[] } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('geo_layer_properties')
    .select('*')
    .eq('org_id', orgId);

  if (error) return { error: error.message };
  return { success: true, assignments: (data ?? []) as GeoLayerProperty[] };
}

export async function getPropertyGeoLayers(
  propertyId: string
): Promise<{ success: true; layers: GeoLayerSummary[]; assignments: GeoLayerProperty[] } | { error: string }> {
  const supabase = createClient();

  const { data: assignments, error: assignError } = await supabase
    .from('geo_layer_properties')
    .select('*')
    .eq('property_id', propertyId);

  if (assignError) return { error: assignError.message };
  if (!assignments || assignments.length === 0) {
    return { success: true, layers: [], assignments: [] };
  }

  const layerIds = assignments.map((a: GeoLayerProperty) => a.geo_layer_id);

  const { data: layers, error: layerError } = await supabase
    .from('geo_layers')
    .select('id, org_id, name, description, color, opacity, source_format, source_filename, feature_count, bbox, is_property_boundary, created_at, created_by, status, source')
    .in('id', layerIds);

  if (layerError) return { error: layerError.message };
  return { success: true, layers: layers as GeoLayerSummary[], assignments: assignments as GeoLayerProperty[] };
}

export async function setPropertyBoundary(
  propertyId: string,
  boundaryLayerId: string | null
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('properties')
    .update({ boundary_layer_id: boundaryLayerId })
    .eq('id', propertyId);

  if (error) return { error: error.message };
  return { success: true };
}

/** Create a geo layer using the service client (bypasses RLS — used during onboarding) */
export async function createGeoLayerService(
  input: CreateGeoLayerInput & { createdBy: string }
): Promise<{ success: true; layerId: string } | { error: string }> {
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from('geo_layers')
    .insert({
      org_id: input.orgId,
      name: input.name,
      description: input.description ?? null,
      color: input.color,
      opacity: input.opacity,
      source_format: input.sourceFormat,
      source_filename: input.sourceFilename,
      geojson: input.geojson,
      feature_count: input.featureCount,
      bbox: input.bbox,
      is_property_boundary: input.isPropertyBoundary,
      created_by: input.createdBy,
      status: input.status ?? 'draft',
      source: input.source ?? 'manual',
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { success: true, layerId: data.id };
}

/**
 * Public (no-auth) version of getPropertyGeoLayers — used on the public map page.
 * RLS allows anon reads on geo_layers and geo_layer_properties.
 */
export async function getPropertyGeoLayersPublic(
  propertyId: string
): Promise<{ success: true; layers: GeoLayerSummary[]; assignments: GeoLayerProperty[] } | { error: string }> {
  const supabase = createClient();

  const { data: assignments, error: assignError } = await supabase
    .from('geo_layer_properties')
    .select('*')
    .eq('property_id', propertyId);

  if (assignError) return { error: assignError.message };
  if (!assignments || assignments.length === 0) {
    return { success: true, layers: [], assignments: [] };
  }

  const layerIds = assignments.map((a: GeoLayerProperty) => a.geo_layer_id);

  const { data: layers, error: layerError } = await supabase
    .from('geo_layers')
    .select('id, org_id, name, description, color, opacity, source_format, source_filename, feature_count, bbox, is_property_boundary, created_at, created_by, status, source')
    .in('id', layerIds);

  if (layerError) return { error: layerError.message };
  return { success: true, layers: layers as GeoLayerSummary[], assignments: assignments as GeoLayerProperty[] };
}

/**
 * Public (no-auth) version of getGeoLayer — used on the public map page.
 * RLS allows anon reads on geo_layers.
 */
export async function getGeoLayerPublic(
  layerId: string
): Promise<{ success: true; layer: GeoLayer } | { error: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('geo_layers')
    .select('*')
    .eq('id', layerId)
    .single();

  if (error) return { error: error.message };
  return { success: true, layer: data as GeoLayer };
}

export async function publishGeoLayer(
  layerId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('geo_layers')
    .update({ status: 'published' })
    .eq('id', layerId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function unpublishGeoLayer(
  layerId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('geo_layers')
    .update({ status: 'draft' })
    .eq('id', layerId);

  if (error) return { error: error.message };
  return { success: true };
}

/** Assign layer to property using service client (bypasses RLS — used during onboarding) */
export async function assignLayerToPropertyService(
  layerId: string,
  propertyId: string,
  orgId: string,
  visibleDefault: boolean = true
): Promise<{ success: true } | { error: string }> {
  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from('geo_layer_properties')
    .insert({
      geo_layer_id: layerId,
      property_id: propertyId,
      org_id: orgId,
      visible_default: visibleDefault,
    });

  if (error) return { error: error.message };
  return { success: true };
}
