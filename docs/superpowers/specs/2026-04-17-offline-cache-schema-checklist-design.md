# Offline Cache Schema-Change Checklist — Design

## Overview

Prevent the class of bug where a SQL migration silently invalidates the client's IndexedDB offline cache, causing runtime crashes or stale reads in production. Root example: migration `044_icon_jsonb.sql` used `ALTER COLUMN TYPE` to convert `item_types.icon` and `entity_types.icon` from text to jsonb, but `ALTER COLUMN TYPE` does not bump `updated_at` on rows. The sync engine's delta cursor (`updated_at >= last_synced_at`) therefore skipped every affected row, so clients whose caches synced before the migration kept serving plain-string icons. Display code assumed the new IconValue object shape and crashed with `Cannot read properties of undefined (reading 'replace')` on the edit-item page.

This spec introduces a lightweight, process-only defense: a playbook every schema-changing migration must follow, plus two pointers (AGENTS.md and the PR template) that make the playbook discoverable at the moment of authoring and reviewing a migration.

Scope intentionally excludes runtime validators at the read boundary (Option 2 in brainstorming) and schema fingerprinting / cursor invalidation (Option 5). Those remain on the table if process discipline proves insufficient — tracked as follow-ups at the end of this spec.

## Goals

- Make the checklist impossible to miss when authoring a SQL migration that touches a synced table.
- Codify the "always bump `updated_at` when changing row shape" rule so agents and humans apply it without having to rediscover the cursor-skipped-my-rows trap.
- Keep setup cost under an hour. No CI automation, no runtime cost, no new dependencies.
- Give authors one canonical place to look when they're unsure whether a change needs a cache bust.

## Non-Goals

- Runtime validation of rows read from IndexedDB. Deferred.
- Automated linting of migration files in CI. Deferred; revisit if the checklist is not followed after a few migrations.
- A Dexie upgrade-hook framework for automatic client-side data normalization. Deferred.
- Changes to how the sync engine resolves cursors or detects drift.
- A one-time migration to bump `updated_at` across all existing synced tables. Current stale caches are already handled by the `normalizeIcon` hotfix (PR #260) — this spec is forward-looking.

## Architecture

Three coordinated touch points, all documentation:

```
┌────────────────────────────────────────────────────────────────────┐
│  docs/playbooks/offline-cache-schema-changes.md                    │
│  (the canonical checklist — the actual content)                    │
└────────────────────────────────────────────────────────────────────┘
         ▲                                              ▲
         │                                              │
┌────────┴───────────────────────┐    ┌─────────────────┴─────────┐
│  AGENTS.md                     │    │ .github/PULL_REQUEST_     │
│  — adds a one-line rule under  │    │ TEMPLATE.md               │
│    Architectural Invariants    │    │ — adds "Cache-safety      │
│    linking to the playbook     │    │   check" item referencing │
│                                │    │   the playbook            │
└────────────────────────────────┘    └───────────────────────────┘
```

**Why three touch points?** Each catches a different moment:
- `AGENTS.md` is loaded by every agent session — catches agents before they author the migration.
- The PR template is surfaced when a human opens a PR — catches humans at review time.
- The playbook is the single source of truth that the other two link to, so maintenance is one-place.

## Component 1 — `docs/playbooks/offline-cache-schema-changes.md`

The playbook has four sections, in this order:

### Section 1: When this applies

Trigger: any SQL migration that touches a table in the `SYNC_TABLES` list exported from `src/lib/offline/sync-engine.ts`. Current list (copied into the playbook for quick reference, with a note to re-check the source of truth):

```
items, item_types, custom_fields, item_updates, update_types,
update_type_fields, photos, entities, entity_types, geo_layers,
properties, orgs, roles, org_memberships
```

Non-synced tables (e.g., `invites`, `communications_*`, `location_history`) are out of scope — changes to them cannot drift client caches because they are never cached.

### Section 2: The mental model

A short paragraph explaining the failure mode in plain language:

> The client keeps a local IndexedDB copy of every synced row. It refreshes that copy using a delta-sync cursor: "give me every row where `updated_at` is newer than the last time I synced." Schema-level changes like `ALTER COLUMN TYPE` or a new default value on an existing column do NOT bump `updated_at`. The cursor sees nothing new, the cache keeps the old representation, and code that assumes the new shape crashes.

This section exists so a future author who has never seen the icon bug still understands *why* the checklist matters. Without it, the checklist looks arbitrary.

### Section 3: The checklist

Five rules, in decision-tree order. The author reads down until one matches, applies the prescribed remedy, and is done.

**1. You changed the TYPE of an existing column** (e.g., `text` → `jsonb`, `int` → `bigint`, `varchar(n)` → `text`).

Remedy: add to the same migration:
```sql
update <table> set updated_at = now();
```
This forces a re-sync of every row so clients download the new representation. Cost: one-time extra bandwidth the next time each client syncs.

**2. You added a column with a server-side default** (e.g., `alter table x add column foo text default 'bar'`).

Remedy: decide which is true:
- "Client code depends on this field being present" → bump `updated_at` as in rule 1.
- "Client code tolerates the field being absent (reads it as optional)" → no bump needed. TypeScript interface should mark the field as optional or nullable.

**3. You renamed or removed a column.**

Remedy: both actions in the same migration:
- `update <table> set updated_at = now();` so clients drop rows carrying the old column on next sync (bulkPut replaces by id).
- Bump the Dexie schema version in `src/lib/offline/db.ts`. If the removed/renamed column was indexed in Dexie, update the index definition in the new version.

**4. You added a new synced table.**

Remedy, all three:
- Add the table name to `SYNC_TABLES` in `src/lib/offline/sync-engine.ts`.
- Add the table to one of the scope arrays (`propertyScoped` or `orgScoped`) in the same file so the sync engine filters correctly.
- Add a Dexie store definition in `src/lib/offline/db.ts` in a new version block (do not mutate the existing version).

**5. You narrowed an enum or check constraint** (removed a previously-valid value).

Remedy: in the same migration, update any rows carrying the now-invalid value:
```sql
update <table> set <column> = '<valid-value>' where <column> = '<removed-value>';
```
This update itself bumps `updated_at` on synced tables (they have an `updated_at` trigger from migration 013 onward), so clients re-sync the repaired rows automatically. No separate timestamp bump needed unless the table lacks the trigger — verify by grepping `_updated_at` triggers for the table in `supabase/migrations/`.

**None of the above?** The migration is cache-safe. Examples that do NOT need anything:
- Creating a brand-new table that is not in `SYNC_TABLES`.
- Adding an index or unique constraint (no row-shape change).
- Changing an RLS policy (no row-shape change).
- Adding a nullable column with no default that client code doesn't reference yet.

### Section 4: Secondary reminder for TS-interface changes

When a code PR adds or changes a field on a TypeScript interface for a synced row (`Item`, `ItemType`, `Entity`, `EntityType`, `UpdateType`, `UpdateTypeField`, `CustomField`, `Property`, `Org`, `Role`, `OrgMembership`, `Photo`, `ItemUpdate`) *without* a corresponding SQL migration:

> Ask: will stale caches still work? Usually yes if you make the new field optional (`field?: T` or `field: T | null`) and handle `undefined` gracefully. If the code needs the field to be present, the change needs an accompanying SQL migration (rule 2 above).

This section is a reminder, not a hard rule — TypeScript-only changes to a cached type don't touch the cache itself, they just tighten what the code expects from it.

## Component 2 — `AGENTS.md` addition

Add a single line under **Architectural Invariants** (the table at the top of the file). New row:

| Invariant | Detail |
|---|---|
| Offline cache safety | Any SQL migration that touches a table in `SYNC_TABLES` must follow `docs/playbooks/offline-cache-schema-changes.md`. When in doubt, `update <table> set updated_at = now();` in the same migration. |

No other changes to AGENTS.md.

## Component 3 — PR template addition

Add one item to `.github/PULL_REQUEST_TEMPLATE.md` under a new "Cache-safety check" heading (or append to an existing testing/checklist section if one exists — to be confirmed during implementation):

```markdown
## Cache-safety check

- [ ] This PR does not add a SQL migration, OR the migration follows `docs/playbooks/offline-cache-schema-changes.md`.
```

Single checkbox. If the PR has no migration, the author ticks it trivially. If it has a migration, the author confirms they followed the playbook.

## Data Flow

No runtime data flow changes — this is pure documentation.

Authoring flow (what the playbook changes):

```
  Author plans a migration
           │
           ▼
  AGENTS.md: "Offline cache safety — see playbook"
           │
           ▼
  Playbook: read Section 3 checklist
           │
           ▼
  Author applies remedy(ies) in migration SQL
           │
           ▼
  PR opened, template shows cache-safety checkbox
           │
           ▼
  Reviewer verifies migration follows playbook
```

## Error Handling

Not applicable — documentation has no error states.

What happens if the checklist is skipped anyway:
- The bug manifests as a runtime crash on the first page that reads a drifted row.
- Recovery is whatever we ship in PR #260 (the `normalizeIcon` pattern) or a hotfix specific to that row shape.
- The checklist being ignored once does not cascade — each migration is independent.

## Testing

- **Spec completeness** — inline review below.
- **Follow-up real-world test** — the next SQL migration after this spec lands should be author-tested against the checklist. If the author misses a step and a reviewer catches it, the playbook worked. If the author misses a step and it reaches main, the playbook needs sharper language.
- **No unit tests required** — no code is changing.

## Open Questions / Deferred

- **CI automation** (deferred). A GitHub Action that greps migration diffs for `ALTER COLUMN` without a matching `UPDATE ... set updated_at = now()` would make the checklist enforcing rather than aspirational. Revisit if two or more migrations ship without the checklist being applied.
- **Runtime read-boundary validators** (deferred, option 2 in brainstorming). Could catch drift the checklist misses, at the cost of ~15 kB bundle + per-read CPU. Revisit if process discipline is insufficient and we accumulate more normalizer patterns like `normalizeIcon`.
- **Schema fingerprint in sync_metadata** (deferred, option 5 in brainstorming). Would give the sync engine a way to detect drift and auto-invalidate cursors. Higher leverage than validators but requires server-side cooperation (schema version exposed per table). Revisit if this becomes a recurring concern.
- **A one-time migration to bump `updated_at` on all currently-affected tables** so existing stale caches repair themselves without needing the `normalizeIcon` patch long-term. Worth considering as a separate small PR after this lands; not part of this spec.

## File Structure

```
docs/
  playbooks/
    offline-cache-schema-changes.md        # new — the canonical checklist
AGENTS.md                                  # modified — one line added
.github/
  PULL_REQUEST_TEMPLATE.md                 # modified — one checkbox added
                                           # (may be created if it does not
                                           # already exist — verify during
                                           # implementation)
```

No source code changes. No test changes. No migration. No dependency changes.
