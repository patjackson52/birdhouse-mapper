'use client';

import { Fragment, useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import GeoLayerRenderer from './GeoLayerRenderer';
import PropertyBoundary from './PropertyBoundary';
import FeatureListPanel, { featureKey } from './FeatureListPanel';
import MultiSnapBottomSheet from '@/components/ui/MultiSnapBottomSheet';
import { intersectFeaturesWithArea, injectProvenance, geometryKey } from '@/lib/geo/discovery';
import { findCandidateLayers, createDiscoveredLayer } from '@/app/admin/properties/[slug]/geo-layers/discover/actions';
import { DISCOVERY_COLOR_PALETTE, CANDIDATE_FEATURE_WARNING, SELECTION_FEATURE_WARNING } from '@/lib/geo/constants';
import type { GeoLayer, FeatureGroup, DiscoveredFeature } from '@/lib/geo/types';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import bbox from '@turf/bbox';
import 'leaflet/dist/leaflet.css';

const DrawAreaControl = dynamic(() => import('./DrawAreaControl'), { ssr: false });

type WizardStep = 'define-area' | 'review' | 'select' | 'confirm';
const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'define-area', label: 'Define Area' },
  { key: 'review', label: 'Review Matches' },
  { key: 'select', label: 'Select Features' },
  { key: 'confirm', label: 'Confirm' },
];

/** Fits the map bounds to the given feature groups when they change */
function FitToFeatures({ groups }: { groups: FeatureGroup[] }) {
  const map = useMap();
  useEffect(() => {
    if (groups.length === 0) return;
    const bounds = L.latLngBounds([]);
    groups.forEach((g) => {
      g.features.forEach((df) => {
        const geoLayer = L.geoJSON(df.feature);
        bounds.extend(geoLayer.getBounds());
      });
    });
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, groups]);
  return null;
}

interface DiscoverWizardProps {
  orgId: string;
  propertyId: string;
  propertyName: string;
  propertySlug: string;
  boundaryGeoJSON: FeatureCollection | null;
  mapCenter: [number, number];
  mapZoom: number;
}

export default function DiscoverWizard({
  orgId,
  propertyId,
  propertyName,
  propertySlug,
  boundaryGeoJSON,
  mapCenter,
  mapZoom,
}: DiscoverWizardProps) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>('define-area');
  const [searchArea, setSearchArea] = useState<Feature<Polygon | MultiPolygon> | null>(null);
  const [useBoundary, setUseBoundary] = useState(!!boundaryGeoJSON);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Discovery results
  const [featureGroups, setFeatureGroups] = useState<FeatureGroup[]>([]);
  const [totalCandidateFeatures, setTotalCandidateFeatures] = useState(0);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [layerName, setLayerName] = useState(`${propertyName} — Discovered Features`);
  const [submitting, setSubmitting] = useState(false);
  const [createdLayerId, setCreatedLayerId] = useState<string | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // Derive the active search area (boundary or drawn)
  const activeSearchArea = useMemo(() => {
    if (useBoundary && boundaryGeoJSON) {
      const poly = boundaryGeoJSON.features.find(
        (f) => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
      );
      return (poly as Feature<Polygon | MultiPolygon>) ?? null;
    }
    return searchArea;
  }, [useBoundary, boundaryGeoJSON, searchArea]);

  // Map center for the search area
  const searchMapCenter = useMemo<[number, number]>(() => {
    if (activeSearchArea) {
      const b = bbox(activeSearchArea);
      return [(b[1] + b[3]) / 2, (b[0] + b[2]) / 2];
    }
    return mapCenter;
  }, [activeSearchArea, mapCenter]);

  const handleAreaDrawn = useCallback((area: Feature<Polygon> | null) => {
    if (area) {
      setSearchArea(area);
      setUseBoundary(false);
    } else {
      setSearchArea(null);
    }
  }, []);

  // --- Step 2: Find candidates ---
  const handleFindCandidates = useCallback(async () => {
    if (!activeSearchArea) return;
    setLoading(true);
    setError(null);

    const searchBbox = bbox(activeSearchArea) as [number, number, number, number];
    const result = await findCandidateLayers(orgId, propertyId, searchBbox);

    if ('error' in result) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Client-side intersection
    const groups: FeatureGroup[] = [];
    let totalFeatures = 0;

    result.layers.forEach((layer, layerIndex) => {
      const color = DISCOVERY_COLOR_PALETTE[layerIndex % DISCOVERY_COLOR_PALETTE.length];
      const matched = intersectFeaturesWithArea(layer.geojson, activeSearchArea);
      totalFeatures += matched.length;

      if (matched.length > 0) {
        const discoveredFeatures: DiscoveredFeature[] = matched.map((f) => ({
          feature: f,
          sourceLayerId: layer.id,
          sourceLayerName: layer.name,
          sourceLayerColor: color,
        }));

        groups.push({
          layerId: layer.id,
          layerName: layer.name,
          layerColor: color,
          sourceFormat: layer.source_format,
          features: discoveredFeatures,
        });
      }
    });

    // Deduplicate features across source layers by geometry coordinates
    const seen = new Map<string, { groupIdx: number; featureIdx: number }>();
    groups.forEach((group, gi) => {
      group.features = group.features.filter((df, fi) => {
        const key = geometryKey(df.feature);
        const existing = seen.get(key);
        if (existing) {
          // Mark the first occurrence with this duplicate source
          const orig = groups[existing.groupIdx].features[existing.featureIdx];
          if (!orig.duplicateSources) orig.duplicateSources = [];
          orig.duplicateSources.push({ layerId: df.sourceLayerId, layerName: df.sourceLayerName });
          return false; // remove duplicate
        }
        seen.set(key, { groupIdx: gi, featureIdx: fi });
        return true;
      });
    });
    // Remove empty groups after dedup
    const dedupedGroups = groups.filter((g) => g.features.length > 0);

    setFeatureGroups(dedupedGroups);
    setTotalCandidateFeatures(totalFeatures);
    setLoading(false);

    if (dedupedGroups.length > 0) {
      // Auto-select all features
      const allKeys = new Set<string>();
      dedupedGroups.forEach((g) =>
        g.features.forEach((_, i) => allKeys.add(featureKey(g.layerId, i)))
      );
      setSelectedIds(allKeys);
      setStep('review');
    }
  }, [activeSearchArea, orgId, propertyId]);

  // --- Selection handlers ---
  const toggleFeature = useCallback((key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((layerId: string, selectAll: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const group = featureGroups.find((g) => g.layerId === layerId);
      if (!group) return prev;
      group.features.forEach((_, i) => {
        const key = featureKey(layerId, i);
        if (selectAll) next.add(key);
        else next.delete(key);
      });
      return next;
    });
  }, [featureGroups]);

  // --- Collect selected features ---
  const selectedFeatures = useMemo(() => {
    const features: Feature[] = [];
    featureGroups.forEach((group) => {
      group.features.forEach((df, i) => {
        const key = featureKey(group.layerId, i);
        if (selectedIds.has(key)) {
          features.push(injectProvenance(df.feature, df.sourceLayerId, df.sourceLayerName));
        }
      });
    });
    return features;
  }, [featureGroups, selectedIds]);

  // --- Step 4: Create layer ---
  const handleCreate = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    const result = await createDiscoveredLayer({
      orgId,
      propertyId,
      name: layerName,
      features: selectedFeatures,
    });

    if ('error' in result) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setCreatedLayerId(result.layerId);
    setSubmitting(false);
    setStep('confirm');
  }, [orgId, propertyId, layerName, selectedFeatures]);

  // --- Step indicator ---
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const stepIndicator = (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
              i <= stepIndex
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {i + 1}
          </div>
          <span className={`text-sm hidden md:inline ${i <= stepIndex ? 'text-gray-800' : 'text-gray-400'}`}>
            {s.label}
          </span>
          {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-300" />}
        </div>
      ))}
    </div>
  );

  // =========================
  // STEP 1: Define Area
  // =========================
  if (step === 'define-area') {
    return (
      <div className="max-w-3xl mx-auto p-4">
        {stepIndicator}
        <h2 className="text-lg font-semibold mb-4">Define Search Area</h2>

        {boundaryGeoJSON && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setUseBoundary(true); setSearchArea(null); }}
              className={useBoundary ? 'btn-primary' : 'btn-secondary'}
            >
              Use Property Boundary
            </button>
            <button
              onClick={() => setUseBoundary(false)}
              className={!useBoundary ? 'btn-primary' : 'btn-secondary'}
            >
              Draw Custom Area
            </button>
          </div>
        )}

        {!boundaryGeoJSON && (
          <p className="text-sm text-gray-600 mb-4">
            This property doesn&apos;t have a boundary set. Draw an area to search for features.
          </p>
        )}

        <div className="h-96 rounded-lg overflow-hidden border border-gray-200 mb-4">
          <MapContainer center={searchMapCenter} zoom={mapZoom} className="w-full h-full" zoomControl={true}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {useBoundary && boundaryGeoJSON && (
              <PropertyBoundary geojson={boundaryGeoJSON} />
            )}
            {!useBoundary && (
              <DrawAreaControl onAreaDrawn={handleAreaDrawn} allowPolygon={true} />
            )}
          </MapContainer>
        </div>

        <div className="flex justify-between">
          <a href={`/admin/properties/${propertySlug}/data`} className="btn-secondary">
            Cancel
          </a>
          <button
            onClick={handleFindCandidates}
            className="btn-primary"
            disabled={!activeSearchArea || loading}
          >
            {loading ? 'Searching...' : 'Find Features'}
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
    );
  }

  // =========================
  // STEP 2: Review Matches
  // =========================
  if (step === 'review') {
    if (featureGroups.length === 0) {
      return (
        <div className="max-w-3xl mx-auto p-4">
          {stepIndicator}
          <h2 className="text-lg font-semibold mb-4">No Features Found</h2>
          <p className="text-gray-600 mb-4">No features were found in this area. Try expanding your search area.</p>
          <button onClick={() => setStep('define-area')} className="btn-secondary">Back</button>
        </div>
      );
    }

    const totalMatched = featureGroups.reduce((sum, g) => sum + g.features.length, 0);

    return (
      <div className="p-4">
        {stepIndicator}
        <h2 className="text-lg font-semibold mb-2">Review Matches</h2>
        <p className="text-sm text-gray-600 mb-4">
          Found {totalMatched} features from {featureGroups.length} layer{featureGroups.length !== 1 ? 's' : ''}.
        </p>

        {totalCandidateFeatures > CANDIDATE_FEATURE_WARNING && (
          <p className="text-sm text-amber-600 mb-4">
            Large dataset ({totalCandidateFeatures} features). Consider narrowing your search area for better performance.
          </p>
        )}

        <div className="flex flex-col md:flex-row gap-4" style={{ height: 'calc(100vh - 240px)' }}>
          {/* Map */}
          <div className="flex-1 md:flex-[2] rounded-lg overflow-hidden border border-gray-200">
            <MapContainer center={searchMapCenter} zoom={mapZoom} className="w-full h-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitToFeatures groups={featureGroups} />
              {featureGroups.map((group) => {
                const fc: FeatureCollection = {
                  type: 'FeatureCollection',
                  features: group.features.map((df) => df.feature),
                };
                return (
                  <GeoLayerRenderer
                    key={group.layerId}
                    geojson={fc}
                    layer={{
                      id: group.layerId,
                      name: group.layerName,
                      color: group.layerColor,
                      opacity: 0.6,
                      feature_count: group.features.length,
                    } as any}
                    showTooltip
                  />
                );
              })}
            </MapContainer>
          </div>

          {/* Desktop list panel */}
          <div className="hidden md:block flex-1 min-w-[280px] border border-gray-200 rounded-lg overflow-hidden">
            <FeatureListPanel
              groups={featureGroups}
              selectedIds={selectedIds}
              onToggleFeature={toggleFeature}
              onToggleGroup={toggleGroup}
            />
          </div>
        </div>

        {/* Mobile: toggle button + bottom sheet */}
        <button
          onClick={() => setMobileSheetOpen(true)}
          className="md:hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-30 btn-primary shadow-lg"
        >
          {selectedIds.size} features selected
        </button>
        <div className="md:hidden">
          <MultiSnapBottomSheet isOpen={mobileSheetOpen} onClose={() => setMobileSheetOpen(false)}>
            <FeatureListPanel
              groups={featureGroups}
              selectedIds={selectedIds}
              onToggleFeature={toggleFeature}
              onToggleGroup={toggleGroup}
            />
          </MultiSnapBottomSheet>
        </div>

        <div className="flex justify-between mt-4">
          <button onClick={() => setStep('define-area')} className="btn-secondary">Back</button>
          <button onClick={() => setStep('select')} className="btn-primary">
            Continue to Selection
          </button>
        </div>
      </div>
    );
  }

  // =========================
  // STEP 3: Select Features
  // =========================
  if (step === 'select') {
    return (
      <div className="p-4">
        {stepIndicator}
        <h2 className="text-lg font-semibold mb-2">Select Features</h2>
        <p className="text-sm text-gray-600 mb-4">
          Choose which features to include in the new layer. {selectedIds.size} selected.
        </p>

        <div className="flex flex-col md:flex-row gap-4" style={{ height: 'calc(100vh - 300px)' }}>
          {/* Map with selection-aware styling */}
          <div className="flex-1 md:flex-[2] rounded-lg overflow-hidden border border-gray-200">
            <MapContainer center={searchMapCenter} zoom={mapZoom} className="w-full h-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitToFeatures groups={featureGroups} />
              {featureGroups.map((group) => {
                const selectedFeats = group.features.filter((_, i) =>
                  selectedIds.has(featureKey(group.layerId, i))
                );
                const unselectedFeats = group.features.filter((_, i) =>
                  !selectedIds.has(featureKey(group.layerId, i))
                );

                return (
                  <Fragment key={group.layerId}>
                    {unselectedFeats.length > 0 && (
                      <GeoLayerRenderer
                        geojson={{ type: 'FeatureCollection', features: unselectedFeats.map((df) => df.feature) }}
                        layer={{
                          id: `${group.layerId}-unselected`,
                          name: group.layerName,
                          color: group.layerColor,
                          opacity: 0.3,
                          feature_count: unselectedFeats.length,
                        } as any}
                        onFeatureClick={(feature) => {
                          const idx = group.features.findIndex((df) => df.feature === feature);
                          if (idx >= 0) toggleFeature(featureKey(group.layerId, idx));
                        }}
                        showTooltip
                      />
                    )}
                    {selectedFeats.length > 0 && (
                      <GeoLayerRenderer
                        geojson={{ type: 'FeatureCollection', features: selectedFeats.map((df) => df.feature) }}
                        layer={{
                          id: `${group.layerId}-selected`,
                          name: group.layerName,
                          color: group.layerColor,
                          opacity: 0.8,
                          feature_count: selectedFeats.length,
                        } as any}
                        onFeatureClick={(feature) => {
                          const idx = group.features.findIndex((df) => df.feature === feature);
                          if (idx >= 0) toggleFeature(featureKey(group.layerId, idx));
                        }}
                        showTooltip
                      />
                    )}
                  </Fragment>
                );
              })}
            </MapContainer>
          </div>

          {/* Desktop list panel */}
          <div className="hidden md:block flex-1 min-w-[280px] border border-gray-200 rounded-lg overflow-hidden">
            <FeatureListPanel
              groups={featureGroups}
              selectedIds={selectedIds}
              onToggleFeature={toggleFeature}
              onToggleGroup={toggleGroup}
            />
          </div>
        </div>

        {/* Mobile: toggle button + bottom sheet */}
        <button
          onClick={() => setMobileSheetOpen(true)}
          className="md:hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-30 btn-primary shadow-lg"
        >
          {selectedIds.size} features selected
        </button>
        <div className="md:hidden">
          <MultiSnapBottomSheet isOpen={mobileSheetOpen} onClose={() => setMobileSheetOpen(false)}>
            <FeatureListPanel
              groups={featureGroups}
              selectedIds={selectedIds}
              onToggleFeature={toggleFeature}
              onToggleGroup={toggleGroup}
            />
          </MultiSnapBottomSheet>
        </div>

        {/* Layer name input */}
        <div className="mt-4 max-w-md">
          <label className="label">Layer Name</label>
          <input
            type="text"
            value={layerName}
            onChange={(e) => setLayerName(e.target.value)}
            className="input-field"
          />
        </div>

        {selectedIds.size > SELECTION_FEATURE_WARNING && (
          <p className="text-sm text-amber-600 mt-2">
            {selectedIds.size} features selected. Large layers may affect map performance.
          </p>
        )}

        <div className="flex justify-between mt-4">
          <button onClick={() => setStep('review')} className="btn-secondary">Back</button>
          <button
            onClick={handleCreate}
            className="btn-primary"
            disabled={selectedIds.size === 0 || !layerName.trim() || submitting}
          >
            {submitting ? 'Creating...' : 'Create Layer'}
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
    );
  }

  // =========================
  // STEP 4: Confirm
  // =========================
  if (step === 'confirm' && createdLayerId) {
    const sourceBreakdown = featureGroups
      .map((g) => {
        const count = g.features.filter((_, i) => selectedIds.has(featureKey(g.layerId, i))).length;
        return count > 0 ? `${g.layerName}: ${count}` : null;
      })
      .filter(Boolean);

    return (
      <div className="max-w-2xl mx-auto p-4">
        {stepIndicator}
        <h2 className="text-lg font-semibold mb-4">Layer Created</h2>

        <div className="card p-4 space-y-2">
          <div className="font-medium">{layerName}</div>
          <div className="text-sm text-gray-600">{selectedFeatures.length} features</div>
          <div className="text-sm text-gray-500">
            <div className="font-medium text-gray-700 mb-1">Sources:</div>
            {sourceBreakdown.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <a
            href={`/admin/properties/${propertySlug}/data`}
            className="btn-primary"
          >
            Done
          </a>
        </div>
      </div>
    );
  }

  return null;
}
