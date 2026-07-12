# Photo Upload Moderation — Design

**Date:** 2026-05-07
**Issue:** #269
**Status:** Draft

## Problem

Authenticated photo uploads from the offline mutation queue (`src/lib/offline/sync-engine.ts`) write directly to `vault-public` and insert rows in legacy `photos` table without any moderation. Only uploads that go through `uploadToVault({ moderateAsPublicContribution: true })` are moderated. Logged-in volunteers/contributors can therefore publish anything that passes the `attachments.upload` permission with zero safety screening, including images submitted from item edit forms and update forms.

This surface is the dominant photo upload path in the app — far higher volume than the public-contribution path that is moderated.

## Constraints / Invariants

- ADR-0001 mandates moderation via `moderateImage` from `src/lib/moderation/moderate.ts` using OpenAI omni-moderation, fail-closed semantics.
- Sync engine runs in the browser; `moderateImage` reads `process.env.OPENAI_API_KEY`. Direct call would expose the key. Must wrap moderation in a server action.
- ADR-0004 (offline outbound mutation invariants): mutations carry `org_id` + `property_id`; payload shape is fixed; must remain idempotent.
- Photo blobs may be large; converting to base64 on every retry is wasteful but acceptable (already happens once per upload in `vault/actions.ts`).
- Legacy `photos` table has no `moderation_status` / `moderation_scores` columns. Adding them is out of scope for this issue (would be a larger migration + admin UI work). For v1 we use a binary admit/reject decision and rely on the existing `vault_items` admin queue for the unified pipeline (issue's Option 1 — separate, larger work).

## Decision

Implement Option 2 from issue #269: **inline moderation in the sync engine photo-upload path, via a thin server-action wrapper**.

### Pipeline

1. Sync engine encounters a photo blob during outbound sync.
2. Sync engine reads `photoBlob.blob` → base64 (via `blob.arrayBuffer()` + `Buffer.from(...).toString('base64')` … in the browser, use `FileReader.readAsDataURL` and strip the prefix).
3. Sync engine calls a new server action `moderatePhotoUpload(base64, mimeType)` which:
   - Authenticates the user (rejects anonymous calls).
   - Calls `moderateImage(base64, mimeType)`.
   - Returns `{ flagged: false }` or `{ flagged: true, reason: string }` or `{ error: string }` for transient failures.
4. Sync engine reacts:
   - `flagged === true` → throw `ContentRejectedError`. processOutboundQueue catches it, **removes the mutation and the photo blob** (terminal — no retry), increments a new `result.rejected` counter, surfaces a user-visible toast on next render.
   - `error` (transient) → return error string; existing path marks mutation `failed` + retries up to `MAX_RETRIES`. Photo stays in IDB.
   - `flagged === false` → continue with existing upload + insert.

### Why a server action wrapper

`moderateImage` requires the OpenAI API key. Calling it directly from the browser would expose the key. A server action runs on the server, authenticates the caller, and proxies the moderation call. This matches the rest of the app's mutation architecture (server actions for anything that needs secrets or RLS bypass).

### Why fail-closed (not fail-open) on transient errors

ADR-0001 mandates fail-closed. For offline-queued photos, "fail-closed" means the upload doesn't go to `vault-public` until moderation succeeds. Mutation stays in queue and retries. After `MAX_RETRIES` (5) the mutation lands in failed state — same UX as any other upload that can't reach the server.

### Why drop (not retry) on flagged content

The same image will get the same flag every time. Retrying wastes API budget and never resolves. Drop the mutation, drop the photo blob, surface the rejection.

### Scope decisions

- **Authenticated users only.** Public contributions already go through `uploadToVault` and are moderated.
- **No `photos` schema changes.** Keeping the diff small. A `vault_item_id` FK + `moderation_status` columns on `photos` is the right long-term move (Option 1 in the issue) but is its own ADR + migration + admin UI.
- **No bulk-moderate-existing-rows backfill.** Out of scope. Issue is about preventing new bypass, not retroactively moderating history.
- **No per-org toggle (`allow_public_contributions`-style).** Authenticated photo upload is the dominant write path; making moderation opt-out would defeat the safety story. Per-org moderation policy granularity is a follow-up.

## Files affected

- `src/lib/offline/sync-engine.ts` — add moderation step before upload to `vault-public`; handle rejection vs transient error.
- `src/lib/offline/types.ts` — extend `SyncResult` with `rejected` count.
- `src/lib/moderation/actions.ts` (new) — `moderatePhotoUpload` server action.
- `src/lib/offline/photo-store.ts` — small helper to read blob → base64.
- `src/lib/offline/__tests__/sync-engine.test.ts` — three new test cases (approved, flagged, transient error).
- `docs/adr/0011-offline-photo-upload-moderation.md` (new) — record the decision.

## Acceptance criteria

- Every photo upload that lands in `vault-public` via the offline sync engine has been moderated by `moderateImage`.
- Flagged photos do not reach `vault-public`. Mutation and photo blob are removed; user sees a rejection.
- Transient moderation failures retry up to `MAX_RETRIES`; photo blob stays in IDB.
- `npm run type-check` clean. `npm run test` passes the new and existing sync-engine cases.
- ADR-0011 committed.
