'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import type { Feature, Polygon } from 'geojson';

interface DrawAreaControlProps {
  /** Called when user completes drawing a shape */
  onAreaDrawn: (area: Feature<Polygon> | null) => void;
  /** If true, show polygon tool in addition to rectangle */
  allowPolygon?: boolean;
}

export default function DrawAreaControl({ onAreaDrawn, allowPolygon = false }: DrawAreaControlProps) {
  const map = useMap();
  const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const controlRef = useRef<L.Control.Draw | null>(null);

  useEffect(() => {
    const drawnItems = drawnItemsRef.current;
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        rectangle: {
          shapeOptions: {
            color: '#6b7280',
            weight: 2,
            fillOpacity: 0.1,
            dashArray: '8, 6',
          },
        },
        polygon: allowPolygon ? {
          shapeOptions: {
            color: '#6b7280',
            weight: 2,
            fillOpacity: 0.1,
            dashArray: '8, 6',
          },
        } : false,
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });

    controlRef.current = drawControl;
    map.addControl(drawControl);

    const handleCreated = (e: any) => {
      drawnItems.clearLayers();
      const layer = e.layer;
      drawnItems.addLayer(layer);
      const geojson = layer.toGeoJSON() as Feature<Polygon>;
      onAreaDrawn(geojson);
    };

    const handleEdited = (e: any) => {
      const layers = e.layers;
      layers.eachLayer((layer: any) => {
        const geojson = layer.toGeoJSON() as Feature<Polygon>;
        onAreaDrawn(geojson);
      });
    };

    const handleDeleted = () => {
      if (drawnItems.getLayers().length === 0) {
        onAreaDrawn(null);
      }
    };

    map.on(L.Draw.Event.CREATED, handleCreated);
    map.on(L.Draw.Event.EDITED, handleEdited);
    map.on(L.Draw.Event.DELETED, handleDeleted);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.off(L.Draw.Event.EDITED, handleEdited);
      map.off(L.Draw.Event.DELETED, handleDeleted);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, onAreaDrawn, allowPolygon]);

  return null;
}
