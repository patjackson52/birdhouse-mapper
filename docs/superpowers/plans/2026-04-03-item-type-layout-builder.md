# Item Type Layout Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a drag-and-drop layout builder for ItemTypes that lets non-technical admins design custom detail views with live preview, producing a JSON layout stored on the ItemType and rendered via a new multi-snap bottom sheet.

**Architecture:** Layout-first type creation where the builder IS the type definition tool. A `TypeLayout` JSON (JSONB column on `item_types`) describes blocks arranged vertically or in rows. A `LayoutRenderer` interprets this JSON in both the live DetailPanel and builder preview. The existing BottomSheet is replaced with a multi-snap (peek/half/full) sheet. An auto-generated form preview derives input forms from the detail layout.

**Tech Stack:** Next.js 14, Supabase PostgreSQL, Tailwind CSS, @dnd-kit/sortable (new), Framer Motion (existing), Zod (existing), Dexie (existing), Vitest + Testing Library (existing)

---

## File Structure

### New Files

```
src/lib/layout/
  types.ts                  — TypeLayout, LayoutNode, LayoutBlock, LayoutRow, BlockConfig interfaces
  schemas.ts                — Zod validation for layout JSON
  defaults.ts               — Generate default layout from custom fields
  mock-data.ts              — Generate mock ItemWithDetails for preview
  form-derivation.ts        — Derive form field list from detail layout
  spacing.ts                — Spacing preset constants (gap, padding values)

src/components/layout/
  LayoutRenderer.tsx         — Iterates layout nodes, renders block components
  BlockErrorBoundary.tsx     — Per-block error boundary

  blocks/
    FieldDisplayBlock.tsx
    PhotoGalleryBlock.tsx
    StatusBadgeBlock.tsx
    EntityListBlock.tsx
    TimelineBlock.tsx
    TextLabelBlock.tsx
    DividerBlock.tsx
    MapSnippetBlock.tsx
    ActionButtonsBlock.tsx
    RowBlock.tsx             — Renders horizontal row of children

  builder/
    LayoutBuilder.tsx        — Main builder orchestrator (state, tabs, responsive)
    BlockPalette.tsx         — Horizontally scrollable block type pills
    BlockList.tsx            — Sortable block list with @dnd-kit
    BlockListItem.tsx        — Single block row: drag handle, label, delete, accordion config
    BlockConfigPanel.tsx     — Config UI per block type (switch on type)
    RowEditor.tsx            — Row config: distribution, gap, add/remove children
    PeekBoundary.tsx         — Draggable line showing peek fold
    InlineFieldCreator.tsx   — Create custom field inline in builder
    SpacingPicker.tsx        — Three-option compact/comfortable/spacious toggle

  preview/
    DetailPreview.tsx        — Simulated bottom sheet with peek line
    FormPreview.tsx          — Auto-generated form from layout

src/components/ui/
  MultiSnapBottomSheet.tsx   — Three-snap-point bottom sheet (replaces BottomSheet)

src/app/admin/properties/[slug]/types/
  layout-actions.ts          — Server actions: saveTypeWithLayout, deleteLayout

supabase/migrations/
  030_item_type_layout.sql   — ALTER TABLE item_types ADD COLUMN layout JSONB
```

### Modified Files

```
src/lib/types.ts                              — Add layout field to ItemType interface
src/lib/offline/db.ts                         — Layout included in item_types cache (no schema change needed, JSONB stored as-is)
src/components/item/DetailPanel.tsx            — Integrate LayoutRenderer, use MultiSnapBottomSheet
src/components/map/MapView.tsx                 — FAB repositioning when bottom sheet is in peek state
src/app/admin/properties/[slug]/types/page.tsx — Restructure to tabs (Layout/Fields/Settings)
src/components/manage/ItemForm.tsx             — Use form derivation for field ordering when layout exists
package.json                                  — Add @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, nanoid
```

---

## Task 1: Database Migration + TypeScript Types

**Files:**
- Create: `supabase/migrations/030_item_type_layout.sql`
- Create: `src/lib/layout/types.ts`
- Modify: `src/lib/types.ts`
- Create: `src/lib/layout/__tests__/types.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/030_item_type_layout.sql
-- Add layout JSONB column to item_types for custom detail panel layouts

ALTER TABLE item_types
ADD COLUMN layout jsonb DEFAULT NULL;

COMMENT ON COLUMN item_types.layout IS
  'JSON layout definition for the item detail panel. NULL = use default rendering.';
```

- [ ] **Step 2: Create layout type definitions**

```typescript
// src/lib/layout/types.ts

export type SpacingPreset = 'compact' | 'comfortable' | 'spacious';

export interface TypeLayout {
  version: 1;
  blocks: LayoutNode[];
  spacing: SpacingPreset;
  peekBlockCount: number;
}

export type LayoutNode = LayoutBlock | LayoutRow;

export interface LayoutBlock {
  id: string;
  type: BlockType;
  config: BlockConfig;
  hideWhenEmpty?: boolean;
}

export interface LayoutRow {
  id: string;
  type: 'row';
  children: LayoutBlock[];
  gap: 'tight' | 'normal' | 'loose';
  distribution: 'equal' | 'auto' | number[];
}

export type BlockType =
  | 'field_display'
  | 'photo_gallery'
  | 'status_badge'
  | 'entity_list'
  | 'text_label'
  | 'divider'
  | 'action_buttons'
  | 'map_snippet'
  | 'timeline';

export type BlockConfig =
  | FieldDisplayConfig
  | PhotoGalleryConfig
  | StatusBadgeConfig
  | EntityListConfig
  | TimelineConfig
  | TextLabelConfig
  | DividerConfig
  | MapSnippetConfig
  | ActionButtonsConfig;

export interface FieldDisplayConfig {
  fieldId: string;
  size: 'compact' | 'normal' | 'large';
  showLabel: boolean;
}

export interface PhotoGalleryConfig {
  style: 'hero' | 'grid' | 'carousel';
  maxPhotos: number;
}

export interface StatusBadgeConfig {}

export interface EntityListConfig {
  entityTypeIds: string[];
}

export interface TimelineConfig {
  showUpdates: boolean;
  showScheduled: boolean;
  maxItems: number;
}

export interface TextLabelConfig {
  text: string;
  style: 'heading' | 'subheading' | 'body' | 'caption';
}

export interface DividerConfig {}

export interface MapSnippetConfig {}

export interface ActionButtonsConfig {}

// Type guard helpers
export function isLayoutRow(node: LayoutNode): node is LayoutRow {
  return node.type === 'row';
}

export function isLayoutBlock(node: LayoutNode): node is LayoutBlock {
  return node.type !== 'row';
}
```

- [ ] **Step 3: Add layout to ItemType interface**

In `src/lib/types.ts`, add the `layout` field to `ItemType`:

```typescript
// Add import at top
import type { TypeLayout } from '@/lib/layout/types';

// Add to ItemType interface (after sort_order field):
  layout: TypeLayout | null;
```

- [ ] **Step 4: Write type guard tests**

```typescript
// src/lib/layout/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import { isLayoutRow, isLayoutBlock } from '../types';
import type { LayoutBlock, LayoutRow } from '../types';

describe('layout type guards', () => {
  const block: LayoutBlock = {
    id: 'b1',
    type: 'status_badge',
    config: {},
  };

  const row: LayoutRow = {
    id: 'r1',
    type: 'row',
    children: [block],
    gap: 'normal',
    distribution: 'equal',
  };

  it('isLayoutRow returns true for rows', () => {
    expect(isLayoutRow(row)).toBe(true);
  });

  it('isLayoutRow returns false for blocks', () => {
    expect(isLayoutRow(block)).toBe(false);
  });

  it('isLayoutBlock returns true for blocks', () => {
    expect(isLayoutBlock(block)).toBe(true);
  });

  it('isLayoutBlock returns false for rows', () => {
    expect(isLayoutBlock(row)).toBe(false);
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/layout/__tests__/types.test.ts`
Expected: PASS — 4 tests pass

- [ ] **Step 6: Apply migration**

Run: `cd /Users/patrick/birdhousemapper && npx supabase db push` (or appropriate migration command for local dev)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/030_item_type_layout.sql src/lib/layout/types.ts src/lib/types.ts src/lib/layout/__tests__/types.test.ts
git commit -m "feat: add layout JSONB column and TypeScript types for item type layouts"
```

---

## Task 2: Zod Validation Schemas

**Files:**
- Create: `src/lib/layout/schemas.ts`
- Create: `src/lib/layout/__tests__/schemas.test.ts`

- [ ] **Step 1: Write failing tests for schema validation**

```typescript
// src/lib/layout/__tests__/schemas.test.ts
import { describe, it, expect } from 'vitest';
import { typeLayoutSchema } from '../schemas';

describe('typeLayoutSchema', () => {
  it('accepts a valid layout with blocks', () => {
    const layout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'photo_gallery', config: { style: 'hero', maxPhotos: 4 } },
        {
          id: 'b3',
          type: 'field_display',
          config: { fieldId: 'f1', size: 'normal', showLabel: true },
          hideWhenEmpty: true,
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts a layout with a row', () => {
    const layout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'compact', showLabel: true } },
            { id: 'b2', type: 'field_display', config: { fieldId: 'f2', size: 'compact', showLabel: true } },
          ],
          gap: 'normal',
          distribution: 'equal',
        },
      ],
      spacing: 'compact',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts row with number[] distribution', () => {
    const layout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'text_label', config: { text: 'Hello', style: 'heading' } },
          ],
          gap: 'tight',
          distribution: [2, 1],
        },
      ],
      spacing: 'spacious',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('rejects empty blocks array', () => {
    const layout = {
      version: 1,
      blocks: [],
      spacing: 'comfortable',
      peekBlockCount: 0,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects invalid block type', () => {
    const layout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'unknown_block', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects row with fewer than 2 children', () => {
    const layout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [{ id: 'b1', type: 'status_badge', config: {} }],
          gap: 'normal',
          distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects row with more than 4 children', () => {
    const children = Array.from({ length: 5 }, (_, i) => ({
      id: `b${i}`,
      type: 'status_badge' as const,
      config: {},
    }));
    const layout = {
      version: 1,
      blocks: [{ id: 'r1', type: 'row', children, gap: 'normal', distribution: 'equal' }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects maxPhotos outside 1-20', () => {
    const layout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'photo_gallery', config: { style: 'hero', maxPhotos: 25 } }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects invalid spacing preset', () => {
    const layout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'divider', config: {} }],
      spacing: 'extra-wide',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('defaults to version 1', () => {
    const layout = {
      blocks: [{ id: 'b1', type: 'divider', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/layout/__tests__/schemas.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the Zod schemas**

```typescript
// src/lib/layout/schemas.ts
import { z } from 'zod';

// Block config schemas
const fieldDisplayConfigSchema = z.object({
  fieldId: z.string().min(1),
  size: z.enum(['compact', 'normal', 'large']),
  showLabel: z.boolean(),
});

const photoGalleryConfigSchema = z.object({
  style: z.enum(['hero', 'grid', 'carousel']),
  maxPhotos: z.number().int().min(1).max(20),
});

const statusBadgeConfigSchema = z.object({});

const entityListConfigSchema = z.object({
  entityTypeIds: z.array(z.string()),
});

const timelineConfigSchema = z.object({
  showUpdates: z.boolean(),
  showScheduled: z.boolean(),
  maxItems: z.number().int().min(1).max(50),
});

const textLabelConfigSchema = z.object({
  text: z.string(),
  style: z.enum(['heading', 'subheading', 'body', 'caption']),
});

const emptyConfigSchema = z.object({});

// Block type enum
const blockTypeSchema = z.enum([
  'field_display',
  'photo_gallery',
  'status_badge',
  'entity_list',
  'text_label',
  'divider',
  'action_buttons',
  'map_snippet',
  'timeline',
]);

// Discriminated block schemas
const fieldDisplayBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('field_display'),
  config: fieldDisplayConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const photoGalleryBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('photo_gallery'),
  config: photoGalleryConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const statusBadgeBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('status_badge'),
  config: statusBadgeConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const entityListBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('entity_list'),
  config: entityListConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const textLabelBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('text_label'),
  config: textLabelConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const timelineBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('timeline'),
  config: timelineConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const dividerBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('divider'),
  config: emptyConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const actionButtonsBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('action_buttons'),
  config: emptyConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const mapSnippetBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('map_snippet'),
  config: emptyConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

export const layoutBlockSchema = z.discriminatedUnion('type', [
  fieldDisplayBlockSchema,
  photoGalleryBlockSchema,
  statusBadgeBlockSchema,
  entityListBlockSchema,
  textLabelBlockSchema,
  timelineBlockSchema,
  dividerBlockSchema,
  actionButtonsBlockSchema,
  mapSnippetBlockSchema,
]);

const layoutRowSchema = z.object({
  id: z.string().min(1),
  type: z.literal('row'),
  children: z.array(layoutBlockSchema).min(2).max(4),
  gap: z.enum(['tight', 'normal', 'loose']),
  distribution: z.union([
    z.enum(['equal', 'auto']),
    z.array(z.number().positive()),
  ]),
});

export const layoutNodeSchema = z.union([layoutBlockSchema, layoutRowSchema]);

export const typeLayoutSchema = z.object({
  version: z.literal(1).default(1),
  blocks: z.array(layoutNodeSchema).min(1),
  spacing: z.enum(['compact', 'comfortable', 'spacious']),
  peekBlockCount: z.number().int().min(0).max(10),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/layout/__tests__/schemas.test.ts`
Expected: PASS — all 9 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/schemas.ts src/lib/layout/__tests__/schemas.test.ts
git commit -m "feat: add Zod validation schemas for layout JSON"
```

---

## Task 3: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @dnd-kit packages and nanoid**

Run: `cd /Users/patrick/birdhousemapper && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities nanoid`

- [ ] **Step 2: Verify installation**

Run: `cd /Users/patrick/birdhousemapper && node -e "require('@dnd-kit/core'); require('@dnd-kit/sortable'); require('nanoid'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, nanoid"
```

---

## Task 4: Spacing Constants + Default Layout Generation

**Files:**
- Create: `src/lib/layout/spacing.ts`
- Create: `src/lib/layout/defaults.ts`
- Create: `src/lib/layout/__tests__/defaults.test.ts`

- [ ] **Step 1: Create spacing constants**

```typescript
// src/lib/layout/spacing.ts
import type { SpacingPreset } from './types';

export const SPACING = {
  compact: { blockGap: 8, rowGap: 8, sectionPadding: 12 },
  comfortable: { blockGap: 12, rowGap: 12, sectionPadding: 16 },
  spacious: { blockGap: 16, rowGap: 16, sectionPadding: 20 },
} as const satisfies Record<SpacingPreset, { blockGap: number; rowGap: number; sectionPadding: number }>;

/** Width below which rows collapse to vertical stacking */
export const ROW_COLLAPSE_BREAKPOINT = 480;
```

- [ ] **Step 2: Write failing tests for default layout generation**

```typescript
// src/lib/layout/__tests__/defaults.test.ts
import { describe, it, expect } from 'vitest';
import { generateDefaultLayout } from '../defaults';
import type { CustomField } from '@/lib/types';

describe('generateDefaultLayout', () => {
  it('generates starter layout with no custom fields', () => {
    const layout = generateDefaultLayout([]);
    expect(layout.version).toBe(1);
    expect(layout.spacing).toBe('comfortable');
    expect(layout.peekBlockCount).toBe(2);
    expect(layout.blocks).toHaveLength(3);
    expect(layout.blocks[0].type).toBe('status_badge');
    expect(layout.blocks[1].type).toBe('photo_gallery');
    expect(layout.blocks[2].type).toBe('action_buttons');
  });

  it('inserts field_display blocks for each custom field', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'Species', field_type: 'dropdown', options: ['Robin'], required: true, sort_order: 0, org_id: 'o1' },
      { id: 'f2', item_type_id: 't1', name: 'Install Date', field_type: 'date', options: null, required: false, sort_order: 1, org_id: 'o1' },
    ];
    const layout = generateDefaultLayout(fields);
    // Status Badge, Photo Gallery, Field(Species), Field(Install Date), Action Buttons
    expect(layout.blocks).toHaveLength(5);
    expect(layout.blocks[2].type).toBe('field_display');
    expect(layout.blocks[3].type).toBe('field_display');
    const config0 = layout.blocks[2].config as { fieldId: string };
    const config1 = layout.blocks[3].config as { fieldId: string };
    expect(config0.fieldId).toBe('f1');
    expect(config1.fieldId).toBe('f2');
  });

  it('sorts fields by sort_order', () => {
    const fields: CustomField[] = [
      { id: 'f2', item_type_id: 't1', name: 'B', field_type: 'text', options: null, required: false, sort_order: 2, org_id: 'o1' },
      { id: 'f1', item_type_id: 't1', name: 'A', field_type: 'text', options: null, required: false, sort_order: 1, org_id: 'o1' },
    ];
    const layout = generateDefaultLayout(fields);
    const config0 = layout.blocks[2].config as { fieldId: string };
    const config1 = layout.blocks[3].config as { fieldId: string };
    expect(config0.fieldId).toBe('f1');
    expect(config1.fieldId).toBe('f2');
  });

  it('generates unique IDs for all blocks', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'A', field_type: 'text', options: null, required: false, sort_order: 0, org_id: 'o1' },
    ];
    const layout = generateDefaultLayout(fields);
    const ids = layout.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/layout/__tests__/defaults.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement default layout generation**

```typescript
// src/lib/layout/defaults.ts
import { nanoid } from 'nanoid';
import type { TypeLayout, LayoutBlock } from './types';
import type { CustomField } from '@/lib/types';

export function generateDefaultLayout(customFields: CustomField[]): TypeLayout {
  const sorted = [...customFields].sort((a, b) => a.sort_order - b.sort_order);

  const fieldBlocks: LayoutBlock[] = sorted.map((field) => ({
    id: nanoid(10),
    type: 'field_display',
    config: { fieldId: field.id, size: 'normal' as const, showLabel: true },
  }));

  return {
    version: 1,
    spacing: 'comfortable',
    peekBlockCount: 2,
    blocks: [
      { id: nanoid(10), type: 'status_badge', config: {} },
      { id: nanoid(10), type: 'photo_gallery', config: { style: 'hero' as const, maxPhotos: 4 } },
      ...fieldBlocks,
      { id: nanoid(10), type: 'action_buttons', config: {} },
    ],
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/layout/__tests__/defaults.test.ts`
Expected: PASS — all 4 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/layout/spacing.ts src/lib/layout/defaults.ts src/lib/layout/__tests__/defaults.test.ts
git commit -m "feat: add spacing constants and default layout generation"
```

---

## Task 5: Mock Data Generation

**Files:**
- Create: `src/lib/layout/mock-data.ts`
- Create: `src/lib/layout/__tests__/mock-data.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/layout/__tests__/mock-data.test.ts
import { describe, it, expect } from 'vitest';
import { generateMockItem } from '../mock-data';
import type { CustomField, ItemType } from '@/lib/types';

describe('generateMockItem', () => {
  const itemType: ItemType = {
    id: 't1',
    name: 'Bird Box',
    icon: '🏠',
    color: '#5D7F3A',
    sort_order: 0,
    created_at: '2026-01-01',
    org_id: 'o1',
    layout: null,
  };

  it('generates a mock item with correct type info', () => {
    const mock = generateMockItem(itemType, []);
    expect(mock.name).toBe('Sample Bird Box');
    expect(mock.item_type_id).toBe('t1');
    expect(mock.status).toBe('active');
    expect(mock.latitude).toBeTypeOf('number');
    expect(mock.longitude).toBeTypeOf('number');
  });

  it('generates mock values for text fields', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'Notes', field_type: 'text', options: null, required: false, sort_order: 0, org_id: 'o1' },
    ];
    const mock = generateMockItem(itemType, fields);
    expect(mock.custom_field_values['f1']).toBe('Sample text');
  });

  it('generates mock values for number fields', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'Count', field_type: 'number', options: null, required: false, sort_order: 0, org_id: 'o1' },
    ];
    const mock = generateMockItem(itemType, fields);
    expect(mock.custom_field_values['f1']).toBe(42);
  });

  it('generates first option for dropdown fields', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'Species', field_type: 'dropdown', options: ['Robin', 'Wren'], required: false, sort_order: 0, org_id: 'o1' },
    ];
    const mock = generateMockItem(itemType, fields);
    expect(mock.custom_field_values['f1']).toBe('Robin');
  });

  it('generates today for date fields', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'Installed', field_type: 'date', options: null, required: false, sort_order: 0, org_id: 'o1' },
    ];
    const mock = generateMockItem(itemType, fields);
    expect(mock.custom_field_values['f1']).toBe(new Date().toISOString().split('T')[0]);
  });

  it('includes mock photos', () => {
    const mock = generateMockItem(itemType, []);
    expect(mock.photos.length).toBeGreaterThan(0);
  });

  it('includes mock updates', () => {
    const mock = generateMockItem(itemType, []);
    expect(mock.updates.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/layout/__tests__/mock-data.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement mock data generation**

```typescript
// src/lib/layout/mock-data.ts
import type { ItemWithDetails, CustomField, ItemType } from '@/lib/types';

function mockFieldValue(field: CustomField): unknown {
  switch (field.field_type) {
    case 'text':
      return 'Sample text';
    case 'number':
      return 42;
    case 'dropdown':
      return field.options?.[0] ?? 'Option A';
    case 'date':
      return new Date().toISOString().split('T')[0];
    default:
      return 'Sample value';
  }
}

export function generateMockItem(
  itemType: ItemType,
  customFields: CustomField[],
): ItemWithDetails {
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  const custom_field_values: Record<string, unknown> = {};
  for (const field of customFields) {
    custom_field_values[field.id] = mockFieldValue(field);
  }

  return {
    id: 'mock-item',
    name: `Sample ${itemType.name}`,
    description: 'This is a preview with sample data.',
    latitude: 51.5074,
    longitude: -0.1278,
    item_type_id: itemType.id,
    status: 'active',
    custom_field_values,
    created_at: now,
    updated_at: now,
    created_by: 'mock-user',
    org_id: itemType.org_id,
    property_id: 'mock-property',
    item_type: itemType,
    custom_fields: customFields,
    entities: [
      {
        id: 'mock-entity-1',
        entity_type_id: 'mock-et',
        org_id: itemType.org_id,
        name: 'Sample Entity',
        description: null,
        photo_path: null,
        external_link: null,
        custom_field_values: {},
        sort_order: 0,
        created_at: now,
        updated_at: now,
        entity_type: { id: 'mock-et', org_id: itemType.org_id, name: 'Category', icon: '🏷', color: '#888', link_to: ['items'], sort_order: 0, created_at: now, updated_at: now },
      },
    ],
    photos: [
      { id: 'mock-photo-1', item_id: 'mock-item', update_id: null, storage_path: '', url: '/placeholder-photo.jpg', created_at: now, org_id: itemType.org_id },
    ],
    updates: [
      {
        id: 'mock-update-1',
        item_id: 'mock-item',
        update_type_id: 'mock-ut',
        content: 'Initial installation completed',
        update_date: today,
        custom_field_values: {},
        created_at: now,
        updated_at: now,
        created_by: 'mock-user',
        org_id: itemType.org_id,
        update_type: { id: 'mock-ut', name: 'Maintenance', icon: '🔧', is_global: true, item_type_id: null, sort_order: 0, org_id: itemType.org_id },
        photos: [],
        entities: [],
      },
      {
        id: 'mock-update-2',
        item_id: 'mock-item',
        update_type_id: 'mock-ut',
        content: 'Routine inspection passed',
        update_date: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
        custom_field_values: {},
        created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
        updated_at: new Date(Date.now() - 7 * 86400000).toISOString(),
        created_by: 'mock-user',
        org_id: itemType.org_id,
        update_type: { id: 'mock-ut', name: 'Inspection', icon: '🔍', is_global: true, item_type_id: null, sort_order: 1, org_id: itemType.org_id },
        photos: [],
        entities: [],
      },
      {
        id: 'mock-update-3',
        item_id: 'mock-item',
        update_type_id: 'mock-ut',
        content: 'First occupancy observed',
        update_date: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
        custom_field_values: {},
        created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        updated_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        created_by: 'mock-user',
        org_id: itemType.org_id,
        update_type: { id: 'mock-ut', name: 'Observation', icon: '👁', is_global: true, item_type_id: null, sort_order: 2, org_id: itemType.org_id },
        photos: [],
        entities: [],
      },
    ],
  };
}
```

Note: The exact shape of `ItemWithDetails` may need adjustment based on the current type definition. Check `src/lib/types.ts` for the exact fields and adjust the mock accordingly. The mock must satisfy the same interface the real DetailPanel uses.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/layout/__tests__/mock-data.test.ts`
Expected: PASS — all 7 tests pass. If type mismatches occur, adjust the mock to match `ItemWithDetails`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/mock-data.ts src/lib/layout/__tests__/mock-data.test.ts
git commit -m "feat: add mock data generation for layout preview"
```

---

## Task 6: Block Components

**Files:**
- Create: `src/components/layout/BlockErrorBoundary.tsx`
- Create: `src/components/layout/blocks/StatusBadgeBlock.tsx`
- Create: `src/components/layout/blocks/FieldDisplayBlock.tsx`
- Create: `src/components/layout/blocks/PhotoGalleryBlock.tsx`
- Create: `src/components/layout/blocks/TextLabelBlock.tsx`
- Create: `src/components/layout/blocks/DividerBlock.tsx`
- Create: `src/components/layout/blocks/ActionButtonsBlock.tsx`
- Create: `src/components/layout/blocks/MapSnippetBlock.tsx`
- Create: `src/components/layout/blocks/EntityListBlock.tsx`
- Create: `src/components/layout/blocks/TimelineBlock.tsx`
- Create: `src/components/layout/blocks/RowBlock.tsx`
- Create: `src/components/layout/blocks/__tests__/blocks.test.tsx`

This task creates all 9 block components + the row container + error boundary. Each block is a focused presentational component.

- [ ] **Step 1: Create BlockErrorBoundary**

```tsx
// src/components/layout/BlockErrorBoundary.tsx
'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  blockType: string;
}

interface State {
  hasError: boolean;
}

export default class BlockErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn(`Layout block "${this.props.blockType}" crashed:`, error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-xs text-sage italic py-2">
          Unable to display this block
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Create StatusBadgeBlock**

```tsx
// src/components/layout/blocks/StatusBadgeBlock.tsx
import StatusBadge from '@/components/item/StatusBadge';
import type { ItemStatus } from '@/lib/types';

interface Props {
  status: ItemStatus;
}

export default function StatusBadgeBlock({ status }: Props) {
  return (
    <div className="flex items-center">
      <StatusBadge status={status} />
    </div>
  );
}
```

- [ ] **Step 3: Create FieldDisplayBlock**

```tsx
// src/components/layout/blocks/FieldDisplayBlock.tsx
import type { FieldDisplayConfig } from '@/lib/layout/types';
import type { CustomField } from '@/lib/types';
import { formatDate } from '@/lib/utils';

interface Props {
  config: FieldDisplayConfig;
  field: CustomField | undefined;
  value: unknown;
}

const sizeClasses = {
  compact: 'text-sm',
  normal: 'text-sm',
  large: 'text-xl font-semibold leading-tight',
} as const;

export default function FieldDisplayBlock({ config, field, value }: Props) {
  if (!field) return null;

  const displayValue =
    field.field_type === 'date' && value
      ? formatDate(String(value))
      : value != null
        ? String(value)
        : '—';

  return (
    <div>
      {config.showLabel && (
        <span className="text-xs font-medium text-sage uppercase tracking-wide">
          {field.name}
        </span>
      )}
      <p className={`text-forest-dark font-medium ${sizeClasses[config.size]}`}>
        {displayValue}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Create PhotoGalleryBlock**

```tsx
// src/components/layout/blocks/PhotoGalleryBlock.tsx
import PhotoViewer from '@/components/ui/PhotoViewer';
import type { PhotoGalleryConfig } from '@/lib/layout/types';
import type { Photo } from '@/lib/types';

interface Props {
  config: PhotoGalleryConfig;
  photos: Photo[];
  isEdgeToEdge?: boolean;
}

export default function PhotoGalleryBlock({ config, photos, isEdgeToEdge }: Props) {
  if (photos.length === 0) return null;

  const limited = photos.slice(0, config.maxPhotos);

  return (
    <div className={isEdgeToEdge ? '-mx-4' : ''}>
      <PhotoViewer photos={limited} />
    </div>
  );
}
```

- [ ] **Step 5: Create TextLabelBlock**

```tsx
// src/components/layout/blocks/TextLabelBlock.tsx
import type { TextLabelConfig } from '@/lib/layout/types';

interface Props {
  config: TextLabelConfig;
}

const styleClasses = {
  heading: 'text-lg font-semibold text-forest-dark leading-snug',
  subheading: 'text-[15px] font-medium text-forest-dark leading-snug',
  body: 'text-sm text-forest-dark/80 leading-relaxed',
  caption: 'text-xs text-sage leading-snug',
} as const;

export default function TextLabelBlock({ config }: Props) {
  return <p className={styleClasses[config.style]}>{config.text}</p>;
}
```

- [ ] **Step 6: Create DividerBlock**

```tsx
// src/components/layout/blocks/DividerBlock.tsx
export default function DividerBlock() {
  return <hr className="border-sage-light" />;
}
```

- [ ] **Step 7: Create ActionButtonsBlock**

```tsx
// src/components/layout/blocks/ActionButtonsBlock.tsx
import Link from 'next/link';

interface Props {
  itemId: string;
  canEdit: boolean;
  canAddUpdate: boolean;
  mode: 'live' | 'preview';
}

export default function ActionButtonsBlock({ itemId, canEdit, canAddUpdate, mode }: Props) {
  if (mode === 'preview') {
    return (
      <div className="flex gap-2">
        <span className="btn-primary text-sm flex-1 text-center opacity-60 cursor-default">Edit Item</span>
        <span className="btn-secondary text-sm flex-1 text-center opacity-60 cursor-default">Add Update</span>
      </div>
    );
  }

  if (!canEdit && !canAddUpdate) return null;

  return (
    <div className="flex gap-2">
      {canEdit && (
        <Link href={`/manage/edit/${itemId}`} className="btn-primary text-sm flex-1 text-center">
          Edit Item
        </Link>
      )}
      {canAddUpdate && (
        <Link href={`/manage/update?item=${itemId}`} className="btn-secondary text-sm flex-1 text-center">
          Add Update
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Create MapSnippetBlock**

```tsx
// src/components/layout/blocks/MapSnippetBlock.tsx
'use client';

import dynamic from 'next/dynamic';

const MapContainer = dynamic(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false },
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((m) => m.TileLayer),
  { ssr: false },
);
const Marker = dynamic(
  () => import('react-leaflet').then((m) => m.Marker),
  { ssr: false },
);

interface Props {
  latitude: number;
  longitude: number;
  context: 'bottom-sheet' | 'side-panel' | 'preview';
}

export default function MapSnippetBlock({ latitude, longitude, context }: Props) {
  // Hidden on mobile (map visible behind bottom sheet)
  if (context === 'bottom-sheet') return null;

  return (
    <div className="h-32 rounded-lg overflow-hidden border border-sage-light">
      <MapContainer
        center={[latitude, longitude]}
        zoom={15}
        className="w-full h-full"
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[latitude, longitude]} />
      </MapContainer>
    </div>
  );
}
```

- [ ] **Step 9: Create EntityListBlock**

```tsx
// src/components/layout/blocks/EntityListBlock.tsx
import type { EntityListConfig } from '@/lib/layout/types';

interface EntityDisplay {
  id: string;
  name: string;
  entity_type: { id: string; name: string; icon: string };
}

interface Props {
  config: EntityListConfig;
  entities: EntityDisplay[];
}

export default function EntityListBlock({ config, entities }: Props) {
  const filtered =
    config.entityTypeIds.length > 0
      ? entities.filter((e) => config.entityTypeIds.includes(e.entity_type.id))
      : entities;

  if (filtered.length === 0) return null;

  // Group by entity type
  const grouped = new Map<string, { type: { name: string; icon: string }; items: EntityDisplay[] }>();
  for (const e of filtered) {
    const key = e.entity_type.id;
    if (!grouped.has(key)) grouped.set(key, { type: e.entity_type, items: [] });
    grouped.get(key)!.items.push(e);
  }

  return (
    <div className="space-y-2">
      {Array.from(grouped.values()).map(({ type, items }) => (
        <div key={type.name}>
          <span className="text-xs font-medium text-sage uppercase tracking-wide">
            {type.icon} {type.name}
          </span>
          <div className="flex flex-wrap gap-1 mt-1">
            {items.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center gap-1 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full"
              >
                {e.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 10: Create TimelineBlock**

```tsx
// src/components/layout/blocks/TimelineBlock.tsx
import type { TimelineConfig } from '@/lib/layout/types';
import UpdateTimeline from '@/components/item/UpdateTimeline';
import type { ItemUpdate } from '@/lib/types';

interface Props {
  config: TimelineConfig;
  updates: ItemUpdate[];
}

export default function TimelineBlock({ config, updates }: Props) {
  const filtered = config.showUpdates ? updates : [];
  const limited = filtered.slice(0, config.maxItems);

  if (limited.length === 0) {
    return <p className="text-xs text-sage italic">No activity yet</p>;
  }

  return (
    <div>
      <h3 className="text-xs font-medium text-sage uppercase tracking-wide mb-3">
        Updates
      </h3>
      <UpdateTimeline updates={limited} />
    </div>
  );
}
```

- [ ] **Step 11: Create RowBlock**

```tsx
// src/components/layout/blocks/RowBlock.tsx
'use client';

import type { LayoutRow } from '@/lib/layout/types';
import { ROW_COLLAPSE_BREAKPOINT } from '@/lib/layout/spacing';
import type { ReactNode } from 'react';

interface Props {
  row: LayoutRow;
  children: ReactNode[];
  containerWidth?: number;
}

const gapClasses = {
  tight: 'gap-2',
  normal: 'gap-3',
  loose: 'gap-4',
} as const;

function getGridCols(distribution: LayoutRow['distribution'], count: number): string {
  if (distribution === 'equal') {
    return `repeat(${count}, 1fr)`;
  }
  if (distribution === 'auto') {
    return `repeat(${count}, auto)`;
  }
  // number[] ratios
  return distribution.map((r) => `${r}fr`).join(' ');
}

export default function RowBlock({ row, children, containerWidth }: Props) {
  const shouldCollapse = containerWidth != null && containerWidth < ROW_COLLAPSE_BREAKPOINT;

  if (shouldCollapse) {
    return <div className="flex flex-col gap-2">{children}</div>;
  }

  return (
    <div
      className={`grid ${gapClasses[row.gap]}`}
      style={{ gridTemplateColumns: getGridCols(row.distribution, row.children.length) }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 12: Write block component tests**

```tsx
// src/components/layout/blocks/__tests__/blocks.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadgeBlock from '../StatusBadgeBlock';
import FieldDisplayBlock from '../FieldDisplayBlock';
import TextLabelBlock from '../TextLabelBlock';
import DividerBlock from '../DividerBlock';
import EntityListBlock from '../EntityListBlock';
import TimelineBlock from '../TimelineBlock';

// Mock StatusBadge since it's an existing component
vi.mock('@/components/item/StatusBadge', () => ({
  default: ({ status }: { status: string }) => <span data-testid="status-badge">{status}</span>,
}));

vi.mock('@/components/item/UpdateTimeline', () => ({
  default: ({ updates }: { updates: unknown[] }) => <div data-testid="timeline">{updates.length} updates</div>,
}));

vi.mock('@/lib/utils', () => ({
  formatDate: (d: string) => d,
}));

describe('StatusBadgeBlock', () => {
  it('renders the status', () => {
    render(<StatusBadgeBlock status="active" />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('active');
  });
});

describe('FieldDisplayBlock', () => {
  const field = { id: 'f1', item_type_id: 't1', name: 'Species', field_type: 'text' as const, options: null, required: false, sort_order: 0, org_id: 'o1' };

  it('renders field label and value', () => {
    render(<FieldDisplayBlock config={{ fieldId: 'f1', size: 'normal', showLabel: true }} field={field} value="Robin" />);
    expect(screen.getByText('Species')).toBeInTheDocument();
    expect(screen.getByText('Robin')).toBeInTheDocument();
  });

  it('hides label when showLabel is false', () => {
    render(<FieldDisplayBlock config={{ fieldId: 'f1', size: 'normal', showLabel: false }} field={field} value="Robin" />);
    expect(screen.queryByText('Species')).not.toBeInTheDocument();
    expect(screen.getByText('Robin')).toBeInTheDocument();
  });

  it('shows dash for null value', () => {
    render(<FieldDisplayBlock config={{ fieldId: 'f1', size: 'normal', showLabel: true }} field={field} value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('returns null for undefined field', () => {
    const { container } = render(<FieldDisplayBlock config={{ fieldId: 'f1', size: 'normal', showLabel: true }} field={undefined} value="x" />);
    expect(container.firstChild).toBeNull();
  });

  it('applies large size class', () => {
    render(<FieldDisplayBlock config={{ fieldId: 'f1', size: 'large', showLabel: true }} field={field} value="Big" />);
    const el = screen.getByText('Big');
    expect(el.className).toContain('text-xl');
  });
});

describe('TextLabelBlock', () => {
  it('renders heading text', () => {
    render(<TextLabelBlock config={{ text: 'Section Title', style: 'heading' }} />);
    const el = screen.getByText('Section Title');
    expect(el.className).toContain('text-lg');
    expect(el.className).toContain('font-semibold');
  });

  it('renders caption text', () => {
    render(<TextLabelBlock config={{ text: 'Note', style: 'caption' }} />);
    const el = screen.getByText('Note');
    expect(el.className).toContain('text-xs');
  });
});

describe('DividerBlock', () => {
  it('renders an hr element', () => {
    const { container } = render(<DividerBlock />);
    expect(container.querySelector('hr')).toBeInTheDocument();
  });
});

describe('EntityListBlock', () => {
  const entities = [
    { id: 'e1', name: 'Robin', entity_type: { id: 'et1', name: 'Species', icon: '🐦' } },
    { id: 'e2', name: 'Wren', entity_type: { id: 'et1', name: 'Species', icon: '🐦' } },
  ];

  it('renders grouped entities', () => {
    render(<EntityListBlock config={{ entityTypeIds: [] }} entities={entities} />);
    expect(screen.getByText('Robin')).toBeInTheDocument();
    expect(screen.getByText('Wren')).toBeInTheDocument();
  });

  it('filters by entity type IDs', () => {
    render(<EntityListBlock config={{ entityTypeIds: ['et2'] }} entities={entities} />);
    expect(screen.queryByText('Robin')).not.toBeInTheDocument();
  });

  it('returns null when no entities match', () => {
    const { container } = render(<EntityListBlock config={{ entityTypeIds: ['et99'] }} entities={entities} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('TimelineBlock', () => {
  const updates = [
    { id: 'u1', item_id: 'i1', update_type_id: 'ut1', content: 'test', update_date: '2026-01-01', custom_field_values: {}, created_at: '', updated_at: '', created_by: '', org_id: '', update_type: { id: 'ut1', name: 'Note', icon: '📝', is_global: true, item_type_id: null, sort_order: 0, org_id: '' }, photos: [], entities: [] },
  ];

  it('renders updates when showUpdates is true', () => {
    render(<TimelineBlock config={{ showUpdates: true, showScheduled: false, maxItems: 10 }} updates={updates} />);
    expect(screen.getByTestId('timeline')).toHaveTextContent('1 updates');
  });

  it('shows empty message when no updates', () => {
    render(<TimelineBlock config={{ showUpdates: true, showScheduled: false, maxItems: 10 }} updates={[]} />);
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });

  it('limits to maxItems', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...updates[0], id: `u${i}` }));
    render(<TimelineBlock config={{ showUpdates: true, showScheduled: false, maxItems: 2 }} updates={many} />);
    expect(screen.getByTestId('timeline')).toHaveTextContent('2 updates');
  });
});
```

- [ ] **Step 13: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/components/layout/blocks/__tests__/blocks.test.tsx`
Expected: PASS — all tests pass

- [ ] **Step 14: Commit**

```bash
git add src/components/layout/
git commit -m "feat: add all layout block components with error boundary and tests"
```

---

## Task 7: LayoutRenderer

**Files:**
- Create: `src/components/layout/LayoutRenderer.tsx`
- Create: `src/components/layout/__tests__/LayoutRenderer.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/layout/__tests__/LayoutRenderer.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LayoutRenderer from '../LayoutRenderer';
import type { TypeLayout } from '@/lib/layout/types';
import type { ItemWithDetails, CustomField } from '@/lib/types';

// Mock all block components
vi.mock('../blocks/StatusBadgeBlock', () => ({
  default: () => <div data-testid="block-status_badge" />,
}));
vi.mock('../blocks/FieldDisplayBlock', () => ({
  default: ({ field }: { field?: { name: string } }) => (
    <div data-testid="block-field_display">{field?.name}</div>
  ),
}));
vi.mock('../blocks/PhotoGalleryBlock', () => ({
  default: () => <div data-testid="block-photo_gallery" />,
}));
vi.mock('../blocks/TextLabelBlock', () => ({
  default: ({ config }: { config: { text: string } }) => (
    <div data-testid="block-text_label">{config.text}</div>
  ),
}));
vi.mock('../blocks/DividerBlock', () => ({
  default: () => <div data-testid="block-divider" />,
}));
vi.mock('../blocks/ActionButtonsBlock', () => ({
  default: () => <div data-testid="block-action_buttons" />,
}));
vi.mock('../blocks/MapSnippetBlock', () => ({
  default: () => <div data-testid="block-map_snippet" />,
}));
vi.mock('../blocks/EntityListBlock', () => ({
  default: () => <div data-testid="block-entity_list" />,
}));
vi.mock('../blocks/TimelineBlock', () => ({
  default: () => <div data-testid="block-timeline" />,
}));
vi.mock('../blocks/RowBlock', () => ({
  default: ({ children }: { children: React.ReactNode[] }) => (
    <div data-testid="block-row">{children}</div>
  ),
}));

const mockItem = {
  id: 'i1',
  name: 'Test',
  status: 'active',
  custom_field_values: { f1: 'Robin' },
  latitude: 0,
  longitude: 0,
  photos: [],
  updates: [],
  entities: [],
} as unknown as ItemWithDetails;

const mockFields: CustomField[] = [
  { id: 'f1', item_type_id: 't1', name: 'Species', field_type: 'text', options: null, required: false, sort_order: 0, org_id: 'o1' },
];

describe('LayoutRenderer', () => {
  it('renders blocks in order', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'divider', config: {} },
        { id: 'b3', type: 'action_buttons', config: {} },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    render(
      <LayoutRenderer layout={layout} item={mockItem} mode="preview" context="preview" customFields={[]} />,
    );
    const blocks = screen.getAllByTestId(/^block-/);
    expect(blocks).toHaveLength(3);
  });

  it('renders field_display with correct field data', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    render(
      <LayoutRenderer layout={layout} item={mockItem} mode="preview" context="preview" customFields={mockFields} />,
    );
    expect(screen.getByTestId('block-field_display')).toHaveTextContent('Species');
  });

  it('renders rows with children', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'divider', config: {} },
          ],
          gap: 'normal',
          distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    render(
      <LayoutRenderer layout={layout} item={mockItem} mode="preview" context="preview" customFields={[]} />,
    );
    expect(screen.getByTestId('block-row')).toBeInTheDocument();
    expect(screen.getByTestId('block-status_badge')).toBeInTheDocument();
    expect(screen.getByTestId('block-divider')).toBeInTheDocument();
  });

  it('limits blocks in peek state', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'photo_gallery', config: { style: 'hero', maxPhotos: 4 } },
        { id: 'b3', type: 'timeline', config: { showUpdates: true, showScheduled: false, maxItems: 5 } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    render(
      <LayoutRenderer layout={layout} item={mockItem} mode="live" context="bottom-sheet" sheetState="peek" customFields={[]} />,
    );
    const blocks = screen.getAllByTestId(/^block-/);
    expect(blocks).toHaveLength(2);
  });

  it('renders all blocks in half/full state', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'photo_gallery', config: { style: 'hero', maxPhotos: 4 } },
        { id: 'b3', type: 'timeline', config: { showUpdates: true, showScheduled: false, maxItems: 5 } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    render(
      <LayoutRenderer layout={layout} item={mockItem} mode="live" context="bottom-sheet" sheetState="full" customFields={[]} />,
    );
    expect(screen.getAllByTestId(/^block-/)).toHaveLength(3);
  });

  it('skips blocks with unknown type gracefully', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'unknown_type' as any, config: {} },
        { id: 'b3', type: 'divider', config: {} },
      ],
      spacing: 'comfortable',
      peekBlockCount: 3,
    };
    render(
      <LayoutRenderer layout={layout} item={mockItem} mode="preview" context="preview" customFields={[]} />,
    );
    expect(screen.getAllByTestId(/^block-/)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/components/layout/__tests__/LayoutRenderer.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement LayoutRenderer**

```tsx
// src/components/layout/LayoutRenderer.tsx
'use client';

import type { TypeLayout, LayoutNode, LayoutBlock, LayoutRow } from '@/lib/layout/types';
import { isLayoutRow } from '@/lib/layout/types';
import type { FieldDisplayConfig } from '@/lib/layout/types';
import type { ItemWithDetails, CustomField } from '@/lib/types';
import { SPACING } from '@/lib/layout/spacing';
import BlockErrorBoundary from './BlockErrorBoundary';
import StatusBadgeBlock from './blocks/StatusBadgeBlock';
import FieldDisplayBlock from './blocks/FieldDisplayBlock';
import PhotoGalleryBlock from './blocks/PhotoGalleryBlock';
import TextLabelBlock from './blocks/TextLabelBlock';
import DividerBlock from './blocks/DividerBlock';
import ActionButtonsBlock from './blocks/ActionButtonsBlock';
import MapSnippetBlock from './blocks/MapSnippetBlock';
import EntityListBlock from './blocks/EntityListBlock';
import TimelineBlock from './blocks/TimelineBlock';
import RowBlock from './blocks/RowBlock';

interface LayoutRendererProps {
  layout: TypeLayout;
  item: ItemWithDetails;
  mode: 'live' | 'preview';
  context: 'bottom-sheet' | 'side-panel' | 'preview';
  sheetState?: 'peek' | 'half' | 'full';
  customFields: CustomField[];
}

export default function LayoutRenderer({
  layout,
  item,
  mode,
  context,
  sheetState,
  customFields,
}: LayoutRendererProps) {
  const spacing = SPACING[layout.spacing];

  // In peek state, only show first N top-level nodes
  const visibleBlocks =
    sheetState === 'peek'
      ? layout.blocks.slice(0, layout.peekBlockCount)
      : layout.blocks;

  const fieldMap = new Map(customFields.map((f) => [f.id, f]));

  function renderBlock(block: LayoutBlock, index: number) {
    const isHeroPosition = index <= 1;

    switch (block.type) {
      case 'status_badge':
        return <StatusBadgeBlock status={item.status} />;
      case 'field_display': {
        const config = block.config as FieldDisplayConfig;
        const field = fieldMap.get(config.fieldId);
        const value = item.custom_field_values[config.fieldId];
        if (block.hideWhenEmpty && value == null) return null;
        return <FieldDisplayBlock config={config} field={field} value={value} />;
      }
      case 'photo_gallery':
        return (
          <PhotoGalleryBlock
            config={block.config as any}
            photos={item.photos}
            isEdgeToEdge={
              isHeroPosition &&
              (block.config as any).style === 'hero' &&
              context === 'bottom-sheet'
            }
          />
        );
      case 'text_label':
        return <TextLabelBlock config={block.config as any} />;
      case 'divider':
        return <DividerBlock />;
      case 'action_buttons':
        return (
          <ActionButtonsBlock
            itemId={item.id}
            canEdit={true}
            canAddUpdate={true}
            mode={mode}
          />
        );
      case 'map_snippet':
        return (
          <MapSnippetBlock
            latitude={item.latitude}
            longitude={item.longitude}
            context={context}
          />
        );
      case 'entity_list':
        return (
          <EntityListBlock
            config={block.config as any}
            entities={item.entities}
          />
        );
      case 'timeline':
        return (
          <TimelineBlock
            config={block.config as any}
            updates={item.updates}
          />
        );
      default:
        return null;
    }
  }

  function renderNode(node: LayoutNode, index: number) {
    if (isLayoutRow(node)) {
      return (
        <BlockErrorBoundary key={node.id} blockType="row">
          <RowBlock row={node}>
            {node.children.map((child, i) => (
              <BlockErrorBoundary key={child.id} blockType={child.type}>
                {renderBlock(child, i)}
              </BlockErrorBoundary>
            ))}
          </RowBlock>
        </BlockErrorBoundary>
      );
    }

    const rendered = renderBlock(node, index);
    if (rendered === null) return null;

    return (
      <BlockErrorBoundary key={node.id} blockType={node.type}>
        {rendered}
      </BlockErrorBoundary>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: `${spacing.blockGap}px` }}>
      {visibleBlocks.map((node, i) => renderNode(node, i))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/components/layout/__tests__/LayoutRenderer.test.tsx`
Expected: PASS — all 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/LayoutRenderer.tsx src/components/layout/__tests__/LayoutRenderer.test.tsx
git commit -m "feat: add LayoutRenderer component with peek state support"
```

---

## Task 8: Multi-Snap Bottom Sheet

**Files:**
- Create: `src/components/ui/MultiSnapBottomSheet.tsx`
- Create: `src/components/ui/__tests__/MultiSnapBottomSheet.test.tsx`

- [ ] **Step 1: Write the component tests**

```tsx
// src/components/ui/__tests__/MultiSnapBottomSheet.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MultiSnapBottomSheet from '../MultiSnapBottomSheet';

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  useMotionValue: () => ({ get: () => 0, set: () => {} }),
  useTransform: () => ({ get: () => 0 }),
  useDragControls: () => ({ start: vi.fn() }),
  AnimatePresence: ({ children }: any) => children,
}));

describe('MultiSnapBottomSheet', () => {
  it('renders children when open', () => {
    render(
      <MultiSnapBottomSheet isOpen onClose={vi.fn()} onStateChange={vi.fn()}>
        <p>Content</p>
      </MultiSnapBottomSheet>,
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <MultiSnapBottomSheet isOpen={false} onClose={vi.fn()} onStateChange={vi.fn()}>
        <p>Content</p>
      </MultiSnapBottomSheet>,
    );
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('renders handle element', () => {
    render(
      <MultiSnapBottomSheet isOpen onClose={vi.fn()} onStateChange={vi.fn()}>
        <p>Content</p>
      </MultiSnapBottomSheet>,
    );
    expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(
      <MultiSnapBottomSheet isOpen onClose={onClose} onStateChange={vi.fn()}>
        <p>Content</p>
      </MultiSnapBottomSheet>,
    );
    fireEvent.click(screen.getByTestId('sheet-overlay'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/components/ui/__tests__/MultiSnapBottomSheet.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement MultiSnapBottomSheet**

```tsx
// src/components/ui/MultiSnapBottomSheet.tsx
'use client';

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';

export type SheetState = 'peek' | 'half' | 'full';

interface MultiSnapBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onStateChange: (state: SheetState) => void;
  initialState?: SheetState;
  children: ReactNode;
}

// Snap point heights as percentage of viewport
const SNAP_POINTS: Record<SheetState, number> = {
  peek: 0.25,
  half: 0.50,
  full: 0.92,
};

const DISMISS_THRESHOLD = 0.15; // Below peek, dismiss

export default function MultiSnapBottomSheet({
  isOpen,
  onClose,
  onStateChange,
  initialState = 'peek',
  children,
}: MultiSnapBottomSheetProps) {
  const [state, setState] = useState<SheetState>(initialState);
  const contentRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startHeight = useRef(0);
  const isDragging = useRef(false);
  const [height, setHeight] = useState(0);

  // Calculate pixel heights from viewport
  const getSnapHeight = useCallback((s: SheetState) => {
    if (typeof window === 'undefined') return 0;
    return Math.round(window.innerHeight * SNAP_POINTS[s]);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setHeight(getSnapHeight(initialState));
      setState(initialState);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, initialState, getSnapHeight]);

  const snapToNearest = useCallback((currentHeight: number, velocity: number) => {
    const vh = window.innerHeight;
    const ratio = currentHeight / vh;

    // Dismiss if below threshold
    if (ratio < DISMISS_THRESHOLD) {
      onClose();
      return;
    }

    // Fast swipe up → skip to full
    if (velocity < -500 && state === 'peek') {
      const next = 'full';
      setState(next);
      setHeight(getSnapHeight(next));
      onStateChange(next);
      return;
    }

    // Fast swipe down → skip to peek or dismiss
    if (velocity > 500 && state === 'full') {
      const next = 'peek';
      setState(next);
      setHeight(getSnapHeight(next));
      onStateChange(next);
      return;
    }

    // Find closest snap point
    const states: SheetState[] = ['peek', 'half', 'full'];
    let closest = states[0];
    let minDist = Infinity;
    for (const s of states) {
      const dist = Math.abs(currentHeight - getSnapHeight(s));
      if (dist < minDist) {
        minDist = dist;
        closest = s;
      }
    }

    setState(closest);
    setHeight(getSnapHeight(closest));
    onStateChange(closest);
  }, [state, getSnapHeight, onClose, onStateChange]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    startHeight.current = height;
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const deltaY = startY.current - e.touches[0].clientY;
    const newHeight = Math.max(0, Math.min(window.innerHeight * 0.95, startHeight.current + deltaY));
    setHeight(newHeight);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const endY = e.changedTouches[0].clientY;
    const velocity = (startY.current - endY) / 0.3; // rough velocity
    snapToNearest(height, -velocity);
  };

  const handleHandleTap = () => {
    const next = state === 'peek' ? 'half' : 'peek';
    setState(next);
    setHeight(getSnapHeight(next));
    onStateChange(next);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        data-testid="sheet-overlay"
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        style={{ opacity: state === 'peek' ? 0.1 : 0.3 }}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl"
        style={{
          height: `${height}px`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle */}
        <button
          onClick={handleHandleTap}
          className="w-full flex justify-center py-3 cursor-grab active:cursor-grabbing"
          aria-label={state === 'peek' ? 'Expand details' : 'Collapse details'}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </button>

        {/* Content */}
        <div
          ref={contentRef}
          className="overflow-y-auto px-4 pb-4"
          style={{ height: `calc(100% - 40px)` }}
        >
          {children}
        </div>
      </motion.div>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/components/ui/__tests__/MultiSnapBottomSheet.test.tsx`
Expected: PASS — all 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/MultiSnapBottomSheet.tsx src/components/ui/__tests__/MultiSnapBottomSheet.test.tsx
git commit -m "feat: add multi-snap bottom sheet with peek/half/full states"
```

---

## Task 9: DetailPanel Integration

**Files:**
- Modify: `src/components/item/DetailPanel.tsx`

- [ ] **Step 1: Integrate LayoutRenderer and MultiSnapBottomSheet into DetailPanel**

Read the current `DetailPanel.tsx` first (already read above). The modification:
- When `item.item_type?.layout` exists, render via `LayoutRenderer`
- When null, render the existing fixed layout (backward compatibility)
- Replace `BottomSheet` with `MultiSnapBottomSheet` on mobile

```tsx
// src/components/item/DetailPanel.tsx — replace entire file
'use client';

import type { ItemWithDetails } from '@/lib/types';
import StatusBadge from './StatusBadge';
import UpdateTimeline from './UpdateTimeline';
import MultiSnapBottomSheet, { type SheetState } from '@/components/ui/MultiSnapBottomSheet';
import LayoutRenderer from '@/components/layout/LayoutRenderer';
import { formatDate } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useUserLocation } from '@/lib/location/provider';
import { getDistanceToItem, formatDistance } from '@/lib/location/utils';
import Link from 'next/link';
import PhotoViewer from '@/components/ui/PhotoViewer';

interface DetailPanelProps {
  item: ItemWithDetails | null;
  onClose: () => void;
  isAuthenticated?: boolean;
  canEditItem?: boolean;
  canAddUpdate?: boolean;
}

export default function DetailPanel({ item, onClose, isAuthenticated, canEditItem, canAddUpdate }: DetailPanelProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [sheetState, setSheetState] = useState<SheetState>('peek');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Reset to peek when a new item is selected
  useEffect(() => {
    if (item) setSheetState('peek');
  }, [item?.id]);

  const { position } = useUserLocation();

  if (!item) return null;

  const distance = getDistanceToItem(position, item);
  const layout = item.item_type?.layout ?? null;

  // Header: always shown (outside layout)
  const header = (
    <div className="flex items-start justify-between mb-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {item.item_type && <span className="text-xl">{item.item_type.icon}</span>}
          <h2 className="font-heading font-semibold text-forest-dark text-xl">
            {item.name}
          </h2>
        </div>
        {distance != null && (
          <span className="text-xs text-forest">
            {formatDistance(distance)} away
          </span>
        )}
      </div>
      {!isMobile && (
        <button
          onClick={onClose}
          className="ml-2 p-1 rounded-lg text-sage hover:bg-sage-light transition-colors"
          aria-label="Close panel"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );

  // Content: either layout-driven or legacy
  const content = layout ? (
    <div>
      {header}
      <LayoutRenderer
        layout={layout}
        item={item}
        mode="live"
        context={isMobile ? 'bottom-sheet' : 'side-panel'}
        sheetState={isMobile ? sheetState : undefined}
        customFields={item.custom_fields ?? []}
      />
    </div>
  ) : (
    // Legacy fixed layout (unchanged from original)
    <div>
      {header}
      <div className="flex items-center mb-3">
        <StatusBadge status={item.status} />
      </div>

      {item.custom_fields && item.custom_fields.length > 0 && (
        <div className="space-y-2 mb-3">
          {item.custom_fields
            .filter((f) => item.custom_field_values[f.id] != null)
            .map((field) => (
              <div key={field.id}>
                <span className="text-xs font-medium text-sage uppercase tracking-wide">
                  {field.name}
                </span>
                <p className="text-sm text-forest-dark font-medium">
                  {field.field_type === 'date' && item.custom_field_values[field.id]
                    ? formatDate(String(item.custom_field_values[field.id]))
                    : String(item.custom_field_values[field.id])}
                </p>
              </div>
            ))}
        </div>
      )}

      {item.entities && item.entities.length > 0 && (() => {
        const grouped = new Map<string, { type: { id: string; name: string; icon: string }; entities: typeof item.entities }>();
        for (const e of item.entities) {
          const key = e.entity_type.id;
          if (!grouped.has(key)) grouped.set(key, { type: e.entity_type, entities: [] });
          grouped.get(key)!.entities.push(e);
        }
        return Array.from(grouped.values()).map(({ type, entities }) => (
          <div key={type.id} className="mb-3">
            <span className="text-xs font-medium text-sage uppercase tracking-wide">
              {type.icon} {type.name}
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {entities.map((e) => (
                <span key={e.id} className="inline-flex items-center gap-1 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full">
                  {e.name}
                </span>
              ))}
            </div>
          </div>
        ));
      })()}

      {item.description && (
        <div className="mb-4">
          <span className="text-xs font-medium text-sage uppercase tracking-wide">Description</span>
          <p className="text-sm text-forest-dark/80 leading-relaxed mt-0.5">{item.description}</p>
        </div>
      )}

      {item.photos.length > 0 && (
        <div className="mb-4">
          <PhotoViewer photos={item.photos} />
        </div>
      )}

      {isAuthenticated && (canEditItem || canAddUpdate) && (
        <div className="flex gap-2 mb-4">
          {canEditItem && (
            <Link href={`/manage/edit/${item.id}`} className="btn-primary text-sm flex-1 text-center">
              Edit Item
            </Link>
          )}
          {canAddUpdate && (
            <Link href={`/manage/update?item=${item.id}`} className="btn-secondary text-sm flex-1 text-center">
              Add Update
            </Link>
          )}
        </div>
      )}

      <div>
        <h3 className="text-xs font-medium text-sage uppercase tracking-wide mb-3">Updates</h3>
        <UpdateTimeline updates={item.updates} />
      </div>
    </div>
  );

  // Mobile: multi-snap bottom sheet
  if (isMobile) {
    return (
      <MultiSnapBottomSheet
        isOpen={!!item}
        onClose={onClose}
        onStateChange={setSheetState}
        initialState="peek"
      >
        {content}
      </MultiSnapBottomSheet>
    );
  }

  // Desktop: side panel (unchanged)
  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-2xl border-l border-sage-light z-20 overflow-y-auto animate-slide-in-right">
      <div className="p-5">{content}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `cd /Users/patrick/birdhousemapper && npm run type-check`
Expected: No type errors. If there are type mismatches between `ItemWithDetails` and what LayoutRenderer expects, fix them.

- [ ] **Step 3: Commit**

```bash
git add src/components/item/DetailPanel.tsx
git commit -m "feat: integrate LayoutRenderer and multi-snap bottom sheet into DetailPanel"
```

---

## Task 10: Form Derivation Logic

**Files:**
- Create: `src/lib/layout/form-derivation.ts`
- Create: `src/lib/layout/__tests__/form-derivation.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/layout/__tests__/form-derivation.test.ts
import { describe, it, expect } from 'vitest';
import { deriveFormFields } from '../form-derivation';
import type { TypeLayout } from '../types';
import type { CustomField } from '@/lib/types';

describe('deriveFormFields', () => {
  const fields: CustomField[] = [
    { id: 'f1', item_type_id: 't1', name: 'Species', field_type: 'dropdown', options: ['Robin', 'Wren'], required: true, sort_order: 0, org_id: 'o1' },
    { id: 'f2', item_type_id: 't1', name: 'Install Date', field_type: 'date', options: null, required: false, sort_order: 1, org_id: 'o1' },
  ];

  it('extracts field_display blocks as form fields in order', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
        { id: 'b3', type: 'field_display', config: { fieldId: 'f2', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const result = deriveFormFields(layout, fields);
    expect(result.fields).toHaveLength(2);
    expect(result.fields[0].id).toBe('f1');
    expect(result.fields[1].id).toBe('f2');
  });

  it('extracts fields from rows', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
            { id: 'b2', type: 'field_display', config: { fieldId: 'f2', size: 'normal', showLabel: true } },
          ],
          gap: 'normal',
          distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = deriveFormFields(layout, fields);
    expect(result.fields).toHaveLength(2);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].fieldIds).toEqual(['f1', 'f2']);
  });

  it('includes photo position when photo_gallery block exists', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
        { id: 'b2', type: 'photo_gallery', config: { style: 'hero', maxPhotos: 4 } },
        { id: 'b3', type: 'field_display', config: { fieldId: 'f2', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const result = deriveFormFields(layout, fields);
    expect(result.photoPosition).toBe(1); // after first field
  });

  it('omits timeline, map_snippet, action_buttons', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'timeline', config: { showUpdates: true, showScheduled: false, maxItems: 5 } },
        { id: 'b2', type: 'map_snippet', config: {} },
        { id: 'b3', type: 'action_buttons', config: {} },
        { id: 'b4', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const result = deriveFormFields(layout, fields);
    expect(result.fields).toHaveLength(1);
  });

  it('preserves text_label blocks as section headers', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'text_label', config: { text: 'Details', style: 'heading' } },
        { id: 'b2', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const result = deriveFormFields(layout, fields);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].text).toBe('Details');
    expect(result.sections[0].beforeFieldIndex).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/layout/__tests__/form-derivation.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement form derivation**

```typescript
// src/lib/layout/form-derivation.ts
import type { TypeLayout, LayoutNode, LayoutBlock, LayoutRow, FieldDisplayConfig } from './types';
import { isLayoutRow } from './types';
import type { CustomField } from '@/lib/types';

export interface FormSection {
  text: string;
  style: string;
  beforeFieldIndex: number;
}

export interface FormRow {
  fieldIds: string[];
}

export interface DerivedFormLayout {
  fields: CustomField[];
  rows: FormRow[];
  sections: FormSection[];
  photoPosition: number | null; // index in fields list where photo uploader should appear, null = after all fields
}

export function deriveFormFields(layout: TypeLayout, customFields: CustomField[]): DerivedFormLayout {
  const fieldMap = new Map(customFields.map((f) => [f.id, f]));
  const fields: CustomField[] = [];
  const rows: FormRow[] = [];
  const sections: FormSection[] = [];
  let photoPosition: number | null = null;
  let formElementIndex = 0;

  function processBlock(block: LayoutBlock) {
    switch (block.type) {
      case 'field_display': {
        const config = block.config as FieldDisplayConfig;
        const field = fieldMap.get(config.fieldId);
        if (field) {
          fields.push(field);
          formElementIndex++;
        }
        break;
      }
      case 'photo_gallery':
        photoPosition = formElementIndex;
        break;
      case 'text_label': {
        const config = block.config as { text: string; style: string };
        sections.push({
          text: config.text,
          style: config.style,
          beforeFieldIndex: formElementIndex,
        });
        break;
      }
      // status_badge, entity_list handled as fixed form elements
      // timeline, map_snippet, action_buttons, divider omitted
    }
  }

  for (const node of layout.blocks) {
    if (isLayoutRow(node)) {
      const rowFieldIds: string[] = [];
      for (const child of node.children) {
        if (child.type === 'field_display') {
          const config = child.config as FieldDisplayConfig;
          const field = fieldMap.get(config.fieldId);
          if (field) {
            fields.push(field);
            rowFieldIds.push(field.id);
            formElementIndex++;
          }
        } else {
          processBlock(child);
        }
      }
      if (rowFieldIds.length >= 2) {
        rows.push({ fieldIds: rowFieldIds });
      }
    } else {
      processBlock(node);
    }
  }

  return { fields, rows, sections, photoPosition };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/layout/__tests__/form-derivation.test.ts`
Expected: PASS — all 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/form-derivation.ts src/lib/layout/__tests__/form-derivation.test.ts
git commit -m "feat: add form derivation logic to auto-generate form layout from detail layout"
```

---

## Task 11: Server Actions for Layout Save

**Files:**
- Create: `src/app/admin/properties/[slug]/types/layout-actions.ts`
- Create: `src/app/admin/properties/[slug]/types/__tests__/layout-actions.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/app/admin/properties/[slug]/types/__tests__/layout-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase,
}));

vi.mock('@/lib/permissions', () => ({
  getTenantContext: vi.fn().mockResolvedValue({ orgId: 'org1' }),
}));

// Import after mocks
const { saveTypeWithLayout } = await import('../layout-actions');

describe('saveTypeWithLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('returns error when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await saveTypeWithLayout({
      itemTypeId: 't1',
      layout: { version: 1, blocks: [{ id: 'b1', type: 'divider', config: {} }], spacing: 'comfortable', peekBlockCount: 1 },
      newFields: [],
    });
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('returns error for invalid layout', async () => {
    const result = await saveTypeWithLayout({
      itemTypeId: 't1',
      layout: { version: 1, blocks: [], spacing: 'comfortable', peekBlockCount: 0 } as any,
      newFields: [],
    });
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining('Invalid layout') }));
  });

  it('saves layout and creates new fields', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ error: null }) });
    const insertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ data: [{ id: 'new-f1' }], error: null }) });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'item_types') return { update: updateMock };
      if (table === 'custom_fields') return { insert: insertMock };
      return {};
    });

    const result = await saveTypeWithLayout({
      itemTypeId: 't1',
      layout: {
        version: 1,
        blocks: [{ id: 'b1', type: 'status_badge', config: {} }],
        spacing: 'comfortable',
        peekBlockCount: 1,
      },
      newFields: [
        { name: 'Species', field_type: 'dropdown', options: ['Robin'], required: true, sort_order: 0 },
      ],
    });
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/app/admin/properties/[slug]/types/__tests__/layout-actions.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement server actions**

```typescript
// src/app/admin/properties/[slug]/types/layout-actions.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/permissions';
import { typeLayoutSchema } from '@/lib/layout/schemas';
import type { TypeLayout } from '@/lib/layout/types';

interface NewField {
  name: string;
  field_type: string;
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

interface SaveTypeWithLayoutInput {
  itemTypeId: string;
  layout: TypeLayout;
  newFields: NewField[];
}

export async function saveTypeWithLayout(input: SaveTypeWithLayoutInput) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Validate layout
  const parsed = typeLayoutSchema.safeParse(input.layout);
  if (!parsed.success) {
    return { error: `Invalid layout: ${parsed.error.issues[0]?.message ?? 'validation failed'}` };
  }

  // Create any new fields first
  const createdFieldIds: string[] = [];
  if (input.newFields.length > 0) {
    const { data: newFieldRows, error: fieldError } = await supabase
      .from('custom_fields')
      .insert(
        input.newFields.map((f) => ({
          item_type_id: input.itemTypeId,
          name: f.name,
          field_type: f.field_type,
          options: f.options,
          required: f.required,
          sort_order: f.sort_order,
          org_id: tenant.orgId,
        })),
      )
      .select();

    if (fieldError) return { error: `Failed to create fields: ${fieldError.message}` };
    if (newFieldRows) {
      createdFieldIds.push(...newFieldRows.map((r: { id: string }) => r.id));
    }
  }

  // Save layout on item_type
  const { error: layoutError } = await supabase
    .from('item_types')
    .update({ layout: parsed.data })
    .eq('id', input.itemTypeId);

  if (layoutError) return { error: `Failed to save layout: ${layoutError.message}` };

  return { success: true, createdFieldIds };
}

export async function deleteLayout(itemTypeId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('item_types')
    .update({ layout: null })
    .eq('id', itemTypeId);

  if (error) return { error: `Failed to delete layout: ${error.message}` };
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/app/admin/properties/[slug]/types/__tests__/layout-actions.test.ts`
Expected: PASS — all 3 tests pass. Adjust mocks if the import paths or patterns differ slightly.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/properties/[slug]/types/layout-actions.ts src/app/admin/properties/[slug]/types/__tests__/layout-actions.test.ts
git commit -m "feat: add server actions for saving and deleting item type layouts"
```

---

## Task 12: Layout Builder — Core Components

This is the largest task. It creates the builder UI: palette, sortable block list, inline config panels, and the main orchestrator.

**Files:**
- Create: `src/components/layout/builder/BlockPalette.tsx`
- Create: `src/components/layout/builder/BlockListItem.tsx`
- Create: `src/components/layout/builder/BlockConfigPanel.tsx`
- Create: `src/components/layout/builder/InlineFieldCreator.tsx`
- Create: `src/components/layout/builder/SpacingPicker.tsx`
- Create: `src/components/layout/builder/PeekBoundary.tsx`
- Create: `src/components/layout/builder/BlockList.tsx`
- Create: `src/components/layout/builder/RowEditor.tsx`
- Create: `src/components/layout/builder/LayoutBuilder.tsx`

Due to the size of this task, each sub-component is a step. The builder uses `@dnd-kit/sortable` for reordering and manages all layout state internally, calling a save action on "Done."

- [ ] **Step 1: Create BlockPalette**

```tsx
// src/components/layout/builder/BlockPalette.tsx
'use client';

import type { BlockType } from '@/lib/layout/types';

interface PaletteItem {
  type: BlockType | 'row';
  icon: string;
  label: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'field_display', icon: '📊', label: 'Field' },
  { type: 'photo_gallery', icon: '📷', label: 'Photo' },
  { type: 'status_badge', icon: '🏷', label: 'Status' },
  { type: 'entity_list', icon: '🔗', label: 'Entities' },
  { type: 'timeline', icon: '📋', label: 'Timeline' },
  { type: 'text_label', icon: '✏️', label: 'Text' },
  { type: 'divider', icon: '➖', label: 'Divider' },
  { type: 'map_snippet', icon: '📍', label: 'Map' },
  { type: 'action_buttons', icon: '🔘', label: 'Actions' },
  { type: 'row', icon: '⬜', label: 'Row' },
];

interface Props {
  onAdd: (type: BlockType | 'row') => void;
}

export default function BlockPalette({ onAdd }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
      {PALETTE_ITEMS.map((item) => (
        <button
          key={item.type}
          onClick={() => onAdd(item.type)}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full border border-sage-light bg-white hover:bg-sage-light/50 text-sm font-medium text-forest-dark transition-colors min-h-[44px]"
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create InlineFieldCreator**

```tsx
// src/components/layout/builder/InlineFieldCreator.tsx
'use client';

import { useState } from 'react';
import type { FieldType } from '@/lib/types';

interface NewFieldData {
  name: string;
  field_type: FieldType;
  options: string[];
  required: boolean;
}

interface Props {
  onCreateField: (field: NewFieldData) => void;
  onCancel: () => void;
}

export default function InlineFieldCreator({ onCreateField, onCancel }: Props) {
  const [name, setName] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onCreateField({
      name: name.trim(),
      field_type: fieldType,
      options: fieldType === 'dropdown' ? options.split(',').map((o) => o.trim()).filter(Boolean) : [],
      required,
    });
  };

  return (
    <div className="space-y-3 p-3 bg-sage-light/30 rounded-lg border border-sage-light">
      <div>
        <label className="label">Field Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
          placeholder="e.g., Target Species"
          autoFocus
        />
      </div>

      <div>
        <label className="label">Type</label>
        <div className="flex gap-1">
          {(['text', 'number', 'dropdown', 'date'] as FieldType[]).map((t) => (
            <button
              key={t}
              onClick={() => setFieldType(t)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                fieldType === t
                  ? 'bg-forest text-white'
                  : 'bg-white border border-sage-light text-forest-dark hover:bg-sage-light/50'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {fieldType === 'dropdown' && (
        <div>
          <label className="label">Options (comma-separated)</label>
          <input
            type="text"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            className="input-field"
            placeholder="Robin, Wren, Blue Tit"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="field-required"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="field-required" className="text-sm text-forest-dark">Required</label>
      </div>

      <div className="flex gap-2">
        <button onClick={handleSubmit} className="btn-primary text-sm" disabled={!name.trim()}>
          Create Field
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create BlockConfigPanel**

```tsx
// src/components/layout/builder/BlockConfigPanel.tsx
'use client';

import type { LayoutBlock, BlockConfig, FieldDisplayConfig, PhotoGalleryConfig, TimelineConfig, TextLabelConfig, EntityListConfig } from '@/lib/layout/types';
import type { CustomField, EntityType } from '@/lib/types';
import InlineFieldCreator from './InlineFieldCreator';
import { useState } from 'react';

interface Props {
  block: LayoutBlock;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onConfigChange: (blockId: string, config: BlockConfig) => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
}

export default function BlockConfigPanel({ block, customFields, entityTypes, onConfigChange, onCreateField }: Props) {
  const [showFieldCreator, setShowFieldCreator] = useState(false);

  switch (block.type) {
    case 'field_display': {
      const config = block.config as FieldDisplayConfig;
      return (
        <div className="space-y-3 pt-2">
          <div>
            <label className="label">Field</label>
            <select
              value={config.fieldId}
              onChange={(e) => onConfigChange(block.id, { ...config, fieldId: e.target.value })}
              className="input-field"
            >
              <option value="">Select a field...</option>
              {customFields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          {!showFieldCreator && (
            <button
              onClick={() => setShowFieldCreator(true)}
              className="text-sm text-forest font-medium hover:underline"
            >
              + Create New Field
            </button>
          )}
          {showFieldCreator && (
            <InlineFieldCreator
              onCreateField={(field) => {
                onCreateField(field);
                setShowFieldCreator(false);
              }}
              onCancel={() => setShowFieldCreator(false)}
            />
          )}
          <div>
            <label className="label">Size</label>
            <div className="flex gap-1">
              {(['compact', 'normal', 'large'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onConfigChange(block.id, { ...config, size: s })}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    config.size === s ? 'bg-forest text-white' : 'bg-white border border-sage-light'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.showLabel}
              onChange={(e) => onConfigChange(block.id, { ...config, showLabel: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-forest-dark">Show label</span>
          </label>
        </div>
      );
    }

    case 'photo_gallery': {
      const config = block.config as PhotoGalleryConfig;
      return (
        <div className="space-y-3 pt-2">
          <div>
            <label className="label">Style</label>
            <div className="flex gap-1">
              {(['hero', 'grid', 'carousel'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onConfigChange(block.id, { ...config, style: s })}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    config.style === s ? 'bg-forest text-white' : 'bg-white border border-sage-light'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Max Photos: {config.maxPhotos}</label>
            <input
              type="range"
              min={1}
              max={20}
              value={config.maxPhotos}
              onChange={(e) => onConfigChange(block.id, { ...config, maxPhotos: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      );
    }

    case 'timeline': {
      const config = block.config as TimelineConfig;
      return (
        <div className="space-y-3 pt-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.showUpdates}
              onChange={(e) => onConfigChange(block.id, { ...config, showUpdates: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Show updates</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.showScheduled}
              onChange={(e) => onConfigChange(block.id, { ...config, showScheduled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Show scheduled</span>
          </label>
          <div>
            <label className="label">Max items: {config.maxItems}</label>
            <input
              type="range"
              min={1}
              max={50}
              value={config.maxItems}
              onChange={(e) => onConfigChange(block.id, { ...config, maxItems: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      );
    }

    case 'text_label': {
      const config = block.config as TextLabelConfig;
      return (
        <div className="space-y-3 pt-2">
          <div>
            <label className="label">Text</label>
            <input
              type="text"
              value={config.text}
              onChange={(e) => onConfigChange(block.id, { ...config, text: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Style</label>
            <div className="flex gap-1">
              {(['heading', 'subheading', 'body', 'caption'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onConfigChange(block.id, { ...config, style: s })}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    config.style === s ? 'bg-forest text-white' : 'bg-white border border-sage-light'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case 'entity_list': {
      const config = block.config as EntityListConfig;
      return (
        <div className="space-y-2 pt-2">
          <label className="label">Show entity types</label>
          {entityTypes.map((et) => (
            <label key={et.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.entityTypeIds.length === 0 || config.entityTypeIds.includes(et.id)}
                onChange={(e) => {
                  const ids = config.entityTypeIds.length === 0
                    ? entityTypes.map((t) => t.id).filter((id) => id !== et.id || e.target.checked)
                    : e.target.checked
                      ? [...config.entityTypeIds, et.id]
                      : config.entityTypeIds.filter((id) => id !== et.id);
                  onConfigChange(block.id, { ...config, entityTypeIds: ids });
                }}
                className="rounded"
              />
              <span className="text-sm">{et.icon} {et.name}</span>
            </label>
          ))}
        </div>
      );
    }

    default:
      return (
        <p className="text-xs text-sage italic pt-2">No configuration needed</p>
      );
  }
}
```

- [ ] **Step 4: Create SpacingPicker**

```tsx
// src/components/layout/builder/SpacingPicker.tsx
'use client';

import type { SpacingPreset } from '@/lib/layout/types';

interface Props {
  value: SpacingPreset;
  onChange: (value: SpacingPreset) => void;
}

const options: { value: SpacingPreset; label: string; description: string }[] = [
  { value: 'compact', label: 'Compact', description: 'Dense, data-heavy' },
  { value: 'comfortable', label: 'Comfortable', description: 'Balanced' },
  { value: 'spacious', label: 'Spacious', description: 'Airy, photo-forward' },
];

export default function SpacingPicker({ value, onChange }: Props) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-2 rounded-md text-xs font-medium text-center transition-colors ${
            value === opt.value
              ? 'bg-forest text-white'
              : 'bg-white border border-sage-light text-forest-dark hover:bg-sage-light/50'
          }`}
          title={opt.description}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create PeekBoundary**

```tsx
// src/components/layout/builder/PeekBoundary.tsx
'use client';

interface Props {
  peekBlockCount: number;
  totalBlocks: number;
  onChange: (count: number) => void;
}

export default function PeekBoundary({ peekBlockCount, totalBlocks, onChange }: Props) {
  if (totalBlocks <= 1) return null;

  return (
    <div className="flex items-center gap-2 py-2">
      <div className="flex-1 border-t-2 border-dashed border-forest/30" />
      <span className="text-[10px] font-medium text-forest/60 whitespace-nowrap">
        Visible on first tap
      </span>
      <select
        value={peekBlockCount}
        onChange={(e) => onChange(Number(e.target.value))}
        className="text-xs border border-sage-light rounded px-1 py-0.5"
      >
        {Array.from({ length: totalBlocks }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n} block{n > 1 ? 's' : ''}</option>
        ))}
      </select>
      <div className="flex-1 border-t-2 border-dashed border-forest/30" />
    </div>
  );
}
```

- [ ] **Step 6: Create BlockListItem**

```tsx
// src/components/layout/builder/BlockListItem.tsx
'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LayoutBlock } from '@/lib/layout/types';
import type { CustomField, EntityType } from '@/lib/types';
import BlockConfigPanel from './BlockConfigPanel';
import type { BlockConfig } from '@/lib/layout/types';
import { GripVertical, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

const BLOCK_LABELS: Record<string, string> = {
  field_display: 'Field',
  photo_gallery: 'Photo Gallery',
  status_badge: 'Status Badge',
  entity_list: 'Entities',
  text_label: 'Text',
  divider: 'Divider',
  action_buttons: 'Actions',
  map_snippet: 'Map',
  timeline: 'Timeline',
};

interface Props {
  block: LayoutBlock;
  customFields: CustomField[];
  entityTypes: EntityType[];
  fieldName?: string;
  onConfigChange: (blockId: string, config: BlockConfig) => void;
  onDelete: (blockId: string) => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export default function BlockListItem({
  block,
  customFields,
  entityTypes,
  fieldName,
  onConfigChange,
  onDelete,
  onCreateField,
  isExpanded,
  onToggleExpand,
}: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const label = block.type === 'field_display' && fieldName
    ? fieldName
    : BLOCK_LABELS[block.type] ?? block.type;

  return (
    <div ref={setNodeRef} style={style} className="border border-sage-light rounded-lg bg-white">
      {/* Header row */}
      <div className="flex items-center min-h-[48px]">
        <button
          {...attributes}
          {...listeners}
          className="p-3 cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-sage" />
        </button>
        <button
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-2 py-2 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-sage" />
          ) : (
            <ChevronRight className="w-4 h-4 text-sage" />
          )}
          <span className="text-sm font-medium text-forest-dark">{label}</span>
        </button>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1 pr-2">
            <button onClick={() => onDelete(block.id)} className="text-xs text-red-600 font-medium px-2 py-1">
              Delete
            </button>
            <button onClick={() => setShowDeleteConfirm(false)} className="text-xs text-sage px-2 py-1">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-3 text-sage hover:text-red-500 transition-colors"
            aria-label="Delete block"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Config panel (accordion) */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-sage-light/50">
          <BlockConfigPanel
            block={block}
            customFields={customFields}
            entityTypes={entityTypes}
            onConfigChange={onConfigChange}
            onCreateField={onCreateField}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create BlockList with @dnd-kit**

```tsx
// src/components/layout/builder/BlockList.tsx
'use client';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { LayoutNode, LayoutBlock, BlockConfig } from '@/lib/layout/types';
import { isLayoutRow } from '@/lib/layout/types';
import type { CustomField, EntityType } from '@/lib/types';
import BlockListItem from './BlockListItem';
import RowEditor from './RowEditor';
import PeekBoundary from './PeekBoundary';
import { useState } from 'react';

interface Props {
  nodes: LayoutNode[];
  customFields: CustomField[];
  entityTypes: EntityType[];
  peekBlockCount: number;
  onReorder: (activeId: string, overId: string) => void;
  onConfigChange: (blockId: string, config: BlockConfig) => void;
  onDeleteBlock: (blockId: string) => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
  onPeekCountChange: (count: number) => void;
  onRowChange: (rowId: string, update: Partial<{ gap: string; distribution: string | number[] }>) => void;
  onAddToRow: (rowId: string, blockType: string) => void;
  onRemoveFromRow: (rowId: string, blockId: string) => void;
}

export default function BlockList({
  nodes,
  customFields,
  entityTypes,
  peekBlockCount,
  onReorder,
  onConfigChange,
  onDeleteBlock,
  onCreateField,
  onPeekCountChange,
  onRowChange,
  onAddToRow,
  onRemoveFromRow,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  };

  const fieldMap = new Map(customFields.map((f) => [f.id, f]));
  const nodeIds = nodes.map((n) => n.id);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={nodeIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {nodes.map((node, index) => (
            <div key={node.id}>
              {index === peekBlockCount && (
                <PeekBoundary
                  peekBlockCount={peekBlockCount}
                  totalBlocks={nodes.length}
                  onChange={onPeekCountChange}
                />
              )}
              {isLayoutRow(node) ? (
                <RowEditor
                  row={node}
                  customFields={customFields}
                  entityTypes={entityTypes}
                  fieldMap={fieldMap}
                  expandedId={expandedId}
                  onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                  onConfigChange={onConfigChange}
                  onDeleteBlock={onDeleteBlock}
                  onCreateField={onCreateField}
                  onRowChange={onRowChange}
                  onAddToRow={onAddToRow}
                  onRemoveFromRow={onRemoveFromRow}
                />
              ) : (
                <BlockListItem
                  block={node}
                  customFields={customFields}
                  entityTypes={entityTypes}
                  fieldName={
                    node.type === 'field_display'
                      ? fieldMap.get((node.config as { fieldId: string }).fieldId)?.name
                      : undefined
                  }
                  onConfigChange={onConfigChange}
                  onDelete={onDeleteBlock}
                  onCreateField={onCreateField}
                  isExpanded={expandedId === node.id}
                  onToggleExpand={() => setExpandedId(expandedId === node.id ? null : node.id)}
                />
              )}
            </div>
          ))}
          {nodes.length > 0 && peekBlockCount >= nodes.length && (
            <PeekBoundary
              peekBlockCount={peekBlockCount}
              totalBlocks={nodes.length}
              onChange={onPeekCountChange}
            />
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}
```

- [ ] **Step 8: Create RowEditor**

```tsx
// src/components/layout/builder/RowEditor.tsx
'use client';

import type { LayoutRow, BlockConfig } from '@/lib/layout/types';
import type { CustomField, EntityType } from '@/lib/types';
import BlockListItem from './BlockListItem';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface Props {
  row: LayoutRow;
  customFields: CustomField[];
  entityTypes: EntityType[];
  fieldMap: Map<string, CustomField>;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onConfigChange: (blockId: string, config: BlockConfig) => void;
  onDeleteBlock: (blockId: string) => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
  onRowChange: (rowId: string, update: Partial<{ gap: string; distribution: string | number[] }>) => void;
  onAddToRow: (rowId: string, blockType: string) => void;
  onRemoveFromRow: (rowId: string, blockId: string) => void;
}

export default function RowEditor({
  row,
  customFields,
  entityTypes,
  fieldMap,
  expandedId,
  onToggleExpand,
  onConfigChange,
  onDeleteBlock,
  onCreateField,
  onRowChange,
  onAddToRow,
  onRemoveFromRow,
}: Props) {
  const [showRowConfig, setShowRowConfig] = useState(false);

  return (
    <div className="border-2 border-dashed border-sage rounded-lg p-2 space-y-2">
      {/* Row header */}
      <div className="flex items-center justify-between min-h-[44px]">
        <button
          onClick={() => setShowRowConfig(!showRowConfig)}
          className="flex items-center gap-2 text-sm font-medium text-forest-dark"
        >
          {showRowConfig ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Row ({row.children.length} columns, {typeof row.distribution === 'string' ? row.distribution : 'custom'})
        </button>
        <button
          onClick={() => onDeleteBlock(row.id)}
          className="p-2 text-sage hover:text-red-500"
          aria-label="Delete row"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Row config */}
      {showRowConfig && (
        <div className="space-y-2 px-2 pb-2 border-b border-sage-light">
          <div>
            <label className="label">Distribution</label>
            <div className="flex gap-1">
              {(['equal', 'auto'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => onRowChange(row.id, { distribution: d })}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                    row.distribution === d ? 'bg-forest text-white' : 'bg-white border border-sage-light'
                  }`}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Gap</label>
            <div className="flex gap-1">
              {(['tight', 'normal', 'loose'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => onRowChange(row.id, { gap: g })}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                    row.gap === g ? 'bg-forest text-white' : 'bg-white border border-sage-light'
                  }`}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Children */}
      <div className="pl-3 border-l-2 border-sage-light space-y-2">
        {row.children.map((child) => (
          <BlockListItem
            key={child.id}
            block={child}
            customFields={customFields}
            entityTypes={entityTypes}
            fieldName={
              child.type === 'field_display'
                ? fieldMap.get((child.config as { fieldId: string }).fieldId)?.name
                : undefined
            }
            onConfigChange={onConfigChange}
            onDelete={(id) => onRemoveFromRow(row.id, id)}
            onCreateField={onCreateField}
            isExpanded={expandedId === child.id}
            onToggleExpand={() => onToggleExpand(child.id)}
          />
        ))}
        {row.children.length < 4 && (
          <button
            onClick={() => onAddToRow(row.id, 'field_display')}
            className="w-full py-2 border-2 border-dashed border-sage-light rounded-lg text-xs text-sage font-medium hover:border-forest hover:text-forest transition-colors min-h-[44px]"
          >
            + Add to row
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create the main LayoutBuilder orchestrator**

This is the largest single component. It manages all layout state and delegates rendering to sub-components.

```tsx
// src/components/layout/builder/LayoutBuilder.tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { arrayMove } from '@dnd-kit/sortable';
import type { TypeLayout, LayoutNode, LayoutBlock, LayoutRow, BlockType, BlockConfig, SpacingPreset } from '@/lib/layout/types';
import { isLayoutRow } from '@/lib/layout/types';
import type { CustomField, EntityType, ItemType } from '@/lib/types';
import { generateDefaultLayout } from '@/lib/layout/defaults';
import { generateMockItem } from '@/lib/layout/mock-data';
import BlockPalette from './BlockPalette';
import BlockList from './BlockList';
import SpacingPicker from './SpacingPicker';
import LayoutRenderer from '../LayoutRenderer';
import FormPreview from '../preview/FormPreview';

interface Props {
  itemType: ItemType;
  initialLayout: TypeLayout | null;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onSave: (layout: TypeLayout, newFields: { name: string; field_type: string; options: string[]; required: boolean }[]) => Promise<void>;
  onCancel: () => void;
}

type PreviewTab = 'detail' | 'form';

function getDefaultConfig(type: BlockType): BlockConfig {
  switch (type) {
    case 'field_display': return { fieldId: '', size: 'normal' as const, showLabel: true };
    case 'photo_gallery': return { style: 'hero' as const, maxPhotos: 4 };
    case 'timeline': return { showUpdates: true, showScheduled: false, maxItems: 5 };
    case 'text_label': return { text: 'Section Title', style: 'heading' as const };
    case 'entity_list': return { entityTypeIds: [] };
    default: return {};
  }
}

export default function LayoutBuilder({ itemType, initialLayout, customFields, entityTypes, onSave, onCancel }: Props) {
  const [layout, setLayout] = useState<TypeLayout>(
    () => initialLayout ?? generateDefaultLayout(customFields),
  );
  const [pendingFields, setPendingFields] = useState<{ name: string; field_type: string; options: string[]; required: boolean; tempId: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<'build' | 'detail' | 'form'>('build');
  const [previewTab, setPreviewTab] = useState<PreviewTab>('detail');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Combine real fields + pending fields for preview
  const allFields: CustomField[] = [
    ...customFields,
    ...pendingFields.map((f, i) => ({
      id: f.tempId,
      item_type_id: itemType.id,
      name: f.name,
      field_type: f.field_type as CustomField['field_type'],
      options: f.options.length > 0 ? f.options : null,
      required: f.required,
      sort_order: customFields.length + i,
      org_id: itemType.org_id,
    })),
  ];

  const mockItem = generateMockItem(itemType, allFields);

  const handleAddBlock = useCallback((type: BlockType | 'row') => {
    setLayout((prev) => {
      if (type === 'row') {
        const newRow: LayoutRow = {
          id: nanoid(10),
          type: 'row',
          children: [
            { id: nanoid(10), type: 'status_badge', config: {} },
            { id: nanoid(10), type: 'status_badge', config: {} },
          ],
          gap: 'normal',
          distribution: 'equal',
        };
        return { ...prev, blocks: [...prev.blocks, newRow] };
      }
      const newBlock: LayoutBlock = {
        id: nanoid(10),
        type: type,
        config: getDefaultConfig(type),
      };
      return { ...prev, blocks: [...prev.blocks, newBlock] };
    });
  }, []);

  const handleReorder = useCallback((activeId: string, overId: string) => {
    setLayout((prev) => {
      const oldIndex = prev.blocks.findIndex((b) => b.id === activeId);
      const newIndex = prev.blocks.findIndex((b) => b.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, blocks: arrayMove(prev.blocks, oldIndex, newIndex) };
    });
  }, []);

  const handleConfigChange = useCallback((blockId: string, config: BlockConfig) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) => {
        if (node.id === blockId && !isLayoutRow(node)) {
          return { ...node, config };
        }
        if (isLayoutRow(node)) {
          return {
            ...node,
            children: node.children.map((c) =>
              c.id === blockId ? { ...c, config } : c,
            ),
          };
        }
        return node;
      }),
    }));
  }, []);

  const handleDeleteBlock = useCallback((blockId: string) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== blockId),
    }));
  }, []);

  const handleCreateField = useCallback((field: { name: string; field_type: string; options: string[]; required: boolean }) => {
    const tempId = `temp-${nanoid(10)}`;
    setPendingFields((prev) => [...prev, { ...field, tempId }]);
    // Auto-update the last field_display block that has no fieldId
    setLayout((prev) => {
      const blocks = [...prev.blocks];
      for (let i = blocks.length - 1; i >= 0; i--) {
        const node = blocks[i];
        if (!isLayoutRow(node) && node.type === 'field_display' && !(node.config as { fieldId: string }).fieldId) {
          blocks[i] = { ...node, config: { ...(node.config as object), fieldId: tempId } as BlockConfig };
          return { ...prev, blocks };
        }
      }
      return prev;
    });
  }, []);

  const handlePeekCountChange = useCallback((count: number) => {
    setLayout((prev) => ({ ...prev, peekBlockCount: count }));
  }, []);

  const handleSpacingChange = useCallback((spacing: SpacingPreset) => {
    setLayout((prev) => ({ ...prev, spacing }));
  }, []);

  const handleRowChange = useCallback((rowId: string, update: Partial<{ gap: string; distribution: string | number[] }>) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) =>
        node.id === rowId && isLayoutRow(node) ? { ...node, ...update } : node,
      ),
    }));
  }, []);

  const handleAddToRow = useCallback((rowId: string, blockType: string) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) => {
        if (node.id === rowId && isLayoutRow(node) && node.children.length < 4) {
          return {
            ...node,
            children: [
              ...node.children,
              { id: nanoid(10), type: blockType as BlockType, config: getDefaultConfig(blockType as BlockType) },
            ],
          };
        }
        return node;
      }),
    }));
  }, []);

  const handleRemoveFromRow = useCallback((rowId: string, blockId: string) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) => {
        if (node.id === rowId && isLayoutRow(node)) {
          const remaining = node.children.filter((c) => c.id !== blockId);
          // If only 1 child remains, unwrap the row
          if (remaining.length <= 1) {
            return remaining[0] ?? node; // Replace row with single child
          }
          return { ...node, children: remaining };
        }
        return node;
      }).filter((node) => {
        // Remove row if it was replaced by a single child above (handled via map)
        return true;
      }),
    }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(layout, pendingFields.map(({ tempId, ...rest }) => rest));
    } finally {
      setSaving(false);
    }
  };

  // Build panel content
  const buildContent = (
    <div className="space-y-4">
      <BlockPalette onAdd={handleAddBlock} />
      <SpacingPicker value={layout.spacing} onChange={handleSpacingChange} />
      <BlockList
        nodes={layout.blocks}
        customFields={allFields}
        entityTypes={entityTypes}
        peekBlockCount={layout.peekBlockCount}
        onReorder={handleReorder}
        onConfigChange={handleConfigChange}
        onDeleteBlock={handleDeleteBlock}
        onCreateField={handleCreateField}
        onPeekCountChange={handlePeekCountChange}
        onRowChange={handleRowChange}
        onAddToRow={handleAddToRow}
        onRemoveFromRow={handleRemoveFromRow}
      />
    </div>
  );

  const detailPreview = (
    <div className="bg-gray-100 rounded-xl p-3">
      <div className="bg-white rounded-xl shadow-lg p-4 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">{itemType.icon}</span>
          <h2 className="font-heading font-semibold text-forest-dark text-xl">{mockItem.name}</h2>
        </div>
        <LayoutRenderer
          layout={layout}
          item={mockItem}
          mode="preview"
          context="preview"
          customFields={allFields}
        />
      </div>
    </div>
  );

  const formPreviewContent = (
    <FormPreview layout={layout} customFields={allFields} itemTypeName={itemType.name} />
  );

  // Mobile: full-screen with tabs
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ height: '100dvh' }}>
        {/* Sticky header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sage-light">
          <button onClick={onCancel} className="text-sm text-forest font-medium">
            Cancel
          </button>
          <span className="text-sm font-semibold text-forest-dark">{itemType.name} Layout</span>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-4 py-1.5">
            {saving ? 'Saving...' : 'Done'}
          </button>
        </div>

        {/* Tab toggle */}
        <div className="flex border-b border-sage-light">
          {(['build', 'detail', 'form'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-forest border-b-2 border-forest'
                  : 'text-sage'
              }`}
            >
              {tab === 'build' ? 'Build' : tab === 'detail' ? 'Detail' : 'Form'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'build' && buildContent}
          {activeTab === 'detail' && detailPreview}
          {activeTab === 'form' && formPreviewContent}
        </div>
      </div>
    );
  }

  // Desktop: side-by-side
  return (
    <div className="flex gap-6 min-h-[600px]">
      {/* Builder panel */}
      <div className="flex-[3] overflow-y-auto pr-4 border-r border-sage-light">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-semibold text-forest-dark">Layout Builder</h3>
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving...' : 'Save Layout'}
            </button>
          </div>
        </div>
        {buildContent}
      </div>

      {/* Preview panel */}
      <div className="flex-[2] overflow-y-auto">
        <div className="flex gap-1 mb-3">
          {(['detail', 'form'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setPreviewTab(tab)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                previewTab === tab ? 'bg-forest text-white' : 'bg-sage-light text-forest-dark'
              }`}
            >
              {tab === 'detail' ? 'Detail Preview' : 'Form Preview'}
            </button>
          ))}
        </div>
        {previewTab === 'detail' ? detailPreview : formPreviewContent}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Verify the app compiles**

Run: `cd /Users/patrick/birdhousemapper && npm run type-check`
Expected: No type errors. Fix any type mismatches.

- [ ] **Step 11: Commit**

```bash
git add src/components/layout/builder/
git commit -m "feat: add layout builder with drag-and-drop, inline config, and responsive design"
```

---

## Task 13: Form Preview Component

**Files:**
- Create: `src/components/layout/preview/FormPreview.tsx`
- Create: `src/components/layout/preview/DetailPreview.tsx`

- [ ] **Step 1: Create FormPreview**

```tsx
// src/components/layout/preview/FormPreview.tsx
'use client';

import type { TypeLayout } from '@/lib/layout/types';
import type { CustomField } from '@/lib/types';
import { deriveFormFields } from '@/lib/layout/form-derivation';

interface Props {
  layout: TypeLayout;
  customFields: CustomField[];
  itemTypeName: string;
}

export default function FormPreview({ layout, customFields, itemTypeName }: Props) {
  const derived = deriveFormFields(layout, customFields);

  return (
    <div className="bg-gray-100 rounded-xl p-3">
      <div className="bg-white rounded-xl shadow-lg p-4 space-y-4">
        <h3 className="font-heading font-semibold text-forest-dark text-lg">
          Add {itemTypeName}
        </h3>

        {/* Fixed: Name */}
        <div>
          <label className="label">Name <span className="text-red-500">*</span></label>
          <input type="text" className="input-field" placeholder={`e.g., ${itemTypeName} #1`} disabled />
        </div>

        {/* Fixed: Location */}
        <div>
          <label className="label">Location <span className="text-red-500">*</span></label>
          <div className="h-24 bg-sage-light/50 rounded-lg flex items-center justify-center text-xs text-sage">
            Location picker
          </div>
        </div>

        {/* Layout-derived fields with sections */}
        {derived.fields.map((field, index) => {
          const section = derived.sections.find((s) => s.beforeFieldIndex === index);
          const isInRow = derived.rows.some((r) => r.fieldIds.includes(field.id));

          // Check if this is the start of a row
          const row = derived.rows.find((r) => r.fieldIds[0] === field.id);
          const rowFields = row ? row.fieldIds.map((id) => derived.fields.find((f) => f.id === id)).filter(Boolean) : null;

          if (isInRow && !row) return null; // Will be rendered as part of the row

          return (
            <div key={field.id}>
              {section && (
                <p className="text-sm font-semibold text-forest-dark mt-2">{section.text}</p>
              )}
              {rowFields ? (
                <div className="grid grid-cols-2 gap-3">
                  {rowFields.map((rf) => rf && (
                    <div key={rf.id}>
                      <label className="label">
                        {rf.name} {rf.required && <span className="text-red-500">*</span>}
                      </label>
                      {renderFieldInput(rf)}
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <label className="label">
                    {field.name} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  {renderFieldInput(field)}
                </div>
              )}
            </div>
          );
        })}

        {/* Photo uploader placeholder */}
        <div>
          <label className="label">Photos</label>
          <div className="h-16 border-2 border-dashed border-sage-light rounded-lg flex items-center justify-center text-xs text-sage">
            + Add photos
          </div>
        </div>

        {/* Fixed: Submit */}
        <div className="flex gap-2 pt-2">
          <button className="btn-primary flex-1 opacity-60 cursor-default">Save</button>
          <button className="btn-secondary flex-1 opacity-60 cursor-default">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function renderFieldInput(field: CustomField) {
  switch (field.field_type) {
    case 'dropdown':
      return (
        <select className="input-field" disabled>
          <option>Select {field.name}...</option>
          {field.options?.map((opt) => <option key={opt}>{opt}</option>)}
        </select>
      );
    case 'number':
      return <input type="number" className="input-field" placeholder="0" disabled />;
    case 'date':
      return <input type="date" className="input-field" disabled />;
    default:
      return <input type="text" className="input-field" placeholder={`Enter ${field.name.toLowerCase()}`} disabled />;
  }
}
```

- [ ] **Step 2: Create DetailPreview (wrapper component for the builder)**

```tsx
// src/components/layout/preview/DetailPreview.tsx
'use client';

import type { TypeLayout } from '@/lib/layout/types';
import type { ItemWithDetails, CustomField } from '@/lib/types';
import LayoutRenderer from '../LayoutRenderer';

interface Props {
  layout: TypeLayout;
  mockItem: ItemWithDetails;
  customFields: CustomField[];
  itemTypeIcon: string;
}

export default function DetailPreview({ layout, mockItem, customFields, itemTypeIcon }: Props) {
  return (
    <div className="bg-gray-100 rounded-xl p-3">
      {/* Simulated bottom sheet */}
      <div className="bg-white rounded-t-2xl shadow-lg">
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Peek boundary indicator */}
        <div className="px-4 pb-4 max-h-[70vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">{itemTypeIcon}</span>
            <h2 className="font-heading font-semibold text-forest-dark text-xl">
              {mockItem.name}
            </h2>
          </div>

          {/* Layout content */}
          <LayoutRenderer
            layout={layout}
            item={mockItem}
            mode="preview"
            context="preview"
            customFields={customFields}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/preview/
git commit -m "feat: add detail and form preview components for layout builder"
```

---

## Task 14: Admin Page Integration

**Files:**
- Modify: `src/app/admin/properties/[slug]/types/page.tsx`

This task refactors the types admin page to add a Layout tab when editing an item type, integrating the LayoutBuilder component.

- [ ] **Step 1: Read the current types page**

Read `src/app/admin/properties/[slug]/types/page.tsx` to understand the full current structure before modifying.

- [ ] **Step 2: Add layout builder integration to the types page**

The key changes:
1. When an item type is expanded, show tabs: Layout / Fields / Settings
2. Layout tab renders the `LayoutBuilder` component
3. Fields tab shows the existing `CustomFieldEditor`
4. Settings tab shows the existing `ItemTypeEditor` controls (name, icon, color, delete)
5. Import and call `saveTypeWithLayout` server action from the layout builder's onSave

Add the following to the expanded item type section in the page:

```tsx
// Inside the expanded item type section, replace the inline editing with tabs:
import LayoutBuilder from '@/components/layout/builder/LayoutBuilder';
import { saveTypeWithLayout } from './layout-actions';

// Add tab state:
const [activeTab, setActiveTab] = useState<'layout' | 'fields' | 'settings'>('layout');

// Tab bar:
<div className="flex border-b border-sage-light mb-4">
  {(['layout', 'fields', 'settings'] as const).map((tab) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 text-sm font-medium ${
        activeTab === tab
          ? 'text-forest border-b-2 border-forest'
          : 'text-sage hover:text-forest-dark'
      }`}
    >
      {tab.charAt(0).toUpperCase() + tab.slice(1)}
    </button>
  ))}
</div>

// Tab content:
{activeTab === 'layout' && (
  <LayoutBuilder
    itemType={type}
    initialLayout={type.layout}
    customFields={fieldsForType}
    entityTypes={entityTypes}
    onSave={async (layout, newFields) => {
      const result = await saveTypeWithLayout({
        itemTypeId: type.id,
        layout,
        newFields: newFields.map((f, i) => ({ ...f, sort_order: fieldsForType.length + i })),
      });
      if ('error' in result) throw new Error(result.error);
      queryClient.invalidateQueries({ queryKey: ['admin', 'property', slug, 'types'] });
    }}
    onCancel={() => setActiveTab('settings')}
  />
)}
{activeTab === 'fields' && <CustomFieldEditor ... />}
{activeTab === 'settings' && <ItemTypeEditor ... />}
```

The exact integration depends on the current page structure. Read the file, identify the expanded type section, and add the tab system around the existing content. Keep all existing functionality intact — just reorganize it under tabs.

- [ ] **Step 3: Verify the app compiles and renders**

Run: `cd /Users/patrick/birdhousemapper && npm run type-check && npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/properties/[slug]/types/page.tsx
git commit -m "feat: integrate layout builder into item type admin page with tabs"
```

---

## Task 15: Type Check + Build Verification

- [ ] **Step 1: Run full type check**

Run: `cd /Users/patrick/birdhousemapper && npm run type-check`
Expected: 0 errors

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/patrick/birdhousemapper && npm run test`
Expected: All tests pass (new + existing)

- [ ] **Step 3: Run build**

Run: `cd /Users/patrick/birdhousemapper && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Fix any issues found**

If any tests fail or type errors exist, fix them in the relevant files.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type errors and test failures from layout builder integration"
```

---

## Task 16: Field Lifecycle — Deletion Cascade + Sync

**Files:**
- Create: `src/lib/layout/field-sync.ts`
- Create: `src/lib/layout/__tests__/field-sync.test.ts`

This task implements the critical field lifecycle logic: when a custom field is deleted, its corresponding layout block must be auto-removed. When a field is created via the Fields tab, the builder must show a notification.

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/layout/__tests__/field-sync.test.ts
import { describe, it, expect } from 'vitest';
import { removeFieldFromLayout, findFieldsNotInLayout } from '../field-sync';
import type { TypeLayout } from '../types';

describe('removeFieldFromLayout', () => {
  it('removes a field_display block referencing the deleted field', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
        { id: 'b3', type: 'field_display', config: { fieldId: 'f2', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const result = removeFieldFromLayout(layout, 'f1');
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks.find((b) => b.type === 'field_display' && (b as any).config.fieldId === 'f1')).toBeUndefined();
  });

  it('removes a field_display from inside a row', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
            { id: 'b2', type: 'field_display', config: { fieldId: 'f2', size: 'normal', showLabel: true } },
          ],
          gap: 'normal',
          distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = removeFieldFromLayout(layout, 'f1');
    // Row should still exist with 1 child — but rows need 2+ children, so it should unwrap
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].type).toBe('field_display');
  });

  it('returns layout unchanged if field not referenced', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'status_badge', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = removeFieldFromLayout(layout, 'f999');
    expect(result.blocks).toHaveLength(1);
  });
});

describe('findFieldsNotInLayout', () => {
  it('finds fields not referenced by any field_display block', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const fieldIds = ['f1', 'f2', 'f3'];
    const missing = findFieldsNotInLayout(layout, fieldIds);
    expect(missing).toEqual(['f2', 'f3']);
  });

  it('checks inside rows too', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
            { id: 'b2', type: 'field_display', config: { fieldId: 'f2', size: 'normal', showLabel: true } },
          ],
          gap: 'normal',
          distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const missing = findFieldsNotInLayout(layout, ['f1', 'f2', 'f3']);
    expect(missing).toEqual(['f3']);
  });

  it('returns empty array when all fields are in layout', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const missing = findFieldsNotInLayout(layout, ['f1']);
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/layout/__tests__/field-sync.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement field sync logic**

```typescript
// src/lib/layout/field-sync.ts
import type { TypeLayout, LayoutNode, LayoutBlock, LayoutRow, FieldDisplayConfig } from './types';
import { isLayoutRow } from './types';

/**
 * Remove all field_display blocks referencing a given fieldId.
 * If a row is left with <2 children, unwrap it to a single block.
 */
export function removeFieldFromLayout(layout: TypeLayout, fieldId: string): TypeLayout {
  const blocks: LayoutNode[] = [];

  for (const node of layout.blocks) {
    if (isLayoutRow(node)) {
      const filtered = node.children.filter(
        (c) => !(c.type === 'field_display' && (c.config as FieldDisplayConfig).fieldId === fieldId),
      );
      if (filtered.length === 0) continue; // Row fully emptied
      if (filtered.length === 1) {
        blocks.push(filtered[0]); // Unwrap single-child row
      } else {
        blocks.push({ ...node, children: filtered });
      }
    } else {
      if (node.type === 'field_display' && (node.config as FieldDisplayConfig).fieldId === fieldId) {
        continue; // Skip deleted field's block
      }
      blocks.push(node);
    }
  }

  return { ...layout, blocks };
}

/**
 * Find field IDs that are not referenced by any field_display block in the layout.
 */
export function findFieldsNotInLayout(layout: TypeLayout, fieldIds: string[]): string[] {
  const inLayout = new Set<string>();

  function scanBlock(block: LayoutBlock) {
    if (block.type === 'field_display') {
      inLayout.add((block.config as FieldDisplayConfig).fieldId);
    }
  }

  for (const node of layout.blocks) {
    if (isLayoutRow(node)) {
      node.children.forEach(scanBlock);
    } else {
      scanBlock(node);
    }
  }

  return fieldIds.filter((id) => !inLayout.has(id));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/layout/__tests__/field-sync.test.ts`
Expected: PASS — all 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/field-sync.ts src/lib/layout/__tests__/field-sync.test.ts
git commit -m "feat: add field sync logic for layout deletion cascade and missing field detection"
```

---

## Task 17: FAB Repositioning with Bottom Sheet State

**Files:**
- Modify: `src/components/map/MapView.tsx`

The quick-add FAB must reposition above the bottom sheet in peek state and hide in half/full state.

- [ ] **Step 1: Add sheetState prop to MapView**

The parent of both `MapView` and `DetailPanel` needs to share `sheetState`. The simplest approach: lift `sheetState` up to the map page and pass it down.

In `MapView.tsx`, add a prop:

```typescript
interface MapViewProps {
  // ... existing props
  sheetState?: 'peek' | 'half' | 'full' | null; // null = no sheet open
}
```

- [ ] **Step 2: Conditionally position the FAB**

Replace the existing FAB button in `MapView.tsx`:

```tsx
{/* Quick-add FAB — reposition based on bottom sheet state */}
{sheetState !== 'half' && sheetState !== 'full' && (
  <button
    onClick={() => setQuickAddOpen(true)}
    className={`fixed right-4 z-30 bg-green-600 hover:bg-green-700 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-3xl font-light transition-all duration-300 ${
      sheetState === 'peek' ? 'bottom-[calc(25vh+1rem)]' : 'bottom-24'
    }`}
    aria-label="Quick add item"
  >
    +
  </button>
)}
```

- [ ] **Step 3: Wire sheetState from the parent page to MapView**

In the parent page that renders both `MapView` and `DetailPanel`, add state:

```typescript
const [sheetState, setSheetState] = useState<'peek' | 'half' | 'full' | null>(null);
```

Pass to `MapView` as `sheetState={selectedItem ? sheetState : null}` and wire `DetailPanel`'s `onStateChange` to `setSheetState`.

- [ ] **Step 4: Commit**

```bash
git add src/components/map/MapView.tsx
git commit -m "feat: reposition quick-add FAB based on bottom sheet state"
```

---

## Task 18: Safe Area + Bottom Sheet Polish

**Files:**
- Modify: `src/components/ui/MultiSnapBottomSheet.tsx`

- [ ] **Step 1: Add safe area insets**

Update the sheet container's style in `MultiSnapBottomSheet.tsx`:

```tsx
style={{
  height: `${height}px`,
  paddingBottom: 'env(safe-area-inset-bottom)',
}}
```

(Already present in Task 8 implementation — verify it's there.)

- [ ] **Step 2: Add "swipe up for more" affordance**

After the handle and before the content div, add a chevron indicator visible only in peek state:

```tsx
{/* Swipe affordance — visible in peek state */}
{state === 'peek' && (
  <div className="flex justify-center -mt-1 mb-1">
    <svg className="w-4 h-4 text-gray-400 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  </div>
)}
```

- [ ] **Step 3: Add bottom fade gradient for scroll overflow**

In the content div, add an overlay for the fade effect:

```tsx
<div className="relative" style={{ height: `calc(100% - 40px)` }}>
  <div
    ref={contentRef}
    className="overflow-y-auto px-4 pb-4 h-full"
  >
    {children}
  </div>
  {/* Bottom fade gradient when content overflows */}
  <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/MultiSnapBottomSheet.tsx
git commit -m "feat: add safe area insets, swipe affordance, and scroll fade to bottom sheet"
```

---

## Task 19: Integration Tests

**Files:**
- Create: `src/lib/layout/__tests__/integration.test.ts`

- [ ] **Step 1: Write integration tests covering end-to-end layout flows**

```typescript
// src/lib/layout/__tests__/integration.test.ts
import { describe, it, expect } from 'vitest';
import { typeLayoutSchema } from '../schemas';
import { generateDefaultLayout } from '../defaults';
import { generateMockItem } from '../mock-data';
import { deriveFormFields } from '../form-derivation';
import { removeFieldFromLayout, findFieldsNotInLayout } from '../field-sync';
import type { CustomField, ItemType } from '@/lib/types';

const itemType: ItemType = {
  id: 't1',
  name: 'Bird Box',
  icon: '🏠',
  color: '#5D7F3A',
  sort_order: 0,
  created_at: '2026-01-01',
  org_id: 'o1',
  layout: null,
};

const fields: CustomField[] = [
  { id: 'f1', item_type_id: 't1', name: 'Species', field_type: 'dropdown', options: ['Robin', 'Wren'], required: true, sort_order: 0, org_id: 'o1' },
  { id: 'f2', item_type_id: 't1', name: 'Install Date', field_type: 'date', options: null, required: false, sort_order: 1, org_id: 'o1' },
  { id: 'f3', item_type_id: 't1', name: 'Height', field_type: 'number', options: null, required: false, sort_order: 2, org_id: 'o1' },
];

describe('Layout system integration', () => {
  it('full lifecycle: generate → validate → mock → derive form → delete field', () => {
    // 1. Generate default layout
    const layout = generateDefaultLayout(fields);
    expect(layout.blocks.length).toBeGreaterThan(3); // status + photo + 3 fields + actions

    // 2. Validate generated layout
    const validated = typeLayoutSchema.safeParse(layout);
    expect(validated.success).toBe(true);

    // 3. Generate mock item for preview
    const mock = generateMockItem(itemType, fields);
    expect(mock.custom_field_values['f1']).toBe('Robin');
    expect(mock.custom_field_values['f2']).toBeDefined();
    expect(mock.custom_field_values['f3']).toBe(42);

    // 4. Derive form fields
    const form = deriveFormFields(layout, fields);
    expect(form.fields).toHaveLength(3);
    expect(form.fields[0].name).toBe('Species');
    expect(form.fields[1].name).toBe('Install Date');
    expect(form.fields[2].name).toBe('Height');

    // 5. Delete a field — layout updates
    const updated = removeFieldFromLayout(layout, 'f2');
    expect(updated.blocks.length).toBe(layout.blocks.length - 1);

    // 6. Validate updated layout still valid
    const revalidated = typeLayoutSchema.safeParse(updated);
    expect(revalidated.success).toBe(true);

    // 7. Derive form after deletion — should have 2 fields
    const formAfterDelete = deriveFormFields(updated, fields.filter((f) => f.id !== 'f2'));
    expect(formAfterDelete.fields).toHaveLength(2);
  });

  it('backward compatibility: null layout handled gracefully', () => {
    // Layout is null — form derivation and field sync should handle this
    const emptyFields = findFieldsNotInLayout(
      { version: 1, blocks: [], spacing: 'comfortable', peekBlockCount: 0 } as any,
      ['f1', 'f2'],
    );
    // With an empty layout, all fields are "not in layout"
    expect(emptyFields).toEqual(['f1', 'f2']);
  });

  it('field sync detects fields not in layout', () => {
    const layout = generateDefaultLayout([fields[0]]); // Only Species
    const missing = findFieldsNotInLayout(layout, ['f1', 'f2', 'f3']);
    expect(missing).toEqual(['f2', 'f3']);
  });

  it('layout with rows validates and derives form correctly', () => {
    const layoutWithRow = generateDefaultLayout(fields);
    // Manually wrap first two fields in a row
    const fieldBlocks = layoutWithRow.blocks.filter((b) => b.type === 'field_display');
    const otherBlocks = layoutWithRow.blocks.filter((b) => b.type !== 'field_display');

    const rowLayout = {
      ...layoutWithRow,
      blocks: [
        ...otherBlocks.slice(0, -1), // everything except action_buttons
        {
          id: 'row1',
          type: 'row' as const,
          children: [fieldBlocks[0], fieldBlocks[1]],
          gap: 'normal' as const,
          distribution: 'equal' as const,
        },
        fieldBlocks[2],
        otherBlocks[otherBlocks.length - 1], // action_buttons
      ],
    };

    // Validates
    const validated = typeLayoutSchema.safeParse(rowLayout);
    expect(validated.success).toBe(true);

    // Form derivation finds row
    const form = deriveFormFields(rowLayout, fields);
    expect(form.rows).toHaveLength(1);
    expect(form.rows[0].fieldIds).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/layout/__tests__/integration.test.ts`
Expected: PASS — all 4 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/lib/layout/__tests__/integration.test.ts
git commit -m "test: add integration tests for full layout system lifecycle"
```

---

## Notes for Implementation

### Type Compatibility

The `ItemWithDetails` type in `src/lib/types.ts` must include the `item_type` field with the `layout` property. Verify this by reading the type definition. If `ItemWithDetails` doesn't include `item_type.layout`, you'll need to update the Supabase query that fetches items to include the layout column.

### Offline Sync

The `layout` field on `item_types` is automatically included in the Dexie cache since it's part of the record. No Dexie schema version bump is needed — JSONB fields are stored as-is in IndexedDB. Verify by checking that `offlineStore.getItemTypes()` returns records with the `layout` field.

### Mock Data Adjustment

The `generateMockItem` function in Task 5 produces an `ItemWithDetails` object. The exact shape must match what `DetailPanel` and `LayoutRenderer` expect. If the shape diverges from the current `ItemWithDetails` type, adjust the mock. Check `src/lib/types.ts` for the canonical definition.

### Entity Types in Builder

The builder needs access to `EntityType[]` for the EntityListBlock config panel. The admin page should fetch entity types alongside item types. Check if the current page already queries entity types; if not, add a React Query call.
