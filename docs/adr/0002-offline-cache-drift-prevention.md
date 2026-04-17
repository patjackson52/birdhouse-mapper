# ADR-0002: Offline Cache Drift Prevention

**Status:** Accepted

**Date:** 2026-04-17

**Owners:** @patjackson52

## Context

FieldMapper is an offline-first PWA. The client keeps a local IndexedDB copy of every synced row (items, item_types, entities, entity_types, and so on — see `SYNC_TABLES` in `src/lib/offline/sync-engine.ts`). Delta sync refreshes that copy with a per-table cursor: "give me every row where `updated_at` (or `created_at` for some tables) is newer than my last sync."

Schema-level changes like `ALTER COLUMN TYPE`, adding a column with a server-side default, or removing a column do NOT bump row-level timestamps. The delta cursor sees nothing new, the cache keeps the old row representation, and code compiled against the new TypeScript shape crashes on the stale data.

Real incident: migration `044_icon_jsonb.sql` converted `item_types.icon` and `entity_types.icon` from `text` to `jsonb` via `ALTER COLUMN TYPE`. Clients whose caches synced before the migration kept plain-string icons (`"📍"`). The new display code assumed `{set, name}` objects and crashed with `Cannot read properties of undefined (reading 'replace')` on the `/p/<slug>/edit/<id>` page. The runtime hotfix (PR #260, `normalizeIcon`) masks the symptom but leaves the class of bug latent for every future schema change.

The sync engine actually uses three strategies and the right remedy for a schema change depends on which class the affected table is in:

- **Class A** (8 tables, `TABLES_WITH_UPDATED_AT`): `updated_at` delta sync, trigger-backed.
- **Class B** (3 tables): `created_at` delta sync, no `updated_at`.
- **Class C** (3 tables, `TABLES_WITHOUT_TIMESTAMPS`): full sync every time.

This asymmetry is easy to miss and was itself a factor in the icon bug: any single uniform prescription ("always bump updated_at") is wrong for Class B and irrelevant for Class C.

## Decision

Ship a **process-only defense** as the first layer:

1. A canonical playbook at `docs/playbooks/offline-cache-schema-changes.md` that explains the failure mode, documents the Class A/B/C taxonomy, and prescribes class-aware remedies for five change types (column type change, added column with default, rename/remove, new synced table, enum narrowing).
2. A new row in the Architectural Invariants table in `AGENTS.md` that points migration authors at the playbook. Agents read AGENTS.md at session start, so this catches agent-written migrations.
3. A `## Cache safety` checkbox in `.github/pull_request_template.md` that surfaces the check at review time, catching human-written migrations.

No code changes. No runtime cost. One extra line per schema-changing migration (`update <table> set updated_at = now();` for Class A tables; alternate remedies for B and C).

Runtime validators and schema fingerprints — the more robust but more expensive defenses — are deferred unless the process layer proves insufficient. Revisit if two or more migrations ship without the checklist being applied.

## Alternatives Considered

- **Runtime validators at the IndexedDB read boundary** (Zod or handwritten schemas for each of the ~17 cached tables, validating rows on every read). Catches drift after it ships; gives a hook to trigger cursor invalidation or telemetry. Rejected for now: ~4–8 hours of setup, ~200–400 lines of validator code, redundant with TypeScript interfaces unless we generate the types from the validators (a bigger rewrite), ~5–50 ms per 1000-row read synchronously, ~15 kB bundle for Zod (or ~3 kB for Valibot, or 0 kB for handwritten). Addresses the same bug class the playbook addresses — just at a different layer — and does not prevent cursor-stuck bugs without also being paired with cursor invalidation.

- **Schema fingerprint in `sync_metadata`** (each table row tagged with a schema version; mismatch invalidates the cursor and forces a full re-fetch). More direct at the root cause than validators — automatic recovery with no per-row cost at read time. Rejected for now: requires server-side cooperation to expose a per-table schema version, adds a new column to `sync_metadata`, forces a full table refetch on every schema change (bandwidth cost). Higher leverage than validators but also higher setup cost and coordination burden.

- **A one-time migration to bump `updated_at` on every currently-affected synced table.** Would force all existing stale caches to repair themselves on the next sync, which is tempting. Rejected for now: the `normalizeIcon` hotfix (PR #260) already masks the only known stale-shape case, and running a blanket `UPDATE` across all rows on all eight Class A tables is a non-trivial production write. Tracked as a potential follow-up if another stale-shape case surfaces before this playbook catches on.

## Decision Drivers

- **Cost tolerance.** The team is small. The playbook ships in an afternoon; validators or fingerprints are weeks. Start with the cheapest layer that could work.
- **Bug frequency.** Only one production incident of this class has been observed (the icon crash). The frequency doesn't yet justify a heavy runtime defense.
- **Discoverability at the right moment.** The failure mode is trapped in migration-authoring, not at runtime — which is exactly where AGENTS.md and the PR template are read.
- **Observability over silence.** If the process layer fails, we will see it as another runtime crash. That's a clear signal to escalate to a runtime defense.

## Consequences

**Positive:**
- Zero runtime cost, zero bundle size impact, zero new dependencies.
- One canonical place (`docs/playbooks/offline-cache-schema-changes.md`) to look up what to do, plus two entry points (AGENTS.md invariant row, PR template checkbox) at the moments authoring and reviewing actually happen.
- Class A/B/C taxonomy forces authors to consult `src/lib/offline/sync-engine.ts` and understand their table's sync mode, reducing silent assumptions.

**Negative:**
- Relies on discipline. An author who ignores the AGENTS.md row and unchecks the PR template checkbox without actually reading the playbook can still ship a broken migration.
- Does not auto-recover from past drift. Users whose caches predate migration 044 will still hit the stale-string icon path until `normalizeIcon` is there to catch it.
- Not enforceable by CI in this iteration. A migration author can bypass the check and the PR will still merge.

**Neutral:**
- Authors working on non-synced tables (e.g., `invites`, `communications_*`) now have one more checkbox to tick, though the playbook's "None of the above?" section makes the trivial case explicit.
- The playbook duplicates the `SYNC_TABLES` list in prose. The source of truth is the code constant; the playbook is a mirror that can drift if the constant changes. Mitigated by a note in the playbook directing readers back to the source file.

## Escalation criteria

Revisit this decision if any of the following occur:

1. Two or more SQL migrations ship that should have followed the playbook but didn't.
2. A second production incident in the same bug class (schema drift → cache crash) happens after this playbook lands.
3. Schema-change velocity grows to the point where the checklist is consulted multiple times per week.

Likely next step if escalated: a GitHub Action that greps migration diffs for `ALTER COLUMN` without a matching `UPDATE ... set updated_at` (the cheapest form of enforcement). If that's still not enough, move on to runtime validators or schema fingerprints.

## Related Files

- `docs/playbooks/offline-cache-schema-changes.md`
- `AGENTS.md` (Architectural Invariants table)
- `.github/pull_request_template.md`
- `src/lib/offline/sync-engine.ts` (`SYNC_TABLES`, `TABLES_WITH_UPDATED_AT`, `TABLES_WITHOUT_TIMESTAMPS`)
- `src/lib/offline/db.ts` (Dexie schema versions)
- `supabase/migrations/044_icon_jsonb.sql` (motivating incident)
- `src/lib/types.ts` (`normalizeIcon`, the runtime masking of the 044 incident)
- `docs/superpowers/specs/2026-04-17-offline-cache-schema-checklist-design.md`
- `docs/superpowers/plans/2026-04-17-offline-cache-schema-checklist.md`

## Related Issues / PRs

- #259 — Species picker iNaturalist integration (merged; unrelated but surfaced the 044 bug when the user interacted with the edit-item page).
- #260 — `normalizeIcon` runtime hotfix for the 044 stale-cache icon crash (merged).
- #261 — This PR, introducing the playbook, AGENTS.md row, and PR template checkbox.

## Tags

`offline`, `indexeddb`, `sync`, `migrations`, `process`
