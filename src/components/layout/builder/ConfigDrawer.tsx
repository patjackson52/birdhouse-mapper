'use client';

import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import type { LayoutBlockV2, BlockConfigV2 } from '@/lib/layout/types-v2';
import type { CustomField, EntityType } from '@/lib/types';
import BlockConfigPanel from './BlockConfigPanel';

interface ConfigDrawerProps {
  block: LayoutBlockV2 | null;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onConfigChange: (blockId: string, config: BlockConfigV2) => void;
  onDelete: (blockId: string) => void;
  onClose: () => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
}

const BLOCK_LABELS: Record<string, string> = {
  field_display: 'Field',
  photo_gallery: 'Photo Gallery',
  status_badge: 'Status Badge',
  entity_list: 'Entity List',
  timeline: 'Timeline',
  text_label: 'Text Label',
  description: 'Description',
  divider: 'Divider',
  map_snippet: 'Map',
  action_buttons: 'Actions',
};

export default function ConfigDrawer({
  block,
  customFields,
  entityTypes,
  onConfigChange,
  onDelete,
  onClose,
  onCreateField,
}: ConfigDrawerProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!block) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="config-backdrop"
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[50vh] overflow-y-auto mx-auto max-w-[480px]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Swipe handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-sage-light rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-sage-light">
          <span className="font-medium text-forest-dark">
            {BLOCK_LABELS[block.type] ?? block.type}
          </span>
          <button onClick={onClose} aria-label="Close">
            <X size={20} className="text-sage" />
          </button>
        </div>

        {/* Config content — reuse existing BlockConfigPanel */}
        <div className="px-4 py-3">
          <BlockConfigPanel
            block={block as any}
            customFields={customFields}
            entityTypes={entityTypes}
            onConfigChange={(id, config) => onConfigChange(id, config as BlockConfigV2)}
            onCreateField={onCreateField}
          />
        </div>

        {/* Delete */}
        <div className="px-4 py-3 border-t border-sage-light">
          {showDeleteConfirm ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-red-600">Remove this block?</span>
              <div className="flex gap-2">
                <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary text-sm">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onDelete(block.id);
                    setShowDeleteConfirm(false);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-red-500 text-white hover:bg-red-600"
                >
                  Yes, Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600"
            >
              <Trash2 size={14} />
              Remove
            </button>
          )}
        </div>
      </div>
    </>
  );
}
