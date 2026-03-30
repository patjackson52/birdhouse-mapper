'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection } from 'geojson';

interface PropertyBoundaryProps {
  geojson: FeatureCollection;
  color?: string;
}

export default function PropertyBoundary({ geojson, color = '#3b82f6' }: PropertyBoundaryProps) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const boundaryLayer = L.geoJSON(geojson, {
      style: () => ({
        color,
        weight: 3,
        opacity: 0.8,
        dashArray: '8, 6',
        fillColor: color,
        fillOpacity: 0.05,
      }),
      interactive: false,
    });

    boundaryLayer.addTo(map);
    layerRef.current = boundaryLayer;

    const bounds = boundaryLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, geojson, color]);

  return null;
}
