'use client';

import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Item, ItemType } from '@/lib/types';
import { useConfig } from '@/lib/config/client';
import ItemMarker from './ItemMarker';
import MapLegend from './MapLegend';

interface MapViewProps {
  items: Item[];
  itemTypes: ItemType[];
  onMarkerClick: (item: Item) => void;
}

export default function MapView({ items, itemTypes, onMarkerClick }: MapViewProps) {
  const config = useConfig();
  const center: [number, number] = [config.mapCenter.lat, config.mapCenter.lng];
  const zoom = config.mapCenter.zoom;

  // Build a lookup map for item types
  const typeMap = new Map(itemTypes.map((t) => [t.id, t]));

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {items.map((item) => (
          <ItemMarker
            key={item.id}
            item={item}
            itemType={typeMap.get(item.item_type_id)}
            onClick={onMarkerClick}
          />
        ))}
      </MapContainer>
      <MapLegend itemTypes={itemTypes} />
    </div>
  );
}
