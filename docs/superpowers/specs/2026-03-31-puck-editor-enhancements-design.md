# Puck Editor Enhancements — Design Spec

**Date:** 2026-03-31
**Scope:** Custom fields (ImagePicker, IconPicker, LinkField), richtext upgrade, and component enhancements for the Puck site builder.
**Out of scope:** Organization-wide asset library reuse (deferred to a separate effort).

---

## 1. Overview

The Puck site builder currently uses plain text fields for image URLs, links, and text content. This spec introduces three reusable custom Puck fields and upgrades existing components to use them, along with richer controls for HeaderBar and other components.

### Goals

- Replace raw URL text fields with an image picker that supports upload, library browse, and Google Photos
- Add an icon picker field supporting Lucide and Heroicons
- Add a smart link field with URL validation, internal page autocomplete, color picker, and new-tab toggle
- Upgrade text-heavy components to Puck's built-in richtext field with inline Cmd-K linking
- Enhance HeaderBar with logo upload, icon, typography controls, and header links
- Maintain full backwards compatibility with existing Puck data

---

## 2. ImagePickerField

**Puck field type:** `external`

### UI Flow

The field opens a modal with a tabbed interface:

- **Library tab** — grid of previously uploaded images for this property (from `landing-assets` Supabase bucket). Searchable by filename. Click to select.
- **Upload tab** — drag-and-drop or file picker. Uploads to `landing-assets` bucket using existing resize logic (2000px max width). After upload, the image is auto-selected.
- **Google Photos tab** — button that triggers the existing Google Photos Picker API overlay. On selection, the returned photo URL is stored.
- **URL tab** — paste an external URL directly (preserves current behavior as fallback).

### Storage

Reuses the existing `landing-assets` Supabase bucket. New uploads go to `images/{uuid}.{ext}`, same as today.

### Value Stored

A string URL — identical to the current text field format. Fully backwards-compatible with existing Puck data.

### Implementation

Built using Puck's `external` field type:
- `fetchList` queries the `landing-assets` bucket for the current property
- Custom footer content provides upload and Google Photos actions
- `mapProp` extracts the URL string from the selected asset
- `getItemSummary` shows the filename/thumbnail

### Components Using This Field

| Component | Field(s) |
|-----------|----------|
| Hero | `backgroundImageUrl` |
| ImageBlock | `url` |
| Gallery | `images[].url` |
| Card | `imageUrl` |
| Testimonial | `photoUrl` |
| Section | `backgroundImageUrl` |
| HeaderBar | `logoUrl` (new field, editable in Puck) |

---

## 3. IconPickerField

**Puck field type:** `custom`

### UI Flow

- Field displays the currently selected icon (rendered) with its name, or "No icon" placeholder
- Click to open a picker popover/modal:
  - **Search bar** — filters icons by name across both icon sets
  - **Tab toggle** — Lucide | Heroicons
  - **Icon grid** — scrollable grid, click to select
  - **Style toggle** — outline vs. solid (Heroicons has both; Lucide is outline-only)
  - **Clear button** — remove the icon selection

### Value Stored

```typescript
{
  set: "lucide" | "heroicons";
  name: string;        // e.g., "bird", "map-pin"
  style?: "outline" | "solid";  // Heroicons only
}
```

### Rendering

`IconRenderer` component takes the stored value and dynamically imports the specific icon from `lucide-react` or `@heroicons/react`. Only referenced icons are included in the public site bundle.

### Bundle Strategy

- The picker UI (editor-only) lazy-loads icon catalogs (name lists + metadata for search)
- The rendered site dynamically imports only the specific icons saved in Puck data
- Icon catalogs are not included in the public bundle

### Components Using This Field

| Component | Field | Behavior |
|-----------|-------|----------|
| HeaderBar | `icon` (new) | Decorative icon next to site name |
| Hero | `icon` (new, optional) | Icon above the title |
| Card | `icon` (new, optional) | Icon in the card |

---

## 4. LinkField

**Puck field type:** `custom`

### UI Flow

- Renders as a compact input group showing the current URL (or "No link" placeholder)
- Click to expand an editing panel:
  - **URL input** — text field with URL validation
  - **Internal page autocomplete** — as the user types `/`, suggests known internal routes from the property's Puck pages
  - **Open in new tab** — toggle switch (defaults to on for external URLs, off for internal)
  - **Link color** — color picker with preset swatches matching the site theme + custom hex input
  - **Link text preview** — shows how the link will look with the selected color

### Value Stored

```typescript
{
  href: string;
  target?: "_blank";
  color?: string;       // hex color, e.g., "#2563eb"
}
```

### Backwards Compatibility

Render functions accept both `string` (legacy) and `{ href, target?, color? }` (new). If the value is a string, it is treated as `{ href: value }` with default target and color. No data migration needed.

### Components Using This Field

| Component | Field(s) |
|-----------|----------|
| Hero | `ctaHref` |
| ImageBlock | `link` |
| ButtonGroup | `buttons[].href` |
| LinkList | `links[].url` |
| Card | `linkHref` |
| AnnouncementBar | `linkUrl` |
| FooterColumns | `columns[].links[].url` |
| SimpleFooter | `links[].url` |

---

## 5. RichText Field Upgrade

### What Changes

Components currently using `textarea` fields switch to Puck's built-in `richtext` field (TipTap-based, available in v0.21).

### Inline Linking (Cmd-K)

The richtext field supports TipTap's link extension. When the user selects text and presses Cmd-K (or clicks the link button), a link popover appears. We customize the link extension to include:
- Internal page autocomplete (same logic as LinkField)
- Open-in-new-tab toggle
- Link color picker (matching LinkField's color options)

### Link Color Rendering

Links in richtext content render with the specified color via inline styles or CSS custom properties. Default link color comes from the site's theme/primary color, overridable per-link.

### Inline Editing

Enable `contentEditable: true` on richtext components so users can edit text directly on the canvas rather than only in the side panel.

### Components Upgraded to RichText

| Component | Field |
|-----------|-------|
| RichText | `content` (from textarea) |
| Card | `text` (from textarea) |
| Testimonial | `quote` (from textarea) |
| AnnouncementBar | `text` (from textarea) |

### Components Staying as Text/Textarea

| Component | Field | Reason |
|-----------|-------|--------|
| Hero | `title`, `subtitle` | Display-oriented with specific typography; richtext adds unwanted complexity |
| ButtonGroup | `buttons[].label` | Short single-line strings |
| LinkList | `links[].label` | Short single-line strings |

### Backwards Compatibility

Puck stores richtext as HTML string. Plain text from existing textarea content is valid HTML and renders correctly without migration.

---

## 6. HeaderBar Component Enhancement

### Current Fields (Kept)

- `layout` — radio: left-aligned | centered
- `showTagline` — radio: Yes | No
- `backgroundColor` — select: default | primary | primary-dark | surface

### New Fields

| Field | Type | Description |
|-------|------|-------------|
| `logoUrl` | ImagePickerField | Overrides org-level logo when set; falls back to org logo if empty |
| `icon` | IconPickerField | Optional decorative icon next to site name |
| `iconPosition` | radio | `before-name` \| `after-name` \| `above-name` |
| `nameSize` | select | `small` \| `medium` \| `large` \| `xl` |
| `nameWeight` | select | `normal` \| `medium` \| `semibold` \| `bold` |
| `nameColor` | color picker | Preset swatches + custom hex |
| `taglineSize` | select | `small` \| `medium` \| `large` \| `xl` (shown via `resolveFields` when `showTagline` is true) |
| `taglineWeight` | select | `normal` \| `medium` \| `semibold` \| `bold` (conditional) |
| `taglineColor` | color picker | Preset swatches + custom hex (conditional) |
| `links` | array | `{ label: string, href: string }` — inline header navigation links |
| `linkColor` | color picker | Styling for header links |

### Conditional Fields

Tagline typography fields (`taglineSize`, `taglineWeight`, `taglineColor`) are shown/hidden using Puck's `resolveFields` API based on whether `showTagline` is true.

### Relationship to NavBar

HeaderBar links are simple inline links (e.g., "Contact", "Donate"). NavBar remains a separate component for complex navigation patterns (horizontal/hamburger/tabs, sticky positioning, mobile bottom bar).

---

## 7. Technical Architecture

### New Files

```
src/lib/puck/
  fields/
    ImagePickerField.tsx      — external field: Supabase library + upload + Google Photos + URL
    IconPickerField.tsx       — custom field: searchable Lucide + Heroicons grid
    LinkField.tsx             — custom field: URL + autocomplete + color
    richtext-extensions.ts    — custom TipTap extensions for link color, internal page autocomplete
  icons/
    icon-catalog.ts           — lazy-loaded index of Lucide + Heroicons names/metadata for search
    IconRenderer.tsx          — renders the correct icon from { set, name, style }
```

### Dependencies

| Package | Purpose | Bundle Impact |
|---------|---------|---------------|
| `@heroicons/react` | Heroicons icon library | Tree-shaken; only referenced icons in public bundle |
| `react-colorful` | Color picker (~2KB) | Editor-only, dynamically imported |

No new dependencies for richtext — Puck 0.21 includes TipTap internally.
Lucide (`lucide-react`) is expected to already be installed.

### Data Backwards Compatibility

| Field Type | Legacy Format | New Format | Migration Needed |
|------------|--------------|------------|------------------|
| Image fields | `string` (URL) | `string` (URL) | None — format unchanged |
| Link fields | `string` (URL) | `{ href, target?, color? }` | None — render functions accept both |
| Text fields | `string` (plain text) | `string` (HTML) | None — plain text is valid HTML |
| Icon fields | N/A (new) | `{ set, name, style? }` | None — new optional fields default to `undefined` |

### Bundle Considerations

- Icon catalogs (name lists for search) are lazy-loaded only in the editor
- `IconRenderer` dynamically imports only the specific icons used in saved Puck data
- `react-colorful` is editor-only and dynamically imported
- Google Photos Picker API script loaded on-demand when the Google Photos tab is opened

### Testing

- Unit tests for each custom field (render, selection, onChange callback)
- Unit tests for IconRenderer (correct icon for each set/name/style combo)
- Unit tests for backwards compatibility (string vs. object link values in render functions)
- Integration tests for image upload flow (mock Supabase storage)

---

## 8. Components Not Changed

| Component | Reason |
|-----------|--------|
| Spacer | No image/link/text fields |
| Columns | Layout-only component |
| MapPreview | Map-specific, no relevant fields |
| Embed | URL is whitelist-validated, different use case |
| NavBar | Current fields are appropriate |
| SocialLinks | Platform-specific URL fields, not general links |
| Stats | Data-driven, no relevant fields |
