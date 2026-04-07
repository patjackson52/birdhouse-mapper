# Knowledge Editor Spacing & Paste Controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-paragraph line-height control and a paste formatting dialog to the TipTap-based knowledge editor, fixing the double-spaced content problem from pasted sources.

**Architecture:** A custom TipTap extension (`LineHeight`) adds a `lineHeight` global attribute to block nodes, rendered as inline `style="line-height: ..."`. A toolbar dropdown sets/unsets line height. A paste handler detects rich HTML and shows a dialog offering "Keep" vs "Plain text". All state stays in TipTap's JSON document — no DB changes needed.

**Tech Stack:** TipTap 3.x (`@tiptap/core`, `@tiptap/react`), React 18, Tailwind CSS, Vitest + @testing-library/react

---

## File Structure

| File | Role |
|------|------|
| `src/lib/editor/LineHeightExtension.ts` | **New** — TipTap extension: global `lineHeight` attribute + commands |
| `src/lib/editor/PasteFormatDialog.tsx` | **New** — floating dialog component for paste choice |
| `src/lib/editor/extensions.ts` | **Modify** — register LineHeight extension |
| `src/lib/editor/RichTextEditor.tsx` | **Modify** — add toolbar dropdown, paste handler, dialog integration |
| `src/lib/editor/__tests__/LineHeightExtension.test.ts` | **New** — unit tests for extension |
| `src/lib/editor/__tests__/PasteFormatDialog.test.tsx` | **New** — unit tests for paste dialog |
| `src/lib/editor/__tests__/RichTextEditor.test.tsx` | **New** — integration tests for toolbar + paste |

---

### Task 1: LineHeight Extension — Tests

**Files:**
- Create: `src/lib/editor/__tests__/LineHeightExtension.test.ts`

- [ ] **Step 1: Write tests for the LineHeight extension**

```ts
// src/lib/editor/__tests__/LineHeightExtension.test.ts

import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import { LineHeight } from '../LineHeightExtension';
import { generateHTML } from '@tiptap/html';

function createEditor(content?: string) {
  return new Editor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Heading.configure({ levels: [2, 3, 4] }),
      BulletList,
      OrderedList,
      ListItem,
      LineHeight,
    ],
    content: content ?? '<p>Hello world</p>',
  });
}

describe('LineHeightExtension', () => {
  it('registers setLineHeight and unsetLineHeight commands', () => {
    const editor = createEditor();
    expect(typeof editor.commands.setLineHeight).toBe('function');
    expect(typeof editor.commands.unsetLineHeight).toBe('function');
    editor.destroy();
  });

  it('sets lineHeight attribute on the current paragraph', () => {
    const editor = createEditor();
    editor.commands.setTextSelection(1);
    editor.commands.setLineHeight('1.5');
    const json = editor.getJSON();
    expect(json.content?.[0].attrs?.lineHeight).toBe('1.5');
    editor.destroy();
  });

  it('unsets lineHeight attribute', () => {
    const editor = createEditor();
    editor.commands.setTextSelection(1);
    editor.commands.setLineHeight('1.5');
    editor.commands.unsetLineHeight();
    const json = editor.getJSON();
    expect(json.content?.[0].attrs?.lineHeight).toBeNull();
    editor.destroy();
  });

  it('generates HTML with inline line-height style', () => {
    const extensions = [
      Document,
      Paragraph,
      Text,
      Heading.configure({ levels: [2, 3, 4] }),
      BulletList,
      OrderedList,
      ListItem,
      LineHeight,
    ];
    const json = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { lineHeight: '1.15' }, content: [{ type: 'text', text: 'Tight text' }] },
      ],
    };
    const html = generateHTML(json, extensions);
    expect(html).toContain('style="line-height: 1.15"');
    expect(html).toContain('Tight text');
  });

  it('does not add style attribute when lineHeight is null', () => {
    const extensions = [
      Document,
      Paragraph,
      Text,
      Heading.configure({ levels: [2, 3, 4] }),
      BulletList,
      OrderedList,
      ListItem,
      LineHeight,
    ];
    const json = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Default text' }] },
      ],
    };
    const html = generateHTML(json, extensions);
    expect(html).not.toContain('line-height');
  });

  it('parses lineHeight from existing inline styles', () => {
    const editor = createEditor('<p style="line-height: 2.0">Double spaced</p>');
    const json = editor.getJSON();
    expect(json.content?.[0].attrs?.lineHeight).toBe('2.0');
    editor.destroy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper-knowledge-layout && npx vitest run src/lib/editor/__tests__/LineHeightExtension.test.ts`
Expected: FAIL — `Cannot find module '../LineHeightExtension'`

---

### Task 2: LineHeight Extension — Implementation

**Files:**
- Create: `src/lib/editor/LineHeightExtension.ts`
- Modify: `src/lib/editor/extensions.ts`

- [ ] **Step 1: Create the LineHeight extension**

```ts
// src/lib/editor/LineHeightExtension.ts

import { Extension } from '@tiptap/core';

export interface LineHeightOptions {
  types: string[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (lineHeight: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
  }
}

export const LineHeight = Extension.create<LineHeightOptions>({
  name: 'lineHeight',

  addOptions() {
    return {
      types: ['paragraph', 'heading', 'bulletList', 'orderedList'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {};
              return { style: `line-height: ${attributes.lineHeight}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight:
        (lineHeight: string) =>
        ({ commands }) => {
          return this.options.types.every((type) =>
            commands.updateAttributes(type, { lineHeight })
          );
        },
      unsetLineHeight:
        () =>
        ({ commands }) => {
          return this.options.types.every((type) =>
            commands.resetAttributes(type, 'lineHeight')
          );
        },
    };
  },
});
```

- [ ] **Step 2: Register the extension in `extensions.ts`**

In `src/lib/editor/extensions.ts`, add the import and include `LineHeight` in the returned array:

```ts
import { LineHeight } from './LineHeightExtension';
```

Add `LineHeight,` after the `VaultImage` line (line 21), before `Placeholder.configure(...)`.

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper-knowledge-layout && npx vitest run src/lib/editor/__tests__/LineHeightExtension.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhousemapper-knowledge-layout
git add src/lib/editor/LineHeightExtension.ts src/lib/editor/extensions.ts src/lib/editor/__tests__/LineHeightExtension.test.ts
git commit -m "feat: add LineHeight TipTap extension with per-paragraph line spacing"
```

---

### Task 3: Toolbar Line Height Dropdown

**Files:**
- Modify: `src/lib/editor/RichTextEditor.tsx`

- [ ] **Step 1: Add the LineHeightDropdown component and integrate it into the toolbar**

In `src/lib/editor/RichTextEditor.tsx`:

1. Add a `LINE_HEIGHT_OPTIONS` constant above the component:

```tsx
const LINE_HEIGHT_OPTIONS = [
  { value: '1', label: 'Compact' },
  { value: '1.15', label: 'Normal' },
  { value: '1.5', label: 'Relaxed' },
  { value: '2', label: 'Double' },
] as const;
```

2. Add a `LineHeightDropdown` component after the existing `ToolbarButton` component (after line 268):

```tsx
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
```

3. Add `import type { Editor } from '@tiptap/core';` to the imports at the top.

4. Insert the dropdown into the toolbar JSX. After the blockquote `ToolbarButton` (line 196) and before the divider on line 198, add:

```tsx
          <LineHeightDropdown editor={editor} />
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper-knowledge-layout && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-knowledge-layout
git add src/lib/editor/RichTextEditor.tsx
git commit -m "feat: add line height dropdown to knowledge editor toolbar"
```

---

### Task 4: Paste Format Dialog — Tests

**Files:**
- Create: `src/lib/editor/__tests__/PasteFormatDialog.test.tsx`

- [ ] **Step 1: Write tests for the PasteFormatDialog component**

```tsx
// src/lib/editor/__tests__/PasteFormatDialog.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasteFormatDialog } from '../PasteFormatDialog';

describe('PasteFormatDialog', () => {
  it('renders the dialog with Keep and Plain text buttons', () => {
    render(<PasteFormatDialog onKeep={vi.fn()} onPlainText={vi.fn()} />);
    expect(screen.getByText('Pasted content contains formatting.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Plain text' })).toBeTruthy();
  });

  it('calls onKeep when Keep is clicked', () => {
    const onKeep = vi.fn();
    render(<PasteFormatDialog onKeep={onKeep} onPlainText={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onKeep).toHaveBeenCalledOnce();
  });

  it('calls onPlainText when Plain text is clicked', () => {
    const onPlainText = vi.fn();
    render(<PasteFormatDialog onKeep={vi.fn()} onPlainText={onPlainText} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plain text' }));
    expect(onPlainText).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper-knowledge-layout && npx vitest run src/lib/editor/__tests__/PasteFormatDialog.test.tsx`
Expected: FAIL — `Cannot find module '../PasteFormatDialog'`

---

### Task 5: Paste Format Dialog — Implementation

**Files:**
- Create: `src/lib/editor/PasteFormatDialog.tsx`

- [ ] **Step 1: Create the PasteFormatDialog component**

```tsx
// src/lib/editor/PasteFormatDialog.tsx

interface PasteFormatDialogProps {
  onKeep: () => void;
  onPlainText: () => void;
}

export function PasteFormatDialog({ onKeep, onPlainText }: PasteFormatDialogProps) {
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border border-sage-light rounded-lg shadow-lg px-4 py-3 z-50 whitespace-nowrap">
      <p className="text-sm text-forest-dark mb-2">Pasted content contains formatting.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onKeep}
          className="px-3 py-1 text-sm rounded bg-sage-light text-forest-dark hover:bg-sage/20 transition-colors"
        >
          Keep
        </button>
        <button
          type="button"
          onClick={onPlainText}
          className="px-3 py-1 text-sm rounded bg-forest text-white hover:bg-forest-dark transition-colors"
        >
          Plain text
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper-knowledge-layout && npx vitest run src/lib/editor/__tests__/PasteFormatDialog.test.tsx`
Expected: All 3 tests PASS

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-knowledge-layout
git add src/lib/editor/PasteFormatDialog.tsx src/lib/editor/__tests__/PasteFormatDialog.test.tsx
git commit -m "feat: add PasteFormatDialog component for paste formatting choice"
```

---

### Task 6: Integrate Paste Handler into RichTextEditor

**Files:**
- Modify: `src/lib/editor/RichTextEditor.tsx`

- [ ] **Step 1: Add paste detection state and handler**

In `src/lib/editor/RichTextEditor.tsx`:

1. Add import at the top:

```tsx
import { PasteFormatDialog } from './PasteFormatDialog';
```

2. Add paste state inside the `RichTextEditor` component, after the `showVaultPicker` state (after line 12):

```tsx
  const [pendingPaste, setPendingPaste] = useState<{ html: string; plain: string } | null>(null);
```

3. Replace the existing `handlePaste` in `editorProps` (lines 37-50) with this updated version that handles both images and rich text:

```tsx
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
        if (html && /style\s*=/i.test(html)) {
          event.preventDefault();
          const plain = event.clipboardData?.getData('text/plain') ?? '';
          setPendingPaste({ html, plain });
          return true;
        }

        return false;
      },
```

4. Add a `handleKeepPaste` and `handlePlainPaste` callback after `handleVaultSelect` (after line 113):

```tsx
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
```

5. Add `useEffect` to auto-dismiss on keydown. Add to imports: `useEffect`. Add after the paste handlers:

```tsx
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
```

6. Add the dialog to the JSX. Insert after `<EditorContent editor={editor} />` (after line 227):

```tsx
      {pendingPaste && (
        <div className="relative">
          <PasteFormatDialog onKeep={handleKeepPaste} onPlainText={handlePlainPaste} />
        </div>
      )}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper-knowledge-layout && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-knowledge-layout
git add src/lib/editor/RichTextEditor.tsx
git commit -m "feat: integrate paste format detection and dialog into editor"
```

---

### Task 7: Full Integration Tests

**Files:**
- Create: `src/lib/editor/__tests__/RichTextEditor.test.tsx`

- [ ] **Step 1: Write integration tests for the toolbar dropdown and paste dialog**

```tsx
// src/lib/editor/__tests__/RichTextEditor.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RichTextEditor from '../RichTextEditor';

// Mock vault actions to avoid Supabase calls
vi.mock('@/lib/vault/actions', () => ({
  uploadToVault: vi.fn(),
}));

// Mock VaultPicker
vi.mock('@/components/vault/VaultPicker', () => ({
  default: () => <div data-testid="vault-picker" />,
}));

describe('RichTextEditor', () => {
  it('renders the line height dropdown button', async () => {
    render(<RichTextEditor content={null} onChange={vi.fn()} orgId="org-1" />);
    await waitFor(() => {
      expect(screen.getByTitle('Line Spacing')).toBeTruthy();
    });
  });

  it('opens dropdown and shows line height options', async () => {
    render(<RichTextEditor content={null} onChange={vi.fn()} orgId="org-1" />);
    await waitFor(() => {
      expect(screen.getByTitle('Line Spacing')).toBeTruthy();
    });
    fireEvent.click(screen.getByTitle('Line Spacing'));
    expect(screen.getByText('1 — Compact')).toBeTruthy();
    expect(screen.getByText('1.15 — Normal')).toBeTruthy();
    expect(screen.getByText('1.5 — Relaxed')).toBeTruthy();
    expect(screen.getByText('2 — Double')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run all editor tests**

Run: `cd /Users/patrick/birdhousemapper-knowledge-layout && npx vitest run src/lib/editor/__tests__/`
Expected: All tests PASS

- [ ] **Step 3: Run the full test suite to check for regressions**

Run: `cd /Users/patrick/birdhousemapper-knowledge-layout && npx vitest run`
Expected: All tests PASS (no regressions)

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhousemapper-knowledge-layout
git add src/lib/editor/__tests__/RichTextEditor.test.tsx
git commit -m "test: add integration tests for editor line height and paste dialog"
```

---

### Task 8: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run type check**

Run: `cd /Users/patrick/birdhousemapper-knowledge-layout && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/patrick/birdhousemapper-knowledge-layout && npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Run build**

Run: `cd /Users/patrick/birdhousemapper-knowledge-layout && npm run build`
Expected: Build succeeds
