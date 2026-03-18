'use client';

import { MapContainer, TileLayer, ImageOverlay, Marker, useMapEvents } from 'react-leaflet';
import L, { type LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useConfig, useTheme } from '@/lib/config/client';

// Simple colored marker icon
function createCornerIcon(label: string) {
  return L.divIcon({
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div style="
      width: 24px; height: 24px; background: #EF4444; color: white;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    ">${label}</div>`,
  });
}

const swIcon = createCornerIcon('SW');
const neIcon = createCornerIcon('NE');

interface OverlayMapProps {
  imageUrl?: string;
  sw: { lat: number; lng: number } | null;
  ne: { lat: number; lng: number } | null;
  opacity: number;
  onMapClick?: (lat: number, lng: number) => void;
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function OverlayMap({ imageUrl, sw, ne, opacity, onMapClick }: OverlayMapProps) {
  const config = useConfig();
  const theme = useTheme();
  const center: [number, number] = [config.mapCenter.lat, config.mapCenter.lng];
  const zoom = config.mapCenter.zoom;

  const hasBounds = sw && ne;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="w-full h-96 z-0"
      style={{ cursor: onMapClick ? 'crosshair' : undefined }}
    >
      <TileLayer
        attribution={theme.tileAttribution}
        url={theme.tileUrl}
      />

      {/* Image overlay */}
      {imageUrl && hasBounds && (
        <ImageOverlay
          url={imageUrl}
          bounds={[
            [sw.lat, sw.lng],
            [ne.lat, ne.lng],
          ] as LatLngBoundsExpression}
          opacity={opacity}
        />
      )}

      {/* Corner markers */}
      {sw && (
        <Marker position={[sw.lat, sw.lng]} icon={swIcon} />
      )}
      {ne && (
        <Marker position={[ne.lat, ne.lng]} icon={neIcon} />
      )}

      {/* Click handler for placement */}
      {onMapClick && <ClickHandler onClick={onMapClick} />}
    </MapContainer>
  );
}
