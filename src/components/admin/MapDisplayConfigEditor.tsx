'use client';

import { useState, useEffect } from 'react';
import type { MapDisplayConfig } from '@/lib/config/map-display';
import type { ItemType, ItemStatus } from '@/lib/types';
import { statusColors, statusLabels } from '@/lib/utils';

interface ControlDef {
  key: keyof NonNullable<MapDisplayConfig['controls']>;
  label: string;
  description: string;
  icon: string;
}

const CONTROLS: ControlDef[] = [
  { key: 'legend', label: 'Legend', description: 'Status colors & item types', icon: '🗺️' },
  { key: 'locateMe', label: 'Current Position', description: 'Center map on user location', icon: '📍' },
  { key: 'viewAsList', label: 'View as List', description: 'Link to list view', icon: '📋' },
  { key: 'layerSelector', label: 'Layer Selector', description: 'Toggle geo layer visibility', icon: '🗂️' },
  { key: 'quickAdd', label: 'Quick Add', description: 'Floating add button', icon: '➕' },
];

const ALL_STATUSES: ItemStatus[] = ['active', 'planned', 'damaged', 'removed'];

interface Props {
  value: MapDisplayConfig | null;
  onChange: (config: MapDisplayConfig | null) => void;
  itemTypes: ItemType[];
  /** Org-level config for showing defaults on property page. Omit for org-level editing. */
  orgDefaults?: MapDisplayConfig | null;
}

export default function MapDisplayConfigEditor({ value, onChange, itemTypes, orgDefaults }: Props) {
  const config = value ?? {};
  const isPropertyLevel = orgDefaults !== undefined;

  function getControlValue(key: keyof NonNullable<MapDisplayConfig['controls']>): boolean {
    return config.controls?.[key] ?? (isPropertyLevel ? (orgDefaults?.controls?.[key] ?? true) : true);
  }

  function isControlOverridden(key: keyof NonNullable<MapDisplayConfig['controls']>): boolean {
    if (!isPropertyLevel) return false;
    return config.controls?.[key] !== undefined;
  }

  function getOrgDefault(key: keyof NonNullable<MapDisplayConfig['controls']>): boolean {
    return orgDefaults?.controls?.[key] ?? true;
  }

  function setControl(key: keyof NonNullable<MapDisplayConfig['controls']>, val: boolean) {
    const newControls = { ...config.controls, [key]: val };
    onChange({ ...config, controls: newControls });
  }

  function resetControl(key: keyof NonNullable<MapDisplayConfig['controls']>) {
    if (!config.controls) return;
    const newControls = { ...config.controls };
    delete newControls[key];
    const hasKeys = Object.keys(newControls).length > 0;
    onChange({ ...config, controls: hasKeys ? newControls : undefined });
  }

  function getLegendStatuses(): string[] | undefined {
    return config.legend?.statuses ?? (isPropertyLevel ? orgDefaults?.legend?.statuses : undefined);
  }

  function getLegendItemTypeIds(): string[] | undefined {
    return config.legend?.itemTypeIds ?? (isPropertyLevel ? orgDefaults?.legend?.itemTypeIds : undefined);
  }

  function setLegendStatuses(statuses: string[] | undefined) {
    const newLegend = { ...config.legend, statuses };
    if (!statuses) delete newLegend.statuses;
    const hasKeys = Object.keys(newLegend).length > 0;
    onChange({ ...config, legend: hasKeys ? newLegend : undefined });
  }

  function setLegendItemTypeIds(ids: string[] | undefined) {
    const newLegend = { ...config.legend, itemTypeIds: ids };
    if (!ids) delete newLegend.itemTypeIds;
    const hasKeys = Object.keys(newLegend).length > 0;
    onChange({ ...config, legend: hasKeys ? newLegend : undefined });
  }

  function toggleStatus(status: string) {
    const current = getLegendStatuses();
    if (!current) {
      setLegendStatuses(ALL_STATUSES.filter((s) => s !== status));
    } else if (current.includes(status)) {
      const next = current.filter((s) => s !== status);
      setLegendStatuses(next.length > 0 ? next : undefined);
    } else {
      setLegendStatuses([...current, status]);
    }
  }

  function toggleItemType(typeId: string) {
    const current = getLegendItemTypeIds();
    if (!current) {
      setLegendItemTypeIds(itemTypes.filter((t) => t.id !== typeId).map((t) => t.id));
    } else if (current.includes(typeId)) {
      const next = current.filter((id) => id !== typeId);
      setLegendItemTypeIds(next.length > 0 ? next : undefined);
    } else {
      setLegendItemTypeIds([...current, typeId]);
    }
  }

  function isStatusChecked(status: string): boolean {
    const statuses = getLegendStatuses();
    return !statuses || statuses.includes(status);
  }

  function isItemTypeChecked(typeId: string): boolean {
    const ids = getLegendItemTypeIds();
    return !ids || ids.includes(typeId);
  }

  const legendEnabled = getControlValue('legend');

  return (
    <div className="space-y-2">
      {CONTROLS.map((ctrl) => {
        const enabled = getControlValue(ctrl.key);
        const overridden = isControlOverridden(ctrl.key);
        const orgDefault = isPropertyLevel ? getOrgDefault(ctrl.key) : null;

        return (
          <div key={ctrl.key}>
            <div
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                overridden
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-sage-light/30 border-sage-light'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">{ctrl.icon}</span>
                <div>
                  <div className="text-sm font-medium text-forest-dark">{ctrl.label}</div>
                  {isPropertyLevel && (
                    <div className={`text-[10px] ${overridden ? 'text-amber-700' : 'text-sage'}`}>
                      Org default: {orgDefault ? 'On' : 'Off'}
                      {overridden && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            onClick={() => resetControl(ctrl.key)}
                            className="underline hover:no-underline"
                          >
                            Reset
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {!isPropertyLevel && (
                    <div className="text-[10px] text-sage">{ctrl.description}</div>
                  )}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setControl(ctrl.key, !enabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  enabled ? 'bg-forest' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                    enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {ctrl.key === 'legend' && legendEnabled && (
              <div className="ml-3 mt-2 p-3 rounded-lg border border-sage-light bg-white space-y-3">
                <div>
                  <div className="text-xs font-medium text-sage uppercase tracking-wider mb-2">Statuses</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_STATUSES.map((status) => {
                      const checked = isStatusChecked(status);
                      return (
                        <label
                          key={status}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer border transition-colors ${
                            checked
                              ? 'bg-green-50 border-green-300 text-forest-dark'
                              : 'bg-gray-50 border-gray-200 text-gray-400 line-through'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStatus(status)}
                            className="sr-only"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: statusColors[status as ItemStatus] }}
                          />
                          {statusLabels[status as ItemStatus]}
                        </label>
                      );
                    })}
                  </div>
                </div>
                {itemTypes.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-sage uppercase tracking-wider mb-2">Item Types</div>
                    <div className="flex flex-wrap gap-1.5">
                      {itemTypes.map((type) => {
                        const checked = isItemTypeChecked(type.id);
                        return (
                          <label
                            key={type.id}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer border transition-colors ${
                              checked
                                ? 'bg-green-50 border-green-300 text-forest-dark'
                                : 'bg-gray-50 border-gray-200 text-gray-400 line-through'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleItemType(type.id)}
                              className="sr-only"
                            />
                            <span>{type.icon}</span>
                            {type.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {isPropertyLevel && (config.legend?.statuses || config.legend?.itemTypeIds) && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...config, legend: undefined })}
                    className="text-[10px] text-amber-700 underline hover:no-underline"
                  >
                    Reset legend to org default
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
