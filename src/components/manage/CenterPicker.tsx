'use client';

import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '@/lib/config/client';

const crosshairIcon = L.divIcon({
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  html: `<div style="width:20px;height:20px;border:2px solid #EF4444;border-radius:50%;background:rgba(239,68,68,0.15);box-shadow:0 0 0 2px white;"></div>`,
});

interface CenterPickerProps {
  lat: number;
  lng: number;
  zoom: number;
  onChange: (lat: number, lng: number, zoom: number) => void;
}

function MapEvents({ onChange }: { onChange: (lat: number, lng: number, zoom: number) => void }) {
  const map = useMap();
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng, map.getZoom());
    },
    zoomend() {
      const center = map.getCenter();
      onChange(center.lat, center.lng, map.getZoom());
    },
    moveend() {
      const center = map.getCenter();
      onChange(center.lat, center.lng, map.getZoom());
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

export default function CenterPicker({ lat, lng, zoom, onChange }: CenterPickerProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

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
        onChange(pos.coords.latitude, pos.coords.longitude, zoom);
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
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
          {gpsLoading ? 'Getting...' : 'Use My Location'}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="btn-secondary text-xs py-1.5"
        >
          {expanded ? 'Collapse' : 'Expand Map'}
        </button>
        <span className="text-xs text-sage">
          {lat.toFixed(4)}, {lng.toFixed(4)} (zoom {zoom})
        </span>
      </div>

      <div
        className={
          expanded
            ? 'fixed inset-0 z-50 bg-white'
            : 'h-64 rounded-lg overflow-hidden border border-sage-light'
        }
      >
        <MapContainer
          center={[lat, lng]}
          zoom={zoom}
          className="w-full h-full"
          zoomControl={true}
        >
          <MapResizer expanded={expanded} />
          <MapEvents onChange={onChange} />
          <TileLayer
            attribution={theme.tileAttribution}
            url={theme.tileUrl}
          />
          <Marker position={[lat, lng]} icon={crosshairIcon} />
        </MapContainer>

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
              title="Close (Esc)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="absolute bottom-4 left-4 z-[1000] bg-white rounded-lg shadow-lg border border-sage-light px-3 py-2 text-xs text-forest-dark">
              {lat.toFixed(6)}, {lng.toFixed(6)} — zoom {zoom}
            </div>
          </>
        )}
      </div>

      {!expanded && (
        <p className="text-xs text-sage mt-1">
          Pan and zoom to set the default map view. Click to refine center.
        </p>
      )}
    </div>
  );
}
