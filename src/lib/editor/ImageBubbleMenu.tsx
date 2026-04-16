'use client';

import type { Editor } from '@tiptap/core';

type ImageLayout = 'default' | 'float-left' | 'float-right' | 'centered' | 'full-width';

interface ImageToolbarProps {
  editor: Editor;
  onAddImageToRow?: () => void;
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
 * Shows layout toggles, caption input, and row controls.
 */
export function ImageToolbar({ editor, onAddImageToRow }: ImageToolbarProps) {
  if (!editor.isActive('vaultImage')) return null;

  const isInsideRow = editor.isActive('imageRow');
  const currentLayout = (editor.getAttributes('vaultImage').layout as ImageLayout) ?? 'default';
  const currentCaption = (editor.getAttributes('vaultImage').caption as string) ?? '';

  function setLayout(layout: ImageLayout) {
    editor.chain().focus().updateAttributes('vaultImage', { layout }).run();
  }

  function setCaption(caption: string) {
    editor.chain().updateAttributes('vaultImage', { caption: caption || null }).run();
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

      {/* Row controls */}
      {!isInsideRow ? (
        <button
          type="button"
          onClick={() => editor.chain().focus().wrapInImageRow().run()}
          className="px-2 py-1 rounded text-xs bg-sage-light text-forest-dark hover:bg-sage/20 transition-colors"
        >
          Create Row
        </button>
      ) : (
        <button
          type="button"
          onClick={onAddImageToRow}
          className="px-2 py-1 rounded text-xs bg-sage-light text-forest-dark hover:bg-sage/20 transition-colors"
        >
          + Add Image to Row
        </button>
      )}
    </div>
  );
}
