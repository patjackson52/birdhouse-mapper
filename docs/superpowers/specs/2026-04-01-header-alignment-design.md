# Header Tagline Position Design

**Issue:** [#147](https://github.com/patjackson52/birdhouse-mapper/issues/147)
**Date:** 2026-04-01

## Summary

Add a `taglinePosition` field to the HeaderBar Puck component, allowing users to choose whether the tagline renders below the header row (current behavior) or grouped with the title next to the icon.

## Motivation

The current HeaderBar renders the tagline as a separate paragraph below the entire header row. This looks disconnected from the icon+title group. A common header pattern is:

```
icon | Title
     | Subtitle (tagline)
```

This groups the title and tagline visually as a unit, with the icon vertically centered alongside.

## Changes

### New field: `taglinePosition`

- **Type:** `"below" | "grouped"`
- **Default:** `"below"` (backward compatible — existing sites unchanged)
- **Visible when:** `showTagline` is true (same conditional visibility as other tagline fields)

### Rendering behavior

When `taglinePosition === "grouped"`:
- The tagline moves inside the Link element, stacked below the site name in a flex-column container
- The icon sits beside (or above) the title+tagline stack depending on `iconPosition`

**By icon position:**
- `before-name`: icon to the left, title+tagline stacked vertically to the right
- `after-name`: title+tagline stacked vertically, icon to the right
- `above-name`: icon above, then title, then tagline (all stacked vertically)

When `taglinePosition === "below"` (default):
- Current behavior — tagline renders as a `<p>` below the header row

### Files to modify

- `src/lib/puck/types.ts` — add `taglinePosition?: 'below' | 'grouped'` to `HeaderBarProps`
- `src/lib/puck/chrome-config.ts` — add `taglinePosition` radio field, conditionally shown when `showTagline` is true
- `src/lib/puck/components/chrome/HeaderBar.tsx` — restructure rendering to support grouped layout
