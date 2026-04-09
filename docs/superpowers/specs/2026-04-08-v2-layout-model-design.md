# V2 Layout Model Design

**Date:** 2026-04-08
**Issue:** [#230 — item detail updates](https://github.com/patjackson52/birdhouse-mapper/issues/230)
**Branch:** `feat/item-editor-layouts`

## Goal

Evolve the layout system to support fractional block widths, per-block permissions, and a dedicated description block type. Establishes the structural foundation for a future preview-as-editor drag-and-drop experience without implementing the DnD interaction itself.

## Strategy

Create a parallel v2 type system alongside v1. Existing v1 layouts continue to render via the untouched v1 renderer. V2 gets a new renderer and builder. Migration is lazy — v1 upgrades to v2 only when an admin edits and saves a layout.

## V2 Type Definitions

### `TypeLayoutV2`

```typescript
interface TypeLayoutV2 {
  version: 2;
  blocks: LayoutNodeV2[];
  spacing: SpacingPreset;       // 'compact' | 'comfortable' | 'spacious'
  peekBlockCount: number;       // 0-10
}
```

### `LayoutBlockV2`

```typescript
interface LayoutBlockV2 {
  id: string;
  type: BlockTypeV2;
  config: BlockConfigV2;
  width?: FractionalWidth;      // defaults to 'full' when omitted
  hideWhenEmpty?: boolean;
  permissions?: BlockPermissions;
}
```

### `LayoutRowV2`

Drops `distribution` from v1 — width is now per-block.

```typescript
interface LayoutRowV2 {
  id: string;
  type: 'row';
  children: LayoutBlockV2[];    // 2-4 blocks
  gap: 'tight' | 'normal' | 'loose';
  permissions?: BlockPermissions;
}
```

### `FractionalWidth`

```typescript
type FractionalWidth = '1/4' | '1/3' | '1/2' | '2/3' | '3/4' | 'full';
```

### `BlockPermissions`

```typescript
interface BlockPermissions {
  requiredRole?: 'viewer' | 'editor' | 'admin';
}
```

### `BlockTypeV2`

All v1 block types plus `description`:

```typescript
type BlockTypeV2 =
  | 'field_display'
  | 'photo_gallery'
  | 'status_badge'
  | 'entity_list'
  | 'text_label'
  | 'divider'
  | 'action_buttons'
  | 'map_snippet'
  | 'timeline'
  | 'description';
```

### `BlockConfigV2`

All v1 configs plus `DescriptionConfig`:

```typescript
type BlockConfigV2 =
  | FieldDisplayConfig
  | PhotoGalleryConfig
  | StatusBadgeConfig
  | EntityListConfig
  | TimelineConfig
  | TextLabelConfig
  | DividerConfig
  | MapSnippetConfig
  | ActionButtonsConfig
  | DescriptionConfig;
```

### `DescriptionConfig`

```typescript
interface DescriptionConfig {
  showLabel: boolean;
  maxLines?: number;            // CSS line-clamp truncation for peek view
}
```

## Zod Schemas (`schemas-v2.ts`)

Separate file alongside existing `schemas.ts` (untouched).

### Shared schemas

```typescript
const fractionalWidthSchema = z.enum(['1/4', '1/3', '1/2', '2/3', '3/4', 'full']);

const blockPermissionsSchema = z.object({
  requiredRole: z.enum(['viewer', 'editor', 'admin']).optional(),
});
```

### V2 block schemas

Reuse existing v1 config schemas with added `width` and `permissions` fields. A helper adds the common v2 fields to avoid duplicating all 9 block schemas:

```typescript
function v2BlockFields() {
  return {
    width: fractionalWidthSchema.optional(),
    permissions: blockPermissionsSchema.optional(),
  };
}
```

New description block schema:

```typescript
const descriptionBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('description'),
  config: z.object({
    showLabel: z.boolean(),
    maxLines: z.number().int().min(1).max(50).optional(),
  }),
  width: fractionalWidthSchema.optional(),
  hideWhenEmpty: z.boolean().optional(),
  permissions: blockPermissionsSchema.optional(),
});
```

### Row width validation

```typescript
layoutRowV2Schema.refine((row) => {
  const widthMap = { '1/4': 0.25, '1/3': 0.333, '1/2': 0.5, '2/3': 0.667, '3/4': 0.75, 'full': 1 };
  const total = row.children.reduce((sum, child) =>
    sum + (widthMap[child.width ?? 'full'] ?? 1), 0);
  return total <= 1.01; // float tolerance
}, 'Row children widths must not exceed 100%');
```

### Top-level schema

```typescript
export const typeLayoutV2Schema = z.object({
  version: z.literal(2),
  blocks: z.array(layoutNodeV2Schema).min(1),
  spacing: z.enum(['compact', 'comfortable', 'spacious']),
  peekBlockCount: z.number().int().min(0).max(10),
});
```

## Version Dispatch

### `LayoutRendererDispatch.tsx`

Single entry point that replaces direct usage of `LayoutRenderer`:

```typescript
function LayoutRendererDispatch({ layout, ...props }) {
  if (layout.version === 2) return <LayoutRendererV2 layout={layout} {...props} />;
  return <LayoutRenderer layout={layout} {...props} />;
}
```

All current consumers of `LayoutRenderer` switch to `LayoutRendererDispatch`.

### Builder dispatch

The builder always produces v2. When editing an existing item type:

- **V1 layout:** auto-migrate to v2 on load into builder via `migrateV1toV2()`. Not persisted until the admin saves.
- **Null layout:** generate a default v2 layout via updated `generateDefaultLayout()`.

## Migration (`migration.ts`)

### `migrateV1toV2(layout: TypeLayout): TypeLayoutV2`

Mapping rules for `distribution` → per-block `width`:

| V1 `distribution` | V2 block `width` |
|---|---|
| `'equal'` with 2 children | Each `'1/2'` |
| `'equal'` with 3 children | Each `'1/3'` |
| `'equal'` with 4 children | Each `'1/4'` |
| `'auto'` | `undefined` (auto-sized) |
| `number[]` | Normalize to percentages, snap each to nearest fraction by absolute difference (e.g., 40% → `'1/3'` since 33.3% is closer than 50%) |

Additional behavior:

- Sets `version: 2`
- No `permissions` added (visible to all by default)
- All block configs, ids, and `hideWhenEmpty` preserved
- Top-level blocks (outside rows) get no `width` (always full-width at top level)

No automatic bulk migration of stored layouts. V1 layouts in the database stay v1 and render via the v1 renderer.

## Rendering (`LayoutRendererV2.tsx`)

### Width rendering

Blocks inside rows use their `width` mapped to CSS flex-basis:

```typescript
const widthToCSS: Record<FractionalWidth, string> = {
  '1/4': '25%', '1/3': '33.333%', '1/2': '50%',
  '2/3': '66.667%', '3/4': '75%', 'full': '100%',
};
// Row: display: flex
// Child: flex: 0 0 <width%>
```

Top-level blocks always render full-width regardless of `width` value.

### Permissions filtering

```typescript
function useBlockVisibility(permissions?: BlockPermissions): boolean {
  const { role } = useUserContext();
  if (!permissions?.requiredRole) return true;
  return roleHasAccess(role, permissions.requiredRole);
}
```

- Row-level permissions hide the entire row including children.
- Hidden blocks within a visible row: remaining blocks redistribute via flex-grow.
- Permissions checked before `hideWhenEmpty` — if permission-hidden, block is not rendered regardless.

### Description block (`DescriptionBlock.tsx`)

- Reads from `item.description` (well-known column, not a custom field)
- Renders text with optional `maxLines` truncation via CSS `line-clamp`
- Supports `hideWhenEmpty` — hidden when `item.description` is null/empty
- Supports `showLabel` — renders "Description" label above content when true

### Shared block components

Existing block components (`StatusBadgeBlock`, `PhotoGalleryBlock`, `FieldDisplayBlock`, etc.) are shared between v1 and v2 renderers. Only the layout container logic differs.

## Builder Changes (`LayoutBuilderV2.tsx`)

### Block palette

- `description` block added to palette
- Max one `description` per layout — palette disables the option when already present

### Width configuration

- Blocks inside rows show a fractional width picker in `BlockConfigPanel`: clickable buttons for `1/4`, `1/3`, `1/2`, `2/3`, `3/4`
- Blocks at top level do not show the width picker (always full-width)

### Permissions configuration

- All blocks and rows get a collapsible "Visibility" section at the bottom of `BlockConfigPanel`
- Role dropdown: `Everyone` (undefined), `Editors & Admins` ('editor'), `Admins only` ('admin')

### Row config

- Drops the `distribution` control from v1
- Retains `gap` control

## DnD Foundation (Structural Only)

The v2 model enables future preview-as-editor DnD by design:

- **Fractional widths** define snap points for future preview drop zones
- **Stable block `id`** allows mapping rendered DOM elements back to model nodes
- **Explicit row boundaries** enable drop target detection (new row vs. within existing row)
- **Permissions metadata** is separate from render logic — the preview editor can show gated blocks with visual indicators without changing rendering

This task does NOT include any DnD interaction implementation.

## Out of Scope

- Preview-as-editor DnD interaction
- Form derivation updates for v2 (`form-derivation.ts`)
- Visual indicators for drop zones or permissions in the preview
- Bulk migration of stored v1 layouts

## Files

| Action | Path |
|--------|------|
| Create | `src/lib/layout/types-v2.ts` |
| Create | `src/lib/layout/schemas-v2.ts` |
| Create | `src/lib/layout/migration.ts` |
| Create | `src/components/layout/LayoutRendererDispatch.tsx` |
| Create | `src/components/layout/LayoutRendererV2.tsx` |
| Create | `src/components/layout/blocks/DescriptionBlock.tsx` |
| Create | `src/components/layout/builder/LayoutBuilderV2.tsx` |
| Modify | `src/components/layout/builder/BlockPalette.tsx` — add description block |
| Modify | `src/components/layout/builder/BlockConfigPanel.tsx` — width + permissions UI |
| Modify | `src/app/admin/properties/[slug]/types/layout-actions.ts` — accept v2 layouts |
| Modify | Consumers of `LayoutRenderer` — swap to `LayoutRendererDispatch` |

## Testing

### `schemas-v2.test.ts`
- All v2 block types with `width` and `permissions` validate correctly
- Row width sum validation rejects rows exceeding 100%
- Description block config validation (showLabel required, maxLines optional)
- Edge cases: missing width defaults to full, empty permissions object

### `migration.test.ts`
- All `distribution` variants map correctly (`equal` with 2/3/4 children, `auto`, `number[]`)
- All block configs, ids, and `hideWhenEmpty` preserved
- Output passes `typeLayoutV2Schema` validation (round-trip)

### `permissions.test.ts`
- `useBlockVisibility`: viewer blocked from editor blocks, admin sees all, no permissions = visible
- Row-level permissions hide entire row including children
- `hideWhenEmpty` + permissions interaction: permissions checked first

### Component tests
- `DescriptionBlock` renders `item.description`, respects `maxLines`, hides when empty
- `LayoutRendererV2` renders blocks with correct flex-basis styles
- `LayoutRendererDispatch` routes v1 → v1 renderer, v2 → v2 renderer
- Width picker appears in config panel only for blocks inside rows

### Existing tests
All v1 tests remain unchanged and passing.
