# Multi-Page Site Builder

**Issue:** #142 — Enable Site Builder for creating more pages
**Date:** 2026-04-05

## Overview

Extend the Puck-based site builder from a single landing page editor to a multi-page CMS. Users can create any number of pages, manage them from a pages list view, link them in navigation, and publish them on custom routes.

## Data Model

### Existing columns (no changes)

- `puck_pages` / `puck_pages_draft` (JSONB) — already keyed by path, supports multiple pages:
  ```jsonc
  {
    "/": { "root": {}, "content": [...], "zones": {} },
    "/events": { "root": {}, "content": [...], "zones": {} }
  }
  ```

### New column

- `puck_page_meta` (JSONB) on `properties` table — stores per-page metadata keyed by path:
  ```jsonc
  {
    "/events": { "title": "Events", "slug": "events", "createdAt": "2026-04-05" },
    "/volunteer": { "title": "Volunteer", "slug": "volunteer", "createdAt": "2026-04-01" }
  }
  ```
  The landing page (`/`) is implicit and does not need a meta entry.

### Migration

Single migration adding `puck_page_meta JSONB DEFAULT '{}'` to the `properties` table.

## Site Builder IA

### Top-level tabs

- **Pages** (default) — pages list view (replaces "Landing Page" tab)
- **Header & Footer** — unchanged
- **Templates** — unchanged

### Pages tab

- Card grid showing all pages: title, slug, landing page badge, draft/published indicator
- **"+ New Page" button** opens a modal:
  - Title (required)
  - Slug (auto-generated from title, editable)
  - "Set as landing page" checkbox
- Clicking a page card navigates to the Puck editor for that page
- Back button/breadcrumb returns to pages list
- Kebab menu per card: Edit, Set as landing page, Delete

### Route structure

```
/admin/properties/[slug]/site-builder/
  /pages              → pages list view
  /pages/[...path]    → PuckPageEditor for specific page
  /chrome             → PuckChromeEditor (unchanged)
  /templates          → template picker (unchanged)
```

Old `/landing` route redirects to `/pages`. Default redirect from `/site-builder` goes to `/pages`.

## Public-Facing Routing

New catch-all route at `src/app/[...slug]/page.tsx`:

1. Join slug segments into a path (e.g. `["events"]` → `/events`)
2. Look up path in `config.puckPages` (or `config.puckPagesDraft` if `?preview=true`)
3. If found → render `PuckPageRenderer`
4. If not found → `notFound()`

Next.js prioritizes explicit routes (`/map`, `/list`, `/about`, `/admin`) over catch-all routes, so existing routes are unaffected.

Preview mode works identically to the current landing page: `?preview=true` uses draft data and shows the yellow preview banner.

The root `/` page (`src/app/page.tsx`) stays as-is — it already handles the landing page from `puck_pages['/']`.

## Link Field & Navigation

### Extending linkField

The existing `PuckSuggestionsProvider` is extended to carry custom pages from `puck_page_meta` alongside external links.

`LinkField` suggestion groups become:
1. **Built-in Pages** — Map, List, About (existing `PUBLIC_ROUTES`)
2. **Custom Pages** — dynamically populated from page metadata
3. **Previously Used** — external links (existing behavior)

No new field type needed. Every component using `linkField` automatically gets custom page suggestions.

### NavBar

No structural changes to the NavBar component. It already renders items from its props. The improvement is in the editor: when configuring NavBar link items, the link field now suggests custom pages as targets.

## Server Actions

### New actions

- **`createPage(title, slug, isLandingPage)`**
  - Validates slug against `RESERVED_SLUGS` set: `map`, `list`, `about`, `admin`, `auth`, `api`, `p`
  - Validates slug uniqueness against existing `puck_page_meta` keys
  - Creates empty Puck data at the path in `puck_pages_draft`
  - Adds entry to `puck_page_meta`
  - If `isLandingPage` and `/` already has content: moves current `/` content to a slug derived from the old landing page title (or `/home`), creates meta entry for the displaced page, then puts new page content at `/`
  - If `isLandingPage` and `/` has no content: simply places the new page at `/`

- **`deletePage(path)`**
  - Removes the path key from `puck_pages`, `puck_pages_draft`, and `puck_page_meta`
  - Cannot delete `/` — must reassign landing page first

- **`setLandingPage(path)`**
  - Swaps content at `path` with `/` in `puck_pages`, `puck_pages_draft`, and `puck_page_meta`

- **`updatePageMeta(path, { title?, slug? })`**
  - If slug changes, moves content to the new path key in all three JSONB columns

### Existing actions (minor updates)

- `savePuckPageDraft(path, data)` — no changes needed (already supports any path)
- `publishPuckPages()` — no changes needed (already copies entire draft object)
- `getPuckData()` — add `puck_page_meta` to the select query

## Testing

### Unit tests (Vitest)

- **`createPage` action:** validates reserved slugs are rejected, slug uniqueness enforced, empty Puck data created at correct path, meta entry added, landing page swap logic
- **`deletePage` action:** removes from all three columns, rejects deleting `/`
- **`setLandingPage` action:** correctly swaps content and meta between paths
- **`updatePageMeta` action:** title-only update, slug change moves content
- **Reserved slug validation:** all reserved slugs rejected, valid slugs accepted
- **Link suggestions:** custom pages appear in suggestions, built-in routes preserved
- **Slug generation from title:** handles special characters, spaces, duplicates

### E2E tests (Playwright)

- **Create a page:** open site builder → click "+ New Page" → fill title → verify slug auto-generated → submit → page appears in list
- **Edit a page:** click page card → Puck editor loads → add a component → save → verify draft persisted
- **Delete a page:** kebab menu → delete → confirm → page removed from list
- **Set as landing page:** kebab menu → set as landing → verify badges update
- **Public page rendering:** create and publish a page → visit the public URL → verify content renders
- **Catch-all routing:** visit non-existent slug → verify 404
- **Link field suggestions:** in Puck editor, add a link component → verify custom pages appear in suggestions
