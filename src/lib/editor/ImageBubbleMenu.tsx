'use client';

import type { Editor } from '@tiptap/core';
import { SNAP_POINTS } from './resize-utils';

type ImageLayout = 'default' | 'float-left' | 'float-right' | 'centered' | 'full-width';

interface ImageToolbarProps {
  editor: Editor;
  onAddImageToGrid?: () => void;
}

const LAYOUT_OPTIONS: { value: ImageLayout; label: string; icon: string }[] = [
  { value: 'default', label: 'Default', icon: '□' },
  { value: 'float-left', label: 'Float Left', icon: '◧' },
  { value: 'float-right', label: 'Float Right', icon: '◨' },
  { value: 'centered', label: 'Center', icon: '◫' },
  { value: 'full-width', label: 'Full Width', icon: '▬' },
];

/**
 * Contextual toolbar that appears when a vaultImage node is selected.
 * Shows layout toggles, width picker, caption input, and grid controls.
 */
export function ImageToolbar({ editor, onAddImageToGrid }: ImageToolbarProps) {
  if (!editor.isActive('vaultImage')) return null;

  const isInsideGrid = editor.isActive('imageGrid');
  const currentLayout = (editor.getAttributes('vaultImage').layout as ImageLayout) ?? 'default';
  const currentCaption = (editor.getAttributes('vaultImage').caption as string) ?? '';
  const currentWidth = (editor.getAttributes('vaultImage').widthPercent as number | null);
  const isFullWidth = currentLayout === 'full-width';

  function setLayout(layout: ImageLayout) {
    editor.chain().focus().updateAttributes('vaultImage', { layout }).run();
  }

  function setCaption(caption: string) {
    editor.chain().updateAttributes('vaultImage', { caption: caption || null }).run();
  }

  function setWidth(widthPercent: number) {
    editor.chain().focus().updateAttributes('vaultImage', { widthPercent }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-sage-light bg-parchment">
      {/* Layout buttons */}
      <span className="text-xs text-forest-dark/50 mr-1">Layout:</span>
      {LAYOUT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.label}
          onClick={() => setLayout(opt.value)}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            currentLayout === opt.value
              ? 'bg-sage text-white'
              : 'text-forest-dark/70 hover:bg-sage-light hover:text-forest-dark'
          }`}
        >
          {opt.icon} <span className="text-xs">{opt.label}</span>
        </button>
      ))}

      {/* Width picker — hidden for full-width layout */}
      {!isFullWidth && (
        <>
          <div className="w-px bg-sage-light mx-1 self-stretch" />
          <span className="text-xs text-forest-dark/50 mr-1">Width:</span>
          {SNAP_POINTS.map((pt) => (
            <button
              key={pt}
              type="button"
              aria-label={`${pt}%`}
              onClick={() => setWidth(pt)}
              className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                currentWidth === pt
                  ? 'bg-sage text-white'
                  : 'text-forest-dark/70 hover:bg-sage-light hover:text-forest-dark'
              }`}
            >
              {pt}%
            </button>
          ))}
        </>
      )}

      <div className="w-px bg-sage-light mx-1 self-stretch" />

      {/* Caption input */}
      <input
        type="text"
        value={currentCaption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Add caption…"
        className="input-field text-xs py-1 max-w-[200px]"
        onMouseDown={(e) => e.stopPropagation()}
      />

      <div className="w-px bg-sage-light mx-1 self-stretch" />

      {/* Grid controls */}
      {!isInsideGrid ? (
        <button
          type="button"
          onClick={() => editor.chain().focus().wrapInImageGrid().run()}
          className="px-2 py-1 rounded text-xs bg-sage-light text-forest-dark hover:bg-sage/20 transition-colors"
        >
          Create Grid
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <span className="text-xs text-forest-dark/50 mr-1">Cols:</span>
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={String(n)}
              onClick={() => editor.chain().focus().setGridColumns(n).run()}
              className="px-1.5 py-0.5 rounded text-xs text-forest-dark/70 hover:bg-sage-light hover:text-forest-dark transition-colors"
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={onAddImageToGrid}
            className="px-2 py-1 rounded text-xs bg-sage-light text-forest-dark hover:bg-sage/20 transition-colors"
          >
            + Add Image
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().unwrapImageGrid().run()}
            className="px-2 py-1 rounded text-xs text-red-600/70 hover:bg-red-50 hover:text-red-700 transition-colors"
          >
            Unwrap Grid
          </button>
        </div>
      )}
    </div>
  );
}
