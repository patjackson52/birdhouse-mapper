# Item Timeline v2 — Design

## Context

Today, `TimelineBlock` on the item detail page renders `TimelineOverview` (`src/components/item/timeline/TimelineOverview.tsx`), introduced by the 2026-04-17 *Timeline Updates Viewing* spec. It shows compact cards with a small photo thumbnail, relative date, text preview, field chips, and entity pills. The present design supersedes that approach.

The shift is motivated by three gaps:

1. **Photo is buried.** Field contributors — especially volunteers on the public form — submit photo-forward updates. The small right-aligned thumbnail treatment does not do them justice.
2. **No attribution on overview.** Volunteer engagement improves when contributors see their own and others' names on the timeline. Today the card shows an icon + type name but no "who posted this."
3. **Species citings are not explorable.** When an update logs a species, the user cannot see how often that species has been observed at this item, across the property, or across the org. This is table-stakes for conservation teams running multi-property programs.

The new design introduces a **photo-led vertical rail** on the item page, a **full-screen update detail sheet** with prominent attribution and rich species cards, and a **species detail view** (sheet on soft-nav, full page on direct visit) with a **scope toggle** (item / property / org).

## Goals

- **Photo-led overview.** Large thumb, rail with dots, 2-line content clamp; content is scannable on mobile.
- **Attribution everywhere.** Overview card, detail sheet, and species rows all carry author identity. Three variants: member, strict anon, named anon.
- **Species exploration.** Species rows in update detail open a dedicated species view showing sightings scoped to item / property / org.
- **Anon nickname.** Public-form submitters can optionally provide a nickname, rendered with an `ANON` pill.
- **URL-driven species detail.** The species view has a real URL (`/species/[id]?from=…`) and renders as an overlay on soft-nav or a full page on direct visit, via Next.js intercepting + parallel routes.

## Non-Goals (V1)

- Editorial and Season timeline layouts (present in the prototype; ship behind the layout-builder A/B in a future PR).
- Photo lightbox / carousel in `UpdateDetailSheet`.
- Species library index page (`/species`).
- Moderation queue UI for anon submissions.
- Item-type-configurable 4th stat ("Broods" in the prototype) — ship 3 generic stats in the header.
- IP-based rate limiting for the public form. The existing session-based 10-per-hour limit stays.
- Filtering, search, or grouping on the "View all" updates list.

## Approach

Replace `TimelineOverview` and its card (`UpdateCard`) with a new rail (`TimelineRail`) and card (`RailCard`). Rewrite `UpdateDetailSheet`. Build the species detail view as two route entry points (`/species/[id]` and an intercepting `@modal/(.)species/[id]`) that share a single `SpeciesDetailView`. Extract a `SpeciesTaxonomySection` used by both the new detail view and the existing `SpeciesPickerDetail` so taxonomy rendering stays DRY.

Data model changes are minimal: one nullable column (`item_updates.anon_name`), one SQL view (`species_sightings_v`). Anon status is derived from the author's membership role (`org_memberships.base_role = 'public_contributor'`), not stored on the row. Three server actions in `src/app/species/[id]/actions.ts` provide the scope-toggle data; each runs a `group by` on `species_sightings_v`.

The work ships as **one spec, one PR**, in this order: schema → components → routing → public-form `anon_name`.

## Data Model

### Migration 046 — `046_item_timeline_v2.sql`

```sql
-- optional nickname on public submissions (is_anon is derived from membership role)
alter table item_updates add column anon_name text null;

-- read model for species citings across three scopes
create or replace view species_sightings_v as
select
  iu.id              as update_id,
  e.external_id      as species_id,      -- iNat taxon_id
  iu.item_id,
  i.property_id,
  p.org_id,
  iu.update_date     as observed_at,
  iu.created_by
from item_updates iu
join update_entities ue on ue.update_id = iu.id
join entities e        on e.id = ue.entity_id
join entity_types et   on et.id = e.entity_type_id
join items i           on i.id = iu.item_id
join properties p      on p.id = i.property_id
where et.api_source = 'inaturalist'
  and e.external_id is not null;
```

No triggers, no new tables, no check constraints. RLS on the view inherits from underlying tables. The implementation plan must verify that existing RLS on `item_updates`, `update_entities`, `entities`, `items`, and `properties` correctly tenant-scopes view reads.

### TypeScript types (`src/lib/types.ts`)

Add:

```ts
export type AttributionUpdate = Pick<ItemUpdate, 'anon_name'> & {
  created_by: string | null;
  createdByProfile: AuthorProfile | null;  // null only when created_by is null (shouldn't happen with existing data)
};

export type AuthorProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: string;               // base_role from org_memberships (scoped to item's org)
  update_count: number;       // total updates by this user in the org
};

export type EnrichedUpdate = ItemUpdate & {
  anon_name: string | null;
  update_type: { id: string; name: string; icon: string };
  photos: Photo[];
  species: Array<{ external_id: number; entity_id: string; common_name: string; photo_url: string }>;
  fields: Array<{ label: string; value: string }>;
  createdByProfile: AuthorProfile | null;
};

export type SpeciesCitingsItem = { count: number; lastObserved: string | null };

export type SpeciesCitingsProperty = {
  total: { count: number; itemCount: number };
  items: Array<{ item_id: string; item_name: string; count: number; last: string; current: boolean }>;
};

export type SpeciesCitingsOrg = {
  total: { count: number; propertyCount: number; itemCount: number };
  properties: Array<{ property_id: string; property_name: string; item_count: number; count: number; last: string; current: boolean }>;
};
```

## Data Flow

### Item page (server component)

Extends the existing `ItemWithDetails` loader:

1. Existing: item + updates + photos + entities.
2. Add `anon_name` to update selection.
3. For each unique `created_by` in updates, fetch author card data from `profiles` joined with `users.avatar_url` (from migration 008) and `org_memberships.base_role` scoped to the item's `org_id`. Compute `update_count` via `count(*) from item_updates where created_by = p.id and org_id = $org`.
4. Derive `is_anon = (createdByProfile?.role === 'public_contributor')` per update.
5. Header stats:
   ```sql
   select
     (select count(*) from item_updates where item_id=$1) as updates_count,
     (select count(distinct species_id) from species_sightings_v where item_id=$1) as species_count,
     (select count(distinct created_by) from item_updates where item_id=$1) as contributors_count
   ```

No client-side react-query on first paint; all data flows via props to `ItemHeader` and `TimelineRail`.

### Species detail view (client)

`SpeciesCitingsBody` fetches its tab-specific data via react-query, keyed `['species-citings', scope, speciesId, scopeId]`. Underlying server actions:

```ts
// src/app/species/[id]/actions.ts
'use server';
export async function getSpeciesCitingsAtItem(speciesId: number, itemId: string): Promise<SpeciesCitingsItem>;
export async function getSpeciesCitingsAtProperty(speciesId: number, propertyId: string, currentItemId: string): Promise<SpeciesCitingsProperty>;
export async function getSpeciesCitingsAtOrg(speciesId: number, orgId: string, currentPropertyId: string): Promise<SpeciesCitingsOrg>;
```

Each uses `createClient()` from `@/lib/supabase/server`, runs a single `group by` on `species_sightings_v`, returns the typed shape above. Returns `{ error: string }` on failure consistent with project conventions, handled in the hook.

Species basic info (common name, scientific name, photo, native/intro/cavity/IUCN flags, summary) comes from a shared `getSpeciesDetail(externalId)` fetcher extracted from the existing `SpeciesPickerDetail` data path.

### Context resolution from `from`

`SpeciesDetailView` receives `externalId` (path param) and `fromUrl` (search param). `SpeciesCitingsBody` parses `fromUrl`:

```ts
const match = fromUrl?.match(/^\/p\/([^/]+)\/item\/([^/?#]+)/);
const fromItem = match?.[2] ?? null;
```

Property and org context are resolved server-side inside the actions (item → property → org lookup). If `fromItem` is `null`, the "This item" tab is hidden and scope defaults to "property" if a property context exists (e.g., the user is on `/p/[slug]` route), else "org" using the user's default org, else the citings section is hidden entirely.

## File Layout

### New files

```
supabase/migrations/046_item_timeline_v2.sql

src/app/default.tsx                                        # required for parallel routing at root
src/app/@modal/default.tsx                                 # returns null
src/app/@modal/(.)species/[id]/page.tsx                    # intercepted species sheet
src/app/species/[id]/page.tsx                              # full-page species view
src/app/species/[id]/actions.ts                            # three scope server actions

src/components/item/ItemHeader.tsx                         # hero + stats strip + meta row
src/components/item/timeline/TimelineRail.tsx              # replaces TimelineOverview
src/components/item/timeline/RailCard.tsx                  # photo-led rail card
src/components/item/timeline/Attribution.tsx               # member / anon / named anon
src/components/item/timeline/timeline.css                  # two @keyframes (slideUp, slideIn)

src/components/species/SpeciesDetailView.tsx               # shared across sheet + full page
src/components/species/SpeciesSheetWrapper.tsx             # slide-in-from-right chrome
src/components/species/SpeciesFullPageWrapper.tsx          # full-page chrome
src/components/species/SpeciesCitingsBody.tsx              # scope toggle + per-scope rendering
src/components/species/SpeciesTaxonomySection.tsx          # tags + summary (extracted)
src/components/species/SpeciesRow.tsx                      # 48px thumb row
src/components/species/SpeciesAvatar.tsx                   # small circular avatar
src/components/species/Tag.tsx                             # native / intro / cavity pill
```

### Files modified

```
tailwind.config.ts                                         # add forest.border, forest.border-soft
src/app/layout.tsx                                         # add @modal parallel slot
src/components/layout/blocks/TimelineBlock.tsx             # TimelineOverview → TimelineRail
src/components/item/DetailPanel.tsx                        # use ItemHeader; pass enriched updates
src/components/item/timeline/UpdateDetailSheet.tsx         # rewrite
src/components/item/timeline/AllUpdatesSheet.tsx           # render RailCard list
src/components/manage/species-picker/SpeciesPickerDetail.tsx  # consume SpeciesTaxonomySection
src/app/api/public-contribute/actions.ts                   # accept anon_name, insert into item_updates
src/components/map/PublicSubmissionForm.tsx                # add optional "Name" input
src/lib/types.ts                                           # new types (AuthorProfile, EnrichedUpdate, SpeciesCitings*)
# wherever ItemWithDetails is produced (likely src/lib/offline/store.ts or the server page for /p/[slug]/item/[id]) — add enriched update projection + header stats. The plan's first task is to locate and confirm this.
docs/superpowers/specs/2026-04-17-timeline-updates-viewing-design.md  # add frontmatter note: superseded by this spec
```

### Files deleted

```
src/components/item/timeline/TimelineOverview.tsx          # replaced by TimelineRail
src/components/item/timeline/UpdateCard.tsx                # replaced by RailCard
```

`src/components/item/timeline/timeline-helpers.ts` — keep `partitionScheduled` (needed by `ScheduledUpdatesSection`). Remove `detectPrimaryContent` and `getKeyFieldValues` if no longer referenced after rewrite.

`ScheduledUpdatesSection.tsx` stays. It renders above the rail when `config.showScheduled` is true.

## Component Contracts

### `TimelineRail`

```ts
type Props = {
  updates: EnrichedUpdate[];
  maxItems?: number;               // from TimelineBlock config
  showScheduled?: boolean;
  canAddUpdate: boolean;
  onAddUpdate?: () => void;
  onDeleteUpdate: (id: string) => void;
};
```

Renders: optional `ScheduledUpdatesSection` → list of `RailCard` (capped at `maxItems`) → "View all" button if `updates.length > maxItems`. Owns `openUpdateId` and `allOpen` state; passes `onOpen` to each `RailCard`. Opens `UpdateDetailSheet` for a selected update; opens `AllUpdatesSheet` for "View all".

### `RailCard`

```ts
type Props = {
  update: EnrichedUpdate;
  onOpen: () => void;
  isLast: boolean;
};
```

Verbatim from prototype:

- 28px left padding; 1.5px vertical rail at `left: 10px`, `top: 20px`, bottom to container bottom, hidden when `isLast`.
- 14px dot at `left: 4px`, `top: 6px`: white fill, 2.5px `forest` border, 3px `parchment` outer ring.
- Card: white bg, 1px `forest.border-soft` border, 14px radius, 12px padding, `flex` with 12px gap.
- Thumb 66×66, 10px radius: first photo `object-cover`, else `sage-light` bg centered with 26px `update_type.icon` emoji.
- Right side: type name (13px, 600, `forest-dark`) + relative timestamp (11px, `sage`, mono), content clamp (2 lines, 13px, `text`), attribution (compact) + species avatar stack (up to 3, 20px, `-6px` overlap) right-aligned.

### `Attribution`

```ts
type Props = {
  update: Pick<EnrichedUpdate, 'anon_name' | 'createdByProfile'>;
  compact?: boolean;
};
```

Three variants driven by the presence of `createdByProfile` and its `role`:

- **Member** (`createdByProfile` not null and `role !== 'public_contributor'`): avatar image + `display_name` + `role · update_count updates` subtitle.
- **Strict anon** (`role === 'public_contributor'` and `anon_name` is null): dashed "?" circle + "Anonymous contributor" + `ANON` pill + "submitted via public form" subtitle.
- **Named anon** (`role === 'public_contributor'` and `anon_name` is set): dashed "?" circle + `anon_name` + `ANON` pill + "submitted via public form" subtitle.

`compact` shrinks the avatar to 20px and replaces the two-line block with a single inline name label.

### `UpdateDetailSheet`

```ts
type Props = {
  update: EnrichedUpdate | null;
  onClose: () => void;
  onSpeciesOpen: (externalId: number) => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
};
```

Full-screen overlay: `fixed inset-0`, `z-[100]`, slide-up animation (`translateY(100%) → 0`, 280ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`). Hero 240px if the update has a photo, 140px `forest-dark` gradient otherwise. Back + kebab buttons at `top-14` left/right. Hero overlay: type icon + type name (uppercase mono) + formatted full date. Photo count indicator bottom-right if `photos.length > 1`.

Body (scrollable, bottom padding 100px):

1. Attribution block (full variant) inside a bordered card on `parchment` bg + right-aligned time/relative date.
2. Content paragraph if present.
3. Species section: header "Species observed · N" + iNat badge → list of `SpeciesRow`. Each row calls `onSpeciesOpen(externalId)` which navigates to `/species/[externalId]?from=<current path>`.
4. Additional photos grid (`grid-cols-2`, 8px gap) for photos after the hero.
5. Fields grid (`grid-cols-2`, bordered, rounded) — last cell spans both columns when field count is odd.
6. Footer meta: `Update · #<id>`.

Open/close is in-memory state on the item page — no URL change.

### `ItemHeader`

```ts
type Props = {
  item: ItemWithDetails;
  stats: { updatesCount: number; speciesCount: number; contributorsCount: number };
  onBack: () => void;
  onShare: () => void;
};
```

Hero 180px with `object-cover` photo + bottom-fade gradient. Back + share buttons at `top-14`. Location + item name overlay bottom-left. Below hero: 3-cell stats strip (Updates / Species / People). Below that: meta row with item-type-specific details pulled from `item.custom_field_values` (e.g. for nest boxes: box type + entry hole Ø + installed date; for other item types, the first two to three non-empty primary fields).

### `SpeciesDetailView`

```ts
type Props = { externalId: number; fromUrl: string | null };
```

Loads species basics via `getSpeciesDetail(externalId)`. Renders hero (280px) with image + back button + common and scientific name overlay → `SpeciesTaxonomySection` (tags + summary) → `SpeciesCitingsBody`.

### `SpeciesCitingsBody`

```ts
type Props = {
  species: SpeciesDetail;
  fromUrl: string | null;
};
```

Internal state: `scope: 'item' | 'property' | 'org'`. Parses `fromUrl` to extract `fromItem`. Segmented control labels: "This item" (hidden if `fromItem` is null), property name, "All of [Org short name]". Defaults:

- `fromItem` present → default `scope = 'item'`.
- Else if the user has property context (e.g. accessed via a property-scoped full-page entry) → `'property'`.
- Else → `'org'`.

Scope-specific queries are fetched via react-query using the three server actions. Rendering:

- **item:** single bordered card, large count + "observations" + "Most recent · [date]".
- **property:** totals line + `Link` list of items (each with count, last observed, `HERE` pill on the current item).
- **org:** 3-cell totals strip (Observations / Properties / Items) + `Link` list of properties (each with item count, count, last observed, `CURRENT` pill on the current property).

Item links go to `/p/[slug]/item/[id]`; property links go to `/p/[slug]`. Both leave the species sheet via real navigation.

### `SpeciesRow`, `SpeciesAvatar`, `Tag`, `SpeciesTaxonomySection`

Lifted from the prototype:

- `SpeciesRow`: 48×48 photo + common name + scientific name (italic) + tag row + chevron. Button element; `onOpen` fires on click.
- `SpeciesAvatar`: circular photo with 2px white border; `size` prop (default 28px).
- `Tag`: pill with colored leading dot; `kind` prop (`native` | `intro` | `cavity`).
- `SpeciesTaxonomySection`: renders the tag row (native/intro, cavity, IUCN) + summary paragraph. Also replaces the inline taxonomy JSX in `SpeciesPickerDetail`.

## Routing

Intercepting + parallel routes at the app root.

```
src/app/
├── layout.tsx                    # updated: accept {modal} prop, render after {children}
├── default.tsx                   # new: returns null (required)
├── @modal/
│   ├── default.tsx               # returns null
│   └── (.)species/[id]/page.tsx  # sheet, slide-in from right
└── species/
    └── [id]/
        ├── page.tsx              # full page, for direct visit / refresh
        └── actions.ts
```

Soft-nav to `/species/[id]?from=...` is intercepted and renders `SpeciesDetailView` inside `SpeciesSheetWrapper`. Direct visit or refresh falls through to `app/species/[id]/page.tsx`, which wraps `SpeciesDetailView` in `SpeciesFullPageWrapper`.

`app/layout.tsx`:

```tsx
export default function RootLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {modal}
      </body>
    </html>
  );
}
```

Navigation:

- `SpeciesRow` onOpen handler uses `router.push(`/species/${externalId}?from=${encodeURIComponent(pathname)}`)`.
- `SpeciesSheetWrapper` back button calls `router.back()`. The item page underneath does not unmount (parallel routes preserve state); `UpdateDetailSheet` remains open.
- Links inside `SpeciesCitingsBody` (to item or property pages) are real navigation — the sheet unmounts as part of route change.

## Public Form Anon

`PublicSubmissionForm.tsx` (used via `PublicContributeButton`) adds one optional input:

- Label: "Name (optional)"
- Placeholder: "How should we credit you?"
- `maxLength={80}`; value trimmed on submit; empty string → `null`.

`submitPublicContribution` server action extends its input with `anonName?: string | null`; inserts into `item_updates.anon_name`. Moderation is unchanged — `anon_name` is not moderated content (no sensitive data; short label), but it should still be trimmed and length-clamped server-side as a defense-in-depth measure.

Rate limiting: unchanged. Existing 10-per-hour-per-anon-user limit on `org_memberships` remains. No IP layer in this PR.

Existing `public_contributor` role on the session author is what `Attribution` uses to render the anon variants; no role changes needed.

## Styling

Tailwind classes throughout. Inline styles only for the two `@keyframes` animations, defined in `src/components/item/timeline/timeline.css`:

```css
@keyframes fmSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes fmSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
```

Forest-theme token mapping from prototype `tt` object to Tailwind classes:

| Prototype token | Tailwind class |
|---|---|
| `tt.primary` `#5D7F3A` | `forest` |
| `tt.primaryDark` `#2C3E2D` | `forest-dark` |
| `tt.accent` `#D4A853` | `golden` |
| `tt.bg` `#FAFAF7` | `parchment` |
| `tt.surface` `#EEF2EA` | `sage-light` |
| `tt.muted` `#7F8C7A` | `sage` |
| `tt.text` `#1F2A1F` | default body text |
| `tt.border` `#DBE0D3` | `forest-border` (new) |
| `tt.softBorder` `#E8ECE3` | `forest-border-soft` (new) |

`tailwind.config.ts` gets two new tokens under `colors.forest`:

```ts
forest: {
  ...existing,
  border: '#DBE0D3',
  'border-soft': '#E8ECE3',
}
```

Fonts already configured: `Playfair Display` for headings (`.font-heading`), `DM Sans` for body (`.font-body`). Monospace timestamps use `font-mono`.

## Testing

- **Vitest (component):**
  - `Attribution` — member, strict anon, named anon variants with compact and full forms.
  - `RailCard` — photo and icon-fallback thumbs; species avatar stack length 0/1/3/5 (cap at 3).
  - `SpeciesCitingsBody` — scope switching; "This item" tab hidden when `fromUrl` absent; default scope logic.
  - `from=` URL parser — matching, non-matching, and malformed URLs.
- **Vitest (server action):**
  - Three `getSpeciesCitings*` actions against seeded fixtures covering item/property/org aggregation.
  - `submitPublicContribution` with and without `anonName`.
- **SQL fixture test:** `species_sightings_v` row count and filter correctness for a seeded set of `update_entities` (mixed `api_source` values).
- **Playwright E2E:** one happy-path test.
  1. Open `/p/[slug]/item/[id]`.
  2. Click a `RailCard` with species → `UpdateDetailSheet` opens.
  3. Click a `SpeciesRow` → species sheet slides in, URL changes to `/species/[id]?from=...`.
  4. Switch scope to "property" → item list renders with `HERE` pill.
  5. Press browser back → species sheet unmounts; `UpdateDetailSheet` still open with same update.
- No visual-diff screenshots in this PR per the Non-Goals of the superseded spec; manual visual QA against the prototype.

## Open Questions and Risks

- **Profile + users join.** `profiles` has no `avatar_url`; the `users` table (migration 008) does. The implementation plan must confirm the canonical pattern (join, view, or denormalization) before the enriched update projection is built.
- **RLS on `species_sightings_v`.** Postgres views inherit RLS via the `security_invoker` setting (Supabase default varies). The plan must verify the view uses `security_invoker = on` or include it explicitly in the migration.
- **Count subquery performance.** The three header-stats subqueries scan `item_updates` and `species_sightings_v` for a single item. At current scale this is trivial; if an item accumulates thousands of updates, consider denormalizing on `items` or covering-indexing `(item_id, created_by)`.
- **Intercepting-route edge cases.** Adding `@modal` at the app root affects every route. The plan must verify nothing currently expects `layout.tsx` to receive only `{ children }`, and that `default.tsx` at root + `@modal/default.tsx` are both present. A smoke Playwright pass on unrelated routes (e.g. `/p/[slug]`, `/manage`) guards regressions.
- **`base_role` lookup across orgs.** `org_memberships` is per-org. Joining it for the item's org requires knowing the org from `items.property_id → properties.org_id`. The enriched-update loader needs that org id in scope.
