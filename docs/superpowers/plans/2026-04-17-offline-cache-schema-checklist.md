# Offline Cache Schema-Change Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a process-only defense against the offline-cache schema-drift bug class by adding one new playbook, one invariants-table row in `AGENTS.md`, and one checkbox in the PR template.

**Architecture:** Three small file touches. No runtime code, no tests, no migrations. The playbook is the canonical content; the other two touches make it discoverable at authoring and review time. Spec reference: `docs/superpowers/specs/2026-04-17-offline-cache-schema-checklist-design.md`.

**Tech Stack:** Markdown, git.

---

## File Structure

**New files:**
- `docs/playbooks/offline-cache-schema-changes.md` — the canonical checklist, four sections (trigger, mental model, decision-tree checklist, secondary reminder for TS interface changes)

**Modified files:**
- `AGENTS.md` — one new row in the Architectural Invariants table (after the existing rows, before the Coding and Change Discipline section)
- `.github/pull_request_template.md` — one new `## Cache safety` section between the Testing section and the Memory & Decision Tracking section

**Not touched:**
- `src/lib/offline/sync-engine.ts` — referenced by the playbook but not modified (the playbook points to the `SYNC_TABLES` list as the source of truth; no code change)
- `src/lib/offline/db.ts` — same
- `CLAUDE.md` — deliberately not touched. The Playbooks section there currently lists only one playbook; if we start linking every playbook from CLAUDE.md it becomes a second source of truth. AGENTS.md is the canonical operating manual. Revisit only if the new playbook is repeatedly missed by agents.

---

## Task 1: Create the playbook

**Files:**
- Create: `docs/playbooks/offline-cache-schema-changes.md`

- [ ] **Step 1: Confirm the file does not yet exist**

Run: `ls docs/playbooks/offline-cache-schema-changes.md`
Expected: `No such file or directory`

- [ ] **Step 2: Confirm the current `SYNC_TABLES` list in the codebase**

Run: `grep -A5 "^const SYNC_TABLES" src/lib/offline/sync-engine.ts`
Expected output (the list the playbook will reference):
```
const SYNC_TABLES = [
  'items', 'item_types', 'custom_fields', 'item_updates', 'update_types',
  'update_type_fields', 'photos', 'entities', 'entity_types', 'geo_layers',
  'properties', 'orgs', 'roles', 'org_memberships',
] as const;
```

If the list has drifted since the spec was written, update the playbook's Section 1 to match what's actually in the source file. The source file is the source of truth.

- [ ] **Step 3: Create the playbook**

Create `docs/playbooks/offline-cache-schema-changes.md` with this exact content:

````markdown
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
````

- [ ] **Step 4: Verify the file renders cleanly**

Run: `head -20 docs/playbooks/offline-cache-schema-changes.md`
Expected: the file starts with `# Playbook: Offline Cache Schema Changes` and the first paragraph of the Purpose line.

Run: `wc -l docs/playbooks/offline-cache-schema-changes.md`
Expected: roughly 90–110 lines.

- [ ] **Step 5: Commit**

```bash
git add docs/playbooks/offline-cache-schema-changes.md
git commit -m "docs(playbook): offline cache schema-change checklist"
```

---

## Task 2: Add the `AGENTS.md` invariants row

**Files:**
- Modify: `AGENTS.md` — the Architectural Invariants table, currently at lines 22–34

- [ ] **Step 1: Inspect the current table**

Run: `grep -n "^|" AGENTS.md | head -20`

Expected: you see the table headers on lines 22–23 (`| Invariant | Detail |` and `|---|---|`), the existing rows on 24–34, and no Offline-cache row yet. If an Offline-cache row already exists, STOP — the playbook is already linked, and this task is already done.

- [ ] **Step 2: Add the new row**

Edit `AGENTS.md`. Find the existing row `| Client Supabase | \`createClient()\` from \`@/lib/supabase/client\` (synchronous) |` and add a new row immediately after it:

```markdown
| Offline cache safety | Any SQL migration that touches a table in `SYNC_TABLES` (see `src/lib/offline/sync-engine.ts`) must follow `docs/playbooks/offline-cache-schema-changes.md`. When in doubt, `update <table> set updated_at = now();` in the same migration. |
```

- [ ] **Step 3: Verify the row renders as valid markdown**

Run: `grep -A1 "Offline cache safety" AGENTS.md`
Expected: exactly one match, followed immediately by the next existing row of the file (whatever it is) — confirms the row was inserted cleanly with no stray blank lines or broken table syntax.

Run: `awk '/^## Architectural Invariants/,/^## Coding and Change Discipline/' AGENTS.md | head -40`
Expected: the entire Invariants table renders with headers, separator, existing rows, and the new `Offline cache safety` row as the final data row.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): add offline cache safety invariant"
```

---

## Task 3: Update the PR template

**Files:**
- Modify: `.github/pull_request_template.md`

- [ ] **Step 1: Inspect the current template**

Run: `cat .github/pull_request_template.md`

Expected sections: `Summary`, `Type of Change`, `Testing`, `Memory & Decision Tracking`, `Screenshots`.

Confirm there is no existing `Cache safety` section. If there is, STOP — already done.

- [ ] **Step 2: Add the Cache safety section**

Edit `.github/pull_request_template.md`. Insert a new section between the existing `## Testing` section and the existing `## Memory & Decision Tracking` section:

```markdown
## Cache safety

- [ ] This PR does not add a SQL migration, OR the migration follows `docs/playbooks/offline-cache-schema-changes.md`.
```

The placement intentionally sits after Testing (so the author thinks about correctness first) and before Memory tracking (so the cache check is not buried under unrelated bookkeeping).

- [ ] **Step 3: Verify the template parses as valid markdown**

Run: `grep -n "^## " .github/pull_request_template.md`
Expected: the section headings in order — `## Summary`, `## Type of Change`, `## Testing`, `## Cache safety`, `## Memory & Decision Tracking`, `## Screenshots`.

- [ ] **Step 4: Commit**

```bash
git add .github/pull_request_template.md
git commit -m "docs(pr): add cache-safety checkbox to PR template"
```

---

## Task 4: Final internal-consistency check

**Files:** none modified (verification only)

- [ ] **Step 1: Confirm all three files exist and point at each other correctly**

Run: `grep -l "offline-cache-schema-changes" docs/playbooks/offline-cache-schema-changes.md AGENTS.md .github/pull_request_template.md`
Expected: all three paths printed. Each file should mention the playbook either as itself or as a link.

- [ ] **Step 2: Confirm the playbook's `SYNC_TABLES` list still matches the source of truth**

Run: `grep -A5 "^const SYNC_TABLES" src/lib/offline/sync-engine.ts`

Compare its output against Section 2 of the playbook (`cat docs/playbooks/offline-cache-schema-changes.md | grep -A3 "items, item_types"`). The table names should match exactly. If `SYNC_TABLES` has added a table since the playbook was drafted, update Section 2 of the playbook in a small follow-up commit. (This is a one-time check; ongoing drift is managed by the same playbook it's verifying.)

- [ ] **Step 3: Confirm the AGENTS.md Invariants table is still valid markdown**

Run: `awk '/^## Architectural Invariants/,/^## /' AGENTS.md | head -30`
Expected: a clean table with headers, separator row, and all invariant rows including the new `Offline cache safety` row, followed by the next top-level heading.

- [ ] **Step 4: Confirm the PR template still renders**

Use the GitHub CLI to dry-render the template for a PR on a test branch (optional but reassuring if it's your first time editing the template):

```bash
gh pr create --dry-run --title "test" --body-file .github/pull_request_template.md 2>&1 | head -30
```

If you don't have `--dry-run` access or don't want to exercise `gh`, just verify the file is syntactically a valid markdown checklist by visually scanning `cat .github/pull_request_template.md`.

No new commit for Task 4 unless Step 2 found drift requiring a playbook update.

---

## Done criteria

- `docs/playbooks/offline-cache-schema-changes.md` exists and contains all four sections (Why, When, Checklist, Secondary reminder).
- `AGENTS.md` has an `Offline cache safety` row in its Architectural Invariants table that links to the playbook.
- `.github/pull_request_template.md` has a `## Cache safety` section with one checkbox linking to the playbook.
- The `SYNC_TABLES` list in the playbook matches `src/lib/offline/sync-engine.ts` at merge time.
- No code files changed. `npm run test` and `npm run type-check` were not required to run (unchanged by this PR) but verifying they still pass with `npm run test && npm run type-check` is a sanity check against accidental file corruption.

## Deferred follow-ups (intentionally not in this plan)

- Linking the new playbook from `CLAUDE.md`'s Playbooks section. Skipped because AGENTS.md is the canonical location.
- A GitHub Action that greps migration diffs for `ALTER COLUMN` without a matching `UPDATE ... set updated_at`. Revisit if two or more migrations ship without the playbook being applied.
- A one-time migration that bumps `updated_at` across all affected tables so existing stale caches repair themselves without relying on defensive normalizers. Tracked separately.
- Runtime read-boundary validators (option 2 in brainstorming) and schema fingerprinting (option 5). Both deferred until process discipline is shown insufficient.
