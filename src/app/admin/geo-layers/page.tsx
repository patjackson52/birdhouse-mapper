'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';

const ImportFlow = dynamic(() => import('@/components/geo/ImportFlow'), {
  ssr: false,
  loading: () => <p className="text-gray-500 p-4">Loading import wizard...</p>,
});
import {
  createGeoLayer,
  listGeoLayers,
  updateGeoLayer,
  deleteGeoLayer,
  assignLayerToProperties,
  getOrgLayerAssignments,
  publishGeoLayer,
  unpublishGeoLayer,
} from './actions';
import type { GeoLayerSummary, GeoLayerProperty } from '@/lib/geo/types';

export default function GeoLayersAdminPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [layers, setLayers] = useState<GeoLayerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showAiImport, setShowAiImport] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
  const [assignments, setAssignments] = useState<GeoLayerProperty[]>([]);
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('org_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data?.org_id) setOrgId(data.org_id);
        });
    });
  }, []);

  const loadLayers = useCallback(async () => {
    if (!orgId) return;
    const result = await listGeoLayers(orgId);
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setLayers(result.layers);
    }
    setLoading(false);
  }, [orgId]);

  const loadAssignments = useCallback(async () => {
    if (!orgId) return;
    const result = await getOrgLayerAssignments(orgId);
    if (!('error' in result)) {
      setAssignments(result.assignments);
    }
  }, [orgId]);

  useEffect(() => {
    loadLayers();
    loadAssignments();
  }, [loadLayers, loadAssignments]);

  useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    supabase
      .from('properties')
      .select('id, name, slug')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setProperties(data.map((p: { id: string; name: string; slug: string }) => ({ id: p.id, name: p.name || p.slug })));
        }
      });
  }, [orgId]);

  function getAssignedPropertyIds(layerId: string): Set<string> {
    return new Set(
      assignments.filter((a) => a.geo_layer_id === layerId).map((a) => a.property_id)
    );
  }

  async function handleToggleProperty(layerId: string, propertyId: string) {
    const current = getAssignedPropertyIds(layerId);
    if (current.has(propertyId)) {
      current.delete(propertyId);
    } else {
      current.add(propertyId);
    }
    const result = await assignLayerToProperties(layerId, orgId!, Array.from(current));
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
    } else {
      loadAssignments();
    }
  }

  const handleImport = async (data: {
    name: string;
    description: string;
    color: string;
    opacity: number;
    geojson: GeoJSON.FeatureCollection;
    sourceFormat: string;
    sourceFilename: string;
    featureCount: number;
    bbox: [number, number, number, number];
    isPropertyBoundary: boolean;
    assignedPropertyIds: string[];
  }) => {
    const result = await createGeoLayer({
      orgId: orgId!,
      name: data.name,
      description: data.description || undefined,
      geojson: data.geojson,
      sourceFormat: data.sourceFormat as any,
      sourceFilename: data.sourceFilename,
      color: data.color,
      opacity: data.opacity,
      featureCount: data.featureCount,
      bbox: data.bbox,
      isPropertyBoundary: data.isPropertyBoundary,
    });

    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
      return;
    }

    if (data.assignedPropertyIds.length > 0) {
      await assignLayerToProperties(result.layerId, orgId!, data.assignedPropertyIds);
    }

    setMessage({ type: 'success', text: `Layer "${data.name}" imported successfully` });
    setShowImport(false);
    loadLayers();
    loadAssignments();
  };

  const handleDelete = async (layer: GeoLayerSummary) => {
    if (!confirm(`Delete "${layer.name}"? This cannot be undone.`)) return;
    const result = await deleteGeoLayer(layer.id);
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setMessage({ type: 'success', text: `Layer "${layer.name}" deleted` });
      loadLayers();
      loadAssignments();
    }
  };

  const handleSaveEdit = async (layerId: string) => {
    if (!editName.trim()) return;
    const result = await updateGeoLayer(layerId, { name: editName });
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setEditingId(null);
      loadLayers();
    }
  };

  const handlePublish = async (layerId: string) => {
    const result = await publishGeoLayer(layerId);
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setMessage({ type: 'success', text: 'Layer published — now visible on maps' });
      loadLayers();
    }
  };

  const handleUnpublish = async (layerId: string) => {
    const result = await unpublishGeoLayer(layerId);
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setMessage({ type: 'success', text: 'Layer unpublished — hidden from maps' });
      loadLayers();
    }
  };

  if (showImport) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <ImportFlow
          orgId={orgId!}
          properties={properties}
          onImport={handleImport}
          onCancel={() => setShowImport(false)}
        />
      </div>
    );
  }

  if (showAiImport) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="card p-6 text-center text-gray-500">
          <p className="text-lg mb-2">✨ AI-Assisted Import</p>
          <p className="text-sm">Upload a geo file and AI will analyze it, suggest layer names, and auto-configure properties.</p>
          <p className="text-sm mt-4 text-amber-600">Coming soon — use Quick Import for now.</p>
          <button onClick={() => setShowAiImport(false)} className="btn-secondary mt-4">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Geo Layers</h1>
          <p className="text-sm text-gray-500">
            {layers.length} layer{layers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="btn-primary">
            Quick Import
          </button>
          <button
            onClick={() => setShowAiImport(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          >
            ✨ AI-Assisted Import
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-2 font-medium">×</button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading layers...</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Layer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Properties</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Features</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Format</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {layers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">
                    No geo layers yet. Import a GeoJSON, Shapefile, or KML file to get started.
                  </td>
                </tr>
              )}
              {layers.map((layer) => {
                const assignedIds = getAssignedPropertyIds(layer.id);
                const isExpanded = expandedLayerId === layer.id;
                return (
                  <>
                    <tr key={layer.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          layer.status === 'published'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {layer.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: layer.color }} />
                          {editingId === layer.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="input-field text-sm py-1"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEdit(layer.id);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                              />
                              <button onClick={() => handleSaveEdit(layer.id)} className="text-blue-600 text-xs">Save</button>
                              <button onClick={() => setEditingId(null)} className="text-gray-400 text-xs">Cancel</button>
                            </div>
                          ) : (
                            <div>
                              <div className="font-medium text-gray-800">{layer.name}</div>
                              {layer.is_property_boundary && (
                                <div className="text-xs text-blue-600">Property boundary</div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedLayerId(isExpanded ? null : layer.id)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          {assignedIds.size === 0 ? (
                            <span className="text-gray-400">None — assign</span>
                          ) : (
                            <span>{assignedIds.size} propert{assignedIds.size === 1 ? 'y' : 'ies'}</span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{layer.feature_count}</td>
                      <td className="px-4 py-3 text-gray-500 capitalize">{layer.source_format}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {layer.source === 'ai' ? (
                          <span className="text-purple-600">✨ AI</span>
                        ) : (
                          <span>Manual</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {layer.status === 'draft' ? (
                          <button onClick={() => handlePublish(layer.id)} className="text-green-600 hover:text-green-800 text-sm mr-3">
                            Publish
                          </button>
                        ) : (
                          <button onClick={() => handleUnpublish(layer.id)} className="text-amber-600 hover:text-amber-800 text-sm mr-3">
                            Unpublish
                          </button>
                        )}
                        <button
                          onClick={() => { setEditingId(layer.id); setEditName(layer.name); }}
                          className="text-gray-500 hover:text-gray-700 text-sm mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(layer)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${layer.id}-props`} className="border-b border-gray-100 bg-gray-50/50">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {properties.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleToggleProperty(layer.id, p.id)}
                                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                                  assignedIds.has(p.id)
                                    ? 'bg-blue-50 border-blue-500 text-blue-700'
                                    : 'border-gray-300 text-gray-600 hover:border-gray-400'
                                }`}
                              >
                                {assignedIds.has(p.id) && '✓ '}{p.name}
                              </button>
                            ))}
                            {properties.length === 0 && (
                              <span className="text-sm text-gray-400">No properties in this org</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
