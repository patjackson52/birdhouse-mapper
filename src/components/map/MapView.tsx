"use client";

import { useState, useCallback, useEffect } from "react";
import { MapContainer, TileLayer, ImageOverlay, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLngBoundsExpression } from "leaflet";
import type { Item, ItemType } from "@/lib/types";
import { useConfig, useTheme } from "@/lib/config/client";
import ItemMarker from "./ItemMarker";
import MapLegend from "./MapLegend";
import UserLocationLayer from "./UserLocationLayer";
import LocateButton from "./LocateButton";
import GoToFieldButton from "./GoToFieldButton";
import { useUserLocation } from "@/lib/location/provider";
import QuickAddSheet from "./QuickAddSheet";
import GeoLayerRenderer from "@/components/geo/GeoLayerRenderer";
import PropertyBoundary from "@/components/geo/PropertyBoundary";
import FeaturePopup from "@/components/geo/FeaturePopup";
import LayerControlPanel from "@/components/geo/LayerControlPanel";
import type { GeoLayerSummary } from "@/lib/geo/types";
import type { FeatureCollection, Feature } from "geojson";

interface MapViewProps {
  items: Item[];
  itemTypes: ItemType[];
  onMarkerClick: (item: Item) => void;
  geoLayers?: GeoLayerSummary[];
  geoLayerData?: Map<string, FeatureCollection>;
  boundaryGeoJSON?: FeatureCollection | null;
  onToggleGeoLayer?: (layerId: string) => void;
  visibleGeoLayerIds?: Set<string>;
}

/** Flies map to user position when trigger increments */
function FlyToUser({ trigger }: { trigger: number }) {
  const map = useMap();
  const { position } = useUserLocation();
  useEffect(() => {
    if (trigger > 0 && position) {
      map.flyTo([position.lat, position.lng], map.getZoom(), { duration: 1 });
    }
  }, [trigger, position, map]);
  return null;
}

/** Invalidates map size when fullscreen changes */
function MapResizer({ fullscreen }: { fullscreen: boolean }) {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [fullscreen, map]);
  return null;
}

export default function MapView({
  items,
  itemTypes,
  onMarkerClick,
  geoLayers,
  geoLayerData,
  boundaryGeoJSON,
  onToggleGeoLayer,
  visibleGeoLayerIds,
}: MapViewProps) {
  const config = useConfig();
  const theme = useTheme();
  const { position } = useUserLocation();
  const center: [number, number] = [config.mapCenter.lat, config.mapCenter.lng];
  const zoom = config.mapCenter.zoom;
  const [fullscreen, setFullscreen] = useState(false);
  const [flyToUserTrigger, setFlyToUserTrigger] = useState(0);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<{ feature: Feature; layerName: string } | null>(null);

  // Build a lookup map for item types
  const typeMap = new Map(itemTypes.map((t) => [t.id, t]));

  // Escape key exits fullscreen
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && fullscreen) setFullscreen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullscreen]);

  const toggleFullscreen = useCallback(() => setFullscreen((f) => !f), []);

  return (
    <div
      className={
        fullscreen ? "fixed inset-0 z-50 bg-white" : "relative w-full h-full"
      }
    >
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <MapResizer fullscreen={fullscreen} />
        <TileLayer attribution={theme.tileAttribution} url={theme.tileUrl} />
        {config.customMap && (
          <ImageOverlay
            url={config.customMap.url}
            bounds={
              [
                [
                  config.customMap.bounds.southWest.lat,
                  config.customMap.bounds.southWest.lng,
                ],
                [
                  config.customMap.bounds.northEast.lat,
                  config.customMap.bounds.northEast.lng,
                ],
              ] as LatLngBoundsExpression
            }
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
        <UserLocationLayer />
        <FlyToUser trigger={flyToUserTrigger} />
        <GoToFieldButton />

        {boundaryGeoJSON && <PropertyBoundary geojson={boundaryGeoJSON} />}

        {geoLayers?.filter((l) => visibleGeoLayerIds?.has(l.id)).map((l) => {
          const data = geoLayerData?.get(l.id);
          if (!data) return null;
          return (
            <GeoLayerRenderer
              key={l.id}
              geojson={data}
              layer={l}
              onFeatureClick={(feature, layerName) => setSelectedFeature({ feature, layerName })}
            />
          );
        })}
      </MapContainer>

      {geoLayers && geoLayers.length > 0 && (
        <LayerControlPanel
          layers={geoLayers}
          visibleLayerIds={visibleGeoLayerIds ?? new Set()}
          onToggleLayer={onToggleGeoLayer ?? (() => {})}
        />
      )}

      {selectedFeature && (
        <FeaturePopup
          feature={selectedFeature.feature}
          layerName={selectedFeature.layerName}
          onClose={() => setSelectedFeature(null)}
        />
      )}

      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 left-3 z-20 bg-white rounded-lg shadow-lg border border-sage-light p-3 min-w-[44px] min-h-[44px] text-forest-dark hover:bg-sage-light transition-colors"
        aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
      >
        {fullscreen ? (
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 9V4.5m0 0H4.5M9 4.5l-5.25 5.25M9 15v4.5m0 0H4.5M9 19.5l-5.25-5.25M15 9h4.5m0 0V4.5M19.5 9l-5.25-5.25M15 15h4.5m0 0v4.5M19.5 15l-5.25 5.25"
            />
          </svg>
        ) : (
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
            />
          </svg>
        )}
      </button>

      <LocateButton onLocate={() => setFlyToUserTrigger((n) => n + 1)} />
      <MapLegend itemTypes={itemTypes} />

      {/* Quick-add FAB */}
      <button
        onClick={() => setQuickAddOpen(true)}
        className="fixed bottom-24 right-4 z-30 bg-green-600 hover:bg-green-700 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-3xl font-light"
        aria-label="Quick add item"
      >
        +
      </button>

      <QuickAddSheet
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        defaultLocation={position ?? undefined}
      />
    </div>
  );
}
