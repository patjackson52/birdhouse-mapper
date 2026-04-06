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
  const layersRef = useRef<L.GeoJSON[]>([]);

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

    layersRef.current.forEach((l) => l.remove());
    layersRef.current = [];

    const allBounds = L.latLngBounds([]);

    parcels.forEach((parcel, i) => {
      const color = PARCEL_COLORS[i % PARCEL_COLORS.length];
      const isSelected = selectedApns.has(parcel.apn);

      const feature: GeoJSON.Feature = {
        type: 'Feature',
        properties: { apn: parcel.apn },
        geometry: parcel.geometry,
      };

      const layer = L.geoJSON(feature, {
        style: {
          color: isSelected ? color : '#94a3b8',
          fillColor: isSelected ? color : '#cbd5e1',
          fillOpacity: isSelected ? 0.3 : 0.1,
          weight: isSelected ? 3 : 1,
        },
        onEachFeature: (_: unknown, featureLayer: L.Layer) => {
          if (onToggleParcel) {
            featureLayer.on('click', () => onToggleParcel(parcel.apn));
          }
        },
      }).addTo(map);

      allBounds.extend(layer.getBounds());
      layersRef.current.push(layer);
    });

    if (allBounds.isValid()) {
      map.fitBounds(allBounds, { padding: [30, 30] });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [parcels, selectedApns, onToggleParcel]);

  return <div ref={mapRef} style={{ height, width: '100%', borderRadius: '8px' }} />;
}
