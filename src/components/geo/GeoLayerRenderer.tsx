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
}

export default function GeoLayerRenderer({ geojson, layer, onFeatureClick }: GeoLayerRendererProps) {
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
  }, [map, geojson, layer.color, layer.opacity, layer.name, onFeatureClick]);

  return null;
}
