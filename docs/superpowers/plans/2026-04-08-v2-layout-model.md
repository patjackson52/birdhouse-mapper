# V2 Layout Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a parallel v2 layout type system with fractional widths, per-block permissions, and a dedicated description block — without breaking existing v1 layouts.

**Architecture:** V2 types, schemas, and renderer live alongside v1. A dispatch component routes layouts to the correct renderer by version. Migration happens lazily when admins edit a v1 layout. The builder always produces v2.

**Tech Stack:** TypeScript, Zod, React, @dnd-kit, Vitest, @testing-library/react, Tailwind CSS

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/layout/types-v2.ts` | V2 type definitions |
| Create | `src/lib/layout/schemas-v2.ts` | V2 Zod schemas with row width validation |
| Create | `src/lib/layout/migration.ts` | V1→V2 migration function |
| Create | `src/lib/layout/defaults-v2.ts` | V2 default layout generator |
| Create | `src/components/layout/LayoutRendererV2.tsx` | V2 layout renderer |
| Create | `src/components/layout/LayoutRendererDispatch.tsx` | Version dispatch wrapper |
| Create | `src/components/layout/blocks/DescriptionBlock.tsx` | Description block component |
| Create | `src/components/layout/blocks/RowBlockV2.tsx` | V2 row with fractional widths |
| Create | `src/components/layout/builder/LayoutBuilderV2.tsx` | V2 builder (always produces v2) |
| Create | `src/components/layout/builder/BlockPaletteV2.tsx` | Palette with description + disable logic |
| Create | `src/components/layout/builder/BlockConfigPanelV2.tsx` | Config panel with width + permissions |
| Create | `src/components/layout/builder/WidthPicker.tsx` | Fractional width selector UI |
| Create | `src/components/layout/builder/PermissionsConfig.tsx` | Visibility/permissions config UI |
| Modify | `src/components/layout/preview/DetailPreview.tsx` | Accept v2 layout type |
| Modify | `src/components/layout/builder/DragOverlayContent.tsx` | Accept v2 node type |
| Modify | `src/components/item/DetailPanel.tsx` | Use LayoutRendererDispatch |
| Modify | `src/app/admin/properties/[slug]/types/layout-actions.ts` | Accept v2 layouts |
| Modify | `src/app/admin/properties/[slug]/types/page.tsx` | Use LayoutBuilderV2 |
| Modify | `src/app/org/types/page.tsx` | Use LayoutBuilderV2 |
| Create | `src/lib/layout/__tests__/schemas-v2.test.ts` | V2 schema validation tests |
| Create | `src/lib/layout/__tests__/migration.test.ts` | Migration logic tests |
| Create | `src/lib/layout/__tests__/defaults-v2.test.ts` | V2 default generation tests |
| Create | `src/components/layout/__tests__/LayoutRendererV2.test.tsx` | V2 renderer tests |
| Create | `src/components/layout/__tests__/LayoutRendererDispatch.test.tsx` | Dispatch routing tests |
| Create | `src/components/layout/blocks/__tests__/DescriptionBlock.test.tsx` | Description block tests |
| Create | `src/components/layout/blocks/__tests__/RowBlockV2.test.tsx` | V2 row tests |

---

### Task 1: V2 Type Definitions

**Files:**
- Create: `src/lib/layout/types-v2.ts`
- Test: `src/lib/layout/__tests__/types.test.ts` (verify existing tests still pass)

- [ ] **Step 1: Create types-v2.ts**

```typescript
// src/lib/layout/types-v2.ts

import type {
  SpacingPreset,
  FieldDisplayConfig,
  PhotoGalleryConfig,
  StatusBadgeConfig,
  EntityListConfig,
  TimelineConfig,
  TextLabelConfig,
  DividerConfig,
  MapSnippetConfig,
  ActionButtonsConfig,
} from './types';

// Re-export shared types
export type { SpacingPreset } from './types';

export type FractionalWidth = '1/4' | '1/3' | '1/2' | '2/3' | '3/4' | 'full';

export interface BlockPermissions {
  requiredRole?: 'viewer' | 'editor' | 'admin';
}

export interface DescriptionConfig {
  showLabel: boolean;
  maxLines?: number;
}

export type BlockTypeV2 =
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

export type BlockConfigV2 =
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

export interface LayoutBlockV2 {
  id: string;
  type: BlockTypeV2;
  config: BlockConfigV2;
  width?: FractionalWidth;
  hideWhenEmpty?: boolean;
  permissions?: BlockPermissions;
}

export interface LayoutRowV2 {
  id: string;
  type: 'row';
  children: LayoutBlockV2[];
  gap: 'tight' | 'normal' | 'loose';
  permissions?: BlockPermissions;
}

export type LayoutNodeV2 = LayoutBlockV2 | LayoutRowV2;

export interface TypeLayoutV2 {
  version: 2;
  blocks: LayoutNodeV2[];
  spacing: SpacingPreset;
  peekBlockCount: number;
}

// Type guards
export function isLayoutRowV2(node: LayoutNodeV2): node is LayoutRowV2 {
  return node.type === 'row';
}

export function isLayoutBlockV2(node: LayoutNodeV2): node is LayoutBlockV2 {
  return node.type !== 'row';
}
```

- [ ] **Step 2: Run existing tests to verify no breakage**

Run: `npm test -- --run src/lib/layout/__tests__/types.test.ts`
Expected: All existing v1 type tests PASS (new file doesn't touch v1)

- [ ] **Step 3: Commit**

```bash
git add src/lib/layout/types-v2.ts
git commit -m "feat: add v2 layout type definitions"
```

---

### Task 2: V2 Zod Schemas

**Files:**
- Create: `src/lib/layout/schemas-v2.ts`
- Create: `src/lib/layout/__tests__/schemas-v2.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/layout/__tests__/schemas-v2.test.ts

import { describe, it, expect } from 'vitest';
import { typeLayoutV2Schema } from '../schemas-v2';

describe('typeLayoutV2Schema', () => {
  it('accepts a valid v2 layout with blocks', () => {
    const layout = {
      version: 2,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
        {
          id: 'b2',
          type: 'field_display',
          config: { fieldId: 'f1', size: 'normal', showLabel: true },
          width: '1/2',
          permissions: { requiredRole: 'editor' },
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts a description block', () => {
    const layout = {
      version: 2,
      blocks: [
        { id: 'b1', type: 'description', config: { showLabel: true, maxLines: 3 } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts blocks without width (defaults to full)', () => {
    const layout = {
      version: 2,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts blocks without permissions', () => {
    const layout = {
      version: 2,
      blocks: [
        { id: 'b1', type: 'divider', config: {} },
      ],
      spacing: 'compact',
      peekBlockCount: 0,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts a v2 row with fractional widths', () => {
    const layout = {
      version: 2,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {}, width: '1/3' },
            { id: 'b2', type: 'field_display', config: { fieldId: 'f1', size: 'compact', showLabel: true }, width: '2/3' },
          ],
          gap: 'normal',
        },
      ],
      spacing: 'compact',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts a row with permissions', () => {
    const layout = {
      version: 2,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'divider', config: {} },
          ],
          gap: 'tight',
          permissions: { requiredRole: 'admin' },
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('rejects row children widths exceeding 100%', () => {
    const layout = {
      version: 2,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {}, width: '3/4' },
            { id: 'b2', type: 'divider', config: {}, width: '1/2' },
          ],
          gap: 'normal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('accepts row children widths at exactly 100%', () => {
    const layout = {
      version: 2,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {}, width: '1/2' },
            { id: 'b2', type: 'divider', config: {}, width: '1/2' },
          ],
          gap: 'normal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('rejects version 1', () => {
    const layout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'status_badge', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects empty blocks array', () => {
    const layout = {
      version: 2,
      blocks: [],
      spacing: 'comfortable',
      peekBlockCount: 0,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects description block without showLabel', () => {
    const layout = {
      version: 2,
      blocks: [
        { id: 'b1', type: 'description', config: {} },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects invalid fractional width', () => {
    const layout = {
      version: 2,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {}, width: '1/5' },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects invalid requiredRole', () => {
    const layout = {
      version: 2,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {}, permissions: { requiredRole: 'superadmin' } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects row with fewer than 2 children', () => {
    const layout = {
      version: 2,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [{ id: 'b1', type: 'status_badge', config: {} }],
          gap: 'normal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects row with more than 4 children', () => {
    const children = Array.from({ length: 5 }, (_, i) => ({
      id: `b${i}`,
      type: 'status_badge' as const,
      config: {},
      width: '1/4' as const,
    }));
    const layout = {
      version: 2,
      blocks: [{ id: 'r1', type: 'row', children, gap: 'normal' }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('accepts description maxLines within range', () => {
    const layout = {
      version: 2,
      blocks: [
        { id: 'b1', type: 'description', config: { showLabel: false, maxLines: 50 } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('rejects description maxLines outside range', () => {
    const layout = {
      version: 2,
      blocks: [
        { id: 'b1', type: 'description', config: { showLabel: true, maxLines: 0 } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/layout/__tests__/schemas-v2.test.ts`
Expected: FAIL — `schemas-v2` module not found

- [ ] **Step 3: Implement schemas-v2.ts**

```typescript
// src/lib/layout/schemas-v2.ts

import { z } from 'zod';

// --- Shared v2 field schemas ---

export const fractionalWidthSchema = z.enum(['1/4', '1/3', '1/2', '2/3', '3/4', 'full']);

export const blockPermissionsSchema = z.object({
  requiredRole: z.enum(['viewer', 'editor', 'admin']).optional(),
});

// --- Config schemas (reused from v1 definitions) ---

const fieldDisplayConfigSchema = z.object({
  fieldId: z.string().min(1),
  size: z.enum(['compact', 'normal', 'large']),
  showLabel: z.boolean(),
});

const photoGalleryConfigSchema = z.object({
  style: z.enum(['hero', 'grid', 'carousel']),
  maxPhotos: z.number().int().min(1).max(20),
});

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

const descriptionConfigSchema = z.object({
  showLabel: z.boolean(),
  maxLines: z.number().int().min(1).max(50).optional(),
});

const emptyConfigSchema = z.object({});

// --- V2 block schemas (config + width + permissions) ---

const v2CommonFields = {
  width: fractionalWidthSchema.optional(),
  hideWhenEmpty: z.boolean().optional(),
  permissions: blockPermissionsSchema.optional(),
};

const fieldDisplayBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('field_display'),
  config: fieldDisplayConfigSchema,
  ...v2CommonFields,
});

const photoGalleryBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('photo_gallery'),
  config: photoGalleryConfigSchema,
  ...v2CommonFields,
});

const statusBadgeBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('status_badge'),
  config: emptyConfigSchema,
  ...v2CommonFields,
});

const entityListBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('entity_list'),
  config: entityListConfigSchema,
  ...v2CommonFields,
});

const textLabelBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('text_label'),
  config: textLabelConfigSchema,
  ...v2CommonFields,
});

const timelineBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('timeline'),
  config: timelineConfigSchema,
  ...v2CommonFields,
});

const dividerBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('divider'),
  config: emptyConfigSchema,
  ...v2CommonFields,
});

const actionButtonsBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('action_buttons'),
  config: emptyConfigSchema,
  ...v2CommonFields,
});

const mapSnippetBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('map_snippet'),
  config: emptyConfigSchema,
  ...v2CommonFields,
});

const descriptionBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('description'),
  config: descriptionConfigSchema,
  ...v2CommonFields,
});

export const layoutBlockV2Schema = z.discriminatedUnion('type', [
  fieldDisplayBlockV2Schema,
  photoGalleryBlockV2Schema,
  statusBadgeBlockV2Schema,
  entityListBlockV2Schema,
  textLabelBlockV2Schema,
  timelineBlockV2Schema,
  dividerBlockV2Schema,
  actionButtonsBlockV2Schema,
  mapSnippetBlockV2Schema,
  descriptionBlockV2Schema,
]);

// --- Row width map for validation ---

const WIDTH_VALUES: Record<string, number> = {
  '1/4': 0.25,
  '1/3': 0.333,
  '1/2': 0.5,
  '2/3': 0.667,
  '3/4': 0.75,
  'full': 1,
};

const layoutRowV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('row'),
  children: z.array(layoutBlockV2Schema).min(2).max(4),
  gap: z.enum(['tight', 'normal', 'loose']),
  permissions: blockPermissionsSchema.optional(),
}).refine((row) => {
  const total = row.children.reduce((sum, child) =>
    sum + (WIDTH_VALUES[child.width ?? 'full'] ?? 1), 0);
  return total <= 1.01;
}, 'Row children widths must not exceed 100%');

export const layoutNodeV2Schema = z.union([layoutBlockV2Schema, layoutRowV2Schema]);

export const typeLayoutV2Schema = z.object({
  version: z.literal(2),
  blocks: z.array(layoutNodeV2Schema).min(1),
  spacing: z.enum(['compact', 'comfortable', 'spacious']),
  peekBlockCount: z.number().int().min(0).max(10),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/layout/__tests__/schemas-v2.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run existing schema tests to verify no breakage**

Run: `npm test -- --run src/lib/layout/__tests__/schemas.test.ts`
Expected: All existing v1 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/layout/schemas-v2.ts src/lib/layout/__tests__/schemas-v2.test.ts
git commit -m "feat: add v2 layout Zod schemas with row width validation"
```

---

### Task 3: V1→V2 Migration Function

**Files:**
- Create: `src/lib/layout/migration.ts`
- Create: `src/lib/layout/__tests__/migration.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/layout/__tests__/migration.test.ts

import { describe, it, expect } from 'vitest';
import { migrateV1toV2 } from '../migration';
import { typeLayoutV2Schema } from '../schemas-v2';
import type { TypeLayout } from '../types';

describe('migrateV1toV2', () => {
  it('sets version to 2', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'status_badge', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const v2 = migrateV1toV2(v1);
    expect(v2.version).toBe(2);
  });

  it('preserves spacing and peekBlockCount', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'divider', config: {} }],
      spacing: 'spacious',
      peekBlockCount: 5,
    };
    const v2 = migrateV1toV2(v1);
    expect(v2.spacing).toBe('spacious');
    expect(v2.peekBlockCount).toBe(5);
  });

  it('preserves block configs, ids, and hideWhenEmpty', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'fd1',
          type: 'field_display',
          config: { fieldId: 'f1', size: 'large', showLabel: false },
          hideWhenEmpty: true,
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const block = v2.blocks[0];
    expect(block.id).toBe('fd1');
    expect(block.type).toBe('field_display');
    expect(block.config).toEqual({ fieldId: 'f1', size: 'large', showLabel: false });
    expect('hideWhenEmpty' in block && block.hideWhenEmpty).toBe(true);
  });

  it('does not add permissions to blocks', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'status_badge', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const block = v2.blocks[0];
    expect('permissions' in block).toBe(false);
  });

  it('does not add width to top-level blocks', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'status_badge', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const block = v2.blocks[0];
    expect('width' in block).toBe(false);
  });

  it('maps equal distribution with 2 children to 1/2 widths', () => {
    const v1: TypeLayout = {
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
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    expect(row.type).toBe('row');
    if (row.type === 'row') {
      expect(row.children[0].width).toBe('1/2');
      expect(row.children[1].width).toBe('1/2');
    }
  });

  it('maps equal distribution with 3 children to 1/3 widths', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'divider', config: {} },
            { id: 'b3', type: 'divider', config: {} },
          ],
          gap: 'tight',
          distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    if (row.type === 'row') {
      expect(row.children[0].width).toBe('1/3');
      expect(row.children[1].width).toBe('1/3');
      expect(row.children[2].width).toBe('1/3');
    }
  });

  it('maps equal distribution with 4 children to 1/4 widths', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'divider', config: {} },
            { id: 'b3', type: 'divider', config: {} },
            { id: 'b4', type: 'divider', config: {} },
          ],
          gap: 'loose',
          distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    if (row.type === 'row') {
      expect(row.children.every((c) => c.width === '1/4')).toBe(true);
    }
  });

  it('maps auto distribution to undefined widths', () => {
    const v1: TypeLayout = {
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
          distribution: 'auto',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    if (row.type === 'row') {
      expect(row.children[0].width).toBeUndefined();
      expect(row.children[1].width).toBeUndefined();
    }
  });

  it('maps number[] distribution to nearest fractions', () => {
    // [1, 2] → normalize: [33.3%, 66.7%] → snap: ['1/3', '2/3']
    const v1: TypeLayout = {
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
          distribution: [1, 2],
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    if (row.type === 'row') {
      expect(row.children[0].width).toBe('1/3');
      expect(row.children[1].width).toBe('2/3');
    }
  });

  it('snaps 40% to 1/3 (closer to 33.3% than 50%)', () => {
    // [2, 3] → normalize: [40%, 60%] → snap: ['1/3', '2/3']
    const v1: TypeLayout = {
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
          distribution: [2, 3],
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    if (row.type === 'row') {
      expect(row.children[0].width).toBe('1/3');
      expect(row.children[1].width).toBe('2/3');
    }
  });

  it('preserves row gap', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'divider', config: {} },
          ],
          gap: 'loose',
          distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    if (row.type === 'row') {
      expect(row.gap).toBe('loose');
    }
  });

  it('produces a valid v2 schema output (round-trip)', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'photo_gallery', config: { style: 'hero', maxPhotos: 4 } },
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b3', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
            { id: 'b4', type: 'field_display', config: { fieldId: 'f2', size: 'compact', showLabel: true } },
          ],
          gap: 'normal',
          distribution: 'equal',
        },
        { id: 'b5', type: 'action_buttons', config: {} },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const v2 = migrateV1toV2(v1);
    const result = typeLayoutV2Schema.safeParse(v2);
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/layout/__tests__/migration.test.ts`
Expected: FAIL — `migration` module not found

- [ ] **Step 3: Implement migration.ts**

```typescript
// src/lib/layout/migration.ts

import type { TypeLayout, LayoutNode, LayoutRow } from './types';
import { isLayoutRow } from './types';
import type { TypeLayoutV2, LayoutNodeV2, LayoutBlockV2, LayoutRowV2, FractionalWidth } from './types-v2';

const FRACTION_VALUES: [FractionalWidth, number][] = [
  ['1/4', 0.25],
  ['1/3', 0.333],
  ['1/2', 0.5],
  ['2/3', 0.667],
  ['3/4', 0.75],
  ['full', 1],
];

const EQUAL_WIDTH_MAP: Record<number, FractionalWidth> = {
  2: '1/2',
  3: '1/3',
  4: '1/4',
};

function snapToFraction(percentage: number): FractionalWidth {
  let closest: FractionalWidth = 'full';
  let minDiff = Infinity;
  for (const [fraction, value] of FRACTION_VALUES) {
    const diff = Math.abs(percentage - value);
    if (diff < minDiff) {
      minDiff = diff;
      closest = fraction;
    }
  }
  return closest;
}

function migrateBlock(block: LayoutNode, width?: FractionalWidth): LayoutBlockV2 {
  const result: LayoutBlockV2 = {
    id: block.id,
    type: block.type as LayoutBlockV2['type'],
    config: block.config as LayoutBlockV2['config'],
  };
  if (width !== undefined) {
    result.width = width;
  }
  if ('hideWhenEmpty' in block && block.hideWhenEmpty) {
    result.hideWhenEmpty = true;
  }
  return result;
}

function migrateRow(row: LayoutRow): LayoutRowV2 {
  let childWidths: (FractionalWidth | undefined)[];

  if (row.distribution === 'equal') {
    const w = EQUAL_WIDTH_MAP[row.children.length];
    childWidths = row.children.map(() => w);
  } else if (row.distribution === 'auto') {
    childWidths = row.children.map(() => undefined);
  } else {
    // number[] — normalize to percentages, snap to fractions
    const nums = row.distribution as number[];
    const total = nums.reduce((a, b) => a + b, 0);
    childWidths = nums.map((n) => snapToFraction(n / total));
  }

  return {
    id: row.id,
    type: 'row',
    children: row.children.map((child, i) => migrateBlock(child, childWidths[i])),
    gap: row.gap,
  };
}

export function migrateV1toV2(layout: TypeLayout): TypeLayoutV2 {
  const blocks: LayoutNodeV2[] = layout.blocks.map((node) => {
    if (isLayoutRow(node)) {
      return migrateRow(node);
    }
    return migrateBlock(node);
  });

  return {
    version: 2,
    blocks,
    spacing: layout.spacing,
    peekBlockCount: layout.peekBlockCount,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/layout/__tests__/migration.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/migration.ts src/lib/layout/__tests__/migration.test.ts
git commit -m "feat: add v1-to-v2 layout migration function"
```

---

### Task 4: V2 Default Layout Generator

**Files:**
- Create: `src/lib/layout/defaults-v2.ts`
- Create: `src/lib/layout/__tests__/defaults-v2.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/layout/__tests__/defaults-v2.test.ts

import { describe, it, expect } from 'vitest';
import { generateDefaultLayoutV2 } from '../defaults-v2';
import { typeLayoutV2Schema } from '../schemas-v2';
import type { CustomField } from '@/lib/types';

describe('generateDefaultLayoutV2', () => {
  it('generates v2 layout with no custom fields', () => {
    const layout = generateDefaultLayoutV2([]);
    expect(layout.version).toBe(2);
    expect(layout.spacing).toBe('comfortable');
    expect(layout.peekBlockCount).toBe(2);
    // status_badge, photo_gallery, description, action_buttons
    expect(layout.blocks).toHaveLength(4);
    expect(layout.blocks[0].type).toBe('status_badge');
    expect(layout.blocks[1].type).toBe('photo_gallery');
    expect(layout.blocks[2].type).toBe('description');
    expect(layout.blocks[3].type).toBe('action_buttons');
  });

  it('inserts field_display blocks for custom fields', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'Species', field_type: 'text', options: null, required: false, sort_order: 0, org_id: 'o1' },
      { id: 'f2', item_type_id: 't1', name: 'Date', field_type: 'date', options: null, required: false, sort_order: 1, org_id: 'o1' },
    ];
    const layout = generateDefaultLayoutV2(fields);
    // status_badge, photo_gallery, f1, f2, description, action_buttons
    expect(layout.blocks).toHaveLength(6);
    expect(layout.blocks[2].type).toBe('field_display');
    expect(layout.blocks[3].type).toBe('field_display');
  });

  it('produces valid v2 schema output', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'A', field_type: 'text', options: null, required: false, sort_order: 0, org_id: 'o1' },
    ];
    const layout = generateDefaultLayoutV2(fields);
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('generates unique IDs for all blocks', () => {
    const layout = generateDefaultLayoutV2([]);
    const ids = layout.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/layout/__tests__/defaults-v2.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement defaults-v2.ts**

```typescript
// src/lib/layout/defaults-v2.ts

import { nanoid } from 'nanoid';
import type { TypeLayoutV2, LayoutBlockV2 } from './types-v2';
import type { CustomField } from '@/lib/types';

export function generateDefaultLayoutV2(customFields: CustomField[]): TypeLayoutV2 {
  const sorted = [...customFields].sort((a, b) => a.sort_order - b.sort_order);

  const fieldBlocks: LayoutBlockV2[] = sorted.map((field) => ({
    id: nanoid(10),
    type: 'field_display',
    config: { fieldId: field.id, size: 'normal' as const, showLabel: true },
  }));

  return {
    version: 2,
    spacing: 'comfortable',
    peekBlockCount: 2,
    blocks: [
      { id: nanoid(10), type: 'status_badge', config: {} },
      { id: nanoid(10), type: 'photo_gallery', config: { style: 'hero' as const, maxPhotos: 4 } },
      ...fieldBlocks,
      { id: nanoid(10), type: 'description', config: { showLabel: true } },
      { id: nanoid(10), type: 'action_buttons', config: {} },
    ],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/layout/__tests__/defaults-v2.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/defaults-v2.ts src/lib/layout/__tests__/defaults-v2.test.ts
git commit -m "feat: add v2 default layout generator with description block"
```

---

### Task 5: DescriptionBlock Component

**Files:**
- Create: `src/components/layout/blocks/DescriptionBlock.tsx`
- Create: `src/components/layout/blocks/__tests__/DescriptionBlock.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/components/layout/blocks/__tests__/DescriptionBlock.test.tsx

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DescriptionBlock from '../DescriptionBlock';
import type { DescriptionConfig } from '@/lib/layout/types-v2';

describe('DescriptionBlock', () => {
  it('renders description text', () => {
    const config: DescriptionConfig = { showLabel: false };
    render(<DescriptionBlock config={config} description="A lovely birdhouse." />);
    expect(screen.getByText('A lovely birdhouse.')).toBeDefined();
  });

  it('renders label when showLabel is true', () => {
    const config: DescriptionConfig = { showLabel: true };
    render(<DescriptionBlock config={config} description="Test" />);
    expect(screen.getByText('Description')).toBeDefined();
  });

  it('does not render label when showLabel is false', () => {
    const config: DescriptionConfig = { showLabel: false };
    render(<DescriptionBlock config={config} description="Test" />);
    expect(screen.queryByText('Description')).toBeNull();
  });

  it('returns null when description is null', () => {
    const config: DescriptionConfig = { showLabel: true };
    const { container } = render(<DescriptionBlock config={config} description={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when description is empty string', () => {
    const config: DescriptionConfig = { showLabel: true };
    const { container } = render(<DescriptionBlock config={config} description="" />);
    expect(container.innerHTML).toBe('');
  });

  it('applies line-clamp when maxLines is set', () => {
    const config: DescriptionConfig = { showLabel: false, maxLines: 3 };
    render(<DescriptionBlock config={config} description="Long text here" />);
    const el = screen.getByText('Long text here');
    expect(el.style.webkitLineClamp).toBe('3');
  });

  it('does not apply line-clamp when maxLines is not set', () => {
    const config: DescriptionConfig = { showLabel: false };
    render(<DescriptionBlock config={config} description="Text" />);
    const el = screen.getByText('Text');
    expect(el.style.webkitLineClamp).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/layout/blocks/__tests__/DescriptionBlock.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement DescriptionBlock.tsx**

```typescript
// src/components/layout/blocks/DescriptionBlock.tsx

import type { DescriptionConfig } from '@/lib/layout/types-v2';

interface Props {
  config: DescriptionConfig;
  description: string | null;
}

export default function DescriptionBlock({ config, description }: Props) {
  if (!description) return null;

  return (
    <div>
      {config.showLabel && (
        <span className="text-xs font-medium text-sage uppercase tracking-wide">
          Description
        </span>
      )}
      <p
        className="text-sm text-forest-dark/80 leading-relaxed mt-0.5"
        style={config.maxLines ? {
          display: '-webkit-box',
          WebkitLineClamp: String(config.maxLines),
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        } : undefined}
      >
        {description}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/layout/blocks/__tests__/DescriptionBlock.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/blocks/DescriptionBlock.tsx src/components/layout/blocks/__tests__/DescriptionBlock.test.tsx
git commit -m "feat: add DescriptionBlock component with line-clamp support"
```

---

### Task 6: RowBlockV2 Component

**Files:**
- Create: `src/components/layout/blocks/RowBlockV2.tsx`
- Create: `src/components/layout/blocks/__tests__/RowBlockV2.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/components/layout/blocks/__tests__/RowBlockV2.test.tsx

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import RowBlockV2 from '../RowBlockV2';
import type { LayoutRowV2 } from '@/lib/layout/types-v2';

describe('RowBlockV2', () => {
  const baseRow: LayoutRowV2 = {
    id: 'r1',
    type: 'row',
    children: [
      { id: 'b1', type: 'status_badge', config: {}, width: '1/3' },
      { id: 'b2', type: 'divider', config: {}, width: '2/3' },
    ],
    gap: 'normal',
  };

  it('renders as flex container', () => {
    const { container } = render(
      <RowBlockV2 row={baseRow}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </RowBlockV2>
    );
    const rowEl = container.firstElementChild as HTMLElement;
    expect(rowEl.style.display).toBe('flex');
  });

  it('applies correct flex-basis from child widths', () => {
    const { container } = render(
      <RowBlockV2 row={baseRow}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </RowBlockV2>
    );
    const children = container.firstElementChild!.children;
    expect((children[0] as HTMLElement).style.flex).toBe('0 0 33.333%');
    expect((children[1] as HTMLElement).style.flex).toBe('0 0 66.667%');
  });

  it('applies gap class based on row gap', () => {
    const { container } = render(
      <RowBlockV2 row={{ ...baseRow, gap: 'tight' }}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </RowBlockV2>
    );
    const rowEl = container.firstElementChild as HTMLElement;
    expect(rowEl.className).toContain('gap-2');
  });

  it('uses 100% flex-basis for children without width', () => {
    const row: LayoutRowV2 = {
      ...baseRow,
      children: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'divider', config: {} },
      ],
    };
    const { container } = render(
      <RowBlockV2 row={row}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </RowBlockV2>
    );
    const children = container.firstElementChild!.children;
    // No width → defaults to equal distribution via flex: 1 1 0%
    expect((children[0] as HTMLElement).style.flex).toBe('1 1 0%');
  });

  it('collapses to vertical on narrow containers', () => {
    const { container } = render(
      <RowBlockV2 row={baseRow} containerWidth={400}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </RowBlockV2>
    );
    const rowEl = container.firstElementChild as HTMLElement;
    expect(rowEl.className).toContain('flex-col');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/layout/blocks/__tests__/RowBlockV2.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement RowBlockV2.tsx**

```typescript
// src/components/layout/blocks/RowBlockV2.tsx

import type { ReactNode } from 'react';
import type { LayoutRowV2, FractionalWidth } from '@/lib/layout/types-v2';

interface RowBlockV2Props {
  row: LayoutRowV2;
  children: ReactNode[];
  containerWidth?: number;
}

const ROW_COLLAPSE_BREAKPOINT = 480;

const gapClasses: Record<LayoutRowV2['gap'], string> = {
  tight: 'gap-2',
  normal: 'gap-3',
  loose: 'gap-4',
};

const widthToCSS: Record<FractionalWidth, string> = {
  '1/4': '25%',
  '1/3': '33.333%',
  '1/2': '50%',
  '2/3': '66.667%',
  '3/4': '75%',
  'full': '100%',
};

export default function RowBlockV2({ row, children, containerWidth }: RowBlockV2Props) {
  const isCollapsed = containerWidth !== undefined && containerWidth < ROW_COLLAPSE_BREAKPOINT;

  if (isCollapsed) {
    return (
      <div className={`flex flex-col ${gapClasses[row.gap]}`}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={`${gapClasses[row.gap]}`}
      style={{ display: 'flex', flexWrap: 'wrap' }}
    >
      {children.map((child, i) => {
        const blockWidth = row.children[i]?.width;
        const flex = blockWidth
          ? `0 0 ${widthToCSS[blockWidth]}`
          : '1 1 0%';

        return (
          <div key={row.children[i]?.id ?? i} style={{ flex, minWidth: 0 }}>
            {child}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/layout/blocks/__tests__/RowBlockV2.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/blocks/RowBlockV2.tsx src/components/layout/blocks/__tests__/RowBlockV2.test.tsx
git commit -m "feat: add RowBlockV2 with fractional width rendering"
```

---

### Task 7: LayoutRendererV2

**Files:**
- Create: `src/components/layout/LayoutRendererV2.tsx`
- Create: `src/components/layout/__tests__/LayoutRendererV2.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/components/layout/__tests__/LayoutRendererV2.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TypeLayoutV2, LayoutNodeV2 } from '@/lib/layout/types-v2';
import type { ItemWithDetails, CustomField } from '@/lib/types';

// Mock block components
vi.mock('@/components/layout/BlockErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/layout/blocks/StatusBadgeBlock', () => ({
  default: () => <div data-testid="block-status_badge" />,
}));

vi.mock('@/components/layout/blocks/FieldDisplayBlock', () => ({
  default: ({ field }: { field?: { name: string } }) => (
    <div data-testid="block-field_display">{field?.name}</div>
  ),
}));

vi.mock('@/components/layout/blocks/PhotoGalleryBlock', () => ({
  default: () => <div data-testid="block-photo_gallery" />,
}));

vi.mock('@/components/layout/blocks/TextLabelBlock', () => ({
  default: () => <div data-testid="block-text_label" />,
}));

vi.mock('@/components/layout/blocks/DividerBlock', () => ({
  default: () => <div data-testid="block-divider" />,
}));

vi.mock('@/components/layout/blocks/ActionButtonsBlock', () => ({
  default: () => <div data-testid="block-action_buttons" />,
}));

vi.mock('@/components/layout/blocks/MapSnippetBlock', () => ({
  default: () => <div data-testid="block-map_snippet" />,
}));

vi.mock('@/components/layout/blocks/EntityListBlock', () => ({
  default: () => <div data-testid="block-entity_list" />,
}));

vi.mock('@/components/layout/blocks/TimelineBlock', () => ({
  default: () => <div data-testid="block-timeline" />,
}));

vi.mock('@/components/layout/blocks/DescriptionBlock', () => ({
  default: ({ description }: { description: string | null }) => (
    description ? <div data-testid="block-description">{description}</div> : null
  ),
}));

vi.mock('@/components/layout/blocks/RowBlockV2', () => ({
  default: ({ children }: { children: React.ReactNode[] }) => (
    <div data-testid="block-row">{children}</div>
  ),
}));

// Mock usePermissions
const mockUserBaseRole = vi.fn(() => 'viewer');
vi.mock('@/lib/permissions/hooks', () => ({
  usePermissions: () => ({
    permissions: {},
    userBaseRole: mockUserBaseRole(),
    loading: false,
  }),
}));

import LayoutRendererV2 from '../LayoutRendererV2';

function makeBlock(type: string, id = `block-${type}`): LayoutNodeV2 {
  return {
    id,
    type: type as any,
    config: {} as any,
  };
}

function makeLayout(blocks: LayoutNodeV2[], peekBlockCount = 2): TypeLayoutV2 {
  return {
    version: 2,
    blocks,
    spacing: 'comfortable',
    peekBlockCount,
  };
}

const baseItem: ItemWithDetails = {
  id: 'item-1',
  name: 'Test Item',
  description: 'A test description',
  latitude: 40.0,
  longitude: -75.0,
  item_type_id: 'type-1',
  custom_field_values: {},
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  created_by: null,
  org_id: 'org-1',
  property_id: 'prop-1',
  item_type: {
    id: 'type-1',
    name: 'Birdhouse',
    icon: '🏠',
    color: '#green',
    sort_order: 0,
    layout: null,
    created_at: '2024-01-01T00:00:00Z',
    org_id: 'org-1',
  },
  updates: [],
  photos: [],
  custom_fields: [],
  entities: [],
};

describe('LayoutRendererV2', () => {
  it('renders blocks in order', () => {
    const layout = makeLayout([
      makeBlock('status_badge', 'b1'),
      makeBlock('text_label', 'b2'),
      makeBlock('divider', 'b3'),
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-status_badge')).toBeDefined();
    expect(screen.getByTestId('block-text_label')).toBeDefined();
    expect(screen.getByTestId('block-divider')).toBeDefined();
  });

  it('renders description block with item.description', () => {
    const layout = makeLayout([
      { id: 'desc1', type: 'description', config: { showLabel: true } },
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    const block = screen.getByTestId('block-description');
    expect(block.textContent).toBe('A test description');
  });

  it('hides blocks with insufficient permissions', () => {
    mockUserBaseRole.mockReturnValue('viewer');
    const layout = makeLayout([
      { id: 'b1', type: 'status_badge', config: {}, permissions: { requiredRole: 'admin' } } as any,
      makeBlock('divider', 'b2'),
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.queryByTestId('block-status_badge')).toBeNull();
    expect(screen.getByTestId('block-divider')).toBeDefined();
  });

  it('shows blocks when user has sufficient role', () => {
    mockUserBaseRole.mockReturnValue('admin');
    const layout = makeLayout([
      { id: 'b1', type: 'status_badge', config: {}, permissions: { requiredRole: 'editor' } } as any,
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-status_badge')).toBeDefined();
  });

  it('renders rows with children', () => {
    const layout = makeLayout([
      {
        id: 'row-1',
        type: 'row',
        gap: 'normal',
        children: [
          { id: 'b1', type: 'status_badge', config: {}, width: '1/2' as const },
          { id: 'b2', type: 'divider', config: {}, width: '1/2' as const },
        ],
      },
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-row')).toBeDefined();
    expect(screen.getByTestId('block-status_badge')).toBeDefined();
    expect(screen.getByTestId('block-divider')).toBeDefined();
  });

  it('hides entire row when row has insufficient permissions', () => {
    mockUserBaseRole.mockReturnValue('viewer');
    const layout = makeLayout([
      {
        id: 'row-1',
        type: 'row',
        gap: 'normal',
        permissions: { requiredRole: 'admin' },
        children: [
          { id: 'b1', type: 'status_badge', config: {}, width: '1/2' as const },
          { id: 'b2', type: 'divider', config: {}, width: '1/2' as const },
        ],
      },
      makeBlock('text_label', 'b3'),
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.queryByTestId('block-row')).toBeNull();
    expect(screen.queryByTestId('block-status_badge')).toBeNull();
    expect(screen.getByTestId('block-text_label')).toBeDefined();
  });

  it('limits blocks in peek state', () => {
    const layout = makeLayout(
      [
        makeBlock('status_badge', 'b1'),
        makeBlock('text_label', 'b2'),
        makeBlock('divider', 'b3'),
      ],
      2,
    );

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="bottom-sheet"
        sheetState="peek"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-status_badge')).toBeDefined();
    expect(screen.getByTestId('block-text_label')).toBeDefined();
    expect(screen.queryByTestId('block-divider')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/layout/__tests__/LayoutRendererV2.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement LayoutRendererV2.tsx**

```typescript
// src/components/layout/LayoutRendererV2.tsx

'use client';

import type { TypeLayoutV2, LayoutNodeV2, LayoutBlockV2, BlockPermissions } from '@/lib/layout/types-v2';
import { isLayoutRowV2 } from '@/lib/layout/types-v2';
import type { ItemWithDetails, CustomField } from '@/lib/types';
import { SPACING } from '@/lib/layout/spacing';
import { usePermissions } from '@/lib/permissions/hooks';
import { ROLE_LEVELS } from '@/lib/permissions/resolve';
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
import DescriptionBlock from './blocks/DescriptionBlock';
import RowBlockV2 from './blocks/RowBlockV2';
import type { EntityDisplay } from './blocks/EntityListBlock';
import type {
  FieldDisplayConfig,
  PhotoGalleryConfig,
  TextLabelConfig,
  EntityListConfig,
  TimelineConfig,
} from '@/lib/layout/types';
import type { DescriptionConfig } from '@/lib/layout/types-v2';

export interface LayoutRendererV2Props {
  layout: TypeLayoutV2;
  item: ItemWithDetails;
  mode: 'live' | 'preview';
  context: 'bottom-sheet' | 'side-panel' | 'preview';
  sheetState?: 'peek' | 'half' | 'full';
  customFields: CustomField[];
  canEdit?: boolean;
  canAddUpdate?: boolean;
  isAuthenticated?: boolean;
}

function hasAccess(userBaseRole: string, permissions?: BlockPermissions): boolean {
  if (!permissions?.requiredRole) return true;
  const userLevel = ROLE_LEVELS[userBaseRole] ?? 0;
  const requiredLevel = ROLE_LEVELS[permissions.requiredRole] ?? 0;
  return userLevel >= requiredLevel;
}

function renderBlockContent(
  block: LayoutBlockV2,
  index: number,
  props: LayoutRendererV2Props,
): React.ReactNode {
  const { item, mode, context, customFields } = props;

  switch (block.type) {
    case 'status_badge':
      return <StatusBadgeBlock status={item.status} />;

    case 'field_display': {
      const config = block.config as FieldDisplayConfig;
      const field = customFields.find((f) => f.id === config.fieldId);
      const value = item.custom_field_values[config.fieldId];
      return <FieldDisplayBlock config={config} field={field} value={value} />;
    }

    case 'photo_gallery': {
      const config = block.config as PhotoGalleryConfig;
      const isEdgeToEdge =
        context === 'bottom-sheet' && config.style === 'hero' && index <= 1;
      return (
        <PhotoGalleryBlock
          config={config}
          photos={item.photos}
          isEdgeToEdge={isEdgeToEdge}
        />
      );
    }

    case 'text_label': {
      const config = block.config as TextLabelConfig;
      return <TextLabelBlock config={config} />;
    }

    case 'divider':
      return <DividerBlock />;

    case 'action_buttons':
      return (
        <ActionButtonsBlock
          itemId={item.id}
          canEdit={props.canEdit ?? false}
          canAddUpdate={props.canAddUpdate ?? false}
          isAuthenticated={props.isAuthenticated ?? false}
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

    case 'entity_list': {
      const config = block.config as EntityListConfig;
      const entities: EntityDisplay[] = item.entities.map((e) => ({
        id: e.id,
        name: e.name,
        entity_type: {
          id: e.entity_type.id,
          name: e.entity_type.name,
          icon: e.entity_type.icon,
        },
      }));
      return <EntityListBlock config={config} entities={entities} />;
    }

    case 'timeline': {
      const config = block.config as TimelineConfig;
      const updates = item.updates.map((u) => ({
        id: u.id,
        item_id: u.item_id,
        update_type_id: u.update_type_id,
        content: u.content,
        update_date: u.update_date,
        created_at: u.created_at,
        created_by: u.created_by,
        org_id: u.org_id,
        property_id: u.property_id,
        custom_field_values: u.custom_field_values,
      }));
      return <TimelineBlock config={config} updates={updates} />;
    }

    case 'description': {
      const config = block.config as DescriptionConfig;
      return <DescriptionBlock config={config} description={item.description} />;
    }

    default:
      return null;
  }
}

function RenderBlock({
  node,
  index,
  props,
  userBaseRole,
}: {
  node: LayoutNodeV2;
  index: number;
  props: LayoutRendererV2Props;
  userBaseRole: string;
}): React.ReactNode {
  const { item } = props;

  if (isLayoutRowV2(node)) {
    if (!hasAccess(userBaseRole, node.permissions)) return null;

    const children = node.children
      .filter((child) => hasAccess(userBaseRole, child.permissions))
      .map((child, childIndex) => {
        if (child.hideWhenEmpty && child.type === 'field_display') {
          const config = child.config as FieldDisplayConfig;
          const value = item.custom_field_values[config.fieldId];
          if (value === null || value === undefined) return null;
        }
        if (child.hideWhenEmpty && child.type === 'description') {
          if (!item.description) return null;
        }
        const rendered = renderBlockContent(child, childIndex, props);
        if (rendered === null) return null;
        return (
          <BlockErrorBoundary key={child.id} blockType={child.type}>
            {rendered}
          </BlockErrorBoundary>
        );
      })
      .filter(Boolean);

    if (children.length === 0) return null;

    return (
      <BlockErrorBoundary key={node.id} blockType="row">
        <RowBlockV2 row={node}>{children as React.ReactNode[]}</RowBlockV2>
      </BlockErrorBoundary>
    );
  }

  const block = node as LayoutBlockV2;

  if (!hasAccess(userBaseRole, block.permissions)) return null;

  if (block.hideWhenEmpty) {
    if (block.type === 'field_display') {
      const config = block.config as FieldDisplayConfig;
      const value = item.custom_field_values[config.fieldId];
      if (value === null || value === undefined) return null;
    }
    if (block.type === 'description') {
      if (!item.description) return null;
    }
  }

  const rendered = renderBlockContent(block, index, props);
  if (rendered === null) return null;

  return (
    <BlockErrorBoundary key={block.id} blockType={block.type}>
      {rendered}
    </BlockErrorBoundary>
  );
}

export default function LayoutRendererV2(props: LayoutRendererV2Props) {
  const { layout, sheetState, context } = props;
  const { userBaseRole } = usePermissions();
  const spacing = SPACING[layout.spacing];

  const isPeek = sheetState === 'peek' && context === 'bottom-sheet';
  const nodes = isPeek
    ? layout.blocks.slice(0, layout.peekBlockCount)
    : layout.blocks;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.blockGap }}>
      {nodes.map((node, index) => (
        <RenderBlock
          key={node.id}
          node={node}
          index={index}
          props={props}
          userBaseRole={userBaseRole}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/layout/__tests__/LayoutRendererV2.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/LayoutRendererV2.tsx src/components/layout/__tests__/LayoutRendererV2.test.tsx
git commit -m "feat: add LayoutRendererV2 with permissions filtering and description support"
```

---

### Task 8: LayoutRendererDispatch

**Files:**
- Create: `src/components/layout/LayoutRendererDispatch.tsx`
- Create: `src/components/layout/__tests__/LayoutRendererDispatch.test.tsx`
- Modify: `src/components/item/DetailPanel.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/components/layout/__tests__/LayoutRendererDispatch.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/layout/LayoutRenderer', () => ({
  default: () => <div data-testid="v1-renderer" />,
}));

vi.mock('@/components/layout/LayoutRendererV2', () => ({
  default: () => <div data-testid="v2-renderer" />,
}));

import LayoutRendererDispatch from '../LayoutRendererDispatch';

const baseProps = {
  item: {
    id: 'item-1', name: 'Test', description: null, latitude: 0, longitude: 0,
    item_type_id: 't1', custom_field_values: {}, status: 'active',
    created_at: '', updated_at: '', created_by: null, org_id: 'o1', property_id: 'p1',
    item_type: { id: 't1', name: 'T', icon: '', color: '', sort_order: 0, layout: null, created_at: '', org_id: 'o1' },
    updates: [], photos: [], custom_fields: [], entities: [],
  },
  mode: 'live' as const,
  context: 'side-panel' as const,
  customFields: [],
};

describe('LayoutRendererDispatch', () => {
  it('renders v1 renderer for version 1 layouts', () => {
    const layout = { version: 1 as const, blocks: [], spacing: 'comfortable' as const, peekBlockCount: 2 };
    render(<LayoutRendererDispatch layout={layout} {...baseProps} />);
    expect(screen.getByTestId('v1-renderer')).toBeDefined();
    expect(screen.queryByTestId('v2-renderer')).toBeNull();
  });

  it('renders v2 renderer for version 2 layouts', () => {
    const layout = { version: 2 as const, blocks: [], spacing: 'comfortable' as const, peekBlockCount: 2 };
    render(<LayoutRendererDispatch layout={layout} {...baseProps} />);
    expect(screen.getByTestId('v2-renderer')).toBeDefined();
    expect(screen.queryByTestId('v1-renderer')).toBeNull();
  });

  it('defaults to v1 renderer when version is missing', () => {
    const layout = { blocks: [], spacing: 'comfortable' as const, peekBlockCount: 2 } as any;
    render(<LayoutRendererDispatch layout={layout} {...baseProps} />);
    expect(screen.getByTestId('v1-renderer')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/layout/__tests__/LayoutRendererDispatch.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement LayoutRendererDispatch.tsx**

```typescript
// src/components/layout/LayoutRendererDispatch.tsx

'use client';

import type { TypeLayout } from '@/lib/layout/types';
import type { TypeLayoutV2 } from '@/lib/layout/types-v2';
import type { ItemWithDetails, CustomField } from '@/lib/types';
import LayoutRenderer from './LayoutRenderer';
import LayoutRendererV2 from './LayoutRendererV2';

interface Props {
  layout: TypeLayout | TypeLayoutV2;
  item: ItemWithDetails;
  mode: 'live' | 'preview';
  context: 'bottom-sheet' | 'side-panel' | 'preview';
  sheetState?: 'peek' | 'half' | 'full';
  customFields: CustomField[];
  canEdit?: boolean;
  canAddUpdate?: boolean;
  isAuthenticated?: boolean;
}

export default function LayoutRendererDispatch({ layout, ...rest }: Props) {
  if (layout.version === 2) {
    return <LayoutRendererV2 layout={layout as TypeLayoutV2} {...rest} />;
  }
  return <LayoutRenderer layout={layout as TypeLayout} {...rest} />;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/layout/__tests__/LayoutRendererDispatch.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Update DetailPanel.tsx to use LayoutRendererDispatch**

In `src/components/item/DetailPanel.tsx`, replace:
```typescript
import LayoutRenderer from '@/components/layout/LayoutRenderer';
```
with:
```typescript
import LayoutRendererDispatch from '@/components/layout/LayoutRendererDispatch';
```

And replace the `<LayoutRenderer` usage (line 75) with `<LayoutRendererDispatch`.

- [ ] **Step 6: Update DetailPreview.tsx to use LayoutRendererDispatch**

In `src/components/layout/preview/DetailPreview.tsx`, replace:
```typescript
import type { TypeLayout } from '@/lib/layout/types';
import LayoutRenderer from '../LayoutRenderer';
```
with:
```typescript
import type { TypeLayout } from '@/lib/layout/types';
import type { TypeLayoutV2 } from '@/lib/layout/types-v2';
import LayoutRendererDispatch from '../LayoutRendererDispatch';
```

Update the Props interface:
```typescript
interface Props {
  layout: TypeLayout | TypeLayoutV2;
  // ... rest unchanged
}
```

Replace `<LayoutRenderer` with `<LayoutRendererDispatch`.

- [ ] **Step 7: Run all existing tests to verify no breakage**

Run: `npm test -- --run`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/layout/LayoutRendererDispatch.tsx src/components/layout/__tests__/LayoutRendererDispatch.test.tsx src/components/item/DetailPanel.tsx src/components/layout/preview/DetailPreview.tsx
git commit -m "feat: add LayoutRendererDispatch and wire up consumers"
```

---

### Task 9: Server Action Update

**Files:**
- Modify: `src/app/admin/properties/[slug]/types/layout-actions.ts`

- [ ] **Step 1: Update layout-actions.ts to accept both v1 and v2 layouts**

In `src/app/admin/properties/[slug]/types/layout-actions.ts`, update imports:

```typescript
import { typeLayoutSchema } from '@/lib/layout/schemas';
import { typeLayoutV2Schema } from '@/lib/layout/schemas-v2';
import type { TypeLayout } from '@/lib/layout/types';
import type { TypeLayoutV2 } from '@/lib/layout/types-v2';
```

Update the `SaveTypeWithLayoutInput` interface:

```typescript
interface SaveTypeWithLayoutInput {
  itemTypeId: string;
  layout: TypeLayout | TypeLayoutV2;
  newFields: NewField[];
}
```

Update the validation logic in `saveTypeWithLayout`:

Replace the single validation line:
```typescript
const parsed = typeLayoutSchema.safeParse(input.layout);
```
with:
```typescript
const isV2 = (input.layout as any).version === 2;
const parsed = isV2
  ? typeLayoutV2Schema.safeParse(input.layout)
  : typeLayoutSchema.safeParse(input.layout);
```

- [ ] **Step 2: Run existing layout-actions tests**

Run: `npm test -- --run src/app/admin/properties/[slug]/types/__tests__/layout-actions.test.ts`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/properties/[slug]/types/layout-actions.ts
git commit -m "feat: update saveTypeWithLayout to accept v2 layouts"
```

---

### Task 10: Builder UI Components (WidthPicker, PermissionsConfig)

**Files:**
- Create: `src/components/layout/builder/WidthPicker.tsx`
- Create: `src/components/layout/builder/PermissionsConfig.tsx`

- [ ] **Step 1: Create WidthPicker.tsx**

```typescript
// src/components/layout/builder/WidthPicker.tsx

'use client';

import type { FractionalWidth } from '@/lib/layout/types-v2';

interface Props {
  value: FractionalWidth | undefined;
  onChange: (width: FractionalWidth) => void;
}

const OPTIONS: { value: FractionalWidth; label: string }[] = [
  { value: '1/4', label: '1/4' },
  { value: '1/3', label: '1/3' },
  { value: '1/2', label: '1/2' },
  { value: '2/3', label: '2/3' },
  { value: '3/4', label: '3/4' },
];

export default function WidthPicker({ value, onChange }: Props) {
  return (
    <div>
      <label className="label">Width</label>
      <div className="flex gap-1">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              value === opt.value ? 'bg-forest text-white' : 'bg-white border border-sage-light'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create PermissionsConfig.tsx**

```typescript
// src/components/layout/builder/PermissionsConfig.tsx

'use client';

import { useState } from 'react';
import type { BlockPermissions } from '@/lib/layout/types-v2';

interface Props {
  value: BlockPermissions | undefined;
  onChange: (permissions: BlockPermissions | undefined) => void;
}

const ROLE_OPTIONS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: 'Everyone' },
  { value: 'editor', label: 'Editors & Admins' },
  { value: 'admin', label: 'Admins only' },
];

export default function PermissionsConfig({ value, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const currentRole = value?.requiredRole;

  return (
    <div className="border-t border-sage-light/50 pt-2 mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs font-medium text-sage flex items-center gap-1 w-full"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
        Visibility{currentRole ? ` (${currentRole === 'editor' ? 'Editors & Admins' : 'Admins only'})` : ''}
      </button>
      {expanded && (
        <div className="mt-2">
          <select
            value={currentRole ?? ''}
            onChange={(e) => {
              const role = e.target.value || undefined;
              onChange(role ? { requiredRole: role as 'viewer' | 'editor' | 'admin' } : undefined);
            }}
            className="input-field text-sm"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ''}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/builder/WidthPicker.tsx src/components/layout/builder/PermissionsConfig.tsx
git commit -m "feat: add WidthPicker and PermissionsConfig builder components"
```

---

### Task 11: BlockPaletteV2 and BlockConfigPanelV2

**Files:**
- Create: `src/components/layout/builder/BlockPaletteV2.tsx`
- Create: `src/components/layout/builder/BlockConfigPanelV2.tsx`

- [ ] **Step 1: Create BlockPaletteV2.tsx**

```typescript
// src/components/layout/builder/BlockPaletteV2.tsx

'use client';

import { useDraggable } from '@dnd-kit/core';
import type { BlockTypeV2 } from '@/lib/layout/types-v2';

interface PaletteItem {
  type: BlockTypeV2 | 'row';
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
  { type: 'description', icon: '📝', label: 'Description' },
  { type: 'divider', icon: '➖', label: 'Divider' },
  { type: 'map_snippet', icon: '📍', label: 'Map' },
  { type: 'action_buttons', icon: '🔘', label: 'Actions' },
  { type: 'row', icon: '⬜', label: 'Row' },
];

function PaletteChip({ item, disabled }: { item: PaletteItem; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { type: item.type, source: 'palette' },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Drag to add ${item.label}`}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full border border-sage-light bg-white text-sm font-medium text-forest-dark transition-colors min-h-[44px] select-none ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-sage-light/50 cursor-grab active:cursor-grabbing touch-none'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
    </div>
  );
}

interface Props {
  disabledTypes?: Set<string>;
}

export default function BlockPaletteV2({ disabledTypes }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
      {PALETTE_ITEMS.map((item) => (
        <PaletteChip
          key={item.type}
          item={item}
          disabled={disabledTypes?.has(item.type) ?? false}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create BlockConfigPanelV2.tsx**

```typescript
// src/components/layout/builder/BlockConfigPanelV2.tsx

'use client';

import type { LayoutBlockV2, BlockConfigV2, FractionalWidth, BlockPermissions, DescriptionConfig } from '@/lib/layout/types-v2';
import type { FieldDisplayConfig, PhotoGalleryConfig, TimelineConfig, TextLabelConfig, EntityListConfig } from '@/lib/layout/types';
import type { CustomField, EntityType } from '@/lib/types';
import InlineFieldCreator from './InlineFieldCreator';
import WidthPicker from './WidthPicker';
import PermissionsConfig from './PermissionsConfig';
import { useState } from 'react';

interface Props {
  block: LayoutBlockV2;
  customFields: CustomField[];
  entityTypes: EntityType[];
  isInRow: boolean;
  onConfigChange: (blockId: string, config: BlockConfigV2) => void;
  onWidthChange?: (blockId: string, width: FractionalWidth) => void;
  onPermissionsChange: (blockId: string, permissions: BlockPermissions | undefined) => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
}

export default function BlockConfigPanelV2({
  block, customFields, entityTypes, isInRow,
  onConfigChange, onWidthChange, onPermissionsChange, onCreateField,
}: Props) {
  const [showFieldCreator, setShowFieldCreator] = useState(false);

  function renderTypeConfig() {
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
                onCreateField={(field) => { onCreateField(field); setShowFieldCreator(false); }}
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
                type="range" min={1} max={20} value={config.maxPhotos}
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
              <input type="checkbox" checked={config.showUpdates}
                onChange={(e) => onConfigChange(block.id, { ...config, showUpdates: e.target.checked })}
                className="rounded" />
              <span className="text-sm">Show updates</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={config.showScheduled}
                onChange={(e) => onConfigChange(block.id, { ...config, showScheduled: e.target.checked })}
                className="rounded" />
              <span className="text-sm">Show scheduled</span>
            </label>
            <div>
              <label className="label">Max items: {config.maxItems}</label>
              <input type="range" min={1} max={50} value={config.maxItems}
                onChange={(e) => onConfigChange(block.id, { ...config, maxItems: Number(e.target.value) })}
                className="w-full" />
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
              <input type="text" value={config.text}
                onChange={(e) => onConfigChange(block.id, { ...config, text: e.target.value })}
                className="input-field" />
            </div>
            <div>
              <label className="label">Style</label>
              <div className="flex gap-1">
                {(['heading', 'subheading', 'body', 'caption'] as const).map((s) => (
                  <button key={s}
                    onClick={() => onConfigChange(block.id, { ...config, style: s })}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      config.style === s ? 'bg-forest text-white' : 'bg-white border border-sage-light'
                    }`}>
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
                <input type="checkbox"
                  checked={config.entityTypeIds.length === 0 || config.entityTypeIds.includes(et.id)}
                  onChange={(e) => {
                    const ids = config.entityTypeIds.length === 0
                      ? entityTypes.map((t) => t.id).filter((id) => id !== et.id || e.target.checked)
                      : e.target.checked
                        ? [...config.entityTypeIds, et.id]
                        : config.entityTypeIds.filter((id) => id !== et.id);
                    onConfigChange(block.id, { ...config, entityTypeIds: ids });
                  }}
                  className="rounded" />
                <span className="text-sm">{et.icon} {et.name}</span>
              </label>
            ))}
          </div>
        );
      }

      case 'description': {
        const config = block.config as DescriptionConfig;
        return (
          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={config.showLabel}
                onChange={(e) => onConfigChange(block.id, { ...config, showLabel: e.target.checked })}
                className="rounded" />
              <span className="text-sm text-forest-dark">Show label</span>
            </label>
            <div>
              <label className="label">Max lines{config.maxLines ? `: ${config.maxLines}` : ' (unlimited)'}</label>
              <input type="range" min={0} max={20} value={config.maxLines ?? 0}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onConfigChange(block.id, { ...config, maxLines: val === 0 ? undefined : val });
                }}
                className="w-full" />
            </div>
          </div>
        );
      }

      default:
        return <p className="text-xs text-sage italic pt-2">No configuration needed</p>;
    }
  }

  return (
    <div>
      {renderTypeConfig()}
      {isInRow && onWidthChange && (
        <div className="mt-3">
          <WidthPicker
            value={block.width}
            onChange={(w) => onWidthChange(block.id, w)}
          />
        </div>
      )}
      <PermissionsConfig
        value={block.permissions}
        onChange={(p) => onPermissionsChange(block.id, p)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/builder/BlockPaletteV2.tsx src/components/layout/builder/BlockConfigPanelV2.tsx
git commit -m "feat: add BlockPaletteV2 and BlockConfigPanelV2 with width and permissions"
```

---

### Task 12: LayoutBuilderV2

**Files:**
- Create: `src/components/layout/builder/LayoutBuilderV2.tsx`
- Modify: `src/components/layout/builder/DragOverlayContent.tsx`

This is the largest task. LayoutBuilderV2 is based on LayoutBuilder but works with v2 types, uses BlockPaletteV2/BlockConfigPanelV2, and migrates v1 layouts on load.

- [ ] **Step 1: Update DragOverlayContent.tsx to accept both v1 and v2 nodes**

In `src/components/layout/builder/DragOverlayContent.tsx`, update:

```typescript
'use client';

import { useMemo } from 'react';
import type { LayoutNode, TypeLayout } from '@/lib/layout/types';
import type { LayoutNodeV2, TypeLayoutV2 } from '@/lib/layout/types-v2';
import type { CustomField, ItemWithDetails } from '@/lib/types';
import LayoutRendererDispatch from '../LayoutRendererDispatch';

interface Props {
  node: LayoutNode | LayoutNodeV2;
  customFields: CustomField[];
  mockItem: ItemWithDetails;
  version?: 1 | 2;
}

export default function DragOverlayContent({ node, customFields, mockItem, version = 1 }: Props) {
  const overlayLayout = useMemo(() => {
    if (version === 2) {
      return {
        version: 2 as const,
        blocks: [node as LayoutNodeV2],
        spacing: 'comfortable' as const,
        peekBlockCount: 1,
      };
    }
    return {
      version: 1 as const,
      blocks: [node as LayoutNode],
      spacing: 'comfortable' as const,
      peekBlockCount: 1,
    };
  }, [node, version]);

  return (
    <div
      style={{ opacity: 0.7, pointerEvents: 'none' }}
      className="bg-white rounded-xl shadow-lg p-4 max-w-md"
    >
      <LayoutRendererDispatch
        layout={overlayLayout}
        item={mockItem}
        mode="preview"
        context="preview"
        customFields={customFields}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create LayoutBuilderV2.tsx**

This follows the same structure as `LayoutBuilder.tsx` but uses v2 types throughout. Key differences:
- State is `TypeLayoutV2` instead of `TypeLayout`
- Uses `migrateV1toV2()` when `initialLayout` is v1
- Uses `generateDefaultLayoutV2()` for null layouts
- Uses `BlockPaletteV2` with `disabledTypes` for description singleton
- Uses `BlockConfigPanelV2` with `isInRow`, `onWidthChange`, `onPermissionsChange`
- `createBlock()` creates `LayoutBlockV2` (includes `description` type)
- `createRow()` creates `LayoutRowV2` (no `distribution`)
- Row config UI shows only `gap` (no distribution)
- `onSave` passes `TypeLayoutV2`

```typescript
// src/components/layout/builder/LayoutBuilderV2.tsx

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { nanoid } from 'nanoid';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { TypeLayoutV2, LayoutNodeV2, LayoutBlockV2, LayoutRowV2, BlockTypeV2, BlockConfigV2, FractionalWidth, BlockPermissions } from '@/lib/layout/types-v2';
import { isLayoutRowV2 } from '@/lib/layout/types-v2';
import type { TypeLayout } from '@/lib/layout/types';
import type { CustomField, EntityType, ItemType } from '@/lib/types';
import { generateDefaultLayoutV2 } from '@/lib/layout/defaults-v2';
import { migrateV1toV2 } from '@/lib/layout/migration';
import { generateMockItem } from '@/lib/layout/mock-data';
import BlockPaletteV2 from './BlockPaletteV2';
import BlockList from './BlockList';
import SpacingPicker from './SpacingPicker';
import LayoutRendererDispatch from '../LayoutRendererDispatch';
import FormPreview from '../preview/FormPreview';
import DragOverlayContent from './DragOverlayContent';
import { rowAwareCollision } from './collision';

interface Props {
  itemType: ItemType;
  initialLayout: TypeLayout | TypeLayoutV2 | null;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onSave: (layout: TypeLayoutV2, newFields: { name: string; field_type: string; options: string[]; required: boolean }[]) => Promise<void>;
  onCancel: () => void;
}

type PreviewTab = 'detail' | 'form';

function getDefaultConfig(type: BlockTypeV2): BlockConfigV2 {
  switch (type) {
    case 'field_display': return { fieldId: '', size: 'normal' as const, showLabel: true };
    case 'photo_gallery': return { style: 'hero' as const, maxPhotos: 4 };
    case 'timeline': return { showUpdates: true, showScheduled: false, maxItems: 5 };
    case 'text_label': return { text: 'Section Title', style: 'heading' as const };
    case 'entity_list': return { entityTypeIds: [] };
    case 'description': return { showLabel: true };
    default: return {};
  }
}

function createBlock(type: BlockTypeV2): LayoutBlockV2 {
  return { id: nanoid(10), type, config: getDefaultConfig(type) };
}

function createRow(): LayoutRowV2 {
  return {
    id: nanoid(10),
    type: 'row',
    children: [
      { id: nanoid(10), type: 'status_badge', config: {}, width: '1/2' },
      { id: nanoid(10), type: 'status_badge', config: {}, width: '1/2' },
    ],
    gap: 'normal',
  };
}

function resolveInitialLayout(
  initial: TypeLayout | TypeLayoutV2 | null,
  customFields: CustomField[],
): TypeLayoutV2 {
  if (!initial) return generateDefaultLayoutV2(customFields);
  if (initial.version === 2) return initial as TypeLayoutV2;
  return migrateV1toV2(initial as TypeLayout);
}

function findNode(nodes: LayoutNodeV2[], id: string): LayoutNodeV2 | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (isLayoutRowV2(node)) {
      const child = node.children.find((c) => c.id === id);
      if (child) return child;
    }
  }
  return null;
}

function hasDescriptionBlock(nodes: LayoutNodeV2[]): boolean {
  for (const node of nodes) {
    if (node.type === 'description') return true;
    if (isLayoutRowV2(node)) {
      if (node.children.some((c) => c.type === 'description')) return true;
    }
  }
  return false;
}

export default function LayoutBuilderV2({ itemType, initialLayout, customFields, entityTypes, onSave, onCancel }: Props) {
  const [layout, setLayout] = useState<TypeLayoutV2>(
    () => resolveInitialLayout(initialLayout, customFields),
  );
  const [pendingFields, setPendingFields] = useState<{ name: string; field_type: string; options: string[]; required: boolean; tempId: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<'build' | 'detail' | 'form'>('build');
  const [previewTab, setPreviewTab] = useState<PreviewTab>('detail');
  const [activeNode, setActiveNode] = useState<LayoutNodeV2 | null>(null);
  const [activeType, setActiveType] = useState<'block' | 'row' | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const allFields = useMemo(() => {
    const pending: CustomField[] = pendingFields.map((pf, i) => ({
      id: pf.tempId,
      item_type_id: itemType.id,
      name: pf.name,
      field_type: pf.field_type,
      options: pf.options.length > 0 ? pf.options : null,
      required: pf.required,
      sort_order: customFields.length + i,
      org_id: itemType.org_id,
    }));
    return [...customFields, ...pending];
  }, [customFields, pendingFields, itemType]);

  const mockItem = useMemo(() => generateMockItem(itemType, allFields), [itemType, allFields]);

  const disabledTypes = useMemo(() => {
    const set = new Set<string>();
    if (hasDescriptionBlock(layout.blocks)) set.add('description');
    return set;
  }, [layout.blocks]);

  // --- Handlers (same structure as v1 LayoutBuilder, adapted for v2 types) ---
  // Note for implementer: Port the handleDragStart, handleDragEnd, handleDrop,
  // handleReorder, handleConfigChange, handleDeleteBlock, handleCreateField,
  // handlePeekCountChange, handleSpacingChange, handleRowChange,
  // handleRemoveFromRow handlers from LayoutBuilder.tsx.
  //
  // Key differences:
  // - Use LayoutBlockV2/LayoutRowV2/LayoutNodeV2 types
  // - createBlock() and createRow() use v2 versions above
  // - Add handleWidthChange and handlePermissionsChange:

  const handleWidthChange = useCallback((blockId: string, width: FractionalWidth) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) => {
        if (isLayoutRowV2(node)) {
          return {
            ...node,
            children: node.children.map((child) =>
              child.id === blockId ? { ...child, width } : child
            ),
          };
        }
        return node;
      }),
    }));
  }, []);

  const handlePermissionsChange = useCallback((nodeId: string, permissions: BlockPermissions | undefined) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) => {
        if (node.id === nodeId) {
          if (isLayoutRowV2(node)) {
            return permissions ? { ...node, permissions } : (() => { const { permissions: _, ...rest } = node; return rest as LayoutRowV2; })();
          }
          return permissions ? { ...node, permissions } : (() => { const { permissions: _, ...rest } = node as LayoutBlockV2; return rest as LayoutBlockV2; })();
        }
        if (isLayoutRowV2(node)) {
          return {
            ...node,
            children: node.children.map((child) =>
              child.id === nodeId
                ? permissions ? { ...child, permissions } : (() => { const { permissions: _, ...rest } = child; return rest as LayoutBlockV2; })()
                : child
            ),
          };
        }
        return node;
      }),
    }));
  }, []);

  // Port remaining handlers from LayoutBuilder.tsx with v2 type adaptations.
  // The JSX structure mirrors LayoutBuilder.tsx with these substitutions:
  // - BlockPalette → BlockPaletteV2 with disabledTypes prop
  // - BlockConfigPanel → BlockConfigPanelV2 with isInRow, onWidthChange, onPermissionsChange
  // - LayoutRenderer → LayoutRendererDispatch
  // - DragOverlayContent gets version={2}
  // - Row config UI: remove distribution selector, keep only gap

  // ... (full handler porting from LayoutBuilder.tsx)

  return null; // Placeholder — full JSX follows the LayoutBuilder pattern
}
```

**Important for implementer:** The full `LayoutBuilderV2.tsx` implementation should:
1. Copy the handler logic from `LayoutBuilder.tsx` (lines 80-486)
2. Replace all v1 type references with v2 equivalents
3. Replace `BlockPalette` with `BlockPaletteV2` passing `disabledTypes`
4. Replace `BlockConfigPanel` with `BlockConfigPanelV2` passing `isInRow`, `onWidthChange`, `onPermissionsChange`
5. Replace `LayoutRenderer` in preview with `LayoutRendererDispatch`
6. Pass `version={2}` to `DragOverlayContent`
7. Remove distribution config from row editing UI
8. Add `handleWidthChange` and `handlePermissionsChange` (shown above)

- [ ] **Step 3: Run full test suite**

Run: `npm test -- --run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/builder/LayoutBuilderV2.tsx src/components/layout/builder/DragOverlayContent.tsx
git commit -m "feat: add LayoutBuilderV2 with v2 type support and migration on load"
```

---

### Task 13: Wire Up LayoutBuilderV2 in Admin Pages

**Files:**
- Modify: `src/app/admin/properties/[slug]/types/page.tsx`
- Modify: `src/app/org/types/page.tsx`

- [ ] **Step 1: Update admin properties types page**

In `src/app/admin/properties/[slug]/types/page.tsx`, replace:
```typescript
import LayoutBuilder from '@/components/layout/builder/LayoutBuilder';
```
with:
```typescript
import LayoutBuilderV2 from '@/components/layout/builder/LayoutBuilderV2';
```

Replace all `<LayoutBuilder` usages with `<LayoutBuilderV2`.

- [ ] **Step 2: Update org types page**

In `src/app/org/types/page.tsx`, replace:
```typescript
const LayoutBuilder = dynamic(() => import('@/components/layout/builder/LayoutBuilder'), { ssr: false });
```
with:
```typescript
const LayoutBuilderV2 = dynamic(() => import('@/components/layout/builder/LayoutBuilderV2'), { ssr: false });
```

Replace all `<LayoutBuilder` usages with `<LayoutBuilderV2`.

- [ ] **Step 3: Run full test suite**

Run: `npm test -- --run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/properties/[slug]/types/page.tsx src/app/org/types/page.tsx
git commit -m "feat: wire up LayoutBuilderV2 in admin pages"
```

---

### Task 14: Full Test Suite Verification and Type Check

- [ ] **Step 1: Run all tests**

Run: `npm test -- --run`
Expected: All tests PASS (944+ tests, 0 failures)

- [ ] **Step 2: Run TypeScript type check**

Run: `npm run type-check`
Expected: No errors

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Fix any failures found in steps 1-3**

Address issues if any arise.

- [ ] **Step 5: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve type errors and test failures from v2 layout integration"
```
