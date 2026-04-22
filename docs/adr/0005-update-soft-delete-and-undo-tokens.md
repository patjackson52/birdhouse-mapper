# ADR-0005: Update soft-delete and undo tokens

**Status:** Accepted

**Date:** 2026-04-22

**Owners:** @patjackson52

## Context

We are adding a user-initiated delete flow for item_updates. Requirements:
- Authors can delete their own non-anon updates.
- Org admins and coordinators can delete any update in their org (moderation).
- Undo must be available for 8 seconds.
- Deleted updates must not appear in public reads.
- All deletes and undos must be audited.
- species_sightings_v (view over item_updates) must reflect deletes immediately.

## Decision

- **Soft-delete column model.** Add deleted_at/deleted_by/delete_reason to item_updates. Do not introduce a tombstone table. Simpler, and leaves room for a future hard-delete sweeper.

- **No trigger for species_sightings_v.** The view already projects from item_updates. Once the SELECT RLS filter requires deleted_at IS NULL, species_sightings_v automatically stops including rows from deleted updates — and restores them on undo.

- **HMAC undo tokens with a 13-second server TTL.** 8s UI window + 5s grace. Token payload is {update_id, actor_id, expires_at_ms} signed with server-only secret. Token is returned once from softDeleteUpdate and never re-issued.

- **Client-side optimism via Zustand.** Update detail closes immediately, item page renders UndoToast driven by a top-level deleteSlice store.

## Alternatives Considered

- **Hard-delete immediately** — Simpler auditing but loses the 8-second undo window and makes recovery impossible. User expectations for "undo" include waiting a few seconds; hard-delete breaks this mental model.

- **Tombstone table** — Separate audit_trail_deletes table. Adds complexity and requires a join to filter out deletes in views; RLS-level filtering is cleaner.

- **JWT undo tokens** — Smaller payload but requires server-side state to revoke. HMAC tokens with short TTL avoid the revocation problem.

- **Async deletion (mutation queue)** — Deferred soft-delete on next sync. Adds offline complexity and makes "undo" semantics confusing for users who expect immediate visual feedback.

## Decision Drivers

- **UX:** 8-second undo is table-stakes for delete operations; users expect to recover accidental deletes.
- **Audit compliance:** All mutations (including deletes and undos) must be logged with timestamps and actor ids.
- **Simplicity:** Soft-delete + RLS filtering is easier to reason about than tombstone joins or async queues.
- **Mobile offline:** Optimistic closes work without blocking the sync loop; undo tokens do not require round-trip validation.
- **View transparency:** species_sightings_v automatically reflects deletes without triggers or polling.

## Consequences

**Positive:**
- Reads stay fast (no join required to filter out deletes; just an index on deleted_at).
- Anyone writing a new query against item_updates must remember to filter deleted_at; this is enforced at the RLS layer for anon + authenticated reads.
- Soft-delete leaves room for a future hard-delete sweeper without data model changes.
- HMAC tokens avoid the need to track issued tokens in a table or cache, reducing server state.

**Negative:**
- Internal tooling that bypasses RLS (service role) must include the filter manually. Document this near the admin views.
- Adds a new secret (UPDATE_UNDO_HMAC_SECRET). Must be provisioned in Vercel + Supabase environments before rollout.

**Neutral:**
- Deleted rows remain in the table indefinitely (until hard-deleted). Storage cost is negligible unless delete volume becomes high (unlikely for updates).

## Related Files

- `src/lib/delete-updates/undo-token.ts` — HMAC sign/verify
- `src/app/items/[itemId]/updates/actions.ts` — softDeleteUpdate + undoDeleteUpdate server actions
- `src/stores/deleteSlice.ts` — Zustand pending-undo store
- `src/components/delete/` — DeleteConfirmModal, UndoToast, DeleteToastHost
- `supabase/migrations/047_update_soft_delete.sql` — Schema, RLS, audit_log, helper functions

## Related Issues / PRs

(none yet — plan-driven implementation)

## Tags

`update-delete`, `undo`, `soft-delete`, `undo-tokens`, `audit`, `rls`
