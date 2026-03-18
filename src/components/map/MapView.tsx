'use client';

import { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, ImageOverlay, useMap } from 'react-leaflet';
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

/** Invalidates map size when fullscreen changes */
function MapResizer({ fullscreen }: { fullscreen: boolean }) {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [fullscreen, map]);
  return null;
}

export default function MapView({ items, itemTypes, onMarkerClick }: MapViewProps) {
  const config = useConfig();
  const theme = useTheme();
  const center: [number, number] = [config.mapCenter.lat, config.mapCenter.lng];
  const zoom = config.mapCenter.zoom;
  const [fullscreen, setFullscreen] = useState(false);

  // Build a lookup map for item types
  const typeMap = new Map(itemTypes.map((t) => [t.id, t]));

  // Escape key exits fullscreen
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && fullscreen) setFullscreen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreen]);

  const toggleFullscreen = useCallback(() => setFullscreen((f) => !f), []);

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-50 bg-white'
          : 'relative w-full h-full'
      }
    >
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <MapResizer fullscreen={fullscreen} />
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

      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-4 left-4 z-10 bg-white rounded-lg shadow-lg border border-sage-light p-2 text-forest-dark hover:bg-sage-light transition-colors"
        aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
      >
        {fullscreen ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v4m0-4h4m6 6l5 5m0 0v-4m0 4h-4M9 15l-5 5m0 0h4m-4 0v-4m11-6l5-5m0 0h-4m4 0v4" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0 0l-5-5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 0l-5 5" />
          </svg>
        )}
      </button>

      <MapLegend itemTypes={itemTypes} />
    </div>
  );
}
