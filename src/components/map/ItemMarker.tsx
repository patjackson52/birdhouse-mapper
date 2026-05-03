'use client';

import { useState, useEffect } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { Item, ItemType } from '@/lib/types';
import { statusColors } from '@/lib/utils';
import { iconToHtml } from '@/components/shared/IconPicker';

function createDivIcon(iconHtml: string, color: string) {
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
        <span style="transform: rotate(45deg); font-size: 14px; line-height: 1;">${iconHtml}</span>
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
  const [iconHtml, setIconHtml] = useState<string>(
    itemType?.icon?.set === 'emoji' ? itemType.icon.name : '📍'
  );

  useEffect(() => {
    if (!itemType?.icon) return;
    let cancelled = false;
    iconToHtml(itemType.icon, 14).then((html) => {
      if (!cancelled) setIconHtml(html);
    });
    return () => { cancelled = true; };
  }, [itemType?.icon]);

  const color = statusColors[item.status] || '#5D7F3A';

  return (
    <Marker
      position={[item.latitude, item.longitude]}
      icon={createDivIcon(iconHtml, color)}
      eventHandlers={{
        click: () => onClick(item),
      }}
    >
      <Popup>
        <div className="text-center">
          <strong className="text-forest-dark">{item.name}</strong>
        </div>
      </Popup>
    </Marker>
  );
}
