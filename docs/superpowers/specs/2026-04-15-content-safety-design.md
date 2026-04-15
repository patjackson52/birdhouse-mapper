# Content Safety & Abuse Prevention

**Date:** 2026-04-15
**Branch:** feat/image-safety
**Issue:** #221 — [Public Contributor] abuse prevention
**Status:** Design approved

---

## Problem

The app is adding public contributions — a "Submit a photo" button on the public map that allows unauthenticated visitors to upload photos and text. This opens the door to spam, offensive content (images and text), and abuse. Currently there is zero content moderation: all uploads go directly to public buckets with no validation beyond auth checks.

## Design Decisions

- **Server Action pipeline** over Edge Functions or async queues — matches existing codebase patterns, single deploy, simpler to build and debug. The 1-2s moderation latency is acceptable for a submission flow.
- **OpenAI omni-moderation** as the sole AI layer — it's free, handles both images and text, and is sufficient for the current scale. Heavier tools (PhotoDNA, Rekognition, Hive) are deferred to a future phase.
- **Existing `vault-private` as staging** — no new bucket needed. Pending items live in `vault-private` and move to `vault-public` on approval.
- **Existing anonymous auth for public contributors** — extends the current temp user system with a new `public_contributor` role rather than introducing a second auth pathway.
- **Moderation scoped to public contributors only** — existing org members are trusted. This keeps overhead at zero for normal workflows.

## Architecture

### Content Moderation Flow

```
Public contributor taps "Submit a photo" on map
        │
        ▼
Anonymous Supabase sign-in (existing system)
org_memberships row created with public_contributor role
        │
        ▼
Client submits photo + optional text
        │
        ▼
Server action: uploadToVault()
  1. Validate MIME type (allowlist: image/jpeg, image/png, image/webp, image/gif)
  2. Validate file size (existing 50 MiB limit)
  3. Check rate limit (10 uploads/hour per contributor)
  4. Check contributor not banned
  5. Upload to vault-private (staging)
  6. Call OpenAI omni-moderation (image)
  7. If text provided, call OpenAI omni-moderation (text)
  8. Decision:
     ├── AI flags content → reject, delete from staging, store reason
     ├── Org mode = "auto_approve" + AI passes → move to vault-public, status = approved
     └── Org mode = "manual_review" + AI passes → keep in staging, status = pending
  9. Return status to client
```

### Public Contributor Auth & Permissions

- Org enables "Allow public contributions" in admin settings
- "Submit a photo" button appears on public map view
- Tapping it triggers anonymous Supabase sign-in behind the scenes
- `org_memberships` row created with `public_contributor` role

**`public_contributor` permissions:**
- Can upload images (routed through staging + moderation)
- Can submit text with photos (also moderated)
- Can view status of own submissions
- Cannot view other users' content, admin pages, or manage anything
- Cannot delete or update — insert only

**Rate limiting:**
- 10 uploads per hour per anonymous session
- Enforced in server action, tracked via `last_upload_at` and `upload_count_this_hour` columns on `org_memberships`
- Prevents automated flooding without external infrastructure

**Banning:**
- Admins ban a `public_contributor` by setting `org_memberships.status = 'banned'`
- Server action checks status before accepting uploads
- Durable within browser session (tied to Supabase UID)

### Data Model Changes

**New columns on `vault_items`:**

| Column | Type | Default | Purpose |
|---|---|---|---|
| `moderation_status` | `TEXT CHECK (IN ('pending', 'approved', 'rejected', 'flagged_for_review'))` | `'pending'` | Track moderation state |
| `moderation_scores` | `JSONB` | `NULL` | Raw OpenAI category scores for audit |
| `rejection_reason` | `TEXT` | `NULL` | Category that triggered rejection |
| `moderated_at` | `TIMESTAMPTZ` | `NULL` | When moderation completed |

**New columns on `orgs`:**

| Column | Type | Default | Purpose |
|---|---|---|---|
| `allow_public_contributions` | `BOOLEAN` | `false` | Enable/disable public submissions |
| `moderation_mode` | `TEXT CHECK (IN ('auto_approve', 'manual_review'))` | `'manual_review'` | How AI-clean content is handled |

**New role:**
- `public_contributor` entry in `roles` table with minimal base permissions

**New table — `moderation_actions`:**

| Column | Type | Purpose |
|---|---|---|
| `id` | `UUID PRIMARY KEY` | |
| `org_id` | `UUID REFERENCES orgs(id)` | |
| `user_id` | `UUID REFERENCES auth.users(id)` | Contributor acted upon |
| `action` | `TEXT CHECK (IN ('warn', 'ban', 'takedown'))` | Action type |
| `reason` | `TEXT` | Admin-provided reason |
| `vault_item_id` | `UUID` | Associated content (nullable) |
| `acted_by` | `UUID REFERENCES auth.users(id)` | Admin who took action |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | |

**RLS changes:**
- `vault-public` INSERT: `public_contributor` can insert only through server action (staging path)
- `vault_items` SELECT: public contributors can only see their own rows
- `vault_items` public queries: only `approved` items visible to non-admin users

### Admin Experience

**Moderation Queue (`/admin/moderation`):**
- Lists `vault_items` with `moderation_status = 'pending'` or `'flagged_for_review'`
- Shows thumbnail, uploader info, AI moderation scores, submission time
- Per-item actions: Approve, Reject (with reason), Ban contributor
- Bulk actions: approve all, reject selected
- Filter by status, date, contributor type

**Content Takedown:**
- Admins see "Report/Remove" action on any approved content
- Removes from `vault-public`, sets status to `rejected`, logs to `moderation_actions`
- Option to ban contributor in same flow

**Contributor Management:**
- Public contributors appear as filterable group in existing members area
- View submission history, ban/unban
- Banned contributors see "you've been restricted" on upload attempt

**Org Settings:**
- "Allow public contributions" toggle (on/off)
- "Moderation mode" selector (auto-approve after AI check / always require admin review)

**Notifications:**
- Badge count on admin nav when items are pending review
- No email/push notifications in v1

### Text Moderation

- Shared `moderateText(text: string)` utility calling OpenAI omni-moderation
- Called from server actions that accept public contributor text
- Gated on user role — only `public_contributor` text is moderated
- When submitting photo + description, both are moderated; if either fails, the whole submission is rejected
- Scores stored together on the `vault_item`

### Error Handling

| Scenario | Behavior |
|---|---|
| OpenAI API unavailable | Save with `flagged_for_review`, stays in staging, lands in admin queue |
| Rejected content | "Your photo couldn't be posted because it doesn't meet our content guidelines" — no category detail |
| Duplicate submissions | Existing `upsert: false` prevents overwrites; rate limiting handles rapid repeats |
| Anonymous user cleanup | Extend existing `cleanup-temp-accounts` to remove inactive public contributors after 30 days |
| False positives (manual mode) | Admin sees AI scores and can override |
| False positives (auto mode) | Admin can review auto-approved content in moderation history and take down |

## Out of Scope (v1)

These can be layered on later without changing the core data model:

- PhotoDNA / CSAM hash matching
- Perceptual hash (pHash) dedup
- AWS Rekognition / Hive as escalation layers
- NCMEC reporting automation
- Video moderation
- Cloudflare WAF / IP-based rate limiting
- Formal appeal flow for rejected content
- Email/push notifications for admins

## Cost

OpenAI omni-moderation is free. The only cost is Supabase usage (already covered by existing plan). No new paid services required for v1.
