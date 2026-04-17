# Playbook: Offline Cache Schema Changes

**Purpose:** Prevent SQL migrations from silently breaking the client's IndexedDB offline cache. Every migration that touches a synced table must follow this checklist.

**When to use:** Any SQL migration under `supabase/migrations/` that adds, removes, renames, or changes the type of a column on a synced table. Also applies when you add a new synced table, narrow an enum, or change a check constraint.

---

## 1. Why this exists

The client keeps a local IndexedDB copy of every synced row. Delta sync refreshes that copy with a cursor: "give me every row where `updated_at` is newer than my last sync." Schema-level changes like `ALTER COLUMN TYPE`, adding a column with a server-side default, or changing a default value do NOT bump `updated_at`. The cursor sees nothing new, the cache keeps the old representation, and code that assumes the new shape crashes.

Real example: migration `044_icon_jsonb.sql` converted `item_types.icon` and `entity_types.icon` from `text` to `jsonb` via `ALTER COLUMN TYPE`. Clients whose caches synced before the migration kept plain-string icons (`"📍"`). Display code assumed the new `{set, name}` object shape and crashed with `Cannot read properties of undefined (reading 'replace')` on the edit-item page.

## 2. When this applies

Synced tables (as of this writing — re-check `SYNC_TABLES` in `src/lib/offline/sync-engine.ts` for the authoritative list):

```
items, item_types, custom_fields, item_updates, update_types,
update_type_fields, photos, entities, entity_types, geo_layers,
properties, orgs, roles, org_memberships
```

Changes to tables NOT in that list cannot drift client caches because they are never cached. Examples out of scope: `invites`, `communications_*`, `location_history`, `mutation_queue` internals.

## 3. The checklist

Read top to bottom. Stop at the first rule that matches your migration, apply the remedy, and move on.

### Rule 1 — You changed the TYPE of an existing column

Examples: `text` → `jsonb`, `int` → `bigint`, `varchar(n)` → `text`.

Remedy — add to the same migration:

```sql
update <table> set updated_at = now();
```

This forces every row to be re-synced so clients download the new representation. Cost: one-time extra bandwidth the next time each client syncs.

### Rule 2 — You added a column with a server-side default

Example: `alter table items add column priority text default 'normal';`.

Remedy — decide which is true for your migration:

- **Client code depends on this field being present** → bump `updated_at` as in Rule 1.
- **Client code tolerates the field being absent** → no bump needed, but the TypeScript interface in `src/lib/types.ts` should mark the field as optional (`field?: T`) or nullable (`field: T | null`).

### Rule 3 — You renamed or removed a column

Remedy — do both, in the same migration cycle:

1. Add `update <table> set updated_at = now();` to the SQL migration. When clients re-sync, Dexie's `bulkPut` will replace the cached row with one that no longer carries the old column.
2. Bump the Dexie schema version in `src/lib/offline/db.ts`. Add a new `this.version(N + 1).stores({...})` block. If the removed/renamed column was an indexed field in Dexie, update the index list in the new version. Do not mutate the previous version block.

### Rule 4 — You added a new synced table

Remedy — all three:

1. Add the table name to `SYNC_TABLES` in `src/lib/offline/sync-engine.ts`.
2. Add the table to the appropriate scope filter in the same file (`propertyScoped` or `orgScoped`) so the sync engine queries the right foreign key.
3. Add a Dexie store definition in `src/lib/offline/db.ts` in a new version block.

### Rule 5 — You narrowed an enum or check constraint

Example: removing `'beta'` from a status check constraint that used to allow it.

Remedy — in the same migration, repair any rows carrying the now-invalid value:

```sql
update <table> set <column> = '<valid-value>' where <column> = '<removed-value>';
```

This update itself bumps `updated_at` on synced tables (they have an `updated_at` trigger from migration 013 onward), so clients re-sync the repaired rows automatically. No separate timestamp bump is needed unless the table lacks the trigger — verify by grepping `supabase/migrations/` for `<table>_updated_at`.

### None of the above?

The migration is cache-safe. Examples that need no action:

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

When in doubt, add `update <table> set updated_at = now();` to the migration. It forces one extra round-trip of sync per client but eliminates the entire class of cache-drift bugs.
