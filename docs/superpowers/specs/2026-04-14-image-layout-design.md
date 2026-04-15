# Image Layout Support in Knowledge Editor

**Date:** 2026-04-14  
**Issue:** #222  
**Status:** Approved

## Summary

Add rich image layout support to the TipTap-based knowledge editor:
- Float left/right (text wraps around image)
- Full-width and centered positioning
- Side-by-side image rows (gallery)
- Image captions
- Paste preservation of image layout from rich HTML

## Architecture

### 1. VaultImage Extension Enhancements

Extend `VaultImageExtension.ts` with two new attributes:

**`layout`** — controls image positioning:
- `"default"` — inline block, left-aligned (current behavior)
- `"float-left"` — floats left, text wraps right, 40% width
- `"float-right"` — floats right, text wraps left, 40% width
- `"centered"` — centered block, 80% max-width
- `"full-width"` — 100% width block

Stored as `data-layout` HTML attribute. `renderHTML` outputs `data-layout` only; CSS handles the visual.

**`caption`** — string attribute for image caption text, stored as `data-caption`. Rendered visually in `renderHTML` by returning a `<figure>` wrapper with `<figcaption>`. This avoids a nested editable node while still serializing correctly.

> Rendering note: `renderHTML` in TipTap returns `[tag, attrs, ...children]`. For caption support, VaultImage renders as:
> `['figure', {class: 'image-figure', 'data-layout': layout}, ['img', attrs], ['figcaption', {}, caption]]`

ParseHTML entries updated to handle both bare `<img>` and `<figure><img>` patterns.

### 2. ImageRow Extension (new file: `ImageRowExtension.ts`)

Custom TipTap `Node` for side-by-side image galleries:

```
name: 'imageRow'
group: 'block'
content: 'vaultImage{2,4}'
parseHTML: [{ tag: 'div[data-type="image-row"]' }]
renderHTML: ['div', { 'data-type': 'image-row', class: 'image-row' }, 0]
```

A custom command `wrapInImageRow` wraps the currently selected `vaultImage` in an `imageRow` node. A companion command `addImageToRow` inserts a `vaultImage` placeholder into the current `imageRow`.

### 3. ImageBubbleMenu (new file: `ImageBubbleMenu.tsx`)

React component using `BubbleMenu` from `@tiptap/react`. Shown when the cursor is inside a `vaultImage` node.

**Controls:**
- **Layout toggle row:** 5 buttons (Default | Float Left | Float Right | Center | Full Width) with SVG icons. Active layout highlighted.
- **Caption field:** Text input, placeholder "Add caption…". Updates `caption` attribute on change.
- **Row controls:** "Create Row" button (wraps single image in imageRow). Inside a row: "Add Image" opens vault picker.

The bubble menu uses `shouldShow` to appear only when a `vaultImage` is selected.

### 4. CSS (added to `globals.css`)

```css
/* Image layouts */
.ProseMirror .image-figure { display: block; margin: 1rem 0; }
.ProseMirror .image-figure[data-layout="float-left"] { float: left; margin: 0 1rem 1rem 0; max-width: 40%; }
.ProseMirror .image-figure[data-layout="float-right"] { float: right; margin: 0 0 1rem 1rem; max-width: 40%; }
.ProseMirror .image-figure[data-layout="centered"] { display: block; margin-left: auto; margin-right: auto; max-width: 80%; }
.ProseMirror .image-figure[data-layout="full-width"] { width: 100%; }
.ProseMirror .image-figure figcaption { text-align: center; font-size: 0.8em; color: #666; margin-top: 0.4em; font-style: italic; }

/* Image rows */
.ProseMirror .image-row { display: flex; gap: 0.5rem; margin: 1rem 0; }
.ProseMirror .image-row .image-figure { flex: 1; min-width: 0; margin: 0; }
.ProseMirror .image-row .image-figure img { width: 100%; height: 200px; object-fit: cover; border-radius: 4px; }
```

Same classes applied in read-only display (knowledge item view) since the HTML is stored and rendered.

### 5. Paste Handler Enhancement

In `RichTextEditor.tsx`, update `handlePaste` to detect image layout from pasted HTML when "Keep formatting" is selected:

After parsing pasted HTML, traverse `<img>` elements and:
- `style.float === 'left'` → set `data-layout="float-left"`
- `style.float === 'right'` → set `data-layout="float-right"`
- `style.textAlign === 'center'` or parent centered → set `data-layout="centered"`
- Images inside same table cell or flex container → group into `imageRow`

This is best-effort: complex layouts from Word/Google Docs may not map perfectly.

### 6. Extensions Registration

Update `extensions.ts` to include `ImageRow`.

Update `RichTextEditor.tsx` to:
- Import and render `ImageBubbleMenu`
- Pass `editor` to bubble menu
- Keep existing vault picker for row "Add Image"

## Data Flow

```
User selects image → BubbleMenu appears
→ User picks layout → editor.commands.updateAttributes('vaultImage', { layout }) → re-renders with CSS class
→ User types caption → editor.commands.updateAttributes('vaultImage', { caption }) → stored in JSON + HTML
→ User clicks "Create Row" → wrapInImageRow command → imageRow node wraps image
→ onChange fires → KnowledgeEditor gets JSONContent → saves to DB with generateHTML() → HTML includes data-layout/figcaption
```

## Read-Only Rendering

Knowledge item display already renders body_html directly. The CSS classes added to `globals.css` apply globally, so layout and captions render correctly in read-only view.

## Testing

- Unit tests: VaultImage renderHTML/parseHTML with layout/caption attrs
- Unit tests: ImageRow extension node schema
- Manual: Float left/right with text, full-width, centered, rows, captions
- Manual: Paste styled HTML from Google Docs with images

## Files Changed

| File | Change |
|------|--------|
| `src/lib/editor/VaultImageExtension.ts` | Add `layout`, `caption` attrs; update renderHTML/parseHTML |
| `src/lib/editor/ImageRowExtension.ts` | New file: ImageRow node + commands |
| `src/lib/editor/ImageBubbleMenu.tsx` | New file: bubble menu component |
| `src/lib/editor/extensions.ts` | Add ImageRow extension |
| `src/lib/editor/RichTextEditor.tsx` | Add ImageBubbleMenu, update paste handler |
| `src/styles/globals.css` | Add image layout CSS |
