"use client";

import { useState, useEffect } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import { useConfig } from "@/lib/config/client";
import { distanceBetween } from "@/lib/location/utils";

const THRESHOLD_METERS = 805; // 0.5 miles

export default function GoToFieldButton() {
  const map = useMap();
  const config = useConfig();
  const [visible, setVisible] = useState(false);

  function checkDistance() {
    const center = map.getCenter();
    const dist = distanceBetween(
      center.lat,
      center.lng,
      config.mapCenter.lat,
      config.mapCenter.lng,
    );
    setVisible(dist > THRESHOLD_METERS);
  }

  useMapEvents({
    moveend: checkDistance,
  });

  useEffect(() => {
    checkDistance();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  const label = config.siteName || config.locationName;

  return (
    <div className="absolute top-3 right-4 md:left-14 md:right-auto z-[1000]">
      <button
        onClick={() =>
          map.flyTo(
            [config.mapCenter.lat, config.mapCenter.lng],
            config.mapCenter.zoom,
            { duration: 1 },
          )
        }
        className="flex items-center gap-1.5 bg-white rounded-lg shadow-lg border border-sage-light px-3 py-2 min-w-[44px] min-h-[44px] text-sm font-medium text-forest-dark hover:bg-sage-light transition-colors"
        aria-label={`Go to ${label}`}
      >
        <svg
          className="w-4 h-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
          />
        </svg>
        Go to {label}
      </button>
    </div>
  );
}
