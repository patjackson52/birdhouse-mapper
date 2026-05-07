# ADR-0011: Offline Photo Upload Moderation

**Status:** Accepted

**Date:** 2026-05-07

**Owners:** @patjackson52

## Context

ADR-0001 established that all uploads going to the public `vault-public` storage bucket must pass through OpenAI omni-moderation, fail-closed. The implementation in `src/lib/vault/actions.ts` runs moderation inline inside the `uploadToVault` server action whenever the caller passes `moderateAsPublicContribution: true`.

Issue #269 surfaced that the **offline outbound sync engine** (`src/lib/offline/sync-engine.ts`) writes photos to `vault-public` and inserts rows into the legacy `photos` table without ever invoking moderation. This is the dominant photo upload surface in the application — every `EditItemForm` save, every `AddUpdateForm` submission, and every photo attached via the public-contribute path that flows through the offline mutation queue lands here. Logged-in volunteers therefore had a guaranteed bypass around the moderation pipeline.

The two upload paths use different tables (`vault_items` for moderated uploads, `photos` for sync-engine uploads), so the existing admin moderation queue (`/admin/moderation`) had no visibility into sync-engine writes.

## Decision

Moderate photo uploads in the offline sync engine **inline**, before any storage write, via a new server-action wrapper `moderatePhotoUpload` (`src/lib/moderation/actions.ts`).

Key choices:

1. **Server-action wrapper around `moderateImage`.** The sync engine runs in the browser and cannot read `OPENAI_API_KEY`. A thin `'use server'` wrapper authenticates the caller and proxies the existing `moderateImage` helper. Same OpenAI omni-moderation, same fail-closed semantics as ADR-0001.

2. **Two-pass loop in `executeMutation`.** All photo blobs attached to a mutation are moderated *before* any of them are uploaded. A flagged photo at index N would otherwise leave photos 0..N-1 already published in `vault-public` — partial-upload of public content is not acceptable.

3. **Terminal drop on flagged content.** A flagged image is dropped from the queue along with its blob: the same image will be flagged on every retry, so retrying wastes API budget and never resolves. New `result.rejected` counter on `SyncResult` distinguishes this from transient `failed`.

4. **Retry on transient error.** A `{ ok: false, error }` result (API outage, network) marks the mutation `failed`, which retries up to `MAX_RETRIES` (5). Photo blob stays in IndexedDB until the retry succeeds, the mutation is rejected, or `MAX_RETRIES` is hit.

5. **No `photos` schema changes.** Adding `moderation_status`, `moderation_scores`, or a `vault_item_id` FK to the `photos` table is the right long-term direction (issue #269 Option 1) but requires a migration, admin-UI updates, and a backfill story. Out of scope for closing the bypass.

6. **Defensive size cap.** `moderatePhotoUpload` rejects payloads larger than ~9 MB binary (12 MB base64). OpenAI's documented limit is higher; the cap is a CPU/network defense against pathological inputs.

## Alternatives Considered

- **Option 1 — Unify on `vault_items`.** Route all photo uploads through `uploadToVault`, add `vault_item_id` FK to `photos`, delete the direct storage write in sync-engine. Cleanest long-term outcome, single moderation story. Deferred as a multi-day refactor with schema migration; closing the bypass should not wait on it.

- **Option 3 — Client-side pre-screen at submit time.** Run `moderateImage` in `EditItemForm` / `AddUpdateForm` before enqueuing. Faster failure UX online, but offline-queued photos would still need moderation at sync time, recreating the same code path; doubles the moderation surfaces without retiring either.

- **Separate moderation queue table.** Mutations succeed instantly; a background job moderates and removes flagged content after the fact. More moving parts, requires a takedown step that briefly publishes flagged content. Rejected — violates ADR-0001 fail-closed.

- **Fail-open on moderation API errors.** Lower latency, no queue stalls. Rejected — ADR-0001 mandates fail-closed.

## Decision Drivers

- **Closing the bypass is urgent** — `prio:high` security/safety gap. Smallest blast-radius fix wins.
- **Reuse, don't rebuild** — `moderateImage`, `moderation_actions`, the offline mutation queue all exist; this ADR composes them.
- **Maintain ADR-0001 invariants** — fail-closed, OpenAI omni-moderation, server-side key handling.
- **Don't expand schema** — schema-only changes belong in their own ADR / migration / playbook.

## Consequences

**Positive:**
- Every photo that reaches `vault-public` has passed moderation, regardless of which form submitted it.
- No silent failures: rejection counts surface in `SyncResult.rejected`; transient API problems show up in `SyncResult.failed` with a specific error message.
- Moderation lives behind one server action — easy to extend with additional providers later (PhotoDNA, Hive) without touching the sync engine.

**Negative:**
- ~500ms-2s of added latency per offline-queued photo upload. Acceptable on a background flush, would be visible if surfaced inline.
- OpenAI moderation is now invoked on every authenticated photo upload, not just public-contribution flows. Free tier per ADR-0001; budget unchanged.
- Each retry re-base64-encodes the blob and re-calls the API. With `MAX_RETRIES = 5` and the size cap, worst case is bounded; not optimized further.

**Neutral:**
- Legacy `photos` table still has no moderation columns. This ADR does not promise an admin moderation queue for sync-engine uploads — it only enforces the gate. Audit trail is the OpenAI side; admin retro-review is a follow-up.

## Related Files

- `src/lib/offline/sync-engine.ts` — moderation step in `executeMutation`, `ContentRejectedError`, extended `SyncResult`
- `src/lib/moderation/actions.ts` — new server-action wrapper
- `src/lib/moderation/moderate.ts` — unchanged; ADR-0001 implementation
- `src/lib/offline/photo-store.ts` — `blobToBase64` helper
- `src/lib/offline/__tests__/sync-engine.test.ts` — approved / flagged / transient cases
- `docs/adr/0001-content-moderation-architecture.md` — parent invariants
- `docs/adr/0004-offline-outbound-mutation-invariants.md` — sibling invariants on the same surface

## Related Issues / PRs

- #269 (closes)
- ADR-0001, ADR-0004, ADR-0006

## Tags

`moderation`, `security`, `offline`, `photos`, `sync-engine`
