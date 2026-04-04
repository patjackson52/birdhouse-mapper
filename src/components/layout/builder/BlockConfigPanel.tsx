'use client';

import type { LayoutBlock, BlockConfig, FieldDisplayConfig, PhotoGalleryConfig, TimelineConfig, TextLabelConfig, EntityListConfig } from '@/lib/layout/types';
import type { CustomField, EntityType } from '@/lib/types';
import InlineFieldCreator from './InlineFieldCreator';
import { useState } from 'react';

interface Props {
  block: LayoutBlock;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onConfigChange: (blockId: string, config: BlockConfig) => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
}

export default function BlockConfigPanel({ block, customFields, entityTypes, onConfigChange, onCreateField }: Props) {
  const [showFieldCreator, setShowFieldCreator] = useState(false);

  switch (block.type) {
    case 'field_display': {
      const config = block.config as FieldDisplayConfig;
      return (
        <div className="space-y-3 pt-2">
          <div>
            <label className="label">Field</label>
            <select
              value={config.fieldId}
              onChange={(e) => onConfigChange(block.id, { ...config, fieldId: e.target.value })}
              className="input-field"
            >
              <option value="">Select a field...</option>
              {customFields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          {!showFieldCreator && (
            <button
              onClick={() => setShowFieldCreator(true)}
              className="text-sm text-forest font-medium hover:underline"
            >
              + Create New Field
            </button>
          )}
          {showFieldCreator && (
            <InlineFieldCreator
              onCreateField={(field) => {
                onCreateField(field);
                setShowFieldCreator(false);
              }}
              onCancel={() => setShowFieldCreator(false)}
            />
          )}
          <div>
            <label className="label">Size</label>
            <div className="flex gap-1">
              {(['compact', 'normal', 'large'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onConfigChange(block.id, { ...config, size: s })}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    config.size === s ? 'bg-forest text-white' : 'bg-white border border-sage-light'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.showLabel}
              onChange={(e) => onConfigChange(block.id, { ...config, showLabel: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-forest-dark">Show label</span>
          </label>
        </div>
      );
    }

    case 'photo_gallery': {
      const config = block.config as PhotoGalleryConfig;
      return (
        <div className="space-y-3 pt-2">
          <div>
            <label className="label">Style</label>
            <div className="flex gap-1">
              {(['hero', 'grid', 'carousel'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onConfigChange(block.id, { ...config, style: s })}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    config.style === s ? 'bg-forest text-white' : 'bg-white border border-sage-light'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Max Photos: {config.maxPhotos}</label>
            <input
              type="range"
              min={1}
              max={20}
              value={config.maxPhotos}
              onChange={(e) => onConfigChange(block.id, { ...config, maxPhotos: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      );
    }

    case 'timeline': {
      const config = block.config as TimelineConfig;
      return (
        <div className="space-y-3 pt-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.showUpdates}
              onChange={(e) => onConfigChange(block.id, { ...config, showUpdates: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Show updates</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.showScheduled}
              onChange={(e) => onConfigChange(block.id, { ...config, showScheduled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Show scheduled</span>
          </label>
          <div>
            <label className="label">Max items: {config.maxItems}</label>
            <input
              type="range"
              min={1}
              max={50}
              value={config.maxItems}
              onChange={(e) => onConfigChange(block.id, { ...config, maxItems: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      );
    }

    case 'text_label': {
      const config = block.config as TextLabelConfig;
      return (
        <div className="space-y-3 pt-2">
          <div>
            <label className="label">Text</label>
            <input
              type="text"
              value={config.text}
              onChange={(e) => onConfigChange(block.id, { ...config, text: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Style</label>
            <div className="flex gap-1">
              {(['heading', 'subheading', 'body', 'caption'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onConfigChange(block.id, { ...config, style: s })}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    config.style === s ? 'bg-forest text-white' : 'bg-white border border-sage-light'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case 'entity_list': {
      const config = block.config as EntityListConfig;
      return (
        <div className="space-y-2 pt-2">
          <label className="label">Show entity types</label>
          {entityTypes.map((et) => (
            <label key={et.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.entityTypeIds.length === 0 || config.entityTypeIds.includes(et.id)}
                onChange={(e) => {
                  const ids = config.entityTypeIds.length === 0
                    ? entityTypes.map((t) => t.id).filter((id) => id !== et.id || e.target.checked)
                    : e.target.checked
                      ? [...config.entityTypeIds, et.id]
                      : config.entityTypeIds.filter((id) => id !== et.id);
                  onConfigChange(block.id, { ...config, entityTypeIds: ids });
                }}
                className="rounded"
              />
              <span className="text-sm">{et.icon} {et.name}</span>
            </label>
          ))}
        </div>
      );
    }

    default:
      return (
        <p className="text-xs text-sage italic pt-2">No configuration needed</p>
      );
  }
}
