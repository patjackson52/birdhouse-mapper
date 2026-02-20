'use client';

import { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ISLANDWOOD_CENTER: [number, number] = [47.6235, -122.5185];

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

export default function LocationPicker({
  latitude,
  longitude,
  onChange,
}: LocationPickerProps) {
  const [gpsLoading, setGpsLoading] = useState(false);

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
        {latitude && longitude && (
          <span className="text-xs text-sage">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </span>
        )}
      </div>

      <div className="h-64 rounded-lg overflow-hidden border border-sage-light">
        <MapContainer
          center={
            latitude && longitude
              ? [latitude, longitude]
              : ISLANDWOOD_CENTER
          }
          zoom={16}
          className="w-full h-full"
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onChange={onChange} />
          {latitude && longitude && (
            <Marker position={[latitude, longitude]} icon={pinIcon} />
          )}
        </MapContainer>
      </div>
      <p className="text-xs text-sage mt-1">
        Click on the map to set the birdhouse location, or use GPS.
      </p>
    </div>
  );
}
