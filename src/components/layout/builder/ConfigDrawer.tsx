'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import type { LayoutBlockV2, BlockConfigV2, FractionalWidth, BlockAlign, BlockPermissions } from '@/lib/layout/types-v2';
import type { CustomField, EntityType } from '@/lib/types';
import BlockConfigPanelV2 from './BlockConfigPanelV2';

interface ConfigDrawerProps {
  block: LayoutBlockV2 | null;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onConfigChange: (blockId: string, config: BlockConfigV2) => void;
  onWidthChange: (blockId: string, width: FractionalWidth) => void;
  onAlignChange: (blockId: string, align: BlockAlign) => void;
  onPermissionsChange: (blockId: string, permissions: BlockPermissions | undefined) => void;
  onDelete: (blockId: string) => void;
  onClose: () => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
  isMobile?: boolean;
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
  onWidthChange,
  onAlignChange,
  onPermissionsChange,
  onDelete,
  onClose,
  onCreateField,
  isMobile = false,
}: ConfigDrawerProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // --- Mobile snap-point drawer state ---
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [dragOffset, setDragOffset] = useState(0); // px the drawer is dragged down from open position
  const [isSnapping, setIsSnapping] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const dragStartY = useRef(0);
  const dragStartOffset = useRef(0);
  const isDragging = useRef(false);

  // Measure content height when block changes
  useEffect(() => {
    if (!block || !isMobile) return;
    // Reset state for new block
    setDragOffset(0);
    setIsDismissing(false);
    setShowDeleteConfirm(false);

    const measure = () => {
      if (contentRef.current) {
        const maxH = window.innerHeight * 0.7;
        setContentHeight(Math.min(contentRef.current.scrollHeight, maxH));
      }
    };
    // Measure after render
    requestAnimationFrame(measure);
  }, [block?.id, block?.type, isMobile]);

  // Re-measure when delete confirm toggled (changes content size)
  useEffect(() => {
    if (!isMobile || !contentRef.current) return;
    requestAnimationFrame(() => {
      if (contentRef.current) {
        const maxH = window.innerHeight * 0.7;
        setContentHeight(Math.min(contentRef.current.scrollHeight, maxH));
      }
    });
  }, [showDeleteConfirm, isMobile]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartOffset.current = dragOffset;
    setIsSnapping(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [dragOffset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientY - dragStartY.current;
    // Can drag down (positive) freely, but cannot drag above content (negative clamped to 0)
    const newOffset = Math.max(0, dragStartOffset.current + delta);
    setDragOffset(newOffset);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsSnapping(true);

    // If dragged below 50% of content height → dismiss, otherwise snap to open
    if (dragOffset > contentHeight * 0.5) {
      setIsDismissing(true);
      setDragOffset(contentHeight);
      setTimeout(onClose, 250);
    } else {
      setDragOffset(0);
    }
  }, [dragOffset, contentHeight, onClose]);

  if (!block) return null;

  const drawerInner = (
    <>
      {/* Drag handle */}
      <div
        className="flex justify-center py-2.5 cursor-ns-resize touch-none flex-shrink-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="w-9 h-1.5 bg-gray-300 rounded-full" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-sage-light flex-shrink-0">
        <span className="font-medium text-forest-dark">
          {BLOCK_LABELS[block.type] ?? block.type}
        </span>
        <button onClick={onClose} aria-label="Close">
          <X size={20} className="text-sage" />
        </button>
      </div>

      {/* Config content */}
      <div className="px-4 py-3">
        <BlockConfigPanelV2
          block={block}
          customFields={customFields}
          entityTypes={entityTypes}
          onConfigChange={onConfigChange}
          onWidthChange={onWidthChange}
          onAlignChange={onAlignChange}
          onPermissionsChange={onPermissionsChange}
          onCreateField={onCreateField}
        />
      </div>

      {/* Delete */}
      <div className="px-4 py-3 border-t border-sage-light flex-shrink-0">
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
    </>
  );

  // Mobile: inline drawer with snap-point behavior
  if (isMobile) {
    // Visible height = content height minus how far user dragged down
    const visibleHeight = Math.max(0, contentHeight - dragOffset);
    // Use auto height until first measurement to avoid 0-height flash
    const hasBeenMeasured = contentHeight > 0;

    return (
      <div
        className="flex flex-col bg-white flex-shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] overflow-hidden"
        style={{
          height: hasBeenMeasured ? visibleHeight : 'auto',
          maxHeight: '70vh',
          transition: isSnapping ? 'height 250ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
          paddingBottom: 'env(safe-area-inset-bottom)',
          opacity: isDismissing ? 0 : 1,
        }}
      >
        <div
          ref={contentRef}
          className="flex flex-col"
        >
          {drawerInner}
        </div>
      </div>
    );
  }

  // Desktop: fixed overlay with backdrop
  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="config-backdrop"
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[50vh] flex flex-col mx-auto max-w-[480px]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {drawerInner}
      </div>
    </>
  );
}
