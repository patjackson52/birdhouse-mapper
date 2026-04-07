'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import { useCallback, useState } from 'react';
import { getEditorExtensions } from './extensions';
import { uploadToVault } from '@/lib/vault/actions';
import VaultPicker from '@/components/vault/VaultPicker';
import type { VaultItem } from '@/lib/vault/types';
import type { RichTextEditorProps } from './types';
import type { Editor } from '@tiptap/core';

const LINE_HEIGHT_OPTIONS = [
  { value: '1', label: 'Compact' },
  { value: '1.15', label: 'Normal' },
  { value: '1.5', label: 'Relaxed' },
  { value: '2', label: 'Double' },
] as const;

export default function RichTextEditor({ content, onChange, orgId, editable = true }: RichTextEditorProps) {
  const [showVaultPicker, setShowVaultPicker] = useState(false);

  const editor = useEditor({
    extensions: getEditorExtensions(),
    content: content ?? undefined,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-base max-w-none focus:outline-none min-h-[200px] px-4 py-3',
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          const file = files[0];
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            handleImageUpload(file);
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) handleImageUpload(file);
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  const handleImageUpload = useCallback(
    async (file: File) => {
      if (!editor) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const result = await uploadToVault({
          orgId,
          file: { name: file.name, type: file.type, size: file.size, base64 },
          category: 'photo',
          visibility: 'public',
        });

        if ('success' in result) {
          const url = result.item.storage_bucket === 'vault-public'
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vault-public/${result.item.storage_path}`
            : result.item.storage_path;

          editor
            .chain()
            .focus()
            .setImage({ src: url, alt: file.name })
            .run();

          const { state } = editor;
          const { doc } = state;
          doc.descendants((node, pos) => {
            if (node.type.name === 'vaultImage' && node.attrs.src === url && !node.attrs.vaultItemId) {
              editor.view.dispatch(
                state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  vaultItemId: result.item.id,
                })
              );
            }
          });
        }
      };
      reader.readAsDataURL(file);
    },
    [editor, orgId]
  );

  function handleVaultSelect(items: VaultItem[]) {
    if (!editor || items.length === 0) return;
    const item = items[0];

    const url = item.storage_bucket === 'vault-public'
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vault-public/${item.storage_path}`
      : item.storage_path;

    editor
      .chain()
      .focus()
      .setImage({ src: url, alt: item.file_name })
      .run();

    setShowVaultPicker(false);
  }

  if (!editor) return null;

  return (
    <div className="border border-sage-light rounded-lg overflow-hidden bg-white">
      {editable && (
        <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-sage-light bg-parchment/50">
          <ToolbarButton
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
          >
            <span className="underline">U</span>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <span className="line-through">S</span>
          </ToolbarButton>

          <div className="w-px bg-sage-light mx-1" />

          <ToolbarButton
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            H3
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 4 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            title="Heading 4"
          >
            H4
          </ToolbarButton>

          <div className="w-px bg-sage-light mx-1" />

          <ToolbarButton
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            •
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Ordered List"
          >
            1.
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Blockquote"
          >
            &ldquo;
          </ToolbarButton>
          <LineHeightDropdown editor={editor} />

          <div className="w-px bg-sage-light mx-1" />

          <ToolbarButton
            active={false}
            onClick={() => {
              const url = window.prompt('Enter URL:');
              if (url) editor.chain().focus().setLink({ href: url }).run();
            }}
            title="Add Link"
          >
            🔗
          </ToolbarButton>
          <ToolbarButton
            active={false}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal Rule"
          >
            —
          </ToolbarButton>
          <ToolbarButton
            active={false}
            onClick={() => setShowVaultPicker(true)}
            title="Insert Image"
          >
            🖼
          </ToolbarButton>
        </div>
      )}

      <EditorContent editor={editor} />

      {showVaultPicker && (
        <VaultPicker
          orgId={orgId}
          categoryFilter={['photo']}
          onSelect={handleVaultSelect}
          onClose={() => setShowVaultPicker(false)}
          defaultUploadCategory="photo"
          defaultUploadVisibility="public"
        />
      )}
    </div>
  );
}

function LineHeightDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);

  const currentLineHeight = editor.getAttributes('paragraph').lineHeight
    || editor.getAttributes('heading').lineHeight
    || null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Line Spacing"
        className={`px-2 py-1 rounded text-sm transition-colors ${
          currentLineHeight
            ? 'bg-sage text-white'
            : 'text-forest-dark/70 hover:bg-sage-light hover:text-forest-dark'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="5" y1="3" x2="14" y2="3" />
          <line x1="5" y1="8" x2="14" y2="8" />
          <line x1="5" y1="13" x2="14" y2="13" />
          <polyline points="2,5 2,1 2,5" />
          <path d="M2 1L3.5 3M2 1L0.5 3" />
          <polyline points="2,11 2,15 2,11" />
          <path d="M2 15L3.5 13M2 15L0.5 13" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-sage-light rounded-lg shadow-lg z-50 py-1 min-w-[140px]">
          {LINE_HEIGHT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-sage-light transition-colors ${
                currentLineHeight === opt.value ? 'bg-sage/10 text-forest-dark font-medium' : 'text-forest-dark/70'
              }`}
              onClick={() => {
                if (currentLineHeight === opt.value) {
                  editor.chain().focus().unsetLineHeight().run();
                } else {
                  editor.chain().focus().setLineHeight(opt.value).run();
                }
                setOpen(false);
              }}
            >
              {opt.value} — {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded text-sm transition-colors ${
        active
          ? 'bg-sage text-white'
          : 'text-forest-dark/70 hover:bg-sage-light hover:text-forest-dark'
      }`}
    >
      {children}
    </button>
  );
}
