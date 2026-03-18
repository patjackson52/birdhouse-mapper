'use client';

import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useConfig, useTheme } from '@/lib/config/client';

const pinIcon = L.divIcon({
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  html: `<div style="width:24px;height:24px;background:#5D7F3A;border:2px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
});

interface LocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
}

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapResizer({ expanded }: { expanded: boolean }) {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [expanded, map]);
  return null;
}

export default function LocationPicker({
  latitude,
  longitude,
  onChange,
}: LocationPickerProps) {
  const config = useConfig();
  const theme = useTheme();
  const [gpsLoading, setGpsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const defaultCenter: [number, number] = [config.mapCenter.lat, config.mapCenter.lng];
  const defaultZoom = config.mapCenter.zoom;

  // Escape key exits expanded
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && expanded) setExpanded(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded]);

  function handleUseMyLocation() {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude, pos.coords.longitude);
        setGpsLoading(false);
      },
      () => {
        setGpsLoading(false);
      },
      { enableHighAccuracy: true }
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={gpsLoading}
          className="btn-secondary text-xs py-1.5"
        >
          {gpsLoading ? 'Getting location...' : 'Use My Location'}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="btn-secondary text-xs py-1.5"
        >
          {expanded ? 'Collapse Map' : 'Expand Map'}
        </button>
        {latitude && longitude && (
          <span className="text-xs text-sage">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </span>
        )}
      </div>

      <div
        className={
          expanded
            ? 'fixed inset-0 z-50 bg-white'
            : 'h-64 rounded-lg overflow-hidden border border-sage-light'
        }
      >
        <MapContainer
          center={
            latitude && longitude
              ? [latitude, longitude]
              : defaultCenter
          }
          zoom={defaultZoom}
          className="w-full h-full"
          zoomControl={true}
        >
          <MapResizer expanded={expanded} />
          <TileLayer
            attribution={theme.tileAttribution}
            url={theme.tileUrl}
          />
          <ClickHandler onChange={onChange} />
          {latitude && longitude && (
            <Marker position={[latitude, longitude]} icon={pinIcon} />
          )}
        </MapContainer>

        {/* Controls overlay when expanded */}
        {expanded && (
          <>
            <div className="absolute top-4 left-4 z-[1000] flex gap-2">
              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={gpsLoading}
                className="bg-white rounded-lg shadow-lg border border-sage-light px-3 py-2 text-xs font-medium text-forest-dark hover:bg-sage-light transition-colors"
              >
                {gpsLoading ? 'Getting...' : 'Use My Location'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="absolute top-4 right-4 z-[1000] bg-white rounded-lg shadow-lg border border-sage-light p-2 text-forest-dark hover:bg-sage-light transition-colors"
              title="Collapse (Esc)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {latitude && longitude && (
              <div className="absolute bottom-4 left-4 z-[1000] bg-white rounded-lg shadow-lg border border-sage-light px-3 py-2 text-xs text-forest-dark">
                {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </div>
            )}
          </>
        )}
      </div>

      {!expanded && (
        <p className="text-xs text-sage mt-1">
          Click on the map to set the location, or use GPS.
        </p>
      )}
    </div>
  );
}
