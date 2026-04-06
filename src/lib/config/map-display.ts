export interface MapDisplayConfig {
  controls?: {
    legend?: boolean;
    layerSelector?: boolean;
    locateMe?: boolean;
    viewAsList?: boolean;
    quickAdd?: boolean;
  };
  legend?: {
    statuses?: string[];
    itemTypeIds?: string[];
  };
}

export interface ResolvedMapDisplayConfig {
  controls: {
    legend: boolean;
    layerSelector: boolean;
    locateMe: boolean;
    viewAsList: boolean;
    quickAdd: boolean;
  };
  legend: {
    statuses?: string[];
    itemTypeIds?: string[];
  };
}

/**
 * Merge org and property map display configs with cascade logic.
 * Controls: property per-key overrides org per-key, unset defaults to true.
 * Legend lists: property fully replaces org if set, otherwise falls through.
 */
export function resolveMapDisplayConfig(
  orgConfig: MapDisplayConfig | null | undefined,
  propertyConfig: MapDisplayConfig | null | undefined,
): ResolvedMapDisplayConfig {
  const orgControls = orgConfig?.controls;
  const propControls = propertyConfig?.controls;

  return {
    controls: {
      legend: propControls?.legend ?? orgControls?.legend ?? true,
      layerSelector: propControls?.layerSelector ?? orgControls?.layerSelector ?? true,
      locateMe: propControls?.locateMe ?? orgControls?.locateMe ?? true,
      viewAsList: propControls?.viewAsList ?? orgControls?.viewAsList ?? true,
      quickAdd: propControls?.quickAdd ?? orgControls?.quickAdd ?? true,
    },
    legend: {
      statuses: propertyConfig?.legend?.statuses ?? orgConfig?.legend?.statuses,
      itemTypeIds: propertyConfig?.legend?.itemTypeIds ?? orgConfig?.legend?.itemTypeIds,
    },
  };
}
