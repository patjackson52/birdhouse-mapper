'use client';

import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { Item, ItemType, ItemStatus } from '@/lib/types';
import { statusLabels, statusColors } from '@/lib/utils';

function createIcon(item: Item, itemType?: ItemType) {
  const color = statusColors[item.status] || '#5D7F3A';
  const emoji = itemType?.icon || '📍';
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
        <span style="transform: rotate(45deg); font-size: 14px; line-height: 1;">${emoji}</span>
      </div>
    `,
  });
}

interface ItemMarkerProps {
  item: Item;
  itemType?: ItemType;
  onClick: (item: Item) => void;
}

export default function ItemMarker({ item, itemType, onClick }: ItemMarkerProps) {
  return (
    <Marker
      position={[item.latitude, item.longitude]}
      icon={createIcon(item, itemType)}
      eventHandlers={{
        click: () => onClick(item),
      }}
    >
      <Popup>
        <div className="text-center">
          <strong className="text-forest-dark">{item.name}</strong>
          <br />
          <span className="text-xs text-sage">{statusLabels[item.status]}</span>
          {itemType && (
            <>
              <br />
              <span className="text-xs text-forest">{itemType.icon} {itemType.name}</span>
            </>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
