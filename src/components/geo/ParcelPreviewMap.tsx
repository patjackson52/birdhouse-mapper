'use client';

import { useEffect, useRef } from 'react';
import type { ParcelCandidate } from '@/lib/geo/types';

interface ParcelPreviewMapProps {
  parcels: ParcelCandidate[];
  selectedApns: Set<string>;
  onToggleParcel?: (apn: string) => void;
  height?: string;
}

const PARCEL_COLORS = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed'];

export default function ParcelPreviewMap({
  parcels,
  selectedApns,
  onToggleParcel,
  height = '300px',
}: ParcelPreviewMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersRef = useRef<Map<string, L.GeoJSON>>(new Map());
  const onToggleRef = useRef(onToggleParcel);
  onToggleRef.current = onToggleParcel;

  // Initialize map and add layers when parcels change
  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined') return;

    const L = require('leaflet');
    require('leaflet/dist/leaflet.css');

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    const map = L.map(mapRef.current);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const newLayers = new Map<string, L.GeoJSON>();
    const allBounds = L.latLngBounds([]);

    parcels.forEach((parcel, i) => {
      const color = PARCEL_COLORS[i % PARCEL_COLORS.length];
      const feature: GeoJSON.Feature = {
        type: 'Feature',
        properties: { apn: parcel.apn, _color: color },
        geometry: parcel.geometry,
      };

      const layer = L.geoJSON(feature, {
        style: { color, fillColor: color, fillOpacity: 0.3, weight: 3 },
        onEachFeature: (_: unknown, featureLayer: L.Layer) => {
          featureLayer.on('click', () => onToggleRef.current?.(parcel.apn));
        },
      }).addTo(map);

      allBounds.extend(layer.getBounds());
      newLayers.set(parcel.apn, layer);
    });

    layersRef.current = newLayers;

    if (allBounds.isValid()) {
      map.fitBounds(allBounds, { padding: [30, 30] });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [parcels]);

  // Update layer styles when selection changes (no map rebuild)
  useEffect(() => {
    layersRef.current.forEach((layer, apn) => {
      const isSelected = selectedApns.has(apn);
      const innerLayer = layer.getLayers()[0] as L.Layer & { feature?: GeoJSON.Feature };
      const color = innerLayer?.feature?.properties?._color ?? '#16a34a';
      layer.setStyle({
        color: isSelected ? color : '#94a3b8',
        fillColor: isSelected ? color : '#cbd5e1',
        fillOpacity: isSelected ? 0.3 : 0.1,
        weight: isSelected ? 3 : 1,
      });
    });
  }, [selectedApns]);

  return <div ref={mapRef} style={{ height, width: '100%', borderRadius: '8px' }} />;
}
