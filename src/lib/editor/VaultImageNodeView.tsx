'use client';

import { useCallback, useRef, useState } from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { snapToPercent, LAYOUT_WIDTH_DEFAULTS } from './resize-utils';

type ImageLayout = 'default' | 'float-left' | 'float-right' | 'centered' | 'full-width';

/**
 * React NodeView for VaultImage. Renders the figure/img/figcaption structure
 * with an interactive resize handle in editor mode.
 */
export function VaultImageNodeView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const { src, alt, title, layout, caption, widthPercent } = node.attrs;
  const figureRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewPercent, setPreviewPercent] = useState<number | null>(null);

  const effectiveLayout = (layout as ImageLayout) || 'default';
  const effectiveWidth = widthPercent ?? LAYOUT_WIDTH_DEFAULTS[effectiveLayout] ?? 100;
  const isEditable = editor.isEditable;
  const isFullWidth = effectiveLayout === 'full-width';
  const isInsideGrid = editor.isActive('imageGrid');

  // Width style: grids control their own sizing, full-width is always 100%
  const widthStyle = isInsideGrid || isFullWidth ? undefined : `${dragging && previewPercent ? previewPercent : effectiveWidth}%`;

  // Float-right handle goes on left edge; all others on right edge
  const handleSide = effectiveLayout === 'float-right' ? 'left' : 'right';

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const editorEl = editor.view.dom.closest('.ProseMirror')?.parentElement;
      if (!editorEl) return;
      setDragging(true);
      const containerWidth = editorEl.clientWidth;

      function onMouseMove(ev: MouseEvent) {
        if (!figureRef.current) return;
        const rect = figureRef.current.getBoundingClientRect();
        let rawPercent: number;

        if (handleSide === 'right') {
          rawPercent = ((ev.clientX - rect.left) / containerWidth) * 100;
        } else {
          rawPercent = ((rect.right - ev.clientX) / containerWidth) * 100;
        }

        setPreviewPercent(snapToPercent(rawPercent));
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        setDragging(false);
        setPreviewPercent((current) => {
          if (current != null) {
            updateAttributes({ widthPercent: current });
          }
          return null;
        });
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [editor, handleSide, updateAttributes]
  );

  // Build figure class and data attributes to match renderHTML output
  const figureClasses = ['image-figure'];
  const dataAttrs: Record<string, string> = {};
  if (effectiveLayout !== 'default') dataAttrs['data-layout'] = effectiveLayout;
  if (widthPercent != null) dataAttrs['data-width-percent'] = String(widthPercent);

  return (
    <NodeViewWrapper
      as="figure"
      ref={figureRef}
      className={figureClasses.join(' ')}
      style={widthStyle ? { width: widthStyle } : undefined}
      {...dataAttrs}
    >
      <img src={src} alt={alt || ''} title={title || undefined} draggable={false} />

      {caption && <figcaption>{caption}</figcaption>}

      {/* Resize handle — only in editor mode, not inside grids, not full-width */}
      {isEditable && selected && !isInsideGrid && !isFullWidth && (
        <>
          <div
            className="vault-image-resize-handle"
            data-side={handleSide}
            onMouseDown={handleMouseDown}
            title={`Drag to resize (${dragging && previewPercent ? previewPercent : effectiveWidth}%)`}
          />
          {dragging && previewPercent != null && (
            <div className="vault-image-resize-guide">
              {previewPercent}%
            </div>
          )}
        </>
      )}
    </NodeViewWrapper>
  );
}
