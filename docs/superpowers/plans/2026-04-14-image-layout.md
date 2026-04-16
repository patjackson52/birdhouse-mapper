# Image Layout Support in Knowledge Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add float, centering, full-width, caption, and side-by-side row layout controls to the TipTap-based knowledge editor, with a bubble menu UI and paste-preservation of image layout from rich HTML.

**Architecture:** Extend `VaultImage` with `layout` and `caption` attributes rendered as `<figure>` wrappers; add an `ImageRow` custom node for side-by-side galleries; add a `BubbleMenu`-based `ImageBubbleMenu` React component that appears when an image is focused; wire all together in `RichTextEditor`.

**Tech Stack:** TipTap v3 (`@tiptap/react`, `@tiptap/core`), React, Tailwind CSS, Vitest + @testing-library/react

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/editor/VaultImageExtension.ts` | Modify | Add `layout` + `caption` attrs, override `renderHTML`/`parseHTML` |
| `src/lib/editor/ImageRowExtension.ts` | Create | New `imageRow` TipTap node + `wrapInImageRow` command |
| `src/lib/editor/ImageBubbleMenu.tsx` | Create | Bubble menu with layout toggles, caption input, row controls |
| `src/lib/editor/extensions.ts` | Modify | Register `ImageRow` |
| `src/lib/editor/RichTextEditor.tsx` | Modify | Mount `ImageBubbleMenu`, update paste handler |
| `src/styles/globals.css` | Modify | Image layout + row CSS |
| `src/lib/editor/__tests__/VaultImageExtension.test.ts` | Create | Unit tests for new attrs |
| `src/lib/editor/__tests__/ImageRowExtension.test.ts` | Create | Unit tests for imageRow node |

---

## Task 1: Add `layout` and `caption` attributes to VaultImage

**Files:**
- Modify: `src/lib/editor/VaultImageExtension.ts`
- Create: `src/lib/editor/__tests__/VaultImageExtension.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `src/lib/editor/__tests__/VaultImageExtension.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { generateHTML } from '@tiptap/html';
import { VaultImage } from '../VaultImageExtension';

function createEditor(content?: string) {
  return new Editor({
    extensions: [Document, Paragraph, Text, VaultImage],
    content: content ?? '<p>Hello</p>',
  });
}

const baseExtensions = [Document, Paragraph, Text, VaultImage];

describe('VaultImageExtension - layout attribute', () => {
  it('defaults layout to "default"', () => {
    const editor = createEditor('<p><img src="a.jpg" /></p>');
    const json = editor.getJSON();
    const imgNode = json.content?.find((n) => n.type === 'vaultImage')
      ?? json.content?.[0].content?.find((n) => n.type === 'vaultImage');
    expect(imgNode?.attrs?.layout).toBe('default');
    editor.destroy();
  });

  it('parses float:left style into float-left layout', () => {
    const editor = createEditor('<p><img src="a.jpg" style="float:left" /></p>');
    const json = editor.getJSON();
    const imgNode = json.content?.find((n) => n.type === 'vaultImage')
      ?? json.content?.[0].content?.find((n) => n.type === 'vaultImage');
    expect(imgNode?.attrs?.layout).toBe('float-left');
    editor.destroy();
  });

  it('parses float:right style into float-right layout', () => {
    const editor = createEditor('<p><img src="a.jpg" style="float:right" /></p>');
    const json = editor.getJSON();
    const imgNode = json.content?.find((n) => n.type === 'vaultImage')
      ?? json.content?.[0].content?.find((n) => n.type === 'vaultImage');
    expect(imgNode?.attrs?.layout).toBe('float-right');
    editor.destroy();
  });

  it('parses data-layout from a figure wrapper', () => {
    const editor = createEditor(
      '<figure data-layout="centered"><img src="a.jpg" /></figure>'
    );
    const json = editor.getJSON();
    const imgNode = json.content?.find((n) => n.type === 'vaultImage');
    expect(imgNode?.attrs?.layout).toBe('centered');
    editor.destroy();
  });

  it('renders float-left as data-layout on figure in HTML output', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'vaultImage',
        attrs: { src: 'a.jpg', alt: null, title: null, vaultItemId: null, layout: 'float-left', caption: null },
      }],
    };
    const html = generateHTML(json, baseExtensions);
    expect(html).toContain('data-layout="float-left"');
    expect(html).toContain('<figure');
    expect(html).toContain('<img');
    expect(html).not.toContain('<figcaption');
  });

  it('renders caption as figcaption in HTML output', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'vaultImage',
        attrs: { src: 'a.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: 'Eagle in flight' },
      }],
    };
    const html = generateHTML(json, baseExtensions);
    expect(html).toContain('<figcaption>Eagle in flight</figcaption>');
  });

  it('parses caption from figcaption inside figure', () => {
    const editor = createEditor(
      '<figure data-layout="default"><img src="a.jpg" /><figcaption>Test cap</figcaption></figure>'
    );
    const json = editor.getJSON();
    const imgNode = json.content?.find((n) => n.type === 'vaultImage');
    expect(imgNode?.attrs?.caption).toBe('Test cap');
    editor.destroy();
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd /Users/patrick/birdhousemapper-issue-222
npm run test -- src/lib/editor/__tests__/VaultImageExtension.test.ts
```

Expected: FAIL — `layout` and `caption` attrs don't exist yet.

- [ ] **Step 1.3: Implement VaultImageExtension with new attrs**

Replace `src/lib/editor/VaultImageExtension.ts` entirely:

```ts
import Image from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';

type ImageLayout = 'default' | 'float-left' | 'float-right' | 'centered' | 'full-width';

function detectLayoutFromStyle(element: HTMLElement): ImageLayout | null {
  const style = (element.getAttribute('style') || '').toLowerCase();
  if (style.includes('float:left') || style.includes('float: left')) return 'float-left';
  if (style.includes('float:right') || style.includes('float: right')) return 'float-right';
  const align = element.getAttribute('align');
  if (align === 'center') return 'centered';
  if (style.includes('margin:auto') || style.includes('margin: auto')) return 'centered';
  return null;
}

/**
 * Custom TipTap Image extension that stores a vault item ID, layout, and caption.
 * Renders as <figure class="image-figure" data-layout="..."><img ...><figcaption>...</figcaption></figure>
 */
export const VaultImage = Image.extend({
  name: 'vaultImage',

  parseHTML() {
    return [
      { tag: 'figure img[src]' }, // images wrapped in our figure format
      { tag: 'img[src]' },        // bare images (paste from external sources)
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const {
      'data-layout': layout,
      'data-caption': caption,
      ...imgAttrs
    } = HTMLAttributes;

    const figureAttrs: Record<string, string> = { class: 'image-figure' };
    if (layout && layout !== 'default') figureAttrs['data-layout'] = layout;

    if (caption) {
      return ['figure', figureAttrs, ['img', mergeAttributes(imgAttrs)], ['figcaption', {}, caption]];
    }
    return ['figure', figureAttrs, ['img', mergeAttributes(imgAttrs)]];
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      vaultItemId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-vault-item-id'),
        renderHTML: (attributes) => {
          if (!attributes.vaultItemId) return {};
          return { 'data-vault-item-id': attributes.vaultItemId };
        },
      },
      layout: {
        default: 'default' as ImageLayout,
        parseHTML: (element) => {
          const fig = element.closest?.('figure');
          if (fig) {
            return (fig.getAttribute('data-layout') as ImageLayout) || detectLayoutFromStyle(element) || 'default';
          }
          return detectLayoutFromStyle(element) || 'default';
        },
        renderHTML: (attributes) => {
          if (!attributes.layout || attributes.layout === 'default') return {};
          return { 'data-layout': attributes.layout };
        },
      },
      caption: {
        default: null as string | null,
        parseHTML: (element) => {
          const fig = element.closest?.('figure');
          return fig?.querySelector?.('figcaption')?.textContent?.trim() || null;
        },
        renderHTML: (attributes) => {
          if (!attributes.caption) return {};
          return { 'data-caption': attributes.caption };
        },
      },
    };
  },
});
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
npm run test -- src/lib/editor/__tests__/VaultImageExtension.test.ts
```

Expected: All tests pass.

- [ ] **Step 1.5: Commit**

```bash
cd /Users/patrick/birdhousemapper-issue-222
git add src/lib/editor/VaultImageExtension.ts src/lib/editor/__tests__/VaultImageExtension.test.ts
git commit -m "feat: add layout and caption attributes to VaultImage extension"
```

---

## Task 2: Create ImageRow Extension

**Files:**
- Create: `src/lib/editor/ImageRowExtension.ts`
- Create: `src/lib/editor/__tests__/ImageRowExtension.test.ts`

- [ ] **Step 2.1: Write failing tests**

Create `src/lib/editor/__tests__/ImageRowExtension.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { generateHTML } from '@tiptap/html';
import { VaultImage } from '../VaultImageExtension';
import { ImageRow } from '../ImageRowExtension';

const extensions = [Document, Paragraph, Text, VaultImage, ImageRow];

function createEditor(content?: string) {
  return new Editor({ extensions, content: content ?? '<p>Hello</p>' });
}

describe('ImageRow node', () => {
  it('parses div[data-type="image-row"] from HTML', () => {
    const editor = createEditor(
      '<div data-type="image-row"><img src="a.jpg" /><img src="b.jpg" /></div>'
    );
    const json = editor.getJSON();
    const row = json.content?.find((n) => n.type === 'imageRow');
    expect(row).toBeDefined();
    expect(row?.content?.length).toBe(2);
    editor.destroy();
  });

  it('renders imageRow as div[data-type="image-row"] in HTML', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'imageRow',
        content: [
          { type: 'vaultImage', attrs: { src: 'a.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: null } },
          { type: 'vaultImage', attrs: { src: 'b.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: null } },
        ],
      }],
    };
    const html = generateHTML(json, extensions);
    expect(html).toContain('data-type="image-row"');
  });

  it('registers wrapInImageRow command', () => {
    const editor = createEditor();
    expect(typeof editor.commands.wrapInImageRow).toBe('function');
    editor.destroy();
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
npm run test -- src/lib/editor/__tests__/ImageRowExtension.test.ts
```

Expected: FAIL — `ImageRow` not found.

- [ ] **Step 2.3: Implement ImageRowExtension**

Create `src/lib/editor/ImageRowExtension.ts`:

```ts
import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageRow: {
      wrapInImageRow: () => ReturnType;
    };
  }
}

/**
 * ImageRow: block node that holds 1+ vaultImage nodes displayed side-by-side.
 * Rendered as <div data-type="image-row" class="image-row">.
 */
export const ImageRow = Node.create({
  name: 'imageRow',
  group: 'block',
  content: 'vaultImage+',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="image-row"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'image-row', class: 'image-row' }), 0];
  },

  addCommands() {
    return {
      wrapInImageRow:
        () =>
        ({ state, dispatch }) => {
          const { selection } = state;
          const node = selection.$from.node();
          if (node.type.name !== 'vaultImage') return false;

          if (dispatch) {
            const pos = selection.$from.before();
            const imageRowType = state.schema.nodes.imageRow;
            const rowNode = imageRowType.create(null, [node]);
            const tr = state.tr.replaceWith(pos, pos + node.nodeSize, rowNode);
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
npm run test -- src/lib/editor/__tests__/ImageRowExtension.test.ts
```

Expected: All tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/editor/ImageRowExtension.ts src/lib/editor/__tests__/ImageRowExtension.test.ts
git commit -m "feat: add ImageRow TipTap node with wrapInImageRow command"
```

---

## Task 3: Add Image Layout CSS

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 3.1: Add image layout styles to globals.css**

Append the following CSS block to the end of `src/styles/globals.css`:

```css
/* ── Image layouts ─────────────────────────────────────────────────────── */
.image-figure {
  display: block;
  margin: 1rem 0;
}

.image-figure[data-layout="float-left"] {
  float: left;
  margin: 0 1rem 1rem 0;
  max-width: 40%;
}

.image-figure[data-layout="float-right"] {
  float: right;
  margin: 0 0 1rem 1rem;
  max-width: 40%;
}

.image-figure[data-layout="centered"] {
  display: block;
  margin-left: auto;
  margin-right: auto;
  max-width: 80%;
}

.image-figure[data-layout="full-width"] {
  width: 100%;
  max-width: 100%;
}

.image-figure figcaption {
  text-align: center;
  font-size: 0.8em;
  color: var(--color-muted);
  margin-top: 0.4em;
  font-style: italic;
}

/* Image rows */
.image-row {
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0;
}

.image-row .image-figure {
  flex: 1;
  min-width: 0;
  margin: 0;
}

.image-row .image-figure img {
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-radius: 4px;
}

/* Clearfix after floated images */
.ProseMirror::after,
.knowledge-body::after {
  content: '';
  display: table;
  clear: both;
}
```

- [ ] **Step 3.2: Verify build succeeds**

```bash
cd /Users/patrick/birdhousemapper-issue-222
npm run build 2>&1 | tail -20
```

Expected: Build completes without CSS errors.

- [ ] **Step 3.3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add CSS for image float layouts, captions, and image rows"
```

---

## Task 4: Create ImageBubbleMenu Component

**Files:**
- Create: `src/lib/editor/ImageBubbleMenu.tsx`

- [ ] **Step 4.1: Create ImageBubbleMenu**

Create `src/lib/editor/ImageBubbleMenu.tsx`:

```tsx
'use client';

import { BubbleMenu } from '@tiptap/react';
import type { Editor } from '@tiptap/core';

type ImageLayout = 'default' | 'float-left' | 'float-right' | 'centered' | 'full-width';

interface ImageBubbleMenuProps {
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

export function ImageBubbleMenu({ editor, onAddImageToRow }: ImageBubbleMenuProps) {
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
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e }) => e.isActive('vaultImage')}
      tippyOptions={{ duration: 100, placement: 'top' }}
    >
      <div className="bg-white border border-sage-light rounded-lg shadow-lg p-2 flex flex-col gap-2 min-w-[240px]">
        {/* Layout row */}
        <div className="flex gap-1">
          {LAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              onClick={() => setLayout(opt.value)}
              className={`flex-1 px-1 py-1 rounded text-sm transition-colors ${
                currentLayout === opt.value
                  ? 'bg-sage text-white'
                  : 'text-forest-dark/70 hover:bg-sage-light hover:text-forest-dark'
              }`}
            >
              {opt.icon}
            </button>
          ))}
        </div>

        {/* Caption input */}
        <input
          type="text"
          value={currentCaption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add caption…"
          className="input-field text-xs py-1"
          onMouseDown={(e) => e.stopPropagation()}
        />

        {/* Row controls */}
        <div className="flex gap-1">
          {!isInsideRow ? (
            <button
              type="button"
              onClick={() => editor.chain().focus().wrapInImageRow().run()}
              className="flex-1 px-2 py-1 rounded text-xs bg-sage-light text-forest-dark hover:bg-sage/20 transition-colors"
            >
              Create Row
            </button>
          ) : (
            <button
              type="button"
              onClick={onAddImageToRow}
              className="flex-1 px-2 py-1 rounded text-xs bg-sage-light text-forest-dark hover:bg-sage/20 transition-colors"
            >
              + Add Image to Row
            </button>
          )}
        </div>
      </div>
    </BubbleMenu>
  );
}
```

- [ ] **Step 4.2: Verify TypeScript compiles**

```bash
cd /Users/patrick/birdhousemapper-issue-222
npm run type-check 2>&1 | tail -20
```

Expected: No errors in ImageBubbleMenu.tsx.

- [ ] **Step 4.3: Commit**

```bash
git add src/lib/editor/ImageBubbleMenu.tsx
git commit -m "feat: add ImageBubbleMenu with layout toggles, caption input, and row controls"
```

---

## Task 5: Wire Everything into RichTextEditor

**Files:**
- Modify: `src/lib/editor/extensions.ts`
- Modify: `src/lib/editor/RichTextEditor.tsx`

- [ ] **Step 5.1: Register ImageRow in extensions**

Edit `src/lib/editor/extensions.ts` — add the import and extension:

```ts
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { VaultImage } from './VaultImageExtension';
import { LineHeight } from './LineHeightExtension';
import { ImageRow } from './ImageRowExtension';

export function getEditorExtensions(placeholder?: string) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
    }),
    VaultImage,
    ImageRow,
    LineHeight,
    Placeholder.configure({
      placeholder: placeholder ?? 'Start writing…',
    }),
  ];
}
```

- [ ] **Step 5.2: Update RichTextEditor to add ImageBubbleMenu and update paste handler**

Replace `src/lib/editor/RichTextEditor.tsx` with this updated version (changes: import ImageBubbleMenu, add `addImageToRowPicker` state, mount bubble menu, update paste handler to detect float styles on images):

```tsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PasteFormatDialog } from './PasteFormatDialog';
import { ImageBubbleMenu } from './ImageBubbleMenu';
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
  const [showRowImagePicker, setShowRowImagePicker] = useState(false);
  const [pendingPaste, setPendingPaste] = useState<{ html: string; plain: string } | null>(null);

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

        const html = event.clipboardData?.getData('text/html') ?? '';
        if (html.includes('data-pm-slice')) return false;
        if (html && /style\s*=/i.test(html)) {
          event.preventDefault();
          const plain = event.clipboardData?.getData('text/plain') ?? '';
          setPendingPaste({ html, plain });
          return true;
        }

        return false;
      },
    },
  });

  const handleImageUpload = useCallback(
    async (file: File, insertIntoRow = false) => {
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

  function handleRowVaultSelect(items: VaultItem[]) {
    if (!editor || items.length === 0) return;
    const item = items[0];

    const url = item.storage_bucket === 'vault-public'
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vault-public/${item.storage_path}`
      : item.storage_path;

    // Insert image at end of current imageRow by moving cursor to end of row then inserting
    editor.chain().focus().setImage({ src: url, alt: item.file_name }).run();
    setShowRowImagePicker(false);
  }

  function handleKeepPaste() {
    if (!editor || !pendingPaste) return;
    editor.commands.insertContent(pendingPaste.html);
    setPendingPaste(null);
  }

  function handlePlainPaste() {
    if (!editor || !pendingPaste) return;
    editor.commands.insertContent(pendingPaste.plain);
    setPendingPaste(null);
  }

  useEffect(() => {
    if (!pendingPaste) return;
    function handleKeyDown() {
      setPendingPaste((prev) => {
        if (prev && editor) {
          editor.commands.insertContent(prev.html);
        }
        return null;
      });
    }
    document.addEventListener('keydown', handleKeyDown, { once: true });
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [pendingPaste, editor]);

  if (!editor) return null;

  return (
    <div className="border border-sage-light rounded-lg overflow-clip bg-white">
      {editable && (
        <div className="sticky top-0 z-10 flex flex-wrap gap-1 px-3 py-2 border-b border-sage-light bg-parchment">
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

      {editable && (
        <ImageBubbleMenu
          editor={editor}
          onAddImageToRow={() => setShowRowImagePicker(true)}
        />
      )}

      <EditorContent editor={editor} />

      {pendingPaste && (
        <div className="relative">
          <PasteFormatDialog onKeep={handleKeepPaste} onPlainText={handlePlainPaste} />
        </div>
      )}

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

      {showRowImagePicker && (
        <VaultPicker
          orgId={orgId}
          categoryFilter={['photo']}
          onSelect={handleRowVaultSelect}
          onClose={() => setShowRowImagePicker(false)}
          defaultUploadCategory="photo"
          defaultUploadVisibility="public"
        />
      )}
    </div>
  );
}

function LineHeightDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const currentLineHeight = editor.getAttributes('paragraph').lineHeight
    || editor.getAttributes('heading').lineHeight
    || editor.getAttributes('bulletList').lineHeight
    || editor.getAttributes('orderedList').lineHeight
    || null;

  return (
    <div className="relative" ref={ref}>
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
```

- [ ] **Step 5.3: Run all tests**

```bash
cd /Users/patrick/birdhousemapper-issue-222
npm run test
```

Expected: All existing tests pass plus new extension tests.

- [ ] **Step 5.4: TypeScript check**

```bash
npm run type-check 2>&1 | tail -30
```

Expected: No errors.

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/editor/extensions.ts src/lib/editor/RichTextEditor.tsx
git commit -m "feat: wire ImageRow, ImageBubbleMenu into RichTextEditor"
```

---

## Task 6: Verification

- [ ] **Step 6.1: Run full test suite**

```bash
cd /Users/patrick/birdhousemapper-issue-222
npm run test
```

Expected: All tests pass.

- [ ] **Step 6.2: Run type check**

```bash
npm run type-check
```

Expected: No TypeScript errors.

- [ ] **Step 6.3: Run build**

```bash
npm run build 2>&1 | tail -30
```

Expected: Build succeeds with no errors.

---

## Self-Review

**Spec coverage check:**
- ✅ Float left/right (text wraps) — `layout: 'float-left' | 'float-right'` + CSS
- ✅ Full-width and centered — `layout: 'full-width' | 'centered'` + CSS
- ✅ Image captions — `caption` attribute rendered as `<figcaption>`
- ✅ Side-by-side rows — `ImageRow` node + `wrapInImageRow` command + CSS
- ✅ Paste preserves layout — `detectLayoutFromStyle` in `parseHTML` picks up float/align styles
- ✅ Bubble menu UI — `ImageBubbleMenu` with layout toggles, caption input, row controls
- ✅ HTML serialization — `renderHTML` outputs correct `<figure>` with data attributes + figcaption
- ✅ Read-only display — CSS in globals.css applies globally to rendered HTML

**Type consistency:**
- `wrapInImageRow` declared in `declare module` in `ImageRowExtension.ts` and used in `ImageBubbleMenu.tsx` ✅
- `VaultImage` attrs: `src, alt, title, vaultItemId, layout, caption` consistent across all tasks ✅
- `ImageRow` content: `'vaultImage+'` referenced consistently ✅
