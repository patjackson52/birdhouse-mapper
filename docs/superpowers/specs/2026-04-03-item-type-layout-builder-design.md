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
| **Map Snippet** | Small map showing item location (desktop side panel only — auto-hidden on mobile where the map is visible behind the bottom sheet) | None — auto-centers on item coordinates |
| **Action Buttons** | Edit item, add update | None — buttons determined by user permissions |

### Block Empty States

Each block handles missing data gracefully:

- **Photo Gallery** with no photos: "No photos yet" placeholder (or hidden entirely — configurable via a "hide when empty" toggle on each block)
- **Entity List** with no linked entities: hidden by default
- **Timeline** with no updates: "No activity yet" message
- **Field Display** with no value: shows field label with "—" or hidden (configurable)

---

## Layout Composition Model

The layout system supports two composition modes:

- **Vertical stacking** — blocks flow top to bottom (the default). Each block occupies the full width.
- **Horizontal stacking** — a `row` container places 2–4 child blocks side by side, sharing the width equally or at configured ratios.

Nesting is limited to **one level**: rows contain blocks, but rows cannot contain rows. This keeps the builder simple for non-technical users while enabling common patterns like:

```
┌──────────────────────────────┐
│  Status Badge (full width)   │
├──────────────────────────────┤
│  Photo Gallery (full width)  │
├──────────────┬───────────────┤
│  Species     │  Installed    │  ← row with 2 fields
│  (field)     │  (date field) │
├──────────────┴───────────────┤
│  Notes (full width field)    │
├──────────────────────────────┤
│  Timeline (full width)       │
├──────────────────────────────┤
│  Action Buttons              │
└──────────────────────────────┘
```

### Responsive Row Behavior

Rows are horizontal on screens ≥480px. On narrower screens, rows **automatically collapse to vertical stacking** — each child becomes full-width. This means admins design for desktop/tablet and mobile layouts work automatically. No separate mobile layout needed.

---

## Layout JSON Schema

Stored as a single JSONB column on `item_types`:

```typescript
interface TypeLayout {
  version: 1;
  blocks: LayoutNode[];
  spacing: SpacingPreset;  // controls global spacing rhythm
  peekBlockCount: number;  // how many top-level nodes to show in bottom sheet peek state (default: 2)
}

// A node is either a content block or a row container
type LayoutNode = LayoutBlock | LayoutRow;

interface LayoutBlock {
  id: string;           // nanoid, unique within layout
  type: BlockType;
  config: BlockConfig;  // discriminated by type
  hideWhenEmpty?: boolean;
}

interface LayoutRow {
  id: string;
  type: 'row';
  children: LayoutBlock[];   // 2–4 blocks, no nested rows
  gap: 'tight' | 'normal' | 'loose';
  distribution: 'equal' | 'auto' | number[];  
  // 'equal' = even split, 'auto' = content-driven,
  // number[] = explicit ratios e.g. [2, 1] for 2/3 + 1/3
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

type SpacingPreset = 'compact' | 'comfortable' | 'spacious';
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

- Every node has a valid `type` and unique `id`
- `row` nodes contain 2–4 children, no nested rows
- `row` distribution arrays sum correctly and match children count
- `field_display` blocks reference a `fieldId` that exists in the type's custom fields
- Config values are within valid ranges (e.g., `maxPhotos` 1–20, `maxItems` 1–50)
- At least one node exists (empty layouts are not saved — delete the layout instead)

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
- Preview panel: ~40% width, fixed position, with a tab bar at the top: **Detail Preview | Form Preview**
- Detail Preview shows the bottom sheet simulation with peek line indicator
- Form Preview shows the auto-generated add/edit form
- Both previews update live as blocks are added, reordered, or configured

### Mobile Layout (<768px) — Full-Screen Mode

The builder opens as a **full-screen overlay** (100dvh × 100vw) to maximize workspace:

```
┌──────────────────────────────┐
│  ← Bird Box Layout     Done  │  ← sticky header
├──────────────────────────────┤
│ [ Build ] [ Detail ] [ Form ]│  ← tab toggle
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
- A **peek boundary line** appears between blocks to show what's visible in the bottom sheet peek state (label: "Visible on first tap — swipe up for more"). This line is draggable to adjust `peekBlockCount`.
- Tap a block to expand its config accordion-style (one open at a time)
- Drag handles: 44×44px minimum touch target with clear grip affordance

**Detail Preview tab:**
- Renders the DetailPanel at device width inside a container styled to match the real bottom sheet shell (with handle, peek/half/full snap indicators)
- Shows a simulated bottom sheet with the peek state visible by default — admin can swipe/tap to see half and full states
- Scrollable for long layouts
- Subtle bottom-edge fade when content extends below the fold
- A dashed line in the preview marks the peek boundary so admins understand what's visible at first glance

**Form Preview tab:**
- Renders the auto-generated Add Item form for this type
- Form layout is derived from the detail layout: each `field_display` block becomes the corresponding input (text field, number input, dropdown, date picker), in the same order. Rows carry over — fields in a row appear side by side in the form.
- Fixed form elements always present: name input (top), location picker, status selector, photo uploader, entity selector (if applicable), submit button (bottom)
- Custom field inputs appear between location and status, matching the layout block order
- The form preview is interactive — admins can tap into fields to see focus states, dropdowns, etc. but no data is saved
- Shows both required indicators and placeholder text

**Tab switching** preserves all state. Edits in Build are immediately visible when switching to either Preview tab.

### Block Palette Interaction

- **Tap** a palette item to append the block to the end of the layout
- The new block auto-scrolls into view and expands its config panel
- For Field Display blocks, the config immediately shows the field picker / creator
- Palette items are always available (no drag from palette — just tap to add, then reorder in the list)
- The palette includes a **Row** item (icon: columns/grid) — tapping it appends a row with 2 empty slots

### Row Interaction

Rows appear in the block list as a visually grouped container with an indented children area:

```
⠿ ┌ Row (2 columns, equal) ──────── ✕
  │  ⠿ Species (field)          ✕
  │  ⠿ Install Date (field)     ✕
  │  [+ Add to row]
  └────────────────────────────────
```

- **Adding blocks to a row:** Tap "+ Add to row" inside the row, or drag an existing block into the row area. Maximum 4 children per row.
- **Row configuration:** Tap the row header to expand settings — column count (2–4), distribution (equal / auto / custom ratios via a simple slider), gap (tight / normal / loose)
- **Converting to/from rows:** Select two adjacent blocks and tap "Group into row" from a contextual action. Ungroup a row by tapping "Unstack" in the row config — children become standalone vertical blocks.
- **Drag behavior:** Blocks can be dragged into or out of rows. Drop indicators show whether the block will land inside the row or between top-level nodes.
- **Mobile rows:** On the mobile builder, rows show children vertically with a visual grouping indicator (left border line). The preview tab shows how rows collapse on narrow screens.

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

### Mobile Bottom Sheet — Multi-Snap States

The current BottomSheet has a single open/closed state. This must be upgraded to a **three-snap-point bottom sheet** following the pattern established by Google Maps, Apple Maps, and Airbnb:

| State | Height | What's visible | Map visibility |
|-------|--------|----------------|----------------|
| **Peek** | ~25% of viewport | Item name, type icon, status badge, and the first `peekBlockCount` blocks from the layout (default 2). Enough to identify the item at a glance. | Map fully interactive, marker centered above the sheet |
| **Half** | ~50% of viewport | More blocks visible, user can scroll within the half-height container | Map visible above, partially interactive |
| **Full** | ~92% of viewport (safe area aware) | All blocks, full scroll | Map hidden behind sheet |

**Transitions between states:**
- **Swipe up** from peek → half → full (velocity-based snapping — a fast swipe skips half and goes to full)
- **Swipe down** from full → half → peek → dismiss
- **Tap the handle area** toggles between peek and half
- **Scroll within content** — when content is scrolled to top and user pulls down, the sheet collapses rather than overscrolling. When in peek/half and user scrolls content, the sheet expands to accommodate.
- Spring physics with 300ms duration, slight overshoot for natural feel

**Peek state design:**
The layout's `peekBlockCount` controls how many top-level nodes render in peek state. The default of 2 typically gives: Status Badge + Photo Gallery hero — enough visual identity without obscuring the map. The peek state always includes the item name and type icon (these are outside the layout, in the shell). A subtle "swipe up for more" affordance (chevron or fade) hints at additional content.

**Safe areas:**
- Bottom: accounts for home indicator on notched devices (env(safe-area-inset-bottom))
- The quick-add FAB (currently `fixed bottom-24 right-4`) repositions above the sheet in peek state, hides in half/full state
- Full state reserves 8% at top so the user can see they're still in the map context and can swipe down

### Desktop Side Panel

The side panel remains at 384px (`w-96`) width. At this width:
- **Rows auto-collapse to vertical stacking** — the panel is narrower than the 480px row threshold, so all content stacks vertically. This is intentional: the side panel is a constrained context similar to mobile.
- If a future need arises for wider panels, the row threshold is a single constant to adjust.

The side panel does not use snap states — it opens fully with slide-in animation and scrolls internally.

### Photo Gallery — Edge-to-Edge in Bottom Sheet

When a `photo_gallery` block with `style: 'hero'` is the first or second block in the layout, it renders **edge-to-edge** (no horizontal padding) within the bottom sheet. This creates the visual pattern users expect from map apps — a hero image that bleeds to the panel edges, anchoring the visual identity of the item.

In non-hero positions or with grid/carousel styles, photos render with standard padding.

### Component Architecture

```
DetailPanel (shell — bottom sheet on mobile, side panel on desktop)
  ├── Handle / drag indicator (mobile only)
  ├── Item name + type icon (always present, outside layout)
  └── LayoutRenderer
       ├── StatusBadgeBlock
       ├── PhotoGalleryBlock
       ├── FieldDisplayBlock
       ├── TimelineBlock
       ├── EntityListBlock
       ├── TextLabelBlock
       ├── DividerBlock
       ├── MapSnippetBlock (desktop only — auto-hidden on mobile)
       └── ActionButtonsBlock
```

### LayoutRenderer Component

```typescript
interface LayoutRendererProps {
  layout: TypeLayout;
  item: ItemWithDetails;
  mode: 'live' | 'preview';
  context: 'bottom-sheet' | 'side-panel' | 'preview';
  sheetState?: 'peek' | 'half' | 'full';  // mobile only
  customFields: CustomField[];
}
```

- Iterates `layout.blocks` in order, renders the matching block component
- In `peek` state, only renders the first `peekBlockCount` top-level nodes
- In `half` / `full` / `side-panel`, renders all blocks
- Each block is wrapped in a React error boundary — one broken block doesn't crash the panel
- `mode: 'preview'` passes mock data and suppresses network calls
- `mode: 'live'` passes real item data and fetches timeline/entities as needed
- Blocks with `hideWhenEmpty: true` check for data presence and render nothing if empty
- `context` controls platform-specific behavior (e.g., MapSnippet hidden in bottom-sheet context)

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

Long layouts scroll naturally within the DetailPanel content area. The panel shell (handle, header) remains fixed. Both the preview and live DetailPanel use the same scroll behavior:

- Content area scrolls independently within the current sheet/panel height
- On mobile: scrolling at the top of content triggers sheet state change (up = expand, down = collapse) rather than rubber-banding
- Subtle fade gradient at the bottom edge when more content exists below the fold
- Scroll position resets to top when opening a different item or when sheet collapses to peek

---

## Auto-Generated Form Layout

The Add/Edit Item form layout is **automatically derived** from the detail layout. Admins do not build the form separately — they build the detail view, and the form follows. The Form Preview tab in the builder shows the result.

### Derivation Rules

The form renderer walks the detail layout and translates display blocks to input blocks:

| Detail Block | Form Equivalent |
|-------------|-----------------|
| `field_display` | Corresponding input for the field type (text input, number input, dropdown select, date picker) |
| `photo_gallery` | Photo uploader (camera + gallery picker) |
| `status_badge` | Status selector dropdown |
| `entity_list` | Entity multi-select per entity type |
| `text_label` | Rendered as-is (section header in form) |
| `divider` | Rendered as-is (visual break in form) |
| `timeline` | **Omitted** — no form equivalent (display-only) |
| `map_snippet` | **Omitted** — location picker is a fixed form element |
| `action_buttons` | **Omitted** — replaced by Submit/Cancel buttons |

### Fixed Form Elements

These elements are always present in the form regardless of layout, in fixed positions:

1. **Item name** — always first (text input, required)
2. **Location picker** — always second (map tap or GPS, required)
3. *(layout-derived fields appear here, preserving block order and row grouping)*
4. **Photo uploader** — after custom fields (unless a `photo_gallery` block exists in the layout, in which case it renders at that position)
5. **Submit / Cancel buttons** — always last

### Row Behavior in Forms

Rows from the detail layout carry into the form. Two fields in a row render as side-by-side inputs on wider screens (≥480px) and stack vertically on narrow screens — matching the detail view's responsive behavior. This creates visual consistency between the form and the detail view.

### Form-Specific Considerations

- **Required indicators:** Fields marked as required show a red asterisk next to the label
- **Validation:** Runs on blur and on submit. Errors appear below the input with red text.
- **Field order matches detail layout:** If an admin puts "Species" before "Install Date" in the detail view, the form inputs appear in the same order
- **No separate form layout storage:** The form is derived at render time from the detail layout JSON. No additional database column.

### Why Auto-Generated (Not Separately Designed)

- **Cognitive load:** Non-technical admins would struggle to maintain two separate layouts
- **Consistency:** The form and detail view stay in sync automatically — adding a field to the detail layout adds the input to the form
- **Scope:** A separate form builder doubles the builder complexity for marginal benefit
- **Future path:** If custom form layouts are needed later, a `formLayout` field can be added to the JSON schema. Null = auto-generate (backward compatible).

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

## UX Design System & Guidelines

### Spacing System

The layout uses a consistent **4px base unit** spacing scale, applied via the `SpacingPreset` on the layout:

| Preset | Block gap | Row internal gap | Section padding | Use case |
|--------|-----------|-------------------|-----------------|----------|
| `compact` | 8px (2 units) | 8px | 12px | Data-dense types with many fields |
| `comfortable` | 12px (3 units) | 12px | 16px | Default — balanced readability |
| `spacious` | 16px (4 units) | 16px | 20px | Photo-forward or minimal types |

The spacing preset is a single toggle in the builder (three options with visual previews), not per-block configuration. Consistent rhythm matters more than per-element control.

### Typography Scale

Block text rendering follows a coherent type scale derived from the app's existing Tailwind config:

| Style | Size | Weight | Line Height | Use case |
|-------|------|--------|-------------|----------|
| `heading` | 18px / 1.125rem | 600 (semibold) | 1.3 | Section headers within the detail panel |
| `subheading` | 15px / 0.9375rem | 500 (medium) | 1.4 | Subsection labels, field group titles |
| `body` | 14px / 0.875rem | 400 (regular) | 1.5 | Field values, descriptions, body text |
| `caption` | 12px / 0.75rem | 400 (regular) | 1.4 | Timestamps, metadata, secondary info |
| `field-label` | 12px / 0.75rem | 500 (medium) | 1.3 | Field labels above values, all-caps tracking |
| `field-value-large` | 20px / 1.25rem | 600 (semibold) | 1.2 | Featured/hero field values (large size config) |

Labels use muted color (`text-gray-500`) to create visual hierarchy against values in `text-gray-900`. This hierarchy is automatic — admins don't configure it.

### Information Architecture

The layout renderer enforces a sensible reading order and visual hierarchy:

- **Primary context first:** Status, identity, and hero imagery at the top establish what the user is looking at
- **Data in the middle:** Custom fields, entities, and detail content in the main body
- **History and actions last:** Timeline and action buttons anchor the bottom

The default starter layout follows this pattern. The builder doesn't enforce ordering (admins can arrange freely), but the defaults model good IA.

**Visual grouping:** Rows implicitly create related-field groups. Adjacent Field Display blocks without a divider between them are rendered with tighter spacing (the `compact` gap) to signal they belong together. A Divider block creates a stronger visual break.

### Touch Targets & Interaction Design

All interactive elements meet **44×44px minimum touch target size** per Apple HIG and WCAG 2.5.5 (AAA):

- Drag handles: 44×44px with visible grip dots, generous padding around the hit area
- Block palette pills: 44px height, minimum 44px width, horizontal padding for comfortable tap
- Delete buttons: 44×44px (icon only, no small text links)
- Toggle switches: native size (already compliant)
- Accordion expand/collapse: entire block header row is tappable (full width, 48px min height)
- Row "Add to row" button: full row width, 44px height
- Spacing between adjacent tap targets: minimum 8px to prevent mis-taps

**Fitts's Law considerations:**
- "Done" / "Save" button in the sticky header is large and in a consistent position (top-right)
- Block palette is pinned at top — always accessible without scrolling
- Delete actions require intentional reach (positioned at row end, away from drag handle)

### Transitions & Feedback

- **Adding a block:** Block slides in from right with 200ms ease-out, auto-scrolls into view
- **Removing a block:** Block fades out over 150ms, list collapses smoothly (no layout jump)
- **Reordering:** Dragged block lifts with subtle shadow (2px translate-z), other blocks animate to make room (200ms spring easing)
- **Config expand/collapse:** Accordion animation 200ms ease-in-out, content height animates (not display:none toggle)
- **Tab switching (mobile):** Crossfade 150ms, scroll position preserved per tab
- **Preview updates:** Blocks in preview cross-fade on content changes (150ms) — not instant swap
- **Save:** Button shows spinner → checkmark (hold 600ms) → returns to normal
- **Row collapse/expand on resize:** Smooth CSS transition, no JS reflow

All animations respect `prefers-reduced-motion: reduce` — transitions become instant, no motion.

### Accessibility

- Drag/drop has keyboard alternative: Tab to select block, Space to pick up, Arrow keys to move, Space to drop, Escape to cancel
- Block palette items are focusable and keyboard-navigable (arrow keys cycle, Enter adds)
- Screen readers announce block type and position ("Photo Gallery, block 2 of 5")
- Row children announced as "Species field, column 1 of 2 in row"
- Config forms use proper `<label>` associations and `aria-describedby` for help text
- Color contrast meets WCAG AA throughout (4.5:1 for text, 3:1 for interactive elements)
- Focus indicators: visible 2px ring on all interactive elements, not just browser default
- Error messages linked to inputs via `aria-errormessage`

### Empty States

- **New type, first time in builder:** Starter layout is pre-populated (not blank). A subtle banner above the block list reads: "Drag to reorder. Tap + to add blocks. Tap a block to configure it." Banner dismisses permanently after first block interaction.
- **All blocks deleted:** Message with illustration: "Your layout is empty. Add blocks from the palette above to build the detail view." The preview shows just the item name and type icon.
- **Empty row:** Shows a dashed-border drop zone with "+ Add block" centered inside.

### Responsive Breakpoints

| Width | Builder layout | Preview | Row behavior |
|-------|---------------|---------|-------------|
| < 480px | Full-screen overlay, tabbed Build/Detail/Form | Simulated bottom sheet with peek line | Rows collapse to vertical stacking |
| 480–767px | Full-screen overlay, tabbed Build/Detail/Form | Simulated bottom sheet with peek line | Rows display horizontally |
| 768–1024px | Side-by-side, builder 55% / preview 45% | Tabbed Detail/Form in preview panel | Rows display horizontally |
| > 1024px | Side-by-side, builder 60% / preview 40% | Tabbed Detail/Form in preview panel | Rows display horizontally |

The preview always renders at the width the end user will see — on mobile builder, the preview tab renders at device width. On desktop, the preview panel constrains to typical mobile/panel width to show the realistic view.

---

## Scope Boundaries

### In Scope

- Layout builder with 9 block types + row container
- Vertical and horizontal composition (rows with 2–4 children, one level deep)
- Responsive row collapse on narrow screens
- Layout-first type creation flow
- **Multi-snap bottom sheet** (peek / half / full) with configurable peek boundary
- **Auto-generated form layout** with Form Preview tab in builder
- Live detail and form previews with mock data
- Mobile full-screen editing with three tabs (Build / Detail / Form)
- Inline field creation from builder
- Field sync (add/delete notifications)
- LayoutRenderer for DetailPanel
- FormRenderer derived from detail layout
- Edge-to-edge hero photo rendering in bottom sheet
- Backward-compatible fallback rendering
- Database migration (single column)
- Offline support (cached layout JSON)
- Spacing preset system (compact / comfortable / spacious)
- Typography scale and visual hierarchy
- Zod validation
- `@dnd-kit/sortable` for drag/drop
- WCAG AA accessibility compliance

### Out of Scope (Future Consideration)

- Layout templates / presets (start from a template instead of the starter layout)
- Copy/duplicate layout between types
- Layout version history or undo beyond session
- Deeply nested layouts (rows in rows, columns in columns)
- Conditional blocks (show block X only if field Y has value Z)
- Custom CSS or theme overrides per type
- Layout builder for UpdateTypes or EntityTypes
- Custom form layout builder (separate from detail layout — currently auto-generated)
- A/B testing of layouts
- Layout analytics (which blocks get seen/interacted with)
- Per-block spacing overrides (global preset only)
