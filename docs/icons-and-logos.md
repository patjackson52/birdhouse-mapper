# Icons & Logos

## Overview

FieldMapper uses a unified icon system that supports three icon sets — Lucide, Heroicons, and a curated emoji catalog — across the entire app: admin forms, map markers, sidebar navigation, the Puck site builder, and more. Icons are stored as structured JSON in the database rather than plain text, enabling consistent rendering and searchability.

The logo system handles org and property branding with automatic variant generation for PWA, favicon, and display use cases.

---

## Icons

### Data Model

Icons are stored as `jsonb` in the database using the `IconValue` type:

```typescript
interface IconValue {
  set: 'lucide' | 'heroicons' | 'emoji';
  name: string;
  style?: 'outline' | 'solid';  // heroicons only; defaults to 'outline'
}
```

**Example values:**
```json
{ "set": "emoji",     "name": "🐦" }
{ "set": "lucide",    "name": "MapPin" }
{ "set": "heroicons", "name": "Map",  "style": "outline" }
```

**Database columns using `IconValue`:**
- `item_types.icon` — jsonb, NOT NULL, default `{"set":"emoji","name":"📍"}`
- `entity_types.icon` — jsonb, NOT NULL, default `{"set":"emoji","name":"📋"}`

Migration `044_icon_jsonb.sql` converted these from plain text (bare emoji) to jsonb. Existing emoji values were automatically wrapped: `"🐦"` became `{"set":"emoji","name":"🐦"}`.

> **Note:** `roles.icon` and update types still use plain text strings — they haven't been migrated to `IconValue` yet.

### Components

#### IconPicker

**File:** `src/components/shared/IconPicker/IconPicker.tsx`

The primary icon selection UI. A button that opens a dropdown with search, set filter tabs, and a scrollable icon grid.

```tsx
import { IconPicker } from '@/components/shared/IconPicker';

<IconPicker
  value={icon}              // IconValue | undefined
  onChange={setIcon}        // (value: IconValue | undefined) => void
  className="..."           // optional
/>
```

**Features:**
- Search across all three icon sets (substring match on names/keywords)
- Filter tabs: All, Lucide, Heroicons, Emoji
- 8-column scrollable grid with 32x32 icon buttons
- Clear button to unset the icon
- Shows current icon with display name and set badge

#### IconRenderer

**File:** `src/components/shared/IconPicker/IconRenderer.tsx`

Renders any `IconValue` as a React component. Handles all three sets with lazy loading for SVG icons.

```tsx
import { IconRenderer } from '@/components/shared/IconPicker';

<IconRenderer
  icon={icon}              // IconValue | undefined
  size={20}                // px, default 20
  className="text-white"   // optional
/>
```

**Rendering by set:**
| Set | Strategy |
|---|---|
| `emoji` | `<span>` with the emoji character (synchronous) |
| `lucide` | Dynamic import from `lucide-react`, renders SVG component |
| `heroicons` | Dynamic import from `@heroicons/react/24/{outline\|solid}`, renders SVG component |

Returns `null` for undefined icons or failed imports. Lucide/Heroicons load asynchronously — there's a brief frame where nothing renders while the import resolves.

#### iconToHtml

**File:** `src/components/shared/IconPicker/IconRenderer.tsx`

Async helper that produces a raw HTML string for non-React contexts (Leaflet map markers).

```typescript
import { iconToHtml } from '@/components/shared/IconPicker';

const html = await iconToHtml(icon, 14);  // Returns HTML string
```

- Emoji: returns the character directly
- Lucide/Heroicons: uses `react-dom/server.renderToStaticMarkup()` to produce SVG markup

Used in `ItemMarker.tsx` to inject icon HTML into Leaflet `DivIcon` templates.

#### iconDisplayName

**File:** `src/lib/types.ts`

Plain-text label for contexts where React components can't render (e.g., `<option>` elements, sidebar nav labels).

```typescript
import { iconDisplayName } from '@/lib/types';

iconDisplayName({ set: 'emoji', name: '🐦' })     // "🐦"
iconDisplayName({ set: 'lucide', name: 'MapPin' }) // "Map Pin"
```

### Emoji Catalog

**File:** `src/components/shared/IconPicker/emoji-catalog.ts`

75 conservation-relevant emojis in 5 categories:

| Category | Count | Examples |
|---|---|---|
| Animals | 20 | 🐦 🦅 🦆 🦉 🐟 🦋 🐝 🦌 |
| Plants | 15 | 🌲 🌳 🌴 🌵 🌿 🍀 🌱 🌾 |
| Nature | 15 | 🏔️ ⛰️ 🌊 💧 🏖️ 🏕️ 🌅 ☀️ |
| Tools | 15 | 🔭 📷 🔬 🪣 🪜 🔧 📋 📝 |
| General | 10 | ⭐ ❤️ ✅ ⚠️ 🏠 🚩 🎯 💡 |

Each emoji has search terms for discoverability (e.g., "bird" finds 🐦, "water" finds 🌊 💧).

### Icon Catalog (Search)

**File:** `src/components/shared/IconPicker/icon-catalog.ts`

```typescript
import { searchIcons, getLucideIcons, getHeroicons, getEmojis } from '@/components/shared/IconPicker';

const results = await searchIcons('bird');                   // all sets
const results = await searchIcons('arrow', 'lucide');        // one set
const lucide  = await getLucideIcons();                      // full list
const hero    = await getHeroicons();                        // full list
const emoji   = getEmojis();                                 // synchronous
```

Search is substring-based on pre-computed search terms. Results are capped at 200.

### Where Icons Render

| Context | Component/Helper | Size | Notes |
|---|---|---|---|
| Map markers | `iconToHtml()` → Leaflet DivIcon | 14px | Async; emoji shown immediately, SVG loads after |
| Map legend | `IconRenderer` | 14px | Inline next to type name |
| Item detail panel | `IconRenderer` | 20px / 12px | Item type header / entity type label |
| Item cards (list view) | `IconRenderer` | 18px | Next to item name |
| Admin entity type form | `IconPicker` | — | Full picker for editing |
| Admin item type editor | `IconPicker` + `IconRenderer` | 20px | Picker for editing, renderer in collapsed row |
| Layout entity list block | `IconRenderer` | 12px | Entity group headers |
| Puck Hero block | `IconRenderer` | 48px | Optional, above hero title |
| Puck Card block | `IconRenderer` | 24px | Optional, above card title |
| Puck site header | `IconRenderer` | 20-28px | Branding icon, scales with name size |
| Sidebar nav / selectors | `iconDisplayName()` | — | Plain text only (emoji char or "Map Pin") |

### Puck Site Builder Integration

The shared icon picker is wrapped for Puck's custom field system:

```typescript
// In a Puck component config:
import { iconPickerField } from '@/lib/puck/fields';

const MyComponent = {
  fields: {
    icon: iconPickerField('Icon'),  // produces a Puck custom field
  },
  // ...
};
```

The wrapper at `src/lib/puck/fields/IconPickerField.tsx` is a thin pass-through to the shared `IconPicker`. Re-export shims exist at `src/lib/puck/icons/` for `IconRenderer` and `icon-catalog`.

---

## Logos

### How Logos Work

Organizations and properties can have custom logos. On upload, the system generates 5 variants using Sharp for different display contexts.

### Variants

| File | Dimensions | Purpose |
|---|---|---|
| `original.png` | max 1024x1024 (fit inside) | General display |
| `icon-192.png` | 192x192 (cover crop) | PWA manifest small icon |
| `icon-512.png` | 512x512 (cover crop) | PWA manifest large icon |
| `icon-512-maskable.png` | 512x512 with 20% safe-zone padding | Android adaptive icon |
| `favicon-32.png` | 32x32 (cover crop) | Browser favicon |

### Storage

All variants are stored in the `vault-public` Supabase storage bucket:

- **Org logo:** `vault-public/{orgId}/original.png`, `vault-public/{orgId}/icon-192.png`, etc.
- **Property logo:** `vault-public/{orgId}/{propertyId}/original.png`, etc.

The database stores only the **base path** (e.g., `{orgId}` or `{orgId}/{propertyId}`) in `orgs.logo_url` and `properties.logo_url`. Full URLs are constructed at read time.

### URL Resolution

```typescript
// Client-side
import { getLogoUrl } from '@/lib/config/logo';
const url = getLogoUrl(org.logo_url, 'original.png');
const favicon = getLogoUrl(org.logo_url, 'favicon-32.png');

// Server-side
import { getLogoUrlServer } from '@/lib/config/logo-server';
const url = getLogoUrlServer(org.logo_url, 'icon-192.png');
```

When `logo_url` is `null`, both functions return a default logo from `/defaults/logos/`.

**Available variants type:**
```typescript
type LogoVariant = 'original.png' | 'icon-192.png' | 'icon-512.png' | 'icon-512-maskable.png' | 'favicon-32.png';
```

### Upload

**Server action:** `src/app/admin/settings/logo-actions.ts`

```typescript
uploadLogo(formData: FormData, scope: 'org' | 'property', propertyId?: string)
```

Accepts any image file up to 5 MB. Uses Sharp to generate all 5 variants and uploads them to `vault-public`.

**Default logos:** `uploadDefaultLogo(defaultName, scope, propertyId?)` reads from `public/defaults/logos/{name}.png` and runs it through the same variant pipeline. Available defaults: `fieldmapper`, `birdhouse`, `binoculars`, `leaf`.

### LogoUploader Component

**File:** `src/components/admin/LogoUploader.tsx`

```tsx
<LogoUploader
  currentLogoUrl={logoUrl}      // string | null — shown as preview
  scope="org"                   // 'org' | 'property'
  orgId={orgId}                 // required
  propertyId={propertyId}       // required when scope='property'
  onUploaded={(basePath) => {}} // called after successful upload
/>
```

Three upload modes:
1. **File picker** — any image, processed through variant pipeline
2. **Vault picker** — select from existing branding images in the data vault
3. **Default logos** — pre-built logos shipped with the app

### Key Files

| File | Purpose |
|---|---|
| `src/app/admin/settings/logo-actions.ts` | `uploadLogo`, `uploadDefaultLogo` server actions |
| `src/lib/config/logo.ts` | Client-side `getLogoUrl()` |
| `src/lib/config/logo-server.ts` | Server-side `getLogoUrlServer()` |
| `src/components/admin/LogoUploader.tsx` | Upload/select UI component |
