# Knowledge Editor Spacing & Paste Controls

**Issue:** [#220](https://github.com/patjackson52/birdhouse-mapper/issues/220)
**Date:** 2026-04-06
**Branch:** `feat/knowledge-layout`

## Problem

Content pasted into the knowledge editor (TipTap) from external sources (Word, Google Docs, web pages) brings in excessive line spacing that cannot be adjusted. Bullet lists and general paragraph content appear double-spaced with no way to fix it.

## Solution

Two features that work together:

1. **Line Height Extension** — per-paragraph line spacing control via a toolbar dropdown
2. **Paste Formatting Dialog** — prompt when rich content is pasted, offering "Keep formatting" or "Paste as plain text"

## 1. Line Height Extension

A custom TipTap extension (`LineHeight`) that adds a `lineHeight` attribute to block-level nodes.

### Affected Node Types

- `paragraph`
- `heading`
- `bulletList`
- `orderedList`

### Implementation

- Uses `addGlobalAttributes` to add `lineHeight` to the above node types
- Attribute renders as `style="line-height: <value>"` on the HTML element
- Parses from existing inline styles (handles pasted content that already has line-height)
- Commands: `setLineHeight(value: string)` and `unsetLineHeight()`
- Preset values: `1.0`, `1.15`, `1.5`, `2.0`
- Default: no attribute (inherits from Tailwind prose defaults, ~1.75)

### Storage

The `lineHeight` value lives in the TipTap JSON document per-node. It persists automatically when the document is saved. `generateHTML()` produces the inline styles, so KnowledgeRenderer displays them correctly with no renderer changes.

### File

`src/lib/editor/LineHeightExtension.ts`

## 2. Toolbar Dropdown

A dropdown button in the RichTextEditor toolbar for selecting line height.

### Placement

After the existing formatting controls, before the image/link buttons.

### UI

- Icon: line-spacing icon (stacked horizontal lines with vertical arrows, inline SVG)
- Dropdown shows 4 options:
  - `1.0` — Compact
  - `1.15` — Normal
  - `1.5` — Relaxed
  - `2.0` — Double
- Active value is highlighted
- Selecting a value applies it; selecting the already-active value removes it (resets to default)

### Behavior

- Applies to the currently selected paragraph(s)/block(s)
- If multiple blocks are selected with different values, no active indicator is shown
- Works on paragraphs, headings, and list containers

### File Changes

`src/lib/editor/RichTextEditor.tsx` — add dropdown component and wire to `setLineHeight`/`unsetLineHeight` commands

## 3. Paste Formatting Dialog

When users paste content from external sources, detect rich formatting and offer a choice.

### Detection

Use TipTap's `handlePaste` editor prop. Check if the clipboard `text/html` content contains `style=` attributes or elements like `<table>`, `<div>`, `<span style=...>` that indicate formatting beyond basic semantic markup (bold, italic, links, lists). A simple heuristic: if the HTML contains any `style=` attribute, treat it as rich/formatted.

### UX Flow

1. User pastes content
2. If rich HTML is detected, a small floating dialog appears near the paste location:
   > "Pasted content contains formatting."
   > **[Keep]** **[Plain text]**
3. **Keep**: inserts HTML as-is (TipTap default behavior)
4. **Plain text**: strips all HTML, inserts plain text preserving line breaks

### Edge Cases

- Plain text paste (no HTML in clipboard): paste normally, no dialog
- Internal copy/paste (within the same editor): no dialog
- Dialog auto-dismisses if user starts typing (treats as "Keep")

### Implementation

- Intercept paste in `handlePaste` editor prop
- Use React state + portal to render the dialog
- Hold clipboard data until user decides
- "Plain text" path: `editor.commands.insertContent(clipboardData.getData('text/plain'))`

### File Changes

- `src/lib/editor/RichTextEditor.tsx` — add `handlePaste` prop and dialog state
- `src/lib/editor/PasteFormatDialog.tsx` — new component for the floating dialog

## Testing

- Unit test: LineHeight extension applies and removes line-height attribute correctly
- Unit test: `generateHTML` produces correct inline styles for line-height
- Integration test: paste dialog appears for rich HTML, not for plain text
- Manual verification: paste from Google Docs, Word, web browser — spacing is controllable

## Files Changed (Summary)

| File | Change |
|------|--------|
| `src/lib/editor/LineHeightExtension.ts` | New — custom TipTap extension |
| `src/lib/editor/PasteFormatDialog.tsx` | New — floating paste choice dialog |
| `src/lib/editor/RichTextEditor.tsx` | Modified — add toolbar dropdown, paste handler, dialog integration |
| `src/lib/editor/extensions.ts` | Modified — register LineHeight extension |
