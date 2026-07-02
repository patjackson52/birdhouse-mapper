# 11. Store icon references as JSONB on type tables

Date: 2026-04-17
Status: Accepted
Implements: PR #256

## Context

Until PR #256 (`feat: shared icon picker for entity types and item types`),
`item_types.icon` and `entity_types.icon` were `text` columns that held a
single emoji literal. The new shared `IconPicker` component supports three
icon sources — Lucide, Heroicons, and a curated emoji set — so a plain
string can no longer represent an icon unambiguously (a Lucide name and an
emoji can collide; a renderer needs to know which set to look in).

We need a representation that:

- Distinguishes icon source (`lucide` / `heroicon` / `emoji`).
- Survives offline cache hydration without bespoke decoding.
- Doesn't require an enum-table join on every render.
- Lets us add new icon sources later without another migration.

## Decision

Migrate `item_types.icon` and `entity_types.icon` from `text` to `jsonb`
with the shape:

```json
{ "set": "lucide" | "heroicon" | "emoji", "name": "TreePine" }
```

Existing `text` rows are auto-converted in the migration to
`{"set":"emoji","name":"<old text>"}` so no code path sees a `null`.

A single `IconRenderer` React component reads `{set, name}` and dispatches
to the correct icon library. All ~30 call sites that used to render
`row.icon` directly now go through `IconRenderer`.

## Consequences

**Good**

- Adding a new icon source is a code change only — no migration, no enum.
- The shape is self-describing; debugging and DB inspection are obvious.
- Postgres jsonb is indexed natively if we ever need to query by set.

**Bad / watch out**

- Offline caches need the v2 shape — anything reading the old string form
  will throw. Mitigation: `parseIconValue()` in `src/lib/icons/parse.ts`
  treats a bare string as `{set:'emoji',name}` for one release window.
- Slightly larger row size (jsonb overhead vs. an emoji text). Negligible.
- Search / sort by icon "name" is now a `->>` extraction.

## Related

- PR #256 — implementation
- `src/components/shared/IconPicker/` — shared picker
- `src/lib/icons/IconRenderer.tsx` — central dispatcher
- Memory pattern: see `memory/patterns/coding-patterns.md` ("Polymorphic
  reference columns" section, to be added).
