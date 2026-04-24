# Scheduled Maintenance — Public Viewer + Item Block (PR 3)

**Date:** 2026-04-24
**Branch:** `feat/maintenance-public-viewer`
**Builds on:** PR 1 (`ea37d54`) + PR 2 (`a9d1896`) — specs in `docs/superpowers/specs/2026-04-23-scheduled-maintenance-design.md` and `2026-04-24-maintenance-pickers-design.md`
**Source design bundle:** `fieldmapper-scheduled-maintenance` (Claude Design handoff)

## Overview

Third and final PR in the Scheduled Maintenance rollout. Adds:

1. A **public viewer page** at `/p/[slug]/maintenance/[id]` — shareable read-only view of a maintenance project and its linked items and knowledge, rendered for anonymous visitors on public properties.
2. A **`maintenance_projects` block type** for the item-type layout builder — admins add it to an item type's layout, and it renders per-item a compact history of maintenance projects that include this item. Visibility controlled by the existing block-level `permissions.requiredRole`.
3. A **`KnowledgePreviewCard`** — new reusable component for showing a knowledge article as a preview (hero cover image + title + visibility pill + excerpt + context-aware CTA). Used by the public viewer; available for future reuse.
4. **Migration `050_maintenance_public_read.sql`** — additive RLS policies granting anonymous SELECT on `maintenance_projects` / `maintenance_project_items` / `maintenance_project_knowledge` scoped to projects on active public properties.

## Goals

- Anonymous visitors can open `/p/[slug]/maintenance/[id]` on an active property and see project title, description, meta, linked items, and knowledge previews without authentication.
- Org members (signed in) see org-only articles with direct links to the full admin view; anonymous viewers see a sign-in CTA.
- `KnowledgePreviewCard` surfaces the hero image when present and degrades gracefully when absent.
- `maintenance_projects` block plugs into the existing V2 layout-builder pipeline (palette → config → renderer) with no special casing.
- Admin can toggle block visibility per placement via `permissions.requiredRole` — e.g., admin-only for draft layouts, public for published item pages.
- No regression in existing admin flows; all PR 1 / PR 2 tests continue to pass.

## Non-goals (PR 3)

- **Org-level public maintenance index** (`/p/[slug]/maintenance` without an id). Out of scope; the design only specified the single-project viewer.
- **Offline support** for the public viewer. Still admin-side only.
- **Linking items from the public viewer** to per-item pages. Items render read-only with no chevron action.
- **Custom OG/twitter card image.** Text-only `generateMetadata` for PR 3.
- **Block configuration surface beyond standard (permissions, width)** — no max-count, no filters, no display styles. Per brainstorming, zero config.
- **Rendering on the public map popup** — the `maintenance_projects` block targets the item detail layout, not the map popup. Map popup integration is a future effort.

## Data model

No schema changes. One new migration adds additive RLS policies.

### Migration: `supabase/migrations/050_maintenance_public_read.sql`

```sql
-- Anonymous / non-member SELECT on maintenance projects whose property is active.
create policy maintenance_projects_select_public on maintenance_projects
  for select using (
    property_id is not null
    and exists (
      select 1 from properties p
      where p.id = maintenance_projects.property_id
        and p.is_active = true
    )
  );

create policy mpi_select_public on maintenance_project_items
  for select using (
    exists (
      select 1 from maintenance_projects mp
      join properties p on p.id = mp.property_id
      where mp.id = maintenance_project_items.maintenance_project_id
        and p.is_active = true
    )
  );

create policy mpk_select_public on maintenance_project_knowledge
  for select using (
    exists (
      select 1 from maintenance_projects mp
      join properties p on p.id = mp.property_id
      where mp.id = maintenance_project_knowledge.maintenance_project_id
        and p.is_active = true
    )
  );
```

These are **additive** — PR 1's member-read and staff+ write policies are untouched.

### Related existing policies (relied upon, not modified)

- `items`: must already allow public read on items belonging to active properties. Verify during implementation; if missing, extend this migration with an analogous `items_select_public` policy. The existing `/p/[slug]` public map works, so some form of public-read on items already exists.
- `knowledge_items`: `knowledge_items_select_public` (from migration 029) permits reads of `visibility = 'public'` rows. Org-only articles are filtered out for anonymous viewers; the preview card handles that by rendering a sign-in CTA based on the absence of full data.

### `SYNC_TABLES`

No changes. Maintenance tables stay off offline sync.

## Public viewer

### Routes

```
src/app/p/[slug]/maintenance/[id]/
  page.tsx                    # server: fetch + composition + generateMetadata
  loading.tsx                 # skeleton
  error.tsx                   # error boundary with Retry
  MaintenancePublicViewer.tsx # presentational; imported by page.tsx
```

No re-export boilerplate — the route lives directly under `/p/[slug]`, not duplicated under `/admin/properties/[slug]`.

### `page.tsx` responsibilities

1. Fetch property by slug; `notFound()` if missing or `is_active = false`.
2. Fetch project by id, scoped to `property_id = property.id`; `notFound()` if missing.
3. Fetch linked items via `maintenance_project_items` join with `items(name, item_type_id, item_types(name, icon))`.
4. Compute `last_maintained_at` per item via a batched `item_updates` query (same as the picker in PR 2: `update_types.name = 'Maintenance'`, newest first).
5. Fetch linked knowledge via `maintenance_project_knowledge` join with `knowledge_items(id, title, excerpt, visibility, cover_image_url)`.
6. Compute progress: `count(*) filter (where completed_at is not null)` / `count(*)` over `maintenance_project_items`.
7. Determine `isOrgMember`: `auth.getUser()` → `org_memberships` lookup for `property.org_id`. `false` for anonymous.
8. Render `<MaintenancePublicViewer …>`.
9. `generateMetadata` returns `{ title: "{project.title} — {property.name}", description: project.description?.slice(0, 160) ?? "…" }`.

### `MaintenancePublicViewer.tsx` layout

- Sticky top header: property icon + property name on the left; nav links (Map / List / About) on the right for desktop, menu icon for mobile.
- "← Back to map" link to `/p/[slug]`.
- Eyebrow "Maintenance project" + `MaintenanceStatusPill`.
- Heading (`font-heading`, large), description paragraph.
- Meta card (2-column mobile, 3-column desktop):
  - Scheduled (formatted date or "TBD")
  - Scope — `{items.length} items`
  - Progress — visible only when `status === 'in_progress'`; renders progress bar + ratio
- Items section heading `<h2>` "Items in this project"; each row = tone dot + name + type · last-maintained label. Read-only (no chevrons / links).
- Knowledge section (conditional): `<h2>` "Reference material" + a list of `KnowledgePreviewCard` components. Hidden entirely when empty.

Presentation uses Tailwind + existing theme tokens (`text-forest-dark`, `bg-parchment`, `border-sage-light`), `font-heading` for Playfair headings, standard `.card` for the meta block. No inline-style translations — Tailwind utility classes throughout.

## `KnowledgePreviewCard` component

**File:** `src/components/knowledge/KnowledgePreviewCard.tsx`.

**Props:**

```ts
interface Props {
  item: Pick<KnowledgeItem, 'id' | 'slug' | 'title' | 'excerpt' | 'visibility' | 'cover_image_url'>;
  isOrgMember: boolean;
  /** Where the card appears — affects CTA wording. Defaults to 'inline'. */
  context?: 'inline' | 'listing';
  /** Optional override for the sign-in redirect URL. Defaults to current path. */
  signInRedirect?: string;
}
```

**Rendering:**

1. If `cover_image_url` present → render hero image (16:9 aspect, `object-cover`, rounded top); otherwise skip hero and keep the card compact.
2. Body area:
   - Visibility pill (`Public` green / `Org` indigo).
   - Title as `<h3 className="font-heading">`.
   - Excerpt (clamp to 3 lines with `line-clamp-3`).
   - CTA row:
     - `visibility === 'public'` → link `Read article ↗` to `/knowledge/[slug]` (existing public route).
     - `visibility === 'org' && isOrgMember` → link `Read full article` to `/admin/knowledge/[slug]`.
     - `visibility === 'org' && !isOrgMember` → `Sign in to read full article` link to `/login?redirect=<signInRedirect or current path>`.

**Accessibility:** `<article>` wrapper, heading `<h3>` for title, `alt={item.title}` on hero, visibility pill has `aria-label`.

## Layout block: `maintenance_projects`

### Type system wiring

**`src/lib/layout/types-v2.ts`** — extend:

```ts
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
  | 'description'
  | 'maintenance_projects';

export interface MaintenanceProjectsConfig {
  /** Reserved for future filter/display options. Empty in PR 3. */
}
```

Add `MaintenanceProjectsConfig` to the `BlockConfigV2` union.

**`src/lib/layout/schemas-v2.ts`** — register Zod schema for the new block type (`z.object({}).strict()` for config).

**`src/lib/layout/defaults-v2.ts`** — add default factory returning `{ type: 'maintenance_projects', config: {}, width: 'full' }` (or similar — follow existing pattern).

### Renderer

**File:** `src/components/layout/blocks/MaintenanceProjectsBlock.tsx` (client).

**Behavior:**

- Accept `{ itemId: string }` props.
- On mount, query:
  ```ts
  supabase
    .from('maintenance_project_items')
    .select('maintenance_project_id, completed_at, maintenance_projects(id, title, status, scheduled_for, property_id)')
    .eq('item_id', itemId)
  ```
  Then client-side sort by `maintenance_projects.updated_at` (or `scheduled_for`) descending — whichever field best surfaces relevance.
- Render a card with wrench icon + "Maintenance" heading + project count.
- Each row: `MaintenanceStatusPill size="sm"` + project title + scheduled date (right-aligned).
- Footer: if any row has `completed_at`, show `Last maintained via <project.title> · {date}` (using the most recent completion).
- Empty state: `return null` (let the layout renderer's `hideWhenEmpty` handle it; default true for this block).
- Loading state: card with 2 skeleton rows.
- Error state: compact inline message "Couldn't load maintenance history."

**File:** `src/components/layout/LayoutRendererV2.tsx` — add `case 'maintenance_projects'`:

```ts
case 'maintenance_projects':
  return <MaintenanceProjectsBlock itemId={item.id} />;
```

### Block palette registration

**File:** `src/components/layout/builder/BlockPaletteV2.tsx` — add palette entry:

- Icon: wrench (lucide `Wrench`)
- Label: "Maintenance"
- Category: "Information" (same tier as `timeline`, `action_buttons`)

**File:** `src/components/layout/builder/BlockConfigPanelV2.tsx` — no custom config UI needed; use the default panel that shows permissions + width controls.

### Visibility

The block uses the existing `permissions.requiredRole` mechanism. Default placement in a type layout should set `requiredRole: undefined` (public) so it shows on the public item pages by default, matching the user's instruction "public visible by default". Admins can tighten to `'editor'` or `'admin'` per placement.

## Error handling & states

### Public viewer

| State | Behavior |
|---|---|
| Property slug missing or `is_active = false` | `notFound()` → 404 |
| Project id missing or not on property | `notFound()` → 404 |
| Cancelled project | Renders normally with cancelled status pill |
| Project fetch error | `error.tsx` — "Something went wrong" + Retry |
| No items linked | Items section renders "No items yet" placeholder |
| No knowledge linked | Hide knowledge section entirely |
| Org-only article to anonymous viewer | `KnowledgePreviewCard` shows sign-in CTA; card still renders excerpt if preview visible under RLS, otherwise falls back to title + pill only |
| Knowledge item load error | Skip the card silently — one bad reference shouldn't fail the page |

### Layout block

| State | Behavior |
|---|---|
| Loading | Skeleton placeholder inside the card |
| Empty (no linked projects) | Render `null` |
| Fetch error | Compact inline error message in the card |

### SEO / metadata

```ts
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  // Same fetch shape as the page (property + project); reject to null on any miss.
  // Returns:
  //   title: `${project.title} — ${property.name}`
  //   description: project.description?.slice(0, 160) ?? "Maintenance project"
}
```

No OG image for PR 3.

### Concurrency

Public viewer is server-rendered on each request (or ISR), read-only. Layout block is read-only. Nothing to serialize.

## Accessibility

- `<header>` / `<main>` landmarks on the public viewer.
- Heading hierarchy: project h1 → "Items in this project" h2 → "Reference material" h2 → per-article h3.
- Status pills carry `aria-label` (already true from PR 1).
- Tone dots have `aria-hidden="true"`.
- Knowledge preview hero image uses `alt={item.title}`.
- Skip-to-content link not required (single main landmark).

## Testing

### Vitest unit + component tests

1. `src/__tests__/knowledge/KnowledgePreviewCard.test.tsx`:
   - Hero renders when `cover_image_url` present; omitted when null
   - Title + excerpt render
   - Public article → "Public" pill + `/knowledge/[slug]` link with `Read article ↗`
   - Org + not member → `Sign in to read full article` link to `/login?redirect=…`
   - Org + member → `Read full article` link to `/admin/knowledge/[slug]`
2. `src/__tests__/maintenance/MaintenancePublicViewer.test.tsx`:
   - Title + description render
   - Status pill matches project status
   - Progress bar renders only when status is `in_progress`
   - Items list with per-item tone indicators
   - "Reference material" section hidden when no knowledge; present when linked
   - Property name in sticky header
3. `src/__tests__/layout/MaintenanceProjectsBlock.test.tsx` (mock Supabase + navigation):
   - Skeleton on initial load
   - Linked projects render with status pills + titles + dates
   - Returns `null` when no linked projects
   - Error renders inline without throwing
   - Last-maintained footer picks the most recent `completed_at`

### Playwright E2E

- **New spec:** `e2e/tests/public/maintenance-viewer.spec.ts` — anonymous visit to the viewer URL; asserts title, status pill, items list, and (when applicable) "Reference material".
- **Extend** `e2e/tests/admin/maintenance.spec.ts`: after the create-and-add-item steps, open a new anonymous browser context, navigate to `/p/default/maintenance/[created-id]`, verify the title is present.

### Visual baseline

Per `docs/playbooks/visual-diff-screenshots.md`:
- Public viewer desktop (with items + knowledge)
- Public viewer narrow viewport
- `KnowledgePreviewCard` — public, org-member, org-anonymous states
- `MaintenanceProjectsBlock` embedded in an item edit page

### Accessibility check

Manual: keyboard walk through the public viewer (focus visible on links, landmarks announced). Lighthouse run targeting a11y score 90+.

## File map (deliverables)

```
supabase/migrations/050_maintenance_public_read.sql                      (new)

src/app/p/[slug]/maintenance/[id]/
  page.tsx                                                               (new)
  loading.tsx                                                            (new)
  error.tsx                                                              (new)
  MaintenancePublicViewer.tsx                                            (new)

src/components/knowledge/KnowledgePreviewCard.tsx                        (new)

src/lib/layout/
  types-v2.ts                                                            (extend)
  schemas-v2.ts                                                          (extend)
  defaults-v2.ts                                                         (extend)

src/components/layout/
  LayoutRendererV2.tsx                                                   (extend switch)
  blocks/MaintenanceProjectsBlock.tsx                                    (new)
  builder/BlockPaletteV2.tsx                                             (extend palette)

src/__tests__/knowledge/KnowledgePreviewCard.test.tsx                    (new)
src/__tests__/maintenance/MaintenancePublicViewer.test.tsx               (new)
src/__tests__/layout/MaintenanceProjectsBlock.test.tsx                   (new)

e2e/tests/public/maintenance-viewer.spec.ts                              (new)
e2e/tests/admin/maintenance.spec.ts                                      (extend)
```

## Open questions (resolved)

| # | Question | Answer |
|---|---|---|
| 1 | Public read visibility model? | A — public whenever the property is `is_active = true` |
| 2 | Where does the maintenance card render? | Via layout block on item detail; public-visible by default, configurable per-placement |
| 3 | Block config surface? | A — zero config; permissions + width only |
| 4 | Reuse preview component? | New `KnowledgePreviewCard` (with hero cover image) |

## Out-of-band follow-ups (future PRs)

- **Org-level maintenance index** at `/admin/maintenance` + public at `/p/[slug]/maintenance` (list all projects on a property).
- **OG image** for shared public viewer URLs.
- **Offline support** for items + maintenance_project_items for field-worker check-off flow.
- **Map popup integration** — add a maintenance summary line in the `/p/[slug]` map popup.
- **Block configuration expansion** — max-count, filter by status, sort order — once a user request motivates it.
