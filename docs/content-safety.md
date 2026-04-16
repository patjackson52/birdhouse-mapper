# Content Safety & Public Contributions

## Overview

FieldMapper supports public photo contributions — anyone can submit photos to the map without creating an account. To prevent abuse, all public submissions pass through a content moderation pipeline before becoming visible.

The system uses OpenAI's free omni-moderation API to automatically screen images and text for harmful content (NSFW, violence, hate speech, etc.), combined with admin review tools and contributor management.

## How It Works

### For Organizations

Organizations control public contributions through two settings in **Admin > Org Settings > Public Contributions**:

1. **Allow public contributions** (on/off) — When enabled, a "Submit a Photo" button appears on the public map.
2. **Moderation mode** — Controls what happens after the AI check passes:
   - **Always require admin approval** (default) — All submissions queue for admin review regardless of AI result.
   - **Auto-approve after AI safety check** — Clean submissions publish immediately; only flagged content queues for review.

### For Public Contributors

1. Visitor taps "Submit a Photo" on the map
2. An anonymous Supabase account is created behind the scenes
3. They select a photo (JPEG, PNG, WebP, or GIF, max 10 MB) and optionally add a description
4. The submission is checked by the moderation pipeline
5. They see either a success message ("submitted for review" or "published") or a rejection message

Contributors are rate-limited to **10 uploads per hour**. Banned contributors see a "restricted" message.

### Moderation Pipeline

Every public submission follows this path:

```
Photo + text submitted
        |
        v
1. MIME type validation (image/jpeg, image/png, image/webp, image/gif only)
2. Rate limit check (10/hour per contributor)
3. Ban check (membership status != 'banned')
4. Upload to vault-private (staging — never directly public)
5. OpenAI omni-moderation (image)
6. OpenAI omni-moderation (text, if description provided)
        |
        +-- Flagged by AI --> Delete from staging, reject submission
        +-- AI passes + manual_review mode --> Keep in staging, queue for admin
        +-- AI passes + auto_approve mode --> Move to vault-public, publish
        +-- AI unavailable --> Keep in staging, queue as "flagged for review"
```

Key principle: **nothing becomes public until it passes moderation**. On API failure, the system fails closed — content stays in staging for manual review.

### For Admins

**Moderation Queue** (`/admin/moderation`):
- Lists all pending and flagged-for-review submissions
- Shows thumbnail, file name, submission date, and AI confidence scores (color-coded)
- Actions: Approve (moves to public bucket), Reject (with reason), Ban contributor
- Pending count badge appears in the admin sidebar

**Content Takedown:**
- Reject removes the file from storage and logs the action to `moderation_actions`
- Ban sets the contributor's membership status to `banned`, preventing future uploads

## Developer Guide

### Key Files

| File | Purpose |
|---|---|
| `src/lib/moderation/moderate.ts` | OpenAI moderation API wrapper (`moderateImage`, `moderateText`) |
| `src/lib/moderation/types.ts` | `ModerationStatus`, `ModerationScores`, `ModerationResult` types |
| `src/lib/vault/actions.ts` | `uploadToVault()` — moderation pipeline triggered by `moderateAsPublicContribution` flag |
| `src/app/api/public-contribute/actions.ts` | `submitPublicContribution()` — orchestrates anonymous auth, rate limiting, text + image moderation |
| `src/app/admin/moderation/actions.ts` | Admin actions: `getPendingItems`, `approveItem`, `rejectItem`, `banContributor` |
| `src/app/admin/moderation/page.tsx` | Admin moderation queue UI |
| `src/app/admin/settings/actions.ts` | Org settings including `allow_public_contributions` and `moderation_mode` |
| `src/components/map/PublicContributeButton.tsx` | Floating "Submit a Photo" button on the map |
| `src/components/map/PublicSubmissionForm.tsx` | Photo upload modal form |
| `supabase/migrations/043_content_safety.sql` | Database schema for moderation |

### Database Schema

**New columns on `vault_items`:**
- `moderation_status` — `pending`, `approved`, `rejected`, or `flagged_for_review` (default: `approved` for existing items)
- `moderation_scores` — Raw OpenAI category scores (JSONB)
- `rejection_reason` — Why the item was rejected
- `moderated_at` — Timestamp of moderation decision

**New columns on `orgs`:**
- `allow_public_contributions` — Boolean (default: `false`)
- `moderation_mode` — `auto_approve` or `manual_review` (default: `manual_review`)

**New columns on `org_memberships`:**
- `upload_count_this_hour` / `last_upload_window_start` — Rate limiting

**New table: `moderation_actions`** — Audit log of admin actions (approve, reject, ban) with actor, target, reason, and timestamp.

**New role: `public_contributor`** — Added to `roles.base_role` CHECK constraint. Minimal permissions: insert to staging only.

### Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Yes (for moderation) | OpenAI API key. The moderation endpoint is free — no per-call cost. |

If the API key is missing, `moderateImage`/`moderateText` will throw, and the upload pipeline will catch the error and queue the submission as `flagged_for_review`.

### Storage Flow

Public contributions use a staging pattern:

1. **Upload** lands in `vault-private` bucket (private, not publicly accessible)
2. **On approval** (auto or manual), file is copied to `vault-public` and deleted from `vault-private`
3. **On rejection**, file is deleted from `vault-private`

The `vault_items` row tracks which bucket the file is in via `storage_bucket`.

### Adding New Moderation Layers

The moderation pipeline in `uploadToVault()` is designed to be extended. To add a new check (e.g., PhotoDNA, AWS Rekognition):

1. Create a new function in `src/lib/moderation/` that returns `ModerationResult`
2. Call it in the moderation block in `uploadToVault()` after the OpenAI check
3. The existing `flagged` / `scores` / `fail-closed` pattern applies to any new layer

See the design spec at `docs/superpowers/specs/2026-04-15-content-safety-design.md` for the full list of planned future layers (PhotoDNA, pHash dedup, Rekognition, Hive CSAM).

### Testing

All moderation logic has unit tests:
- `src/lib/moderation/__tests__/moderate.test.ts` — OpenAI API wrapper (6 tests)
- `src/lib/vault/__tests__/actions.test.ts` — Moderation pipeline in uploadToVault (4 tests)
- `src/app/admin/moderation/__tests__/actions.test.ts` — Admin actions (14 tests)
- `src/app/api/public-contribute/__tests__/actions.test.ts` — Public contribution flow (12 tests)

The OpenAI API is mocked in tests via `vi.stubGlobal('fetch', ...)`. No real API calls are made during testing.
