# Item Type Layout Builder

**Date:** 2026-04-03
**Status:** Draft

## Problem

The current ItemType system separates data definition (custom fields) from presentation (a fixed DetailPanel layout). Every item type renders identically regardless of its purpose. Admins define fields in one place and have no control over how items appear when tapped on the map. This limits the expressiveness of a system designed to be flexible and expandable.

## Solution

A layout-first type creation experience with a custom drag-and-drop builder. Admins compose a visual layout from a palette of blocks — adding custom fields inline as they build. A live preview renders the actual DetailPanel component with mock data so admins see exactly what end users will see. The layout is stored as JSON on the ItemType and interpreted at render time.

## Design Principles

- **Layout is the type.** The builder is the primary interface for defining what an item type captures and how it displays. Data structure follows layout, not the other way around.
- **What you see is what they get.** The preview renders the same component used in production, with the same styling, spacing, and behavior. No approximations.
- **Mobile-native editing.** The builder works on phones. Not "works if you squint" — genuinely usable with touch, with full-screen mode and touch-sized targets.
- **Zero-config start.** New types begin with a sensible default layout. Existing types render as they always have until an admin opts in. Nothing breaks.
- **Constrained creativity.** The block palette is intentionally limited to components that make sense in a detail view. No freeform HTML, no arbitrary nesting. Hard to build something ugly.

---

## Block Palette

Nine block types, each purpose-built for item detail display:

| Block | Description | Configuration |
|-------|-------------|---------------|
| **Field Display** | Shows a custom field's value with label | Field selection (existing or create new), size (compact / normal / large), show/hide label |
| **Photo Gallery** | Item photos | Style (hero / grid / carousel), max photo count (1–20) |
| **Status Badge** | Item status with color | Minimal — inherits status colors from the system |
| **Entity List** | Linked entities grouped by type | Which entity types to include (checkboxes) |
| **Timeline** | Updates, scheduled events, due dates on a vertical list | Show updates toggle, show scheduled toggle, max items |
| **Text Label** | Static text or section headers | Text content, style (heading / subheading / body / caption) |
| **Divider** | Visual separator | None — renders a horizontal rule with spacing |
| **Map Snippet** | Small map showing item location | None — auto-centers on item coordinates |
| **Action Buttons** | Edit item, add update | None — buttons determined by user permissions |

### Block Empty States

Each block handles missing data gracefully:

- **Photo Gallery** with no photos: "No photos yet" placeholder (or hidden entirely — configurable via a "hide when empty" toggle on each block)
- **Entity List** with no linked entities: hidden by default
- **Timeline** with no updates: "No activity yet" message
- **Field Display** with no value: shows field label with "—" or hidden (configurable)

---

## Layout JSON Schema

Stored as a single JSONB column on `item_types`:

```typescript
interface TypeLayout {
  version: 1;
  blocks: LayoutBlock[];
}

interface LayoutBlock {
  id: string;           // nanoid, unique within layout
  type: BlockType;
  config: BlockConfig;  // discriminated by type
  hideWhenEmpty?: boolean;
}

type BlockType =
  | 'field_display'
  | 'photo_gallery'
  | 'status_badge'
  | 'entity_list'
  | 'text_label'
  | 'divider'
  | 'action_buttons'
  | 'map_snippet'
  | 'timeline';
```

### Block Config Types

```typescript
interface FieldDisplayConfig {
  fieldId: string;
  size: 'compact' | 'normal' | 'large';
  showLabel: boolean;
}

interface PhotoGalleryConfig {
  style: 'hero' | 'grid' | 'carousel';
  maxPhotos: number;
}

interface StatusBadgeConfig {}

interface EntityListConfig {
  entityTypeIds: string[];  // empty = show all
}

interface TimelineConfig {
  showUpdates: boolean;
  showScheduled: boolean;
  maxItems: number;
}

interface TextLabelConfig {
  text: string;
  style: 'heading' | 'subheading' | 'body' | 'caption';
}

interface DividerConfig {}

interface MapSnippetConfig {}

interface ActionButtonsConfig {}
```

### Validation

A Zod schema validates layout JSON on save:

- Every block has a valid `type` and unique `id`
- `field_display` blocks reference a `fieldId` that exists in the type's custom fields
- Config values are within valid ranges (e.g., `maxPhotos` 1–20, `maxItems` 1–50)
- At least one block exists (empty layouts are not saved — delete the layout instead)

---

## Layout Builder UI

### Desktop Layout (≥768px)

Two-panel side-by-side view within the ItemType admin page:

```
┌─────────────────────────────────┬──────────────────────────┐
│          BUILDER                │        PREVIEW           │
│                                 │                          │
│  ┌─ Block Palette ───────────┐  │  ┌── DetailPanel ─────┐  │
│  │ 📊 Field  📷 Photo  📍 Map│  │  │                     │  │
│  │ 📋 Timeline  🏷 Status ...│  │  │  (live preview      │  │
│  └───────────────────────────┘  │  │   with mock data,   │  │
│                                 │  │   scrollable,        │  │
│  ┌─ Block List ──────────────┐  │  │   actual component)  │  │
│  │ ⠿ Status Badge        ✕  │  │  │                     │  │
│  │ ⠿ Photo Gallery ▾    ✕  │  │  │                     │  │
│  │   ┌─ Config ───────────┐  │  │  │                     │  │
│  │   │ Style: [hero ▾]    │  │  │  │                     │  │
│  │   │ Max:   [4    ]     │  │  │  │                     │  │
│  │   └────────────────────┘  │  │  │                     │  │
│  │ ⠿ Target Species      ✕  │  │  │                     │  │
│  │ ⠿ Timeline            ✕  │  │  │                     │  │
│  │ ⠿ Action Buttons      ✕  │  │  │                     │  │
│  └───────────────────────────┘  │  └─────────────────────┘  │
└─────────────────────────────────┴──────────────────────────┘
```

- Builder panel: ~60% width, scrollable independently
- Preview panel: ~40% width, fixed position, scrollable content inside DetailPanel shell
- Preview updates live as blocks are added, reordered, or configured

### Mobile Layout (<768px) — Full-Screen Mode

The builder opens as a **full-screen overlay** (100dvh × 100vw) to maximize workspace:

```
┌──────────────────────────────┐
│  ← Bird Box Layout     Done  │  ← sticky header
├──────────────────────────────┤
│  [ Build ]  [ Preview ]      │  ← tab toggle
├──────────────────────────────┤
│                              │
│  (active tab content,        │
│   full remaining height,     │
│   independently scrollable)  │
│                              │
└──────────────────────────────┘
```

**Build tab:**
- Block palette as a horizontally scrollable row of pill buttons (icon + short label)
- Block list fills remaining space, vertically scrollable
- Tap a block to expand its config accordion-style (one open at a time)
- Drag handles: 44×44px minimum touch target with clear grip affordance

**Preview tab:**
- Renders the DetailPanel at device width inside a container styled to match the real panel shell
- Scrollable for long layouts
- Subtle bottom-edge fade when content extends below the fold

**Tab switching** preserves all state. Edits in Build are immediately visible when switching to Preview.

### Block Palette Interaction

- **Tap** a palette item to append the block to the end of the layout
- The new block auto-scrolls into view and expands its config panel
- For Field Display blocks, the config immediately shows the field picker / creator
- Palette items are always available (no drag from palette — just tap to add, then reorder in the list)

### Inline Block Configuration

Blocks configure in-place via accordion expansion. This avoids modals (which feel heavy and lose context) and sidebars (which don't work on mobile). Each block type has a compact config UI:

- **Field Display:** Segmented control for size, label toggle, field picker dropdown. The field picker has two sections: "Existing Fields" (list of current custom fields) and "+ Create New Field" (expands to name/type/options/required inputs)
- **Photo Gallery:** Visual style picker (three thumbnail previews of hero/grid/carousel), stepper for max photos
- **Timeline:** Toggle switches for updates and scheduled, stepper for max items
- **Text Label:** Text input (single line for headings, multi-line for body), style picker as segmented control
- **Entity List:** Checkbox list of available entity types with icons
- **Status Badge / Divider / Map Snippet / Action Buttons:** "No configuration needed" message, or a single hideWhenEmpty toggle

### Delete Confirmation

Deleting a block shows an inline confirmation (not a modal):
- For **Field Display** blocks: "Remove from layout only, or also delete the field and its data?" with two buttons
- For all other blocks: block fades out with a 3-second "Undo" toast

### Drag and Drop

Using `@dnd-kit/sortable` for reordering:

- **Desktop:** Grab drag handle, drag vertically, drop indicator shows insertion point
- **Mobile:** Long-press drag handle (150ms) to initiate drag, haptic feedback if available, drop indicator shows between blocks
- During drag: dragged block becomes semi-transparent, other blocks animate to make room
- Scroll zones at top/bottom of the list auto-scroll when dragging near edges

---

## Layout-First Type Creation Flow

### New ItemType

1. **Identity screen** — name, icon picker (emoji grid), color picker (preset palette + custom hex). A single compact form. "Next" button.

2. **Layout builder** — opens immediately with a starter layout:
   ```
   Status Badge
   Photo Gallery (hero)
   Action Buttons
   ```
   The admin builds from here. On mobile, this is the full-screen overlay. The starter layout gives immediate visual feedback in the preview — it's not a blank canvas.

3. **Inline field creation** — when adding a Field Display block, the admin creates the custom field right there:
   - Field name (text input)
   - Field type (segmented control: Text / Number / Dropdown / Date)
   - Options (comma-separated, shown only for Dropdown)
   - Required toggle
   - Creating the field adds it to local state and places the block — all fields and the layout are persisted together when the admin hits Save

4. **Save** — one action saves the ItemType identity, all custom fields, and the layout JSON. Validated together before commit.

### Editing an Existing ItemType

The admin screen reorganizes into three tabs:

| Tab | Purpose |
|-----|---------|
| **Layout** | The builder (primary tab) — includes inline field creation |
| **Fields** | Direct table of custom fields — for power users, bulk edits, or managing fields that aren't in the layout |
| **Settings** | Name, icon, color, danger zone (delete type) |

The Layout tab is the default. Most admins never need the Fields tab.

### Field Lifecycle

| Action | Effect on Layout |
|--------|-----------------|
| Create field via builder | Field added to local state + `field_display` block appended to layout (all persisted together on save) |
| Create field via Fields tab | `CustomField` row created, builder shows notification: "1 field not in layout" with quick-add button |
| Delete field via Fields tab | Block referencing that field auto-removed from layout, toast notification |
| Delete Field Display block | Prompt: "Remove from layout only" or "Delete field and all its data" |
| Rename field via Fields tab | No layout impact (blocks reference by ID) |
| Reorder fields via Fields tab | No layout impact (layout has its own ordering) |

---

## DetailPanel Rendering

### Component Architecture

```
DetailPanel (shell — header, close button, panel chrome)
  ├── Item name + type icon (always present, outside layout)
  └── LayoutRenderer
       ├── StatusBadgeBlock
       ├── PhotoGalleryBlock
       ├── FieldDisplayBlock
       ├── TimelineBlock
       ├── EntityListBlock
       ├── TextLabelBlock
       ├── DividerBlock
       ├── MapSnippetBlock
       └── ActionButtonsBlock
```

### LayoutRenderer Component

```typescript
interface LayoutRendererProps {
  layout: TypeLayout;
  item: ItemWithDetails;
  mode: 'live' | 'preview';
  customFields: CustomField[];
}
```

- Iterates `layout.blocks` in order, renders the matching block component
- Each block is wrapped in a React error boundary — one broken block doesn't crash the panel
- `mode: 'preview'` passes mock data and suppresses network calls
- `mode: 'live'` passes real item data and fetches timeline/entities as needed
- Blocks with `hideWhenEmpty: true` check for data presence and render nothing if empty

### Mock Data Generation

For the preview, mock data is generated from the type's custom fields:

| Field Type | Mock Value |
|-----------|------------|
| text | "Sample text" |
| number | 42 |
| dropdown | First option in the list |
| date | Today's date |
| url | "https://example.com" |

Photos use placeholder images. Timeline shows 3 sample updates with realistic dates. Entity list shows 2 sample entities per type. Status defaults to "active."

### Fallback Rendering

- **`layout` is null:** DetailPanel renders with the current fixed layout (full backward compatibility)
- **Layout references a deleted field:** Block is silently skipped (safety net — field deletion already cleans up the layout)
- **Malformed layout JSON:** Falls back to legacy rendering, logs a warning
- **Block component error:** Error boundary renders a muted "Unable to display" placeholder for that block

### Scrollable Layouts

Long layouts scroll naturally within the DetailPanel content area. The panel shell (header, close button) remains fixed. Both the preview and live DetailPanel use the same scroll behavior:

- Content area scrolls independently
- Subtle fade gradient at the bottom edge when more content exists below the fold
- Scroll position resets to top when opening a different item

---

## Database Changes

### Migration

```sql
ALTER TABLE item_types
ADD COLUMN layout JSONB DEFAULT NULL;

COMMENT ON COLUMN item_types.layout IS
  'JSON layout definition for the item detail panel. NULL = use default rendering.';
```

Single column addition. No new tables. No data backfill.

### Why JSONB, Not a Separate Table

- Layouts are always loaded and saved as a unit with the ItemType
- No need to query individual blocks independently
- No join overhead
- Validated at the application layer via Zod before save
- PostgreSQL JSONB supports indexing if ever needed

### RLS / Permissions

The `layout` column inherits existing RLS policies on `item_types`. Same org-scoping, same role requirements for editing. No new permission model needed.

### Offline Storage

The layout JSON is cached in the Dexie offline DB as part of the ItemType record. The `LayoutRenderer` works entirely with locally cached data — item data, custom field values, cached photos, cached updates. No new offline sync tables or logic.

---

## Testing Strategy

### Unit Tests

- **Layout validation:** Zod schema accepts valid layouts, rejects malformed ones with clear error messages
- **Default layout generation:** Given a set of custom fields, produces correct default blocks in expected order
- **Field sync logic:** Adding a field shows notification; deleting a field removes block and produces toast; renaming has no effect on layout
- **Mock data generation:** Each field type produces appropriate sample values

### Component Tests

- **Each block component:** Renders correctly with mock data, handles empty data, respects hideWhenEmpty
- **LayoutRenderer:** Renders blocks in order, skips invalid blocks, error boundary contains crashes
- **Builder interactions:** Add block, remove block, reorder, expand/collapse config, create field inline
- **Mobile full-screen mode:** Opens/closes correctly, tab switching preserves state

### Integration Tests

- **Full creation flow:** Identity → builder → add blocks with fields → save → verify layout JSON + custom fields in database
- **Edit flow:** Open existing type → modify layout → save → verify DetailPanel renders new layout
- **Field deletion cascade:** Delete field → verify block removed → verify toast shown
- **Backward compatibility:** Type with null layout renders with legacy DetailPanel
- **Offline rendering:** Layout renders correctly from Dexie-cached data

### Error Handling

- **Save failure:** Toast with retry action, builder state preserved (no data loss)
- **Drag/drop failure:** Block snaps back to original position
- **Block render crash:** Error boundary shows placeholder, other blocks unaffected
- **Timeline/entity fetch failure:** Block shows "Unable to load" with retry button
- **Invalid field reference:** Block silently skipped in renderer, auto-cleaned on next layout save

---

## UX Details

### Touch Targets

All interactive elements meet 44×44px minimum touch target size per Apple HIG:
- Drag handles: 44×44px with visible grip dots
- Block palette pills: 44px height, horizontal padding for comfortable tap
- Delete buttons: 44×44px (icon only, no small text links)
- Toggle switches: native size (already compliant)
- Accordion expand/collapse: entire block header row is tappable

### Transitions & Feedback

- **Adding a block:** Block slides in from right with 200ms ease-out, auto-scrolls into view
- **Removing a block:** Block fades out over 150ms, list collapses smoothly
- **Reordering:** Dragged block lifts with subtle shadow, other blocks animate to make room (200ms spring)
- **Config expand/collapse:** Accordion animation 200ms ease-in-out, content height transitions
- **Tab switching (mobile):** Crossfade 150ms, no jarring jump
- **Preview updates:** Blocks in preview animate changes (not instant swap) — fade transition on content changes
- **Save:** Button shows spinner, then checkmark on success, then returns to normal

### Accessibility

- Drag/drop has keyboard alternative: select block, use arrow keys to move up/down, Enter to confirm
- Block palette items are focusable and keyboard-navigable
- Screen readers announce block type and position ("Photo Gallery, block 2 of 5")
- Config forms use proper label associations
- Color contrast meets WCAG AA throughout

### Empty States

- **New type, first time in builder:** Starter layout is pre-populated (not blank). A subtle banner above the block list reads: "Drag to reorder. Tap + to add blocks. Tap a block to configure it."
- **All blocks deleted:** Message with illustration: "Your layout is empty. Add blocks from the palette above to build the detail view." The preview shows just the item name and type icon.

### Responsive Breakpoints

| Width | Behavior |
|-------|----------|
| < 768px | Full-screen overlay, tabbed Build/Preview, single column |
| 768–1024px | Side-by-side, builder 55% / preview 45% |
| > 1024px | Side-by-side, builder 60% / preview 40%, more breathing room |

---

## Scope Boundaries

### In Scope

- Layout builder with 9 block types
- Layout-first type creation flow
- Live preview with mock data
- Mobile full-screen editing
- Inline field creation from builder
- Field sync (add/delete notifications)
- LayoutRenderer for DetailPanel
- Backward-compatible fallback rendering
- Database migration (single column)
- Offline support (cached layout JSON)
- Zod validation
- `@dnd-kit/sortable` for drag/drop

### Out of Scope (Future Consideration)

- Layout templates / presets (start from a template instead of the starter layout)
- Copy/duplicate layout between types
- Layout version history or undo beyond session
- Nested blocks or multi-column layouts within the detail panel
- Conditional blocks (show block X only if field Y has value Z)
- Custom CSS or theme overrides per type
- Layout builder for UpdateTypes or EntityTypes
- A/B testing of layouts
- Layout analytics (which blocks get seen/interacted with)
