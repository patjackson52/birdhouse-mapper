'use client';

import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { Birdhouse, BirdhouseStatus } from '@/lib/types';
import { statusLabels } from '@/lib/utils';

const markerColors: Record<BirdhouseStatus, string> = {
  active: '#5D7F3A',
  planned: '#9CA3AF',
  damaged: '#D97706',
  removed: '#6B7280',
};

function createIcon(status: BirdhouseStatus) {
  const color = markerColors[status];
  return L.divIcon({
    className: '',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: ${color};
        border: 2px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <span style="transform: rotate(45deg); font-size: 14px; line-height: 1;">🏠</span>
      </div>
    `,
  });
}

interface BirdhouseMarkerProps {
  birdhouse: Birdhouse;
  onClick: (birdhouse: Birdhouse) => void;
}

export default function BirdhouseMarker({ birdhouse, onClick }: BirdhouseMarkerProps) {
  return (
    <Marker
      position={[birdhouse.latitude, birdhouse.longitude]}
      icon={createIcon(birdhouse.status)}
      eventHandlers={{
        click: () => onClick(birdhouse),
      }}
    >
      <Popup>
        <div className="text-center">
          <strong className="text-forest-dark">{birdhouse.name}</strong>
          <br />
          <span className="text-xs text-sage">{statusLabels[birdhouse.status]}</span>
          {birdhouse.species_target && (
            <>
              <br />
              <span className="text-xs text-forest">{birdhouse.species_target}</span>
            </>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
