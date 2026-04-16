# Icon Picker for Entity Types & Item Types

## Summary

Replace the plain-text emoji input on entity type and item type forms with a shared icon picker component. The picker lets users choose from Lucide icons, Heroicons, or a curated set of conservation-relevant emojis. The existing Puck icon picker is extracted into a shared component; Puck becomes a thin wrapper around it.

## Motivation

The current text input (`<input maxLength={4}>`) limits users to typing emojis they happen to know. A visual picker with search makes icon selection faster and opens up access to the full Lucide and Heroicons libraries already installed in the project.

## Data Model

### IconValue type

Moves from `src/lib/puck/fields/link-utils.ts` to `src/lib/types.ts`:

```typescript
export interface IconValue {
  set: 'lucide' | 'heroicons' | 'emoji';
  name: string;           // icon name for libraries, emoji character for emoji set
  style?: 'outline' | 'solid';  // heroicons only
}
```

### Database migration

Both `item_types.icon` and `entity_types.icon` change from `text` to `jsonb`:

```sql
-- item_types
ALTER TABLE item_types
  ALTER COLUMN icon TYPE jsonb USING jsonb_build_object('set', 'emoji', 'name', icon);
ALTER TABLE item_types
  ALTER COLUMN icon SET DEFAULT '{"set":"emoji","name":"📍"}'::jsonb;

-- entity_types
ALTER TABLE entity_types
  ALTER COLUMN icon TYPE jsonb USING jsonb_build_object('set', 'emoji', 'name', icon);
ALTER TABLE entity_types
  ALTER COLUMN icon SET DEFAULT '{"set":"emoji","name":"📋"}'::jsonb;
```

### TypeScript type changes

In `src/lib/types.ts`:
- `ItemType.icon`: `string` → `IconValue`
- `EntityType.icon`: `string` → `IconValue`

## Shared Component Architecture

### File structure

```
src/components/shared/IconPicker/
  index.ts              — public exports
  IconPicker.tsx         — main picker component (admin-styled)
  IconRenderer.tsx       — renders any IconValue (lucide, heroicons, or emoji)
  icon-catalog.ts        — search/browse across all three sets
  emoji-catalog.ts       — curated emoji collection by category
```

### IconPicker component

**Props:**
```typescript
interface IconPickerProps {
  value: IconValue | undefined;
  onChange: (value: IconValue | undefined) => void;
  className?: string;
}
```

**Behavior:**
- Trigger button displays the current icon + name + set label, or "No icon" placeholder
- Click opens a dropdown panel containing:
  - Search input (searches across all three icon sets)
  - Set filter tabs: All | Lucide | Heroicons | Emoji
  - Scrollable 8-column icon grid (max-height with overflow scroll)
  - Category headers shown within the Emoji tab (Animals, Plants, Nature, Tools, General)
- Clear button to remove selection
- Debounced search (200ms) matching icon names/search terms
- Maximum 200 results displayed at a time
- Styled with admin Tailwind classes (`.input-field` trigger, forest/sage theme colors)

### IconRenderer component

**Props:**
```typescript
interface IconRendererProps {
  icon: IconValue | undefined;
  size?: number;
  className?: string;
}
```

**Rendering logic:**
- `set: 'lucide'` — dynamic import from `lucide-react`, render as SVG component
- `set: 'heroicons'` — dynamic import from `@heroicons/react/24/{outline|solid}`, render as SVG component
- `set: 'emoji'` — render `<span>` with the emoji character, sized via `font-size`

This replaces the existing `src/lib/puck/icons/IconRenderer.tsx`, which moves to the shared location.

### icon-catalog.ts

Extends the existing `src/lib/puck/icons/icon-catalog.ts` with emoji support:

```typescript
export interface IconEntry {
  set: 'lucide' | 'heroicons' | 'emoji';
  name: string;
  searchTerms: string;
  category?: string;      // for emoji grouping
}
```

- `getLucideIcons()`, `getHeroicons()` — unchanged, lazy-loaded and cached
- `getEmojis()` — returns entries from the curated emoji catalog
- `searchIcons(query, set?)` — searches across all sets (or filtered set), returns up to 200 results

### emoji-catalog.ts

Curated emoji collection organized by conservation-relevant categories:

| Category | Examples |
|----------|----------|
| Animals | 🐦 🦅 🦆 🦉 🐟 🐠 🦎 🐍 🐢 🐸 🦋 🐝 🐞 🦌 🐿️ 🐇 🦡 🐻 🐺 🦊 |
| Plants | 🌲 🌳 🌴 🌵 🌿 🍀 🌱 🌾 🌻 🌺 🌸 🍄 🪴 🎋 🎍 |
| Nature | 🏔️ ⛰️ 🌊 💧 🏖️ 🏕️ 🌅 🌄 ☀️ 🌧️ ❄️ 🔥 🌍 🗺️ 🧭 |
| Tools | 🔭 📷 🔬 🪣 🪜 🔧 📋 📝 📌 📍 🏷️ 🚜 🛶 🚙 ✂️ |
| General | ⭐ ❤️ ✅ ⚠️ 🏠 🚩 🎯 💡 🔔 📊 📁 🗓️ 👤 👥 🏗️ |

Each emoji gets a `searchTerms` string derived from its Unicode name (e.g., 🐦 → "bird", 🌲 → "evergreen tree") to enable text search.

## Puck Integration

The existing Puck `IconPickerField` (`src/lib/puck/fields/IconPickerField.tsx`) becomes a thin wrapper:

```typescript
import { IconPicker } from '@/components/shared/IconPicker';

export function IconPickerField({ value, onChange }: IconPickerFieldProps) {
  return <IconPicker value={value} onChange={onChange} />;
}
```

The Puck `IconRenderer` (`src/lib/puck/icons/IconRenderer.tsx`) is replaced with a re-export from the shared location. The Puck `icon-catalog.ts` is similarly replaced.

## Form Integration

### EntityTypeForm (`src/components/admin/EntityTypeForm.tsx`)

Replace the text input:
```tsx
// Before
<input type="text" value={icon} onChange={(e) => setIcon(e.target.value)}
       className="input-field w-16 text-center text-lg" maxLength={4} />

// After
<IconPicker value={icon} onChange={setIcon} />
```

State changes from `useState<string>('📋')` to `useState<IconValue>({ set: 'emoji', name: '📋' })`. Default for new entity types: `{ set: 'emoji', name: '📋' }`.

### ItemTypeEditor (`src/components/admin/ItemTypeEditor.tsx`)

Same pattern. Replace text input with `<IconPicker>`. State changes from `string` to `IconValue`. The `onSave` callback signature changes to accept `IconValue` for the icon field.

## Rendering Updates

All ~30 call sites that render `{thing.icon}` as inline emoji text are updated to use `<IconRenderer icon={thing.icon} size={N} />`. Key files:

| File | Context | Size |
|------|---------|------|
| `ItemCard.tsx` | Item listing cards | 18 |
| `DetailPanel.tsx` | Item detail view | 20 |
| `ItemMarker.tsx` | Map pin icons | 14 |
| `EntityCard.tsx` | Entity type cards | 30 |
| `UpdateTimeline.tsx` | Update feed icons | 14/10 |
| `EditItemForm.tsx` | Item type selector in edit form | 16 |
| `ItemForm.tsx` | Item type selector in create form | 16 |
| `UpdateForm.tsx` | Update type selector | 16 |
| `QuickAddSheet.tsx` | Quick-add map sheet | 16 |
| `MapLegend.tsx` | Map legend icons | 14 |
| `MapDisplayConfigEditor.tsx` | Admin map config | 16 |
| `UpdateTypeEditor.tsx` | Update type admin | 16 |
| `BlockConfigPanel.tsx` | Layout builder config | 14 |
| `BlockPalette.tsx` | Layout builder palette | 16 |
| `LayoutBuilder.tsx` | Layout builder | 20 |
| `ItemTypeEditor.tsx` | Collapsed header icon | 20 |

### ItemMarker special case

`ItemMarker.tsx` builds raw HTML strings for Leaflet `L.divIcon()`. It cannot use React components directly. Approach:

- **Emoji icons:** Render the character inline in the HTML string (same as current behavior).
- **SVG icons (Lucide/Heroicons):** Add a helper function `iconToHtml(icon: IconValue, size: number): string` to `IconRenderer.tsx` that returns an SVG string. For Lucide, import from `lucide-react` and use `ReactDOMServer.renderToStaticMarkup()`. For Heroicons, same approach. This function is async (due to dynamic imports) so `createIcon` becomes async — callers should pre-resolve the HTML or cache it.

The `Popup` content inside `ItemMarker` uses React, so that part can use `<IconRenderer>` directly.

## Out of Scope

- `update_types.icon` migration — same pattern, separate effort
- `roles.icon` — different use case
- Custom icon uploads (SVG/image files)
- Onboarding flow icon inputs (separate branch/worktree)
- AI context types (`src/lib/ai-context/types.ts`) — adapts separately to serialize icon name for LLM context
