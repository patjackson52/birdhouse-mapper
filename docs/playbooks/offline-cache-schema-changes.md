# Playbook: Offline Cache Schema Changes

**Purpose:** Prevent SQL migrations from silently breaking the client's IndexedDB offline cache. Every migration that touches a synced table must follow this checklist.

**When to use:** Any SQL migration under `supabase/migrations/` that adds, removes, renames, or changes the type of a column on a synced table. Also applies when you add a new synced table, narrow an enum, or change a check constraint.

**Decision record:** See [ADR-0002: Offline Cache Drift Prevention](../adr/0002-offline-cache-drift-prevention.md) for the alternatives considered (runtime validators, schema fingerprint) and why this process-only defense was chosen.

---

## 1. Why this exists

The client keeps a local IndexedDB copy of every synced row. Delta sync refreshes that copy with a cursor: "give me every row where `updated_at` is newer than my last sync." Schema-level changes like `ALTER COLUMN TYPE`, adding a column with a server-side default, or changing a default value do NOT bump `updated_at`. The cursor sees nothing new, the cache keeps the old representation, and code that assumes the new shape crashes.

Real example: migration `044_icon_jsonb.sql` converted `item_types.icon` and `entity_types.icon` from `text` to `jsonb` via `ALTER COLUMN TYPE`. Clients whose caches synced before the migration kept plain-string icons (`"📍"`). Display code assumed the new `{set, name}` object shape and crashed with `Cannot read properties of undefined (reading 'replace')` on the edit-item page.

What migration 044 should have done additionally: `update item_types set updated_at = now();` and `update entity_types set updated_at = now();` in the same migration. Rule 1 below codifies this.

## 2. When this applies

Synced tables (as of this writing — re-check `SYNC_TABLES` in `src/lib/offline/sync-engine.ts` for the authoritative list):

```
items, item_types, custom_fields, item_updates, update_types,
update_type_fields, photos, entities, entity_types, geo_layers,
properties, orgs, roles, org_memberships
```

Changes to tables NOT in that list cannot drift client caches because they are never cached. Examples out of scope: `invites`, `communications_*`, `location_history`, `mutation_queue` internals.

### Sync mode per table

The sync engine uses three strategies, and the right remedy depends on which class your table is in. Consult `TABLES_WITH_UPDATED_AT` and `TABLES_WITHOUT_TIMESTAMPS` in `src/lib/offline/sync-engine.ts` for the authoritative split.

| Class | Sync strategy | Tables (as of this writing) | Matters for this playbook? |
|---|---|---|---|
| **A** | Delta sync on `updated_at` (trigger-backed) | `items`, `item_types`, `entities`, `entity_types`, `properties`, `orgs`, `roles`, `org_memberships` | Yes — the main audience of the checklist. |
| **B** | Delta sync on `created_at` (append-mostly tables) | `item_updates`, `photos`, `geo_layers` | Sometimes — see Rule 1's Class B caveat. |
| **C** | Full sync every time (no timestamp column) | `update_types`, `update_type_fields`, `custom_fields` | No — cache drift self-corrects on the next sync. Skip the checklist. |

If your migration touches a Class C table, you're done. If it touches a Class B table, read Rule 1's Class B caveat before choosing a remedy. Class A is the primary case the rules below describe.

## 3. The checklist

Read top to bottom. Stop at the first rule that matches your migration, apply the remedy, and move on.

### Rule 1 — You changed the TYPE of an existing column

Examples: `text` → `jsonb`, `int` → `bigint`, `varchar(n)` → `text`.

Remedy — add to the same migration:

```sql
update <table> set updated_at = now();
```

This forces every row to be re-synced so clients download the new representation. Cost: one-time extra bandwidth the next time each client syncs.

**Caveat for Class B tables** (`item_updates`, `photos`, `geo_layers`): the delta-sync cursor is on `created_at`, not `updated_at`, so bumping `updated_at` has no effect on sync. Either (a) bump the Dexie schema version in `src/lib/offline/db.ts` to force a full rebuild of the store on next app load, or (b) extend the sync engine to also watch `updated_at` on the affected table (larger change — coordinate with the offline-sync owner). Do NOT do `update <table> set created_at = now();` — that corrupts sort order.

### Rule 2 — You added a column with a server-side default

Example: `alter table items add column priority text default 'normal';`.

Remedy — decide which is true for your migration:

- **Client code depends on this field being present** → bump `updated_at` as in Rule 1.
- **Client code tolerates the field being absent** → no bump needed, but the TypeScript interface in `src/lib/types.ts` should mark the field as optional (`field?: T`) or nullable (`field: T | null`).

### Rule 3 — You renamed or removed a column

Remedy — do both, in the same migration cycle:

1. For **Class A** tables, add `update <table> set updated_at = now();` to the SQL migration so clients re-sync. Dexie's `bulkPut` replaces the cached row with one that no longer carries the old column. For **Class B** tables, fall back to Rule 1's Class B remedy (bump Dexie schema version or extend sync to watch `updated_at`) — the `update <table> set updated_at = now();` trick does not apply because these tables have no `updated_at` column. For **Class C** tables, cache drift self-corrects on the next full sync; no extra SQL needed.
2. Bump the Dexie schema version in `src/lib/offline/db.ts`. Add a new `this.version(N + 1).stores({...})` block. If the removed/renamed column was an indexed field in Dexie, update the index list in the new version. Do not mutate the previous version block.

### Rule 4 — You added a new synced table

Before the three steps below, decide which sync class the new table belongs in. The choice determines which timestamp columns you add.

- **Class A** (rows mutate, need low-latency delta sync): add `created_at` and `updated_at` columns with an `updated_at` trigger (follow migration 013's `entities_updated_at` / `entity_types_updated_at` pattern). Add the table name to `TABLES_WITH_UPDATED_AT` in `src/lib/offline/sync-engine.ts`.
- **Class B** (append-mostly, rarely mutated): add `created_at` only. The sync engine will pick up new rows via `created_at`; mutations on existing rows won't propagate until a Dexie schema bump or a sync-engine change, so only pick this class if mutations are truly rare.
- **Class C** (tiny reference data, always full-sync): skip timestamps entirely. Add the table name to `TABLES_WITHOUT_TIMESTAMPS` in `src/lib/offline/sync-engine.ts`.

Then:

1. Add the table name to `SYNC_TABLES` in `src/lib/offline/sync-engine.ts`.
2. Add the table to the appropriate scope filter in the same file (`propertyScoped` or `orgScoped`) so the sync engine queries the right foreign key.
3. Add a Dexie store definition in `src/lib/offline/db.ts` in a new version block.

### Rule 5 — You narrowed an enum or check constraint

Example: removing `'beta'` from a status check constraint that used to allow it.

Remedy — in the same migration, repair any rows carrying the now-invalid value:

```sql
update <table> set <column> = '<valid-value>' where <column> = '<removed-value>';
```

What happens next depends on the table's sync class:

- **Class A** (has `updated_at` trigger): the repair `UPDATE` bumps `updated_at` automatically, and the delta-sync cursor picks up the repaired rows on the next sync. No extra step needed.
- **Class B** (delta on `created_at`): the repair fixes the server but stale caches won't re-sync. Pair with the Class B remedy from Rule 1.
- **Class C** (full sync): the repair shows up on the next full sync. No extra step needed.

### None of the above?

If the migration targets a Class A or B table with a change that doesn't match Rules 1–5, ask: "does this change the client-visible shape of the row?" If yes, apply Rule 1's remedy for that class (updated_at bump for Class A; Dexie schema version bump or sync-engine widening for Class B). If no, the migration is cache-safe.

Cache-safe examples that need no action:

- Creating a brand-new table that is not in `SYNC_TABLES`.
- Adding an index or unique constraint (no row-shape change).
- Changing an RLS policy (no row-shape change).
- Adding a nullable column with no default that client code doesn't reference yet.

## 4. Secondary reminder — TypeScript interface changes

When a code PR adds or changes a field on a TypeScript interface for a synced row (`Item`, `ItemType`, `Entity`, `EntityType`, `UpdateType`, `UpdateTypeField`, `CustomField`, `Property`, `Org`, `Role`, `OrgMembership`, `Photo`, `ItemUpdate`) *without* a corresponding SQL migration:

Ask: will stale caches still work?

- Usually **yes** if you make the new field optional (`field?: T` or `field: T | null`) and handle `undefined` gracefully at the call site.
- If the code needs the field to be present at runtime, the change needs an accompanying SQL migration — at which point Rule 2 above applies.

## 5. Rule of thumb

When in doubt on a Class A table, add `update <table> set updated_at = now();` to the migration. For Class B tables, bump the Dexie schema version. For Class C tables, no action is needed — drift self-corrects on the next sync. This class-aware default eliminates the entire cache-drift bug class with one line per migration.
