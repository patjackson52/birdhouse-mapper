# ADR-0003: Species Picker Architecture

Date: 2026-04-19

## Status

Accepted

## Context

The original `SpeciesPicker` was a compact inline dropdown: search input, blur-dismissed result list, synchronous per-tap Supabase upserts into `entities`, minimal iNat projection (`id`, `name`, `common_name`, `photo_url`, `rank`, `observations_count`, `wikipedia_url`).

Conservation staff asked for a richer selection surface with a full-screen photo grid, per-place native/introduced badges, a cavity-nester filter, and a detail subview that shows the taxon's summary, IUCN status, taxonomy, and a nearby-observations callout. iNat's API gives us some of this (IUCN, Wikipedia summary, ancestry, per-place establishment_means when a `place_id` is supplied) and not others (cavity-nester is not a structured trait; size and diet are prose-only).

FieldMapper is mobile-first and offline-tolerant. Writes everywhere else in the app flow through the offline mutation queue (`src/lib/offline/sync-engine.ts`); the old picker's direct-Supabase upsert diverged from that convention.

## Decision

1. **Bottom-sheet picker pattern.** Rich pickers open a `MultiSnapBottomSheet` at the `full` snap. Inside the sheet, a grid and a detail subview share the same local state; the detail subview is an internal view-switch, not a route change. This becomes the standard pattern for selection UIs with rich per-item metadata.

2. **Selection gated behind the detail view.** Tapping a card pushes the detail subview; selection happens only via the detail's sticky CTA. Users see the enriched context before they commit. The grid still displays ring + check badge on already-staged cards for visual feedback.

3. **Commit-on-Done (staged-selection model).** Sheet-internal state holds a `Map<taxonId, SpeciesResult>` of staged selections. The parent's `selectedIds` is untouched until the user presses Done, at which point `planCommit` returns a `{ newTaxa, keptEntityIds }` pair and the picker runs a single batched upsert. Pure reducer (`staged-selection.ts`) is unit-testable without React.

4. **Place-aware enrichment via `/api/species/[id]`.** A new route proxies iNat `/v1/taxa/:id`, optionally passing a `place_id` resolved server-side from lat/lng via `/v1/places/nearby`. A module-scope LRU (max 500 entries, keyed by lat/lng rounded to 1 decimal place) sits in `src/lib/species/place-id-cache.ts`, with in-flight request dedup and a 5-second timeout. The route exports `revalidate = 86400`. The existing `/api/species/search` and `/api/species/nearby` routes also accept lat/lng and pipe `place_id` through for establishment-means projection. The list-tier projection lives in `src/lib/species/inat-projection.ts` so all three routes share one source of truth.

5. **Curated trait data lives in `src/lib/species/*.ts`.** Traits iNat doesn't carry (currently: cavity-nester) are maintained as a typed `ReadonlySet<number>` of taxon ids with an `isCavityNester(id)` helper. The ADR records the pattern; the cavity-nester list itself is seeded with common North American species and maintained by conservation staff. Future traits follow the same file shape.

6. **Offline writes go through the existing mutation queue.** When Done is pressed offline, each new entity is written locally (Dexie `entities.put`) and an `enqueueMutation({ table: 'entities', operation: 'insert', ... })` record is queued. Temporary ids flow through `onChange`; the sync engine reconciles on next sync. Online, the picker keeps the current direct-Supabase upsert for parity with existing tests.

7. **Parent contract preserved.** `UpdateForm.tsx` is not modified. `SpeciesPicker` props remain `{entityTypeId, entityTypeName, orgId, selectedIds, onChange, lat, lng}`. This is an invariant for any future picker refactor in this component.

## Consequences

- Future rich pickers (e.g., location picker, custom-field dropdown with images) have a template to follow. The bottom-sheet + internal-detail-subview shape is now the house style.
- The place-id cache is per-process. On serverless cold-start, the first request in a cell pays a `/v1/places/nearby` round-trip; 24h revalidate on the detail route amortizes. If serverless invocation density is low enough that this matters, the next iteration is a persistent cache (Redis or DB-backed), not a per-property column.
- Curated trait data files are explicit maintenance surface area. The cavity-nester list is seeded with ~35 ids and requires an explicit PR to extend. Alternative traits (pollinator host, invasive watchlist) should follow the same shape; do not introduce a trait-tag config UI until there's a third consumer.
- The commit-on-Done model means a user can stage many toggles and still hit Cancel to discard; the picker doesn't block on each tap. Tests that previously asserted on per-tap `insert` calls must be updated to assert on Done-time insertion.
- Because UpdateForm writes `update_entities` through the mutation queue already, and the picker now writes `entities` through the queue when offline, the full commit path is mutation-queue-aware and works end-to-end in airplane mode.
