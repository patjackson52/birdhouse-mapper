'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useUserLocation } from '@/lib/location/provider';
import { useConfig } from '@/lib/config/client';
import { distanceBetween } from '@/lib/location/utils';

const SMART_CENTER_RADIUS = 805; // ~0.5 miles

export default function UserLocationLayer() {
  const map = useMap();
  const config = useConfig();
  const { position, accuracy, isTracking } = useUserLocation();
  const dotRef = useRef<L.CircleMarker | null>(null);
  const ringRef = useRef<L.Circle | null>(null);
  const hasCenteredRef = useRef(false);

  // Layer lifecycle — destroy on unmount
  useEffect(() => {
    return () => {
      if (dotRef.current) { dotRef.current.remove(); dotRef.current = null; }
      if (ringRef.current) { ringRef.current.remove(); ringRef.current = null; }
    };
  }, []);

  // Update position, create layers if needed
  useEffect(() => {
    if (!position) {
      if (dotRef.current) { dotRef.current.remove(); dotRef.current = null; }
      if (ringRef.current) { ringRef.current.remove(); ringRef.current = null; }
      return;
    }

    const latlng: L.LatLngExpression = [position.lat, position.lng];

    // Accuracy ring
    if (!ringRef.current) {
      ringRef.current = L.circle(latlng, {
        radius: accuracy || 50,
        color: 'transparent',
        fillColor: 'rgba(66, 133, 244, 0.15)',
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
    } else {
      ringRef.current.setLatLng(latlng);
      if (accuracy) ringRef.current.setRadius(accuracy);
    }

    // Blue dot
    if (!dotRef.current) {
      dotRef.current = L.circleMarker(latlng, {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#4285F4',
        fillOpacity: 1,
        interactive: false,
        className: isTracking ? 'location-dot-pulse' : '',
      }).addTo(map);
    } else {
      dotRef.current.setLatLng(latlng);
    }

    // Smart centering — only on first position
    if (!hasCenteredRef.current) {
      hasCenteredRef.current = true;
      const distToCenter = distanceBetween(
        position.lat, position.lng,
        config.mapCenter.lat, config.mapCenter.lng
      );
      if (distToCenter <= SMART_CENTER_RADIUS) {
        map.flyTo(latlng, map.getZoom(), { duration: 1 });
      }
    }
  }, [position, accuracy, isTracking, map, config.mapCenter]);

  return null;
}
