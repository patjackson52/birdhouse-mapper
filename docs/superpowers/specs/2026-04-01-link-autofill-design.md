# Link Autofill for Site Builder

**Issue:** [#157](https://github.com/patjackson52/birdhouse-mapper/issues/157)
**Date:** 2026-04-01

## Problem

The site builder's link fields are plain text inputs. Users must remember and type URLs manually — both internal routes (`/map`, `/about`) and external URLs they've already used elsewhere. This is error-prone and undiscoverable.

## Solution

Upgrade the `LinkField` component to a combobox with grouped suggestions that appear on focus. Users can browse or type — suggestions filter in real-time.

## UX

**On focus (empty input):** Dropdown opens showing all suggestions in two groups:

- **Pages** — public-facing internal routes (Home, Map, About, List)
- **Previously Used** — deduplicated external URLs already present in other components of the current draft

**Typing:** Both groups filter in real-time, matching against path, label, or full URL.

**Selecting a suggestion:** Fills the input, closes the dropdown, emits the change. External URLs auto-set `target: '_blank'` (open in new tab).

**Escape / click outside:** Closes the dropdown without changing the value.

**Keyboard navigation:** Arrow keys move focus through suggestions, Enter selects.

**Free-form input:** Users can still type any URL. The combobox is additive — it doesn't restrict input.

## Architecture

### Public routes list

Static array in `src/lib/puck/fields/link-suggestions.ts`:

```typescript
export const PUBLIC_ROUTES = [
  { href: '/', label: 'Home' },
  { href: '/map', label: 'Map' },
  { href: '/about', label: 'About' },
  { href: '/list', label: 'List' },
];
```

When custom puck pages are added later, this becomes a DB query. The `LinkSuggestion` interface stays the same.

### PuckSuggestionsProvider

React context wrapping both `PuckPageEditor` and `PuckChromeEditor`.

**Input:** Current Puck `Data` object (updated on every edit via Puck's `onChange`).

**Output:** `externalLinks: LinkSuggestion[]` — deduplicated external URLs extracted from all components in the current draft.

**Extraction logic:** Walks `data.content` and `data.zones`, inspects all props for:
- `LinkValue` objects where `href` starts with `http`
- Plain strings starting with `http`

Deduplicates by URL. Label is the hostname (e.g., `troop1564.org`).

### LinkField changes

Replace the plain `<input>` with a combobox:
- Reads `PUBLIC_ROUTES` from the static list
- Reads `externalLinks` from `PuckSuggestionsProvider` context (gracefully handles missing context — shows only pages group)
- Dropdown renders two groups with headers
- Standard combobox accessibility: `role="combobox"`, `role="listbox"`, `aria-expanded`, `aria-activedescendant`

### Files to create

| File | Purpose |
|------|---------|
| `src/lib/puck/fields/link-suggestions.ts` | `PUBLIC_ROUTES` array + `LinkSuggestion` type + extraction utility |
| `src/lib/puck/fields/PuckSuggestionsProvider.tsx` | React context provider |

### Files to modify

| File | Change |
|------|--------|
| `src/lib/puck/fields/LinkField.tsx` | Replace `<input>` with combobox UI |
| `src/components/puck/PuckPageEditor.tsx` | Wrap editor in `PuckSuggestionsProvider` |
| `src/components/puck/PuckChromeEditor.tsx` | Wrap editor in `PuckSuggestionsProvider` |

### No changes to

- Schema, DB, migrations
- Server actions
- Component render functions
- `linkField()` factory function signature
- `link-utils.ts` types

## Testing

- **link-suggestions.test.ts** — extraction logic: walks puck data correctly, deduplicates, ignores internal URLs, handles empty/malformed data
- **LinkField.test.tsx** — combobox behavior: opens on focus, filters on type, selects on click, keyboard nav (arrow keys + Enter), closes on Escape/blur, auto-sets `_blank` for external URLs, works without context provider (pages-only mode)
- **Existing tests** — all existing `LinkField` and `link-utils` tests continue to pass unchanged
