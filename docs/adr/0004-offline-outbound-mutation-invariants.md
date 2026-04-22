# ADR-0004: Offline Outbound Mutation Invariants for Scoped + Storage-Backed Resources

**Status:** Accepted

**Date:** 2026-04-21

**Owners:** @patjackson52

## Context

FieldMapper's offline-first PWA has an outbound mutation queue in `src/lib/offline/sync-engine.ts` that writes local IndexedDB changes back to Supabase. Photos (and any future resource that sits on top of Supabase storage + a `photos`-shaped row + property/org scoping + RLS) have four co-invariants that all have to hold or the whole upload silently fails. Each was found the hard way over the course of four PRs (#270, #271, #272, #273) while debugging "added photos don't appear on detail or edit page."

The failure mode is the same in every case: **no user-visible error**. A mutation fails RLS, a storage upload is rejected, a race drops a blob, or an inserted row never gets mirrored to the local cache — and the UI just shows nothing. Each invariant looks like a different bug but they all stem from the same class of misunderstanding: the knowledge of how the sync engine, the storage bucket policy, the table-level RLS, the `auto_populate_org_property` trigger, and the JS event loop interact is not co-located anywhere.

The four invariants, in the order they break things:

1. **Storage path must start with an org_id.** Migration 026 (`vault_public_insert` policy) restricts inserts to paths whose first folder is an org_id the caller has active membership in. Uploading to `${item_id}/...` (our original code) fails every time, silently.

2. **Scope columns must be passed explicitly.** The `auto_populate_org_property` trigger (migration 009) fills `property_id` from `orgs.default_property_id` — the user's *default* property, not the item's. For any item on a non-default property, the inserted row lands on the wrong property, and the `photos_insert` RLS check runs against the wrong property and rejects.

3. **`triggerSync` must be a macrotask, not a microtask.** The offline provider wrappers trigger sync inside a `.then()` on the mutation's resolution promise. Callers that follow the pattern "await `updateItem()` → attach follow-up blobs/mutations" see the sync start *before* their follow-up awaits run, because `.then()` callbacks are microtasks. `processOutboundQueue` then picks up the mutation with zero blobs attached, uploads nothing, and `removePhotoBlobsByMutation` deletes any blob that arrived during the race.

4. **Inserted rows must be mirrored into IndexedDB.** `DetailPanel` reads from `offlineStore.getPhotos()` which queries IndexedDB, not Supabase. A successful server insert doesn't automatically reach the local cache; inbound `syncPropertyData` only re-runs on `propertyId` / `isOnline` change, which route navigation doesn't trigger. The new row sits on the server but the panel shows nothing until the 5-minute poll tick or a hard refresh.

A fifth, related invariant covered by ADR-0002 and PR #268 — delta sync can't see hard deletes and needs explicit ID reconciliation — completes the picture for the inbound side.

## Decision

Codify these four invariants as contract for any outbound mutation involving scoped + storage-backed resources. Specifically, the photo upload branch of `executeMutation` must:

1. Upload to `${mutation.org_id}/${item_id}/${timestamp}_${filename}` — first segment is the org the mutation is scoped to, matching the pattern used by `src/lib/vault/actions.ts:42`.

2. Pass `org_id` and `property_id` from the mutation record (not the trigger) into every `photos.insert(...)` payload. The trigger stays in place as defense-in-depth, but code must not depend on it.

3. Use `.select().single()` on the insert and `db.photos.put({...insertedPhoto, _synced_at: now})` to mirror the returned row into IndexedDB, so downstream readers see the new row without waiting for an inbound sync tick.

4. Any provider wrapper that enqueues a mutation and triggers sync in a `.then()` callback must schedule the trigger via `setTimeout(triggerSync, 0)` — macrotask, not microtask. This lets caller-side follow-up awaits (blob storage, related mutations) complete before `processOutboundQueue` inspects the queue.

All four changes are now on `main` via PRs #270–#273 and this ADR captures the reasoning so the next person to add a photo-or-equivalent pipeline doesn't repeat the investigation.

## Alternatives Considered

- **Move all photo uploads to `uploadToVault`.** The vault pipeline already satisfies invariants 1 and 2 correctly. The cost is schema change (add `vault_item_id` to `photos`), re-plumbing the outbound sync to call a server action instead of using the Supabase client directly, and reconciling the two-stage vault write (private → public) with offline retry semantics. Worth doing eventually, tracked as issue #269; keeping the `photos`/`vault_items` split for now avoids blocking the bug fix on a larger refactor.

- **Client-side pre-flight for path + scope.** Run a dry-run against a hypothetical `check_storage_upload(path)` RPC before enqueueing the mutation. Catches invariant 1 at enqueue time, but doesn't help with the other three and doubles the round-trip count per upload. Rejected.

- **Return photo uploads as a separate mutation kind.** Introduce an explicit `operation: 'photo_upload'` record type instead of attaching blobs to another mutation via `mutation_id`. Cleaner data model and avoids the macrotask race entirely. More churn (schema + mutation-type enum + all callers), and doesn't retroactively unblock the current bug. Good follow-up work if/when we revisit invariant 3.

- **Server-side move-to-correct-path.** Keep uploading to `${item_id}/...` and let a server-side post-processor move the file. Impossible under RLS — the upload never succeeds in the first place. Ruled out.

## Decision Drivers

- **Failure mode is silent.** The RLS / trigger / race / cache-miss bugs all surface as "UI shows nothing" with no error in console, no error in the Supabase dashboard logs, and no failed assertions in tests. The cost of rediscovery is high.
- **The four invariants must hold together.** Each individual fix looks complete; only all four in combination actually deliver a working upload. The ADR's job is to make that co-dependence explicit.
- **Any future form adding photos to an item / update / entity will re-encounter these.** An update form already exists (`UpdateForm`), a public-contribute form exists (`PublicSubmissionForm`), and more surfaces are likely (audit logs, inspections). Documenting the invariants lets those authors read once and ship correctly.
- **ADR-0002 already covers the inbound half.** This ADR completes the story; together they describe the full offline sync contract.

## Consequences

**Positive:**
- Future offline-writable resources inherit a documented checklist; no more four-PR chase for photos-like features.
- The `scope_column` + `macrotask trigger` + `local mirror` patterns generalize beyond photos; they apply to any outbound mutation whose observer reads from the local cache.
- Makes the relationship between `vault-public` RLS, `auto_populate_org_property` trigger, and client code explicit. Each is individually reasonable; the combined behavior was what surprised us.

**Negative:**
- The `photos` table and vault system remain diverged. Issue #269 tracks unifying them; until then, two code paths upload images with different moderation postures (public-contribute is moderated, authenticated uploads are not).
- The macrotask trigger adds a small (sub-ms) delay between mutation enqueue and sync kick-off. Imperceptible in practice, measurable in benchmarks.
- Explicit `mutation.org_id` + `mutation.property_id` on the photos insert means the trigger is now redundant *for the happy path* but still acts as a safety net for direct SQL inserts. Not a real cost, but a subtle trap if someone removes the trigger thinking it's unused.

**Neutral:**
- `photos` table has a known silent rejection path (wrong-property-id insert under RLS) that's no longer reachable from the sync engine but would still fire for any new direct-client insert code. Linting / tests could enforce this but aren't added here.

## Related Files

- `src/lib/offline/sync-engine.ts` — outbound queue, photo branch
- `src/lib/offline/provider.tsx` — `triggerSync` scheduling
- `src/lib/vault/actions.ts` — parallel pipeline (moderated uploads)
- `supabase/migrations/026_data_vault.sql` — `vault-public` storage RLS
- `supabase/migrations/009_properties_and_permissions.sql` — `auto_populate_org_property` trigger, `photos_insert` policy
- `docs/adr/0002-offline-cache-drift-prevention.md` — inbound-side counterpart

## Related Issues / PRs

- #270 — pass `org_id`/`property_id` explicitly on photos insert
- #271 — mirror inserted photo into local cache
- #272 — defer `triggerSync` to macrotask
- #273 — storage path must start with `org_id`
- #268 — inbound deletion reconciliation (sibling issue on the inbound side)
- #269 — unify authenticated photo uploads with the vault moderation pipeline (open)

## Tags

`offline-sync`, `photos`, `rls`, `storage`, `mutation-queue`
