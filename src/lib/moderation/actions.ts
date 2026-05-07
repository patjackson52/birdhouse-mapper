'use server';

import { createClient } from '@/lib/supabase/server';
import { moderateImage } from './moderate';

/**
 * Result of an image moderation request.
 *
 * Discriminated by `ok`:
 *  - `{ ok: true, flagged: false }` → image is safe; caller may upload
 *  - `{ ok: true, flagged: true }`  → image rejected; caller must NOT upload
 *  - `{ ok: false, error: string }` → transient failure; caller may retry
 *
 * The third variant is fail-closed (caller does not upload) per ADR-0001.
 */
export type ModeratePhotoResult =
  | { ok: true; flagged: false }
  | { ok: true; flagged: true; reason: string }
  | { ok: false; error: string };

const MAX_BASE64_BYTES = 12 * 1024 * 1024; // ~9 MB binary; defensive cap

/**
 * Server-action wrapper around `moderateImage` for use by browser callers
 * (notably the offline outbound sync engine, which has no access to the
 * OPENAI_API_KEY directly).
 *
 * Always require an authenticated user; rejects anonymous calls. The image
 * is sent to OpenAI omni-moderation; results map to the discriminated union
 * above. Transient failures (API outage, network) come back as
 * `{ ok: false, error }` — caller is expected to fail-closed (do not upload)
 * and retry later.
 */
export async function moderatePhotoUpload(
  base64: string,
  mimeType: string,
): Promise<ModeratePhotoResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  if (!base64 || base64.length === 0) {
    return { ok: false, error: 'Empty image payload' };
  }
  if (base64.length > MAX_BASE64_BYTES) {
    return { ok: false, error: 'Image too large for moderation' };
  }

  try {
    const result = await moderateImage(base64, mimeType || 'image/jpeg');
    if (result.flagged) {
      return {
        ok: true,
        flagged: true,
        reason: "Image didn't meet content guidelines",
      };
    }
    return { ok: true, flagged: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Moderation API error';
    return { ok: false, error: message };
  }
}
