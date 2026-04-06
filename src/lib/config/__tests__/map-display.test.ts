import { describe, it, expect } from 'vitest';
import { resolveMapDisplayConfig } from '../map-display';
import type { MapDisplayConfig, ResolvedMapDisplayConfig } from '../map-display';

describe('resolveMapDisplayConfig', () => {
  it('returns all-true defaults when both org and property are null', () => {
    const result = resolveMapDisplayConfig(null, null);
    expect(result.controls.legend).toBe(true);
    expect(result.controls.layerSelector).toBe(true);
    expect(result.controls.locateMe).toBe(true);
    expect(result.controls.viewAsList).toBe(true);
    expect(result.controls.quickAdd).toBe(true);
    expect(result.legend.statuses).toBeUndefined();
    expect(result.legend.itemTypeIds).toBeUndefined();
  });

  it('uses org config when property is null', () => {
    const org: MapDisplayConfig = {
      controls: { legend: false, quickAdd: false },
      legend: { statuses: ['active', 'planned'] },
    };
    const result = resolveMapDisplayConfig(org, null);
    expect(result.controls.legend).toBe(false);
    expect(result.controls.layerSelector).toBe(true);
    expect(result.controls.quickAdd).toBe(false);
    expect(result.legend.statuses).toEqual(['active', 'planned']);
  });

  it('property controls override org controls per-key', () => {
    const org: MapDisplayConfig = {
      controls: { legend: false, locateMe: false },
    };
    const property: MapDisplayConfig = {
      controls: { legend: true },
    };
    const result = resolveMapDisplayConfig(org, property);
    expect(result.controls.legend).toBe(true);    // property overrides
    expect(result.controls.locateMe).toBe(false);  // falls through to org
    expect(result.controls.layerSelector).toBe(true); // default
  });

  it('property legend statuses fully replace org legend statuses', () => {
    const org: MapDisplayConfig = {
      legend: { statuses: ['active', 'planned'] },
    };
    const property: MapDisplayConfig = {
      legend: { statuses: ['active', 'damaged'] },
    };
    const result = resolveMapDisplayConfig(org, property);
    expect(result.legend.statuses).toEqual(['active', 'damaged']);
  });

  it('property legend itemTypeIds fully replace org itemTypeIds', () => {
    const org: MapDisplayConfig = {
      legend: { itemTypeIds: ['id-1', 'id-2'] },
    };
    const property: MapDisplayConfig = {
      legend: { itemTypeIds: ['id-3'] },
    };
    const result = resolveMapDisplayConfig(org, property);
    expect(result.legend.itemTypeIds).toEqual(['id-3']);
  });

  it('falls through to org legend when property legend is undefined', () => {
    const org: MapDisplayConfig = {
      legend: { statuses: ['active'], itemTypeIds: ['id-1'] },
    };
    const property: MapDisplayConfig = {
      controls: { quickAdd: false },
    };
    const result = resolveMapDisplayConfig(org, property);
    expect(result.legend.statuses).toEqual(['active']);
    expect(result.legend.itemTypeIds).toEqual(['id-1']);
  });
});
