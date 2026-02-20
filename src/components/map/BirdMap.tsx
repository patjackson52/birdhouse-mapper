'use client';

import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Birdhouse } from '@/lib/types';
import BirdhouseMarker from './BirdhouseMarker';
import MapLegend from './MapLegend';

const ISLANDWOOD_CENTER: [number, number] = [47.6235, -122.5185];
const DEFAULT_ZOOM = 16;

interface BirdMapProps {
  birdhouses: Birdhouse[];
  onMarkerClick: (birdhouse: Birdhouse) => void;
}

export default function BirdMap({ birdhouses, onMarkerClick }: BirdMapProps) {
  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={ISLANDWOOD_CENTER}
        zoom={DEFAULT_ZOOM}
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {birdhouses.map((bh) => (
          <BirdhouseMarker
            key={bh.id}
            birdhouse={bh}
            onClick={onMarkerClick}
          />
        ))}
      </MapContainer>
      <MapLegend />
    </div>
  );
}
