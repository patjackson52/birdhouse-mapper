# Photo Upload Moderation — Implementation Plan

**Issue:** #269
**Spec:** `docs/superpowers/specs/2026-05-07-photo-upload-moderation-design.md`
**Branch:** `fix/269-photo-upload-moderation`

## Step 1 — Add `moderatePhotoUpload` server action

Create `src/lib/moderation/actions.ts`:

```ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { moderateImage } from './moderate';

export type ModeratePhotoResult =
  | { ok: true; flagged: false }
  | { ok: true; flagged: true; reason: string }
  | { ok: false; error: string };

export async function moderatePhotoUpload(
  base64: string,
  mimeType: string,
): Promise<ModeratePhotoResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  if (!base64 || base64.length === 0) {
    return { ok: false, error: 'Empty image payload' };
  }
  // Defensive cap: 12 MB base64 ~ 9 MB binary. Larger than any expected photo.
  if (base64.length > 12 * 1024 * 1024) {
    return { ok: false, error: 'Image too large for moderation' };
  }

  try {
    const result = await moderateImage(base64, mimeType || 'image/jpeg');
    if (result.flagged) {
      return { ok: true, flagged: true, reason: "Image didn't meet content guidelines" };
    }
    return { ok: true, flagged: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Moderation API error';
    return { ok: false, error: message };
  }
}
```

## Step 2 — Add blob→base64 helper to `photo-store.ts`

Append:

```ts
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  // Browser: use btoa with a Uint8Array → string conversion to avoid
  // FileReader async overhead. Chunked to avoid call-stack limits on large blobs.
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
```

(Verify availability of `btoa` in the test environment — fake-indexeddb runs in jsdom which provides it. If not, fall back to `Buffer.from(buffer).toString('base64')` guarded by typeof.)

## Step 3 — Extend `SyncResult` and add error sentinel

`src/lib/offline/types.ts`: not the right home for `SyncResult` — it lives inside `sync-engine.ts`. Add a `rejected: number` field there.

`src/lib/offline/sync-engine.ts`:

```ts
class ContentRejectedError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'ContentRejectedError';
  }
}
```

## Step 4 — Wire moderation into `executeMutation`

**Two-pass pattern:** moderate ALL photo blobs in the mutation first, before uploading any. Prevents partial uploads when some photos in a multi-photo mutation are flagged.

Before the existing `for (const photoBlob of photoBlobs)` loop, add a pre-moderation pass:

```ts
// Pre-moderate all photo blobs. Done before any upload so a flagged
// photo in position N doesn't leave photos 0..N-1 published.
for (const photoBlob of photoBlobs) {
  const base64 = await blobToBase64(photoBlob.blob);
  const mimeType = photoBlob.blob.type || 'image/jpeg';
  const modResult = await moderatePhotoUpload(base64, mimeType);

  if (!modResult.ok) {
    // Transient — retryable error path
    return `Moderation check failed: ${modResult.error}`;
  }
  if (modResult.flagged) {
    throw new ContentRejectedError(modResult.reason);
  }
}
```

Then the existing upload + insert loop runs unchanged.

## Step 5 — Catch rejection in `processOutboundQueue`

Update the outer try/catch:

```ts
try {
  const error = await executeMutation(db, supabase, mutation);
  if (error) {
    await markFailed(db, mutation.id, error);
    result.failed++;
  } else {
    await markCompleted(db, mutation.id);
    await removePhotoBlobsByMutation(db, mutation.id);
    await removeMutation(db, mutation.id);
    result.processed++;
  }
} catch (err) {
  if (err instanceof ContentRejectedError) {
    // Terminal — drop mutation and blob, do not retry
    await removePhotoBlobsByMutation(db, mutation.id);
    await removeMutation(db, mutation.id);
    result.rejected++;
    continue;
  }
  const message = err instanceof Error ? err.message : 'Unknown error';
  await markFailed(db, mutation.id, message);
  result.failed++;
}
```

Update `SyncResult` to include `rejected: number`. Initialize in `processOutboundQueue`.

## Step 6 — Tests

`src/lib/offline/__tests__/sync-engine.test.ts` — add three new test cases inside the existing `Sync Engine — Outbound` describe block:

1. **Approved photo upload completes normally.**
   - Mock `moderatePhotoUpload` (vi.mock) → `{ ok: true, flagged: false }`.
   - Enqueue mutation with photo blob.
   - Storage upload + photos.insert mocked to succeed.
   - Assert `result.processed === 1`, mutation removed, photo blob removed, photos.insert called once.

2. **Flagged photo is dropped — no upload, no insert.**
   - Mock `moderatePhotoUpload` → `{ ok: true, flagged: true, reason: '...' }`.
   - Enqueue mutation with photo blob.
   - Assert `result.rejected === 1`, mutation removed, photo blob removed, storage.upload **NOT** called, photos.insert **NOT** called.

3. **Transient moderation error retries.**
   - Mock `moderatePhotoUpload` → `{ ok: false, error: 'API timeout' }`.
   - Enqueue mutation with photo blob.
   - Assert `result.failed === 1`, mutation still in queue, photo blob still in IDB, retry_count incremented.

Mock structure: `vi.mock('../../moderation/actions', () => ({ moderatePhotoUpload: vi.fn() }))` at top of file, then in each test set the impl.

## Step 7 — ADR-0011

Create `docs/adr/0011-offline-photo-upload-moderation.md` documenting:
- Status: Accepted
- Context: ADR-0001 mandates moderation; offline sync engine bypassed it
- Decision: inline moderation via server-action wrapper, fail-closed, terminal-on-flag
- Why not Option 1 (full pipeline unification): scope/migration size
- Consequences: latency hit per upload (~500ms-2s), OpenAI API spend now scales with authenticated upload volume

Use `scripts/new-adr.sh` if available; otherwise write directly.

## Step 8 — Verify

```sh
npm run type-check
npm run test -- src/lib/offline/__tests__/sync-engine.test.ts
npm run test
```

Smoke E2E (`npm run test:e2e:smoke`) optional but nice if quick.

## Step 9 — Commit & PR

```sh
git add -A
git commit -m "fix(offline): moderate photo uploads in sync engine (closes #269)"
git push -u origin fix/269-photo-upload-moderation
```

Open PR into `main` with body summarizing the gap, the fix, the ADR.

## Risk register

- **Latency:** moderation adds ~500ms-2s per photo upload. Acceptable on the offline-flush path (background, batched).
- **API spend:** OpenAI omni-moderation is free per ADR-0001. No cost surprise.
- **Photo too big for OpenAI:** API has a documented size limit (~20 MB). Defensive cap above set to ~9 MB binary.
- **Transient failure cascade:** if OpenAI is down, all queued photo mutations retry-fail; eventually mark failed at MAX_RETRIES. User can re-add the photo when API is up. Not silent — `result.failed` increments visibly.
- **Test hygiene:** `vi.mock('../../moderation/actions')` must be hoisted; ensure the module path resolves.
- **Server-action call from sync engine:** sync engine runs in browser; server actions are imported as functions but invoked via Next.js's RPC mechanism. Verify the import path resolves and the call works in jsdom (mocked) and in real browser.
