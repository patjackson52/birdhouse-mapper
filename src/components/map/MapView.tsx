'use client';

import { MapContainer, TileLayer, ImageOverlay } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLngBoundsExpression } from 'leaflet';
import type { Item, ItemType } from '@/lib/types';
import { useConfig, useTheme } from '@/lib/config/client';
import ItemMarker from './ItemMarker';
import MapLegend from './MapLegend';

interface MapViewProps {
  items: Item[];
  itemTypes: ItemType[];
  onMarkerClick: (item: Item) => void;
}

export default function MapView({ items, itemTypes, onMarkerClick }: MapViewProps) {
  const config = useConfig();
  const theme = useTheme();
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
          attribution={theme.tileAttribution}
          url={theme.tileUrl}
        />
        {config.customMap && (
          <ImageOverlay
            url={config.customMap.url}
            bounds={[
              [config.customMap.bounds.southWest.lat, config.customMap.bounds.southWest.lng],
              [config.customMap.bounds.northEast.lat, config.customMap.bounds.northEast.lng],
            ] as LatLngBoundsExpression}
            opacity={config.customMap.opacity}
          />
        )}
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
