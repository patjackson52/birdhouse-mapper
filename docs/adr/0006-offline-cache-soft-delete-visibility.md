# ADR-0006: Offline Cache Must Mirror Server-Side RLS Visibility Filters (Soft-Delete in Particular)

**Status:** Accepted

**Date:** 2026-04-22

**Owners:** @patjackson52

## Context

FieldMapper's offline-first PWA caches `item_updates` (and a dozen other tables) in IndexedDB via the sync engine in `src/lib/offline/sync-engine.ts`. The sync engine uses two mechanisms to keep the local cache in step with Supabase:

1. **Delta sync** — on each `syncPropertyData` tick, re-fetch rows whose `updated_at` (or `created_at`, for tables without `updated_at`) is newer than the last sync. Cheap and bandwidth-efficient.
2. **ID reconciliation** — fetch the full set of authoritative row ids for the scope, compare against local ids, and bulk-delete any local row the server no longer returns. Added by ADR-0002 after delta sync was shown to be blind to hard-deletes.

PR #275 (update delete flow) introduced soft-delete on `item_updates` via `deleted_at` + a RESTRICTIVE RLS policy `item_updates_hide_deleted`. The server-side half worked correctly on day one: RLS filtered soft-deleted rows out of every read, including the one the reconciliation pass issues. But the feature shipped with a bug: deleted updates stayed visible in the UI after a successful server delete and an 8-second toast window, and only disappeared after the next sync trigger (online event, visibility change, or 5-minute poll).

Root cause:

- `item_updates` has no `updated_at` column, so delta sync is keyed on `created_at`. Soft-delete doesn't change `created_at`, so delta sync never re-fetches the row.
- The ID reconciliation pass *would* catch it (the server's id set no longer includes the row under RLS), but reconciliation only runs during `syncPropertyData`, which mutations do not invoke.
- `router.refresh()` — the only invalidation lever the feature used — re-runs server components but has no effect on IndexedDB or on client state previously hydrated from it. The parent component (`HomeMapView`) snapshots `updates` from `offlineStore.getItemUpdates()` at marker-click time; that snapshot stays in React state across the delete.

In short: **any server-side visibility filter that can hide a row without mutating the delta-sync timestamp is invisible to the cache until the next full sync tick.** Soft-delete is the first case we hit; future equivalents (moderation queues with `published_at`, role-based scope changes, tombstoned status values) have the same shape.

## Decision

Adopt the following invariant for features that introduce server-side visibility filters:

> **If a column or predicate can change whether a row is visible to a given reader under RLS without also bumping `updated_at`/`created_at`, the feature MUST:**
>
> 1. Either (a) bump `updated_at` on the change so delta sync picks it up, OR
> 2. Provide an immediate client-side eviction and an explicit `triggerSync` / reconciliation path so the cache does not lie to the UI between mutation and next sync tick.

For the update delete flow specifically, option 2 was chosen because `item_updates.created_at` is the historical event date (not a mutation timestamp) and bumping it on delete would corrupt timeline ordering. The concrete implementation:

- The Zustand `deleteSlice` carries both the `pending` record (for the undo toast) and a `hiddenUpdateIds` list (an optimistic client filter).
- `DetailPanel.handleDeleteUpdate` (after the server action succeeds) marks the id hidden, evicts the row from IndexedDB via `getOfflineDb().item_updates.delete(id)`, and filters `item.updates` before passing it to the layout renderer.
- `DeleteToastHost.handleUndo` restores the row to IndexedDB via `db.item_updates.put(savedRow)` and clears the hidden flag.
- `DeleteToastHost.handleExpire` leaves the hidden flag set (the row is gone server-side and from IndexedDB; the extra filter is belt-and-suspenders until page reload).

This pattern — **optimistic local eviction + optional server-backed restore on undo + hidden-id filter on the derived UI state** — is the blessed template for any soft-delete-style feature.

A companion refactor (tracked as a follow-up issue, not in this PR) will lift this logic into the sync engine itself, so future features don't have to hand-roll the eviction. Specifically: the reconciliation pass will (a) select `id, deleted_at` where the column exists and treat non-null `deleted_at` the same as "absent from server", and (b) expose an `evictLocal(table, id)` helper so mutation paths have a one-liner instead of `getOfflineDb().X.delete(id)` scattered everywhere. Until then, the per-feature pattern above is the contract.

## Alternatives Considered

- **Bump `updated_at` on soft-delete.** Would make delta sync detect the change naturally and is the cleanest mechanism — but `item_updates` has no `updated_at` column at all, and `created_at` is semantically the observation date (ordering anchor for the timeline). Adding `updated_at` to `item_updates` and backfilling it was rejected as out-of-scope for the delete PR; it's a reasonable follow-up if future features need more change detection on updates.

- **Fire `syncPropertyData` after the server action succeeds.** Would eventually reconcile via the existing ID pass, but the round-trip is several hundred ms and the toast window is 8 s — UX would feel laggy, and a flaky network would leave the row visible after the toast disappears. Rejected as the sole mechanism; can be added as a belt-and-suspenders later.

- **Broadcast a "row evicted" event through a client-side pub/sub.** A reactive layer (Zustand slice per table, or Dexie `liveQuery` subscriptions) would make cached reads auto-update. Larger architectural change, appropriate if/when a third bug in this class shows up. Deferred.

- **Server-side hard-delete instead of soft-delete.** Sidesteps the cache-visibility problem entirely (a hard-delete is caught by the existing reconciliation pass). But loses the 8-second undo window and the audit trail, which are the whole point of this feature. Rejected.

## Decision Drivers

- **Failure mode is silent.** Server works, toast appears, network looks fine — but the UI lies. This mirrors the same "invisible failure" pattern ADR-0002 and ADR-0004 are about; the cost of rediscovery is high and the debugging surface is broad.
- **The invariant generalizes.** Soft-delete is the first instance, not the last. Moderation queues with `published_at`, scheduled content with `scheduled_for`, role-driven hides via `visible_to` arrays — anything that flips visibility without changing the sync key fits the same pattern.
- **The sync engine's reconciliation pass already understands visibility.** It was designed for hard-delete but the mechanism works for soft-delete if we teach it about `deleted_at`. The refactor is small and the primitive is reusable.
- **Per-feature mitigation is cheap in isolation but expensive in aggregate.** Three features each adding their own eviction logic is a 10-minute cost each plus a shared "did everyone remember?" review burden. One sync-engine change retires the category.

## Consequences

**Positive:**
- Future features that hide rows via RLS filters inherit a documented pattern (this ADR) and — once the sync-engine refactor lands — a central mechanism instead of per-feature eviction.
- The pattern of "client-side hidden-id filter + IndexedDB eviction + undo-aware restore" is now named and reusable.
- Future reviewers can reject PRs that ship a new visibility filter without either bumping `updated_at` or providing eviction logic, with a concrete ADR to cite.

**Negative:**
- Until the sync-engine refactor lands, each feature adding a new visibility filter has to copy the eviction pattern by hand. That duplication is a latent source of drift.
- The `hiddenUpdateIds` client-side filter is session-scoped; a tab refresh clears it. On expire, the row is still filtered because the server also stops returning it — but any gap between "evict from cache" and "next server read" could theoretically leak the row back in if sync runs before the UI filter can hide it. In practice the eviction happens before `router.refresh()`, so the gap is empty.

**Neutral:**
- `hiddenUpdateIds` grows monotonically within a session; for delete-heavy sessions (thousands of deletes) this would matter, but realistic usage is at most a handful per session.
- Storing the full saved row in the pending state (for undo restore) is an extra kilobyte or two of in-memory state. Negligible; simpler than re-fetching on undo.

## Related Files

- `src/lib/offline/sync-engine.ts:218` — the existing ID reconciliation pass, the natural home for the follow-up refactor
- `src/lib/offline/store.ts:31` — `getItemUpdates` reads IndexedDB, no `deleted_at` filter at the store level (RLS filters server-side but the local copy is canonical for reads)
- `src/stores/deleteSlice.ts` — Zustand slice with the `hiddenUpdateIds` invariant
- `src/components/item/DetailPanel.tsx` — eviction on delete, restore on undo
- `src/components/delete/DeleteToastHost.tsx` — undo / expire handling
- `docs/adr/0002-offline-cache-drift-prevention.md` — sibling ADR; the hard-delete counterpart
- `docs/adr/0004-offline-outbound-mutation-invariants.md` — sibling ADR; the outbound-mutation counterpart
- `docs/adr/0005-update-soft-delete-and-undo-tokens.md` — the feature ADR; this ADR extends its "Consequences" with the client-cache constraint

## Related Issues / PRs

- #275 — update delete flow (this ADR emerged from post-deploy debugging on that branch)
- #276 — follow-up: centralize soft-delete awareness in the offline sync engine

## Tags

`offline-sync`, `rls`, `soft-delete`, `indexeddb`, `cache-invariants`, `sync-engine`
