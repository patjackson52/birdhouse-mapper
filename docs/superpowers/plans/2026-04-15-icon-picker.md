# Icon Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace plain-text emoji inputs on entity type and item type forms with a shared icon picker component that supports Lucide, Heroicons, and curated emojis.

**Architecture:** Extract the existing Puck icon picker into a shared component at `src/components/shared/IconPicker/`. Add an `'emoji'` set with a curated conservation-themed catalog. Migrate `item_types.icon` and `entity_types.icon` from `text` to `jsonb`. Update ~30 rendering call sites to use `IconRenderer`. Puck's picker becomes a thin wrapper.

**Tech Stack:** Next.js 14, React, TypeScript, Supabase (PostgreSQL), Tailwind CSS, lucide-react, @heroicons/react

---

## File Map

**New files:**
- `src/components/shared/IconPicker/index.ts` — public exports
- `src/components/shared/IconPicker/IconPicker.tsx` — main picker component (admin-styled)
- `src/components/shared/IconPicker/IconRenderer.tsx` — renders any IconValue (lucide, heroicons, emoji)
- `src/components/shared/IconPicker/icon-catalog.ts` — search/browse across all three icon sets
- `src/components/shared/IconPicker/emoji-catalog.ts` — curated emoji collection
- `src/components/shared/IconPicker/__tests__/IconRenderer.test.tsx` — IconRenderer tests
- `src/components/shared/IconPicker/__tests__/IconPicker.test.tsx` — IconPicker tests
- `src/components/shared/IconPicker/__tests__/icon-catalog.test.ts` — catalog tests
- `supabase/migrations/042_icon_jsonb.sql` — migration

**Modified files:**
- `src/lib/types.ts` — add `IconValue`, change `ItemType.icon` and `EntityType.icon` types
- `src/lib/puck/fields/link-utils.ts` — remove `IconValue` (keep `LinkValue` and `resolveLink`)
- `src/lib/puck/fields/index.tsx` — re-export `IconValue` from shared, update `IconPickerField` import
- `src/lib/puck/fields/IconPickerField.tsx` — thin wrapper around shared `IconPicker`
- `src/lib/puck/icons/IconRenderer.tsx` — re-export from shared location
- `src/lib/puck/icons/icon-catalog.ts` — re-export from shared location
- `src/lib/puck/types.ts` — import `IconValue` from `@/lib/types` instead of `link-utils`
- `src/lib/puck/icons/__tests__/IconRenderer.test.tsx` — update import path
- `src/lib/puck/fields/__tests__/IconPickerField.test.tsx` — update mock paths
- `src/components/admin/EntityTypeForm.tsx` — use IconPicker
- `src/components/admin/ItemTypeEditor.tsx` — use IconPicker
- `src/components/admin/EntityCard.tsx` — use IconRenderer
- `src/components/admin/MapDisplayConfigEditor.tsx` — use IconRenderer for item types
- `src/components/admin/UpdateTypeEditor.tsx` — NO CHANGE (update_types.icon stays string)
- `src/components/item/ItemCard.tsx` — use IconRenderer
- `src/components/item/DetailPanel.tsx` — use IconRenderer
- `src/components/item/UpdateTimeline.tsx` — use IconRenderer for entity type icons only
- `src/components/manage/EditItemForm.tsx` — use `iconDisplayName` helper in option + IconRenderer in labels
- `src/components/manage/ItemForm.tsx` — use `iconDisplayName` helper in option + IconRenderer in labels
- `src/components/manage/UpdateForm.tsx` — use IconRenderer for entity type labels
- `src/components/map/ItemMarker.tsx` — use `iconToHtml` helper
- `src/components/map/QuickAddSheet.tsx` — use `iconDisplayName` helper in option
- `src/components/map/MapLegend.tsx` — use IconRenderer
- `src/components/layout/builder/BlockConfigPanel.tsx` — use IconRenderer
- `src/components/layout/builder/BlockPalette.tsx` — use IconRenderer
- `src/components/layout/builder/LayoutBuilder.tsx` — use IconRenderer
- `src/components/layout/PropertyAdminShell.tsx` — use `iconDisplayName` helper
- `src/components/layout/blocks/EntityListBlock.tsx` — use IconRenderer
- `src/app/admin/properties/[slug]/entity-types/page.tsx` — use IconRenderer
- `src/app/admin/properties/[slug]/layout.tsx` — use `iconDisplayName` helper

**Out of scope (not modified):**
- `src/components/admin/UpdateTypeEditor.tsx` — `update_types.icon` stays `string`
- `src/app/setup/page.tsx` — separate onboarding flow
- `src/app/onboard/page.tsx` — separate onboarding flow
- `src/lib/ai-context/types.ts` — separate concern

---

### Task 1: Add IconValue to shared types

**Files:**
- Modify: `src/lib/types.ts:48-57` (ItemType), `src/lib/types.ts:263-273` (EntityType)

- [ ] **Step 1: Add IconValue interface to types.ts**

Add the `IconValue` interface near the top of the file, right after the union type declarations (after line 26):

```typescript
// In src/lib/types.ts, after the union types block and before "Table interfaces"

export interface IconValue {
  set: 'lucide' | 'heroicons' | 'emoji';
  name: string;
  style?: 'outline' | 'solid';
}
```

- [ ] **Step 2: Add iconDisplayName helper**

Add a helper function at the bottom of `src/lib/types.ts` (before the `Database` interface, after the composite types section) that extracts a plain-text name for use in `<option>` elements and string contexts:

```typescript
/**
 * Returns a plain-text display string for an IconValue.
 * For emoji icons, returns the emoji character.
 * For library icons, returns the icon name in a readable format.
 */
export function iconDisplayName(icon: IconValue): string {
  if (icon.set === 'emoji') return icon.name;
  return icon.name.replace(/([A-Z])/g, ' $1').trim();
}
```

- [ ] **Step 3: Update ItemType interface**

Change `icon: string` to `icon: IconValue` in the `ItemType` interface:

```typescript
export interface ItemType {
  id: string;
  name: string;
  icon: IconValue;
  color: string;
  sort_order: number;
  layout: TypeLayout | null;
  created_at: string;
  org_id: string;
}
```

- [ ] **Step 4: Update EntityType interface**

Change `icon: string` to `icon: IconValue` in the `EntityType` interface:

```typescript
export interface EntityType {
  id: string;
  org_id: string;
  name: string;
  icon: IconValue;
  color: string;
  link_to: EntityLinkTarget[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 5: Run type-check to see all breakages**

Run: `npm run type-check 2>&1 | head -80`
Expected: Many type errors across the codebase where `string` was expected but `IconValue` is now provided. This is expected — we'll fix these in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add IconValue type to shared types, update ItemType and EntityType"
```

---

### Task 2: Create emoji catalog

**Files:**
- Create: `src/components/shared/IconPicker/emoji-catalog.ts`

- [ ] **Step 1: Create emoji-catalog.ts**

```typescript
// src/components/shared/IconPicker/emoji-catalog.ts

export interface EmojiEntry {
  emoji: string;
  name: string;
  searchTerms: string;
  category: string;
}

export interface EmojiCategory {
  name: string;
  entries: EmojiEntry[];
}

const ANIMALS: EmojiEntry[] = [
  { emoji: '🐦', name: 'Bird', searchTerms: 'bird', category: 'Animals' },
  { emoji: '🦅', name: 'Eagle', searchTerms: 'eagle bird raptor', category: 'Animals' },
  { emoji: '🦆', name: 'Duck', searchTerms: 'duck bird waterfowl', category: 'Animals' },
  { emoji: '🦉', name: 'Owl', searchTerms: 'owl bird raptor nocturnal', category: 'Animals' },
  { emoji: '🐟', name: 'Fish', searchTerms: 'fish aquatic', category: 'Animals' },
  { emoji: '🐠', name: 'Tropical Fish', searchTerms: 'tropical fish aquatic', category: 'Animals' },
  { emoji: '🦎', name: 'Lizard', searchTerms: 'lizard reptile', category: 'Animals' },
  { emoji: '🐍', name: 'Snake', searchTerms: 'snake reptile', category: 'Animals' },
  { emoji: '🐢', name: 'Turtle', searchTerms: 'turtle reptile', category: 'Animals' },
  { emoji: '🐸', name: 'Frog', searchTerms: 'frog amphibian', category: 'Animals' },
  { emoji: '🦋', name: 'Butterfly', searchTerms: 'butterfly insect', category: 'Animals' },
  { emoji: '🐝', name: 'Bee', searchTerms: 'bee honeybee insect pollinator', category: 'Animals' },
  { emoji: '🐞', name: 'Ladybug', searchTerms: 'ladybug ladybird insect beetle', category: 'Animals' },
  { emoji: '🦌', name: 'Deer', searchTerms: 'deer mammal', category: 'Animals' },
  { emoji: '🐿️', name: 'Squirrel', searchTerms: 'squirrel chipmunk mammal', category: 'Animals' },
  { emoji: '🐇', name: 'Rabbit', searchTerms: 'rabbit bunny mammal', category: 'Animals' },
  { emoji: '🦡', name: 'Badger', searchTerms: 'badger mammal', category: 'Animals' },
  { emoji: '🐻', name: 'Bear', searchTerms: 'bear mammal', category: 'Animals' },
  { emoji: '🐺', name: 'Wolf', searchTerms: 'wolf mammal canine', category: 'Animals' },
  { emoji: '🦊', name: 'Fox', searchTerms: 'fox mammal canine', category: 'Animals' },
];

const PLANTS: EmojiEntry[] = [
  { emoji: '🌲', name: 'Evergreen', searchTerms: 'evergreen tree pine conifer', category: 'Plants' },
  { emoji: '🌳', name: 'Deciduous Tree', searchTerms: 'deciduous tree oak', category: 'Plants' },
  { emoji: '🌴', name: 'Palm Tree', searchTerms: 'palm tree tropical', category: 'Plants' },
  { emoji: '🌵', name: 'Cactus', searchTerms: 'cactus desert succulent', category: 'Plants' },
  { emoji: '🌿', name: 'Herb', searchTerms: 'herb fern green plant', category: 'Plants' },
  { emoji: '🍀', name: 'Clover', searchTerms: 'clover shamrock four leaf', category: 'Plants' },
  { emoji: '🌱', name: 'Seedling', searchTerms: 'seedling sprout grow plant', category: 'Plants' },
  { emoji: '🌾', name: 'Rice', searchTerms: 'rice grain wheat crop', category: 'Plants' },
  { emoji: '🌻', name: 'Sunflower', searchTerms: 'sunflower flower', category: 'Plants' },
  { emoji: '🌺', name: 'Hibiscus', searchTerms: 'hibiscus flower tropical', category: 'Plants' },
  { emoji: '🌸', name: 'Cherry Blossom', searchTerms: 'cherry blossom flower spring', category: 'Plants' },
  { emoji: '🍄', name: 'Mushroom', searchTerms: 'mushroom fungi fungus', category: 'Plants' },
  { emoji: '🪴', name: 'Potted Plant', searchTerms: 'potted plant houseplant', category: 'Plants' },
  { emoji: '🎋', name: 'Bamboo', searchTerms: 'bamboo tanabata', category: 'Plants' },
  { emoji: '🎍', name: 'Pine Decoration', searchTerms: 'pine decoration kadomatsu', category: 'Plants' },
];

const NATURE: EmojiEntry[] = [
  { emoji: '🏔️', name: 'Mountain', searchTerms: 'mountain snow peak', category: 'Nature' },
  { emoji: '⛰️', name: 'Mountain', searchTerms: 'mountain hill', category: 'Nature' },
  { emoji: '🌊', name: 'Wave', searchTerms: 'wave ocean water sea', category: 'Nature' },
  { emoji: '💧', name: 'Droplet', searchTerms: 'droplet water rain', category: 'Nature' },
  { emoji: '🏖️', name: 'Beach', searchTerms: 'beach umbrella sand coast', category: 'Nature' },
  { emoji: '🏕️', name: 'Campsite', searchTerms: 'campsite camping tent outdoors', category: 'Nature' },
  { emoji: '🌅', name: 'Sunrise', searchTerms: 'sunrise dawn morning', category: 'Nature' },
  { emoji: '🌄', name: 'Sunrise Mountains', searchTerms: 'sunrise mountains dawn', category: 'Nature' },
  { emoji: '☀️', name: 'Sun', searchTerms: 'sun sunny weather', category: 'Nature' },
  { emoji: '🌧️', name: 'Rain', searchTerms: 'rain cloud weather', category: 'Nature' },
  { emoji: '❄️', name: 'Snowflake', searchTerms: 'snowflake snow cold winter', category: 'Nature' },
  { emoji: '🔥', name: 'Fire', searchTerms: 'fire flame burn', category: 'Nature' },
  { emoji: '🌍', name: 'Globe', searchTerms: 'globe earth world africa europe', category: 'Nature' },
  { emoji: '🗺️', name: 'Map', searchTerms: 'map world atlas', category: 'Nature' },
  { emoji: '🧭', name: 'Compass', searchTerms: 'compass navigation direction', category: 'Nature' },
];

const TOOLS: EmojiEntry[] = [
  { emoji: '🔭', name: 'Telescope', searchTerms: 'telescope astronomy observe', category: 'Tools' },
  { emoji: '📷', name: 'Camera', searchTerms: 'camera photo picture', category: 'Tools' },
  { emoji: '🔬', name: 'Microscope', searchTerms: 'microscope science lab', category: 'Tools' },
  { emoji: '🪣', name: 'Bucket', searchTerms: 'bucket pail', category: 'Tools' },
  { emoji: '🪜', name: 'Ladder', searchTerms: 'ladder climb', category: 'Tools' },
  { emoji: '🔧', name: 'Wrench', searchTerms: 'wrench spanner tool', category: 'Tools' },
  { emoji: '📋', name: 'Clipboard', searchTerms: 'clipboard checklist list', category: 'Tools' },
  { emoji: '📝', name: 'Memo', searchTerms: 'memo note pencil write', category: 'Tools' },
  { emoji: '📌', name: 'Pushpin', searchTerms: 'pushpin pin location', category: 'Tools' },
  { emoji: '📍', name: 'Pin', searchTerms: 'pin location map marker', category: 'Tools' },
  { emoji: '🏷️', name: 'Label', searchTerms: 'label tag', category: 'Tools' },
  { emoji: '🚜', name: 'Tractor', searchTerms: 'tractor farm vehicle', category: 'Tools' },
  { emoji: '🛶', name: 'Canoe', searchTerms: 'canoe kayak boat paddle', category: 'Tools' },
  { emoji: '🚙', name: 'SUV', searchTerms: 'suv car vehicle truck', category: 'Tools' },
  { emoji: '✂️', name: 'Scissors', searchTerms: 'scissors cut trim', category: 'Tools' },
];

const GENERAL: EmojiEntry[] = [
  { emoji: '⭐', name: 'Star', searchTerms: 'star favorite', category: 'General' },
  { emoji: '❤️', name: 'Heart', searchTerms: 'heart love red', category: 'General' },
  { emoji: '✅', name: 'Check', searchTerms: 'check done complete', category: 'General' },
  { emoji: '⚠️', name: 'Warning', searchTerms: 'warning alert caution', category: 'General' },
  { emoji: '🏠', name: 'House', searchTerms: 'house home building', category: 'General' },
  { emoji: '🚩', name: 'Flag', searchTerms: 'flag marker', category: 'General' },
  { emoji: '🎯', name: 'Target', searchTerms: 'target bullseye goal', category: 'General' },
  { emoji: '💡', name: 'Light Bulb', searchTerms: 'light bulb idea', category: 'General' },
  { emoji: '🔔', name: 'Bell', searchTerms: 'bell notification alert', category: 'General' },
  { emoji: '📊', name: 'Chart', searchTerms: 'chart bar graph data', category: 'General' },
  { emoji: '📁', name: 'Folder', searchTerms: 'folder file directory', category: 'General' },
  { emoji: '🗓️', name: 'Calendar', searchTerms: 'calendar date schedule', category: 'General' },
  { emoji: '👤', name: 'Person', searchTerms: 'person user silhouette', category: 'General' },
  { emoji: '👥', name: 'People', searchTerms: 'people group team users', category: 'General' },
  { emoji: '🏗️', name: 'Construction', searchTerms: 'construction building crane', category: 'General' },
];

const ALL_EMOJIS: EmojiEntry[] = [...ANIMALS, ...PLANTS, ...NATURE, ...TOOLS, ...GENERAL];

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { name: 'Animals', entries: ANIMALS },
  { name: 'Plants', entries: PLANTS },
  { name: 'Nature', entries: NATURE },
  { name: 'Tools', entries: TOOLS },
  { name: 'General', entries: GENERAL },
];

export function getAllEmojis(): EmojiEntry[] {
  return ALL_EMOJIS;
}

export function searchEmojis(query: string): EmojiEntry[] {
  const q = query.toLowerCase().trim();
  return ALL_EMOJIS.filter((e) => e.searchTerms.includes(q) || e.name.toLowerCase().includes(q));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/IconPicker/emoji-catalog.ts
git commit -m "feat: add curated emoji catalog for icon picker"
```

---

### Task 3: Create shared icon-catalog

**Files:**
- Create: `src/components/shared/IconPicker/icon-catalog.ts`
- Create: `src/components/shared/IconPicker/__tests__/icon-catalog.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/components/shared/IconPicker/__tests__/icon-catalog.test.ts
import { describe, it, expect, vi } from 'vitest';
import { searchIcons, getEmojis, type IconEntry } from '../icon-catalog';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  icons: {
    Bird: () => null,
    MapPin: () => null,
    Camera: () => null,
  },
}));

// Mock heroicons
vi.mock('@heroicons/react/24/outline', () => ({
  BirdIcon: () => null,
  MapPinIcon: () => null,
}));

describe('icon-catalog', () => {
  it('getEmojis returns entries with set=emoji', () => {
    const emojis = getEmojis();
    expect(emojis.length).toBeGreaterThan(0);
    expect(emojis.every((e) => e.set === 'emoji')).toBe(true);
  });

  it('getEmojis entries have category field', () => {
    const emojis = getEmojis();
    expect(emojis.every((e) => typeof e.category === 'string')).toBe(true);
  });

  it('searchIcons finds emojis by name', async () => {
    const results = await searchIcons('bird', 'emoji');
    expect(results.some((e) => e.name === '🐦')).toBe(true);
  });

  it('searchIcons with no set searches all', async () => {
    const results = await searchIcons('bird');
    const sets = new Set(results.map((e) => e.set));
    expect(sets.has('emoji')).toBe(true);
  });

  it('searchIcons limits to 200 results', async () => {
    const results = await searchIcons('a');
    expect(results.length).toBeLessThanOrEqual(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/components/shared/IconPicker/__tests__/icon-catalog.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create icon-catalog.ts**

```typescript
// src/components/shared/IconPicker/icon-catalog.ts
import { getAllEmojis, searchEmojis, type EmojiEntry } from './emoji-catalog';

export interface IconEntry {
  set: 'lucide' | 'heroicons' | 'emoji';
  name: string;
  searchTerms: string;
  category?: string;
}

let lucideEntries: IconEntry[] | null = null;
let heroiconEntries: IconEntry[] | null = null;

export async function getLucideIcons(): Promise<IconEntry[]> {
  if (lucideEntries) return lucideEntries;
  const { icons } = await import('lucide-react');
  lucideEntries = Object.keys(icons).map((name) => ({
    set: 'lucide' as const,
    name,
    searchTerms: name.toLowerCase().replace(/([A-Z])/g, ' $1').trim(),
  }));
  return lucideEntries;
}

export async function getHeroicons(): Promise<IconEntry[]> {
  if (heroiconEntries) return heroiconEntries;
  const outlineMod = await import('@heroicons/react/24/outline');
  heroiconEntries = Object.keys(outlineMod)
    .filter((name) => name.endsWith('Icon'))
    .map((name) => ({
      set: 'heroicons' as const,
      name: name.replace(/Icon$/, ''),
      searchTerms: name.replace(/Icon$/, '').toLowerCase().replace(/([A-Z])/g, ' $1').trim(),
    }));
  return heroiconEntries;
}

export function getEmojis(): IconEntry[] {
  return getAllEmojis().map((e) => ({
    set: 'emoji' as const,
    name: e.emoji,
    searchTerms: e.searchTerms,
    category: e.category,
  }));
}

export async function searchIcons(
  query: string,
  set?: 'lucide' | 'heroicons' | 'emoji'
): Promise<IconEntry[]> {
  const q = query.toLowerCase().trim();
  const results: IconEntry[] = [];

  if (!set || set === 'lucide') {
    const lucide = await getLucideIcons();
    results.push(...lucide.filter((e) => e.searchTerms.includes(q)));
  }
  if (!set || set === 'heroicons') {
    const heroicons = await getHeroicons();
    results.push(...heroicons.filter((e) => e.searchTerms.includes(q)));
  }
  if (!set || set === 'emoji') {
    const emojis = searchEmojis(query);
    results.push(
      ...emojis.map((e) => ({
        set: 'emoji' as const,
        name: e.emoji,
        searchTerms: e.searchTerms,
        category: e.category,
      }))
    );
  }

  return results.slice(0, 200);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run src/components/shared/IconPicker/__tests__/icon-catalog.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/IconPicker/icon-catalog.ts src/components/shared/IconPicker/__tests__/icon-catalog.test.ts
git commit -m "feat: add shared icon catalog with emoji, lucide, and heroicons support"
```

---

### Task 4: Create shared IconRenderer

**Files:**
- Create: `src/components/shared/IconPicker/IconRenderer.tsx`
- Create: `src/components/shared/IconPicker/__tests__/IconRenderer.test.tsx`

- [ ] **Step 1: Write the test**

```typescript
// src/components/shared/IconPicker/__tests__/IconRenderer.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { IconRenderer, iconToHtml } from '../IconRenderer';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  icons: {
    Bird: (props: any) => <svg data-testid="lucide-bird" {...props} />,
    MapPin: (props: any) => <svg data-testid="lucide-map-pin" {...props} />,
  },
}));

// Mock heroicons
vi.mock('@heroicons/react/24/outline', () => ({
  BirdIcon: (props: any) => <svg data-testid="hero-bird-outline" {...props} />,
}));

vi.mock('@heroicons/react/24/solid', () => ({
  BirdIcon: (props: any) => <svg data-testid="hero-bird-solid" {...props} />,
}));

describe('IconRenderer', () => {
  it('renders nothing when icon is undefined', () => {
    const { container } = render(<IconRenderer icon={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a lucide icon', async () => {
    const { container } = render(
      <IconRenderer icon={{ set: 'lucide', name: 'Bird' }} />
    );
    await waitFor(() => {
      expect(container.querySelector('[data-testid="lucide-bird"]')).not.toBeNull();
    });
  });

  it('renders an emoji icon as a span', () => {
    const { container } = render(
      <IconRenderer icon={{ set: 'emoji', name: '🐦' }} size={20} />
    );
    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe('🐦');
    expect(span?.style.fontSize).toBe('20px');
  });

  it('passes className prop', async () => {
    const { container } = render(
      <IconRenderer icon={{ set: 'lucide', name: 'Bird' }} className="text-red-500" />
    );
    await waitFor(() => {
      const svg = container.querySelector('[data-testid="lucide-bird"]');
      expect(svg?.getAttribute('class')).toContain('text-red-500');
    });
  });
});

describe('iconToHtml', () => {
  it('returns emoji character for emoji icons', async () => {
    const html = await iconToHtml({ set: 'emoji', name: '🐦' }, 14);
    expect(html).toBe('🐦');
  });

  it('returns SVG string for lucide icons', async () => {
    const html = await iconToHtml({ set: 'lucide', name: 'Bird' }, 14);
    expect(html).toContain('<svg');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/components/shared/IconPicker/__tests__/IconRenderer.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create IconRenderer.tsx**

```typescript
// src/components/shared/IconPicker/IconRenderer.tsx
'use client';

import { useState, useEffect } from 'react';
import type { IconValue } from '@/lib/types';
import type { ComponentType, SVGProps } from 'react';

interface IconRendererProps {
  icon: IconValue | undefined;
  size?: number;
  className?: string;
}

export function IconRenderer({ icon, size = 20, className }: IconRendererProps) {
  const [IconComponent, setIconComponent] = useState<ComponentType<SVGProps<SVGSVGElement>> | null>(null);

  useEffect(() => {
    if (!icon || icon.set === 'emoji') {
      setIconComponent(null);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        let Component: ComponentType<SVGProps<SVGSVGElement>> | undefined;

        if (icon!.set === 'lucide') {
          const mod = await import('lucide-react');
          Component = (mod.icons as Record<string, ComponentType<any>>)[icon!.name];
        } else if (icon!.set === 'heroicons') {
          const style = icon!.style || 'outline';
          if (style === 'solid') {
            const mod = await import('@heroicons/react/24/solid');
            Component = (mod as unknown as Record<string, ComponentType<any>>)[`${icon!.name}Icon`];
          } else {
            const mod = await import('@heroicons/react/24/outline');
            Component = (mod as unknown as Record<string, ComponentType<any>>)[`${icon!.name}Icon`];
          }
        }

        if (!cancelled && Component) {
          setIconComponent(() => Component!);
        }
      } catch {
        // Icon not found — render nothing
      }
    }

    load();
    return () => { cancelled = true; };
  }, [icon?.set, icon?.name, icon?.style]);

  if (!icon) return null;

  if (icon.set === 'emoji') {
    return (
      <span style={{ fontSize: `${size}px`, lineHeight: 1 }} className={className}>
        {icon.name}
      </span>
    );
  }

  if (!IconComponent) return null;

  return <IconComponent width={size} height={size} className={className} />;
}

/**
 * Returns an HTML string for an icon. Used by Leaflet DivIcon markers
 * and other contexts that need raw HTML instead of React components.
 */
export async function iconToHtml(icon: IconValue, size: number): Promise<string> {
  if (icon.set === 'emoji') {
    return icon.name;
  }

  // For SVG icons, dynamically import and render to string
  const { renderToStaticMarkup } = await import('react-dom/server');

  if (icon.set === 'lucide') {
    const mod = await import('lucide-react');
    const Component = (mod.icons as Record<string, ComponentType<any>>)[icon.name];
    if (Component) {
      return renderToStaticMarkup(<Component width={size} height={size} />);
    }
  } else if (icon.set === 'heroicons') {
    const style = icon.style || 'outline';
    const mod = style === 'solid'
      ? await import('@heroicons/react/24/solid')
      : await import('@heroicons/react/24/outline');
    const Component = (mod as unknown as Record<string, ComponentType<any>>)[`${icon.name}Icon`];
    if (Component) {
      return renderToStaticMarkup(<Component width={size} height={size} />);
    }
  }

  return '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run src/components/shared/IconPicker/__tests__/IconRenderer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/IconPicker/IconRenderer.tsx src/components/shared/IconPicker/__tests__/IconRenderer.test.tsx
git commit -m "feat: add shared IconRenderer with emoji support and iconToHtml helper"
```

---

### Task 5: Create shared IconPicker component

**Files:**
- Create: `src/components/shared/IconPicker/IconPicker.tsx`
- Create: `src/components/shared/IconPicker/__tests__/IconPicker.test.tsx`

- [ ] **Step 1: Write the test**

```typescript
// src/components/shared/IconPicker/__tests__/IconPicker.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconPicker } from '../IconPicker';

// Mock icon catalog
vi.mock('../icon-catalog', () => ({
  searchIcons: vi.fn().mockResolvedValue([
    { set: 'lucide', name: 'Bird', searchTerms: 'bird' },
    { set: 'emoji', name: '🐦', searchTerms: 'bird', category: 'Animals' },
  ]),
  getLucideIcons: vi.fn().mockResolvedValue([
    { set: 'lucide', name: 'Bird', searchTerms: 'bird' },
  ]),
  getHeroicons: vi.fn().mockResolvedValue([
    { set: 'heroicons', name: 'Star', searchTerms: 'star' },
  ]),
  getEmojis: vi.fn().mockReturnValue([
    { set: 'emoji', name: '🐦', searchTerms: 'bird', category: 'Animals' },
  ]),
}));

// Mock IconRenderer
vi.mock('../IconRenderer', () => ({
  IconRenderer: ({ icon }: any) =>
    icon ? <span data-testid="icon-preview">{icon.set === 'emoji' ? icon.name : icon.name}</span> : null,
}));

describe('IconPicker', () => {
  it('renders "No icon" when value is undefined', () => {
    render(<IconPicker value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText(/no icon/i)).toBeDefined();
  });

  it('shows icon name when value is an emoji', () => {
    render(
      <IconPicker
        value={{ set: 'emoji', name: '🐦' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Bird')).toBeDefined();
  });

  it('opens picker on click', () => {
    render(<IconPicker value={undefined} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText(/no icon/i));
    expect(screen.getByPlaceholderText(/search icons/i)).toBeDefined();
  });

  it('shows clear button when value is set', () => {
    const onChange = vi.fn();
    render(
      <IconPicker
        value={{ set: 'emoji', name: '🐦' }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('shows set filter tabs including Emoji', () => {
    render(<IconPicker value={undefined} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText(/no icon/i));
    expect(screen.getByText('All')).toBeDefined();
    expect(screen.getByText('Lucide')).toBeDefined();
    expect(screen.getByText('Heroicons')).toBeDefined();
    expect(screen.getByText('Emoji')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/components/shared/IconPicker/__tests__/IconPicker.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create IconPicker.tsx**

```typescript
// src/components/shared/IconPicker/IconPicker.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { IconValue } from '@/lib/types';
import { IconRenderer } from './IconRenderer';
import { searchIcons, getLucideIcons, getHeroicons, getEmojis, type IconEntry } from './icon-catalog';
import { getAllEmojis } from './emoji-catalog';

interface IconPickerProps {
  value: IconValue | undefined;
  onChange: (value: IconValue | undefined) => void;
  className?: string;
}

type IconSet = 'all' | 'lucide' | 'heroicons' | 'emoji';

/** Human-readable name for an emoji icon. */
function emojiDisplayName(emoji: string): string {
  const all = getAllEmojis();
  const entry = all.find((e) => e.emoji === emoji);
  return entry?.name ?? emoji;
}

export function IconPicker({ value, onChange, className }: IconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [iconSet, setIconSet] = useState<IconSet>('all');
  const [results, setResults] = useState<IconEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadIcons = useCallback(async () => {
    setLoading(true);
    try {
      if (query) {
        const set = iconSet === 'all' ? undefined : iconSet;
        setResults(await searchIcons(query, set));
      } else if (iconSet === 'emoji') {
        setResults(getEmojis());
      } else {
        const set = iconSet === 'all' ? undefined : iconSet;
        const batches: IconEntry[][] = [];

        if (!set || set === 'lucide') {
          const lucide = await getLucideIcons();
          batches.push(lucide.slice(0, set ? 200 : 80));
        }
        if (!set || set === 'heroicons') {
          const heroicons = await getHeroicons();
          batches.push(heroicons.slice(0, set ? 200 : 80));
        }
        if (!set) {
          batches.push(getEmojis().slice(0, 40));
        }

        setResults(batches.flat());
      }
    } finally {
      setLoading(false);
    }
  }, [query, iconSet]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(loadIcons, query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [isOpen, loadIcons, query]);

  function handleSelect(entry: IconEntry) {
    if (entry.set === 'emoji') {
      onChange({ set: 'emoji', name: entry.name });
    } else {
      onChange({
        set: entry.set,
        name: entry.name,
        style: entry.set === 'heroicons' ? 'outline' : undefined,
      });
    }
    setIsOpen(false);
    setQuery('');
  }

  const displayName = value
    ? value.set === 'emoji'
      ? emojiDisplayName(value.name)
      : value.name.replace(/([A-Z])/g, ' $1').trim()
    : null;

  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 input-field text-sm w-full text-left"
        >
          {value ? (
            <>
              <IconRenderer icon={value} size={18} />
              <span className="text-forest-dark">{displayName}</span>
              <span className="text-sage text-xs ml-auto">{value.set}</span>
            </>
          ) : (
            <span className="text-sage">No icon</span>
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-xs text-sage hover:text-forest-dark shrink-0"
            aria-label="Clear icon"
          >
            Clear
          </button>
        )}
      </div>

      {isOpen && (
        <div className="border border-sage-light rounded-lg bg-white shadow-lg p-3 space-y-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons..."
            className="w-full rounded border border-sage-light px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            autoFocus
          />

          <div className="flex gap-1">
            {(['all', 'lucide', 'heroicons', 'emoji'] as IconSet[]).map((set) => (
              <button
                key={set}
                type="button"
                onClick={() => setIconSet(set)}
                className={`text-xs px-2 py-0.5 rounded ${
                  iconSet === set
                    ? 'bg-forest/10 text-forest-dark font-medium'
                    : 'text-sage hover:bg-sage-light'
                }`}
              >
                {set === 'all' ? 'All' : set === 'lucide' ? 'Lucide' : set === 'heroicons' ? 'Heroicons' : 'Emoji'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
            {loading ? (
              <div className="col-span-8 text-center text-xs text-sage py-4">Loading...</div>
            ) : results.length === 0 ? (
              <div className="col-span-8 text-center text-xs text-sage py-4">No icons found</div>
            ) : (
              results.map((entry) => (
                <button
                  key={`${entry.set}-${entry.name}`}
                  type="button"
                  onClick={() => handleSelect(entry)}
                  className="flex items-center justify-center h-8 w-8 rounded hover:bg-forest/10 transition-colors"
                  title={entry.set === 'emoji'
                    ? emojiDisplayName(entry.name)
                    : `${entry.name} (${entry.set})`}
                >
                  <IconRenderer
                    icon={{
                      set: entry.set,
                      name: entry.name,
                      style: entry.set === 'heroicons' ? 'outline' : undefined,
                    }}
                    size={16}
                  />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run src/components/shared/IconPicker/__tests__/IconPicker.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/IconPicker/IconPicker.tsx src/components/shared/IconPicker/__tests__/IconPicker.test.tsx
git commit -m "feat: add shared IconPicker component with admin styling"
```

---

### Task 6: Create index.ts and wire up Puck re-exports

**Files:**
- Create: `src/components/shared/IconPicker/index.ts`
- Modify: `src/lib/puck/fields/link-utils.ts`
- Modify: `src/lib/puck/fields/IconPickerField.tsx`
- Modify: `src/lib/puck/fields/index.tsx`
- Modify: `src/lib/puck/icons/IconRenderer.tsx`
- Modify: `src/lib/puck/icons/icon-catalog.ts`
- Modify: `src/lib/puck/types.ts`
- Modify: `src/lib/puck/icons/__tests__/IconRenderer.test.tsx`
- Modify: `src/lib/puck/fields/__tests__/IconPickerField.test.tsx`

- [ ] **Step 1: Create index.ts**

```typescript
// src/components/shared/IconPicker/index.ts
export { IconPicker } from './IconPicker';
export { IconRenderer, iconToHtml } from './IconRenderer';
export { searchIcons, getLucideIcons, getHeroicons, getEmojis } from './icon-catalog';
export type { IconEntry } from './icon-catalog';
```

- [ ] **Step 2: Remove IconValue from link-utils.ts**

Edit `src/lib/puck/fields/link-utils.ts` to remove the `IconValue` interface (lines 9-13). Keep `LinkValue` and `resolveLink` unchanged. The file should become:

```typescript
/** A link value that can be stored as a string (legacy) or object (new) */
export interface LinkValue {
  href: string;
  target?: '_blank';
  color?: string;
}

/**
 * Normalize a link field value to a LinkValue object.
 * Handles backwards compatibility: plain strings become { href }.
 * External URLs (http/https) default to target="_blank".
 */
export function resolveLink(value: string | LinkValue | undefined): LinkValue {
  if (!value) {
    return { href: '', target: undefined, color: undefined };
  }
  if (typeof value === 'string') {
    const isExternal = value.startsWith('http');
    return {
      href: value,
      target: isExternal ? '_blank' : undefined,
      color: undefined,
    };
  }
  return {
    href: value.href,
    target: value.target ?? undefined,
    color: value.color ?? undefined,
  };
}
```

- [ ] **Step 3: Update Puck types.ts**

Edit `src/lib/puck/types.ts` to import `IconValue` from `@/lib/types` instead of `./fields/link-utils`:

Change line 2 from:
```typescript
import type { LinkValue, IconValue } from './fields/link-utils';
```
to:
```typescript
import type { LinkValue } from './fields/link-utils';
import type { IconValue } from '@/lib/types';
```

And change line 6 from:
```typescript
export type { LinkValue, IconValue } from './fields/link-utils';
```
to:
```typescript
export type { LinkValue } from './fields/link-utils';
export type { IconValue } from '@/lib/types';
```

- [ ] **Step 4: Update Puck fields/index.tsx**

Edit `src/lib/puck/fields/index.tsx` line 8 from:
```typescript
export type { LinkValue, IconValue } from './link-utils';
```
to:
```typescript
export type { LinkValue } from './link-utils';
export type { IconValue } from '@/lib/types';
```

- [ ] **Step 5: Replace Puck IconPickerField with thin wrapper**

Replace the entire contents of `src/lib/puck/fields/IconPickerField.tsx` with:

```typescript
'use client';

import type { IconValue } from '@/lib/types';
import { IconPicker } from '@/components/shared/IconPicker';

interface IconPickerFieldProps {
  value: IconValue | undefined;
  onChange: (value: IconValue | undefined) => void;
}

export function IconPickerField({ value, onChange }: IconPickerFieldProps) {
  return <IconPicker value={value} onChange={onChange} />;
}
```

- [ ] **Step 6: Replace Puck IconRenderer with re-export**

Replace the entire contents of `src/lib/puck/icons/IconRenderer.tsx` with:

```typescript
export { IconRenderer } from '@/components/shared/IconPicker';
```

- [ ] **Step 7: Replace Puck icon-catalog with re-export**

Replace the entire contents of `src/lib/puck/icons/icon-catalog.ts` with:

```typescript
export { searchIcons, getLucideIcons, getHeroicons, getEmojis } from '@/components/shared/IconPicker';
export type { IconEntry } from '@/components/shared/IconPicker';
```

- [ ] **Step 8: Update Puck IconRenderer test import**

In `src/lib/puck/icons/__tests__/IconRenderer.test.tsx`, no change needed — it imports from `../IconRenderer` which now re-exports from the shared location. The mocks target `lucide-react` and `@heroicons/react` directly, which still work.

Verify: `npm run test -- --run src/lib/puck/icons/__tests__/IconRenderer.test.tsx`
Expected: PASS

- [ ] **Step 9: Update Puck IconPickerField test mock paths**

Edit `src/lib/puck/fields/__tests__/IconPickerField.test.tsx`. Update the mock targets from the old Puck paths to the shared paths:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconPickerField } from '../IconPickerField';

// Mock the shared IconPicker
vi.mock('@/components/shared/IconPicker', () => ({
  IconPicker: ({ value, onChange }: any) => (
    <div data-testid="icon-picker">
      {value ? (
        <>
          <span>{value.name}</span>
          <button aria-label="Clear icon" onClick={() => onChange(undefined)}>Clear</button>
        </>
      ) : (
        <span>No icon</span>
      )}
    </div>
  ),
}));

describe('IconPickerField', () => {
  it('renders "No icon" when value is undefined', () => {
    render(<IconPickerField value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText(/no icon/i)).toBeDefined();
  });

  it('renders icon name when value is set', () => {
    render(
      <IconPickerField
        value={{ set: 'lucide', name: 'Bird' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Bird')).toBeDefined();
  });

  it('delegates clear to onChange(undefined)', () => {
    const onChange = vi.fn();
    render(
      <IconPickerField
        value={{ set: 'lucide', name: 'Bird' }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
```

- [ ] **Step 10: Run all Puck tests**

Run: `npm run test -- --run src/lib/puck`
Expected: PASS (all Puck tests continue to work)

- [ ] **Step 11: Commit**

```bash
git add src/components/shared/IconPicker/index.ts src/lib/puck/fields/link-utils.ts src/lib/puck/fields/IconPickerField.tsx src/lib/puck/fields/index.tsx src/lib/puck/icons/IconRenderer.tsx src/lib/puck/icons/icon-catalog.ts src/lib/puck/types.ts src/lib/puck/icons/__tests__/IconRenderer.test.tsx src/lib/puck/fields/__tests__/IconPickerField.test.tsx
git commit -m "refactor: extract icon picker to shared component, Puck re-exports from shared"
```

---

### Task 7: Database migration

**Files:**
- Create: `supabase/migrations/042_icon_jsonb.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 042_icon_jsonb.sql
-- Convert item_types.icon and entity_types.icon from text to jsonb

-- item_types: convert existing emoji strings to { set: 'emoji', name: '<emoji>' }
ALTER TABLE item_types
  ALTER COLUMN icon TYPE jsonb USING jsonb_build_object('set', 'emoji', 'name', icon);

ALTER TABLE item_types
  ALTER COLUMN icon SET DEFAULT '{"set":"emoji","name":"📍"}'::jsonb;

-- entity_types: same conversion
ALTER TABLE entity_types
  ALTER COLUMN icon TYPE jsonb USING jsonb_build_object('set', 'emoji', 'name', icon);

ALTER TABLE entity_types
  ALTER COLUMN icon SET DEFAULT '{"set":"emoji","name":"📋"}'::jsonb;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/042_icon_jsonb.sql
git commit -m "feat: migrate item_types and entity_types icon columns from text to jsonb"
```

---

### Task 8: Update EntityTypeForm to use IconPicker

**Files:**
- Modify: `src/components/admin/EntityTypeForm.tsx`

- [ ] **Step 1: Update imports**

Add at the top of `src/components/admin/EntityTypeForm.tsx`:

```typescript
import type { IconValue } from '@/lib/types';
import { IconPicker } from '@/components/shared/IconPicker';
```

- [ ] **Step 2: Change icon state type**

Change line 21 from:
```typescript
const [icon, setIcon] = useState(entityType?.icon || '📋');
```
to:
```typescript
const [icon, setIcon] = useState<IconValue>(entityType?.icon || { set: 'emoji', name: '📋' });
```

- [ ] **Step 3: Replace icon text input with IconPicker**

Replace the icon input (lines 148-150):
```tsx
<div>
  <label className="label">Icon</label>
  <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} className="input-field w-16 text-center text-lg" maxLength={4} />
</div>
```
with:
```tsx
<div>
  <label className="label">Icon</label>
  <IconPicker value={icon} onChange={(v) => setIcon(v || { set: 'emoji', name: '📋' })} />
</div>
```

- [ ] **Step 4: Adjust grid layout**

The form currently uses a 2-column grid with Name in col 1, and Icon + Color side by side in col 2. With the new picker being wider, change the layout. Replace the grid (lines 142-157):

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <div>
    <label className="label">Name *</label>
    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="e.g., Species" required />
  </div>
  <div className="flex gap-3">
    <div>
      <label className="label">Icon</label>
      <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} className="input-field w-16 text-center text-lg" maxLength={4} />
    </div>
    <div>
      <label className="label">Color</label>
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-16 rounded border border-sage-light cursor-pointer" />
    </div>
  </div>
</div>
```

Replace with:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <div>
    <label className="label">Name *</label>
    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="e.g., Species" required />
  </div>
  <div className="grid grid-cols-[1fr_auto] gap-3">
    <div>
      <label className="label">Icon</label>
      <IconPicker value={icon} onChange={(v) => setIcon(v || { set: 'emoji', name: '📋' })} />
    </div>
    <div>
      <label className="label">Color</label>
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-16 rounded border border-sage-light cursor-pointer" />
    </div>
  </div>
</div>
```

- [ ] **Step 5: Verify type-check passes for this file**

Run: `npm run type-check 2>&1 | grep EntityTypeForm`
Expected: No errors for EntityTypeForm.tsx

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/EntityTypeForm.tsx
git commit -m "feat: replace emoji text input with IconPicker in EntityTypeForm"
```

---

### Task 9: Update ItemTypeEditor to use IconPicker

**Files:**
- Modify: `src/components/admin/ItemTypeEditor.tsx`

- [ ] **Step 1: Update imports**

Add imports at the top of `src/components/admin/ItemTypeEditor.tsx`:

```typescript
import type { IconValue } from '@/lib/types';
import { IconPicker, IconRenderer } from '@/components/shared/IconPicker';
```

- [ ] **Step 2: Update onSave callback type**

The `onSave` prop currently accepts `{ name: string; icon: string; color: string; sort_order: number }`. Change the interface (line 13-14):

```typescript
onSave: (updates: { name: string; icon: IconValue; color: string; sort_order: number }) => Promise<void>;
```

- [ ] **Step 3: Change icon state type**

Change line 26 from:
```typescript
const [icon, setIcon] = useState(itemType.icon);
```
to:
```typescript
const [icon, setIcon] = useState<IconValue>(itemType.icon);
```

- [ ] **Step 4: Update collapsed header to use IconRenderer**

Change line 60 from:
```tsx
<span className="text-xl">{itemType.icon}</span>
```
to:
```tsx
<IconRenderer icon={itemType.icon} size={20} />
```

- [ ] **Step 5: Replace icon text input with IconPicker**

Replace the icon input block (lines 108-110):
```tsx
<div>
  <label className="label">Icon (emoji)</label>
  <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} className="input-field" />
</div>
```
with:
```tsx
<div>
  <label className="label">Icon</label>
  <IconPicker value={icon} onChange={(v) => setIcon(v || { set: 'emoji', name: '📍' })} />
</div>
```

- [ ] **Step 6: Update callers of onSave**

Check the parent component that calls `<ItemTypeEditor>` to ensure it passes `IconValue` in the `onSave` handler. The parent is `src/app/admin/properties/[slug]/types/page.tsx`. Find where `onSave` is called and ensure the icon type matches. The parent likely does:

```typescript
onSave={async (updates) => {
  await supabase.from('item_types').update(updates).eq('id', itemType.id);
}}
```

Since the database now expects `jsonb` for icon, passing `IconValue` directly is correct — Supabase's JS client serializes objects to JSON automatically.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/ItemTypeEditor.tsx
git commit -m "feat: replace emoji text input with IconPicker in ItemTypeEditor"
```

---

### Task 10: Update rendering call sites — admin components

**Files:**
- Modify: `src/components/admin/EntityCard.tsx:31`
- Modify: `src/components/admin/MapDisplayConfigEditor.tsx:137,232`
- Modify: `src/app/admin/properties/[slug]/entity-types/page.tsx:124`

- [ ] **Step 1: Update EntityCard.tsx**

Add import:
```typescript
import { IconRenderer } from '@/components/shared/IconPicker';
```

Change line 31 from:
```tsx
<span className="text-3xl">{entityType.icon}</span>
```
to:
```tsx
<IconRenderer icon={entityType.icon} size={30} />
```

- [ ] **Step 2: Update MapDisplayConfigEditor.tsx**

Add import:
```typescript
import { IconRenderer } from '@/components/shared/IconPicker';
```

Line 137 — this renders a hardcoded `ctrl.icon` which is a string literal from the controls config, NOT from the database. Check the source: the `ctrl.icon` comes from a local array of control definitions with hardcoded emoji strings. **Leave this line unchanged** — it's not an `ItemType.icon` or `EntityType.icon`.

Line 232 — this renders `type.icon` where `type` is an `ItemType`. Change:
```tsx
<span>{type.icon}</span>
```
to:
```tsx
<IconRenderer icon={type.icon} size={14} />
```

- [ ] **Step 3: Update entity-types page**

Add import at top of `src/app/admin/properties/[slug]/entity-types/page.tsx`:
```typescript
import { IconRenderer } from '@/components/shared/IconPicker';
```

Change line 124 from:
```tsx
<span className="text-2xl">{et.icon}</span>
```
to:
```tsx
<IconRenderer icon={et.icon} size={24} />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/EntityCard.tsx src/components/admin/MapDisplayConfigEditor.tsx src/app/admin/properties/[slug]/entity-types/page.tsx
git commit -m "feat: update admin components to use IconRenderer for entity/item type icons"
```

---

### Task 11: Update rendering call sites — item display components

**Files:**
- Modify: `src/components/item/ItemCard.tsx:27`
- Modify: `src/components/item/DetailPanel.tsx:52,92,150`
- Modify: `src/components/item/UpdateTimeline.tsx:34,60`

- [ ] **Step 1: Update ItemCard.tsx**

Add import:
```typescript
import { IconRenderer } from '@/components/shared/IconPicker';
```

Change line 27 from:
```tsx
{itemType && <span className="text-lg">{itemType.icon}</span>}
```
to:
```tsx
{itemType && <IconRenderer icon={itemType.icon} size={18} />}
```

- [ ] **Step 2: Update DetailPanel.tsx**

Add import:
```typescript
import { IconRenderer } from '@/components/shared/IconPicker';
```

Change line 52 from:
```tsx
{item.item_type && <span className="text-xl">{item.item_type.icon}</span>}
```
to:
```tsx
{item.item_type && <IconRenderer icon={item.item_type.icon} size={20} />}
```

Change line 92 from:
```tsx
{item.item_type && <span className="text-xl">{item.item_type.icon}</span>}
```
to:
```tsx
{item.item_type && <IconRenderer icon={item.item_type.icon} size={20} />}
```

Line 150 renders `type.icon` where `type` comes from a grouped entity type map with type `{ id: string; name: string; icon: string }`. This is an **inline type annotation** — the icon is actually an `EntityType.icon` which is now `IconValue`. Update the inline type in the `grouped` map declaration (line 141):

Change:
```tsx
const grouped = new Map<string, { type: { id: string; name: string; icon: string }; entities: typeof item.entities }>();
```
to:
```tsx
const grouped = new Map<string, { type: { id: string; name: string; icon: IconValue }; entities: typeof item.entities }>();
```

Add `import type { IconValue } from '@/lib/types';` if not already imported (it may already be via `ItemWithDetails`).

Then change line 150 from:
```tsx
{type.icon} {type.name}
```
to:
```tsx
<IconRenderer icon={type.icon} size={12} /> {type.name}
```

- [ ] **Step 3: Update UpdateTimeline.tsx**

Add import:
```typescript
import { IconRenderer } from '@/components/shared/IconPicker';
```

Line 34 renders `update.update_type?.icon` — this is `UpdateType.icon` which stays as `string` (out of scope). **Leave unchanged.**

Line 60 renders `type.icon` where `type` comes from a grouped entity type map. The inline type is `{ id: string; name: string; icon: string }` — update it to `{ id: string; name: string; icon: IconValue }`.

Add `import type { IconValue } from '@/lib/types';` at the top.

Update the inline type in the `grouped` map (line 52):
```tsx
const grouped = new Map<string, { type: { id: string; name: string; icon: IconValue }; entities: NonNullable<typeof update.entities> }>();
```

Change line 60 from:
```tsx
<span className="text-[10px] text-sage">{type.icon}</span>
```
to:
```tsx
<span className="text-[10px] text-sage"><IconRenderer icon={type.icon} size={10} /></span>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/item/ItemCard.tsx src/components/item/DetailPanel.tsx src/components/item/UpdateTimeline.tsx
git commit -m "feat: update item display components to use IconRenderer"
```

---

### Task 12: Update rendering call sites — manage forms

**Files:**
- Modify: `src/components/manage/EditItemForm.tsx:334,519`
- Modify: `src/components/manage/ItemForm.tsx:195,329`
- Modify: `src/components/manage/UpdateForm.tsx:298,350`

These files render icons in two contexts:
1. Inside `<option>` elements (text only, cannot use React components)
2. Inside `<label>` elements (can use React components)

- [ ] **Step 1: Update EditItemForm.tsx**

Add imports:
```typescript
import { iconDisplayName, type IconValue } from '@/lib/types';
import { IconRenderer } from '@/components/shared/IconPicker';
```

Line 334 is inside an `<option>` — use `iconDisplayName`:
```tsx
<option key={t.id} value={t.id}>
  {iconDisplayName(t.icon)} {t.name}
</option>
```

Line 519 is a `<label>` — use `IconRenderer`:
```tsx
<label className="label"><IconRenderer icon={et.icon} size={14} /> {et.name}</label>
```

- [ ] **Step 2: Update ItemForm.tsx**

Add imports:
```typescript
import { iconDisplayName } from '@/lib/types';
import { IconRenderer } from '@/components/shared/IconPicker';
```

Line 195 is inside an `<option>`:
```tsx
<option key={t.id} value={t.id}>
  {iconDisplayName(t.icon)} {t.name}
</option>
```

Line 329 is a `<label>`:
```tsx
<label className="label"><IconRenderer icon={et.icon} size={14} /> {et.name}</label>
```

- [ ] **Step 3: Update UpdateForm.tsx**

Add imports:
```typescript
import { IconRenderer } from '@/components/shared/IconPicker';
```

Line 298 renders `t.icon` where `t` is an `UpdateType` — `UpdateType.icon` is still `string`. **Leave unchanged.**

Line 350 renders `et.icon` where `et` is an `EntityType`:
```tsx
<label className="label"><IconRenderer icon={et.icon} size={14} /> {et.name}</label>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/manage/EditItemForm.tsx src/components/manage/ItemForm.tsx src/components/manage/UpdateForm.tsx
git commit -m "feat: update manage forms to use IconRenderer and iconDisplayName"
```

---

### Task 13: Update rendering call sites — map components

**Files:**
- Modify: `src/components/map/ItemMarker.tsx`
- Modify: `src/components/map/QuickAddSheet.tsx:166`
- Modify: `src/components/map/MapLegend.tsx:79`

- [ ] **Step 1: Update ItemMarker.tsx**

Add imports:
```typescript
import type { IconValue } from '@/lib/types';
import { iconToHtml } from '@/components/shared/IconPicker';
import { IconRenderer } from '@/components/shared/IconPicker';
```

The `createIcon` function needs to become async since `iconToHtml` is async. But Leaflet `L.divIcon` is synchronous — we need to pre-resolve the icon HTML. Refactor to use a React state approach:

Replace the entire `createIcon` function and component:

```typescript
import { useState, useEffect } from 'react';

function createDivIcon(iconHtml: string, color: string) {
  return L.divIcon({
    className: '',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: ${color};
        border: 2px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <span style="transform: rotate(45deg); font-size: 14px; line-height: 1;">${iconHtml}</span>
      </div>
    `,
  });
}

export default function ItemMarker({ item, itemType, onClick }: ItemMarkerProps) {
  const [iconHtml, setIconHtml] = useState<string>(
    itemType?.icon?.set === 'emoji' ? (itemType.icon.name) : '📍'
  );

  useEffect(() => {
    if (!itemType?.icon) return;
    let cancelled = false;
    iconToHtml(itemType.icon, 14).then((html) => {
      if (!cancelled) setIconHtml(html);
    });
    return () => { cancelled = true; };
  }, [itemType?.icon]);

  const color = statusColors[item.status] || '#5D7F3A';

  return (
    <Marker
      position={[item.latitude, item.longitude]}
      icon={createDivIcon(iconHtml, color)}
      eventHandlers={{
        click: () => onClick(item),
      }}
    >
      <Popup>
        <div className="text-center">
          <strong className="text-forest-dark">{item.name}</strong>
          <br />
          <span className="text-xs text-sage">{statusLabels[item.status]}</span>
          {itemType && (
            <>
              <br />
              <span className="text-xs text-forest">
                <IconRenderer icon={itemType.icon} size={12} /> {itemType.name}
              </span>
            </>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
```

- [ ] **Step 2: Update QuickAddSheet.tsx**

Add import:
```typescript
import { iconDisplayName } from '@/lib/types';
```

Change line 166 from:
```tsx
{t.icon} {t.name}
```
to:
```tsx
{iconDisplayName(t.icon)} {t.name}
```

- [ ] **Step 3: Update MapLegend.tsx**

Add import:
```typescript
import { IconRenderer } from '@/components/shared/IconPicker';
```

Change line 79 from:
```tsx
<span className="text-sm">{type.icon}</span>
```
to:
```tsx
<IconRenderer icon={type.icon} size={14} />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/map/ItemMarker.tsx src/components/map/QuickAddSheet.tsx src/components/map/MapLegend.tsx
git commit -m "feat: update map components to use IconRenderer and iconToHtml"
```

---

### Task 14: Update rendering call sites — layout builder and navigation

**Files:**
- Modify: `src/components/layout/builder/BlockConfigPanel.tsx:208`
- Modify: `src/components/layout/builder/BlockPalette.tsx:41`
- Modify: `src/components/layout/builder/LayoutBuilder.tsx:376`
- Modify: `src/components/layout/PropertyAdminShell.tsx:76`
- Modify: `src/components/layout/blocks/EntityListBlock.tsx:40`
- Modify: `src/app/admin/properties/[slug]/layout.tsx:45`

- [ ] **Step 1: Update BlockConfigPanel.tsx**

Add import:
```typescript
import { IconRenderer } from '@/components/shared/IconPicker';
```

Change line 208 from:
```tsx
<span className="text-sm">{et.icon} {et.name}</span>
```
to:
```tsx
<span className="text-sm flex items-center gap-1"><IconRenderer icon={et.icon} size={14} /> {et.name}</span>
```

- [ ] **Step 2: Update BlockPalette.tsx**

Add import:
```typescript
import { IconRenderer } from '@/components/shared/IconPicker';
```

The `item.icon` on line 41 comes from the palette block definitions. Check what type `item` is — it's a local interface with `icon: string`. This is NOT from the database — it's a hardcoded block icon like `'📊'`. **Leave unchanged** — this is block palette icons, not entity/item type icons.

- [ ] **Step 3: Update LayoutBuilder.tsx**

Add import:
```typescript
import { IconRenderer } from '@/components/shared/IconPicker';
```

Change line 376 from:
```tsx
<span className="text-xl">{itemType.icon}</span>
```
to:
```tsx
<IconRenderer icon={itemType.icon} size={20} />
```

- [ ] **Step 4: Update PropertyAdminShell.tsx**

Add import:
```typescript
import { iconDisplayName } from '@/lib/types';
```

Change line 76 from:
```tsx
label: `${et.icon} ${et.name}`,
```
to:
```tsx
label: `${iconDisplayName(et.icon)} ${et.name}`,
```

- [ ] **Step 5: Update EntityListBlock.tsx**

Add import:
```typescript
import { IconRenderer } from '@/components/shared/IconPicker';
```

Change line 40 from:
```tsx
{type.icon} {type.name}
```
to:
```tsx
<IconRenderer icon={type.icon} size={12} /> {type.name}
```

- [ ] **Step 6: Update admin layout.tsx**

Add import in `src/app/admin/properties/[slug]/layout.tsx`:
```typescript
import { iconDisplayName } from '@/lib/types';
```

Change line 45 from:
```tsx
label: `${et.icon} ${et.name}`,
```
to:
```tsx
label: `${iconDisplayName(et.icon)} ${et.name}`,
```

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/builder/BlockConfigPanel.tsx src/components/layout/builder/LayoutBuilder.tsx src/components/layout/PropertyAdminShell.tsx src/components/layout/blocks/EntityListBlock.tsx src/app/admin/properties/[slug]/layout.tsx
git commit -m "feat: update layout builder and navigation to use IconRenderer"
```

---

### Task 15: Type-check and fix remaining errors

**Files:**
- Potentially any file with type errors

- [ ] **Step 1: Run full type-check**

Run: `npm run type-check 2>&1 | head -100`

Review all remaining type errors. Common issues:
- Files referencing `ItemType.icon` or `EntityType.icon` as `string` instead of `IconValue`
- Inline type annotations that still say `icon: string` for entity types

- [ ] **Step 2: Fix any remaining type errors**

Fix each error based on its context. Typical fixes:
- Update inline type annotations from `icon: string` to `icon: IconValue`
- Add `import type { IconValue } from '@/lib/types'` where needed
- For files that use `.icon` in a string template context (like `${et.icon}`), use `iconDisplayName(et.icon)` instead

- [ ] **Step 3: Run type-check again**

Run: `npm run type-check`
Expected: PASS (0 errors)

- [ ] **Step 4: Run full test suite**

Run: `npm run test -- --run`
Expected: PASS

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve remaining type errors from IconValue migration"
```

---

### Task 16: Manual testing

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase migration up` (or however local migrations are applied)

- [ ] **Step 3: Test EntityTypeForm**

Navigate to admin > Entity Types. Create a new entity type:
- Click the icon picker trigger button
- Verify the dropdown shows search, set filter tabs (All/Lucide/Heroicons/Emoji), and icon grid
- Search for "bird" — verify results from all three sets
- Switch to "Emoji" tab — verify category headers appear
- Select a Lucide icon — verify it saves and displays correctly
- Edit the entity type — verify the icon picker shows the saved icon

- [ ] **Step 4: Test ItemTypeEditor**

Navigate to admin > Types. Expand an item type:
- Verify the icon picker appears instead of the text input
- Change the icon to a Heroicon — verify it saves
- Verify the collapsed header shows the icon via IconRenderer

- [ ] **Step 5: Test map rendering**

Navigate to the main map:
- Verify item markers render correctly with emoji icons
- If any items have library icons (from testing), verify SVG icons render in markers

- [ ] **Step 6: Test entity display**

Navigate to an entity page:
- Verify entity cards show icons via IconRenderer
- Verify entity type labels in forms show icons

- [ ] **Step 7: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
