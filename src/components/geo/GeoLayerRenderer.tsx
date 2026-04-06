'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoLayerSummary } from '@/lib/geo/types';
import type { FeatureCollection } from 'geojson';

interface GeoLayerRendererProps {
  geojson: FeatureCollection;
  layer: GeoLayerSummary;
  onFeatureClick?: (feature: GeoJSON.Feature, layerName: string) => void;
  /** Show tooltip on hover with feature name and source layer */
  showTooltip?: boolean;
}

export default function GeoLayerRenderer({ geojson, layer, onFeatureClick, showTooltip }: GeoLayerRendererProps) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const geoJsonLayer = L.geoJSON(geojson, {
      style: () => ({
        color: layer.color,
        weight: 2,
        opacity: layer.opacity,
        fillColor: layer.color,
        fillOpacity: layer.opacity * 0.4,
      }),
      pointToLayer: (_feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 6,
          color: layer.color,
          weight: 2,
          opacity: layer.opacity,
          fillColor: layer.color,
          fillOpacity: layer.opacity * 0.6,
        });
      },
      onEachFeature: (feature, leafletLayer) => {
        if (onFeatureClick) {
          leafletLayer.on('click', () => onFeatureClick(feature, layer.name));
        }
        if (showTooltip) {
          const name = feature.properties?.name || feature.properties?.NAME || feature.properties?.title || feature.geometry.type;
          leafletLayer.bindTooltip(
            `<strong>${name}</strong><br/><span style="color:#6b7280">${layer.name}</span>`,
            { sticky: true, direction: 'top', offset: [0, -8] }
          );
        }
      },
    });

    geoJsonLayer.addTo(map);
    layerRef.current = geoJsonLayer;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, geojson, layer.color, layer.opacity, layer.name, onFeatureClick, showTooltip]);

  return null;
}
