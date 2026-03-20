# Temporary Accounts & Invite System

**Date:** 2026-03-20
**Status:** Draft

## Problem

Admins currently must create user accounts manually through the Supabase Dashboard. There is no way to quickly onboard field volunteers or event participants. This friction prevents casual, one-time contributors from participating — especially in field scenarios where an admin needs to get a group of people contributing from their phones in minutes.

## Target Users

- **Field volunteers** — Helping with a birdhouse survey day, need to log observations for a few hours
- **Event participants** — School groups, scout troops, community events where many people need brief access

## Solution Overview

An invite system where admins generate short-lived invite links (shareable via QR code or copied URL). Volunteers claim an invite to get temporary editor access that expires at end-of-day. Admins can optionally allow conversion of a temp account to a permanent one.

**Architecture:** Supabase Anonymous Auth + invite tokens stored in a new `invites` table. Temp users are real Supabase anonymous auth users, meaning existing RLS policies work without modification.

## Data Model

### New Table: `invites`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `token` | text (unique, not null) | SHA-256 hash of the raw invite token |
| `created_by` | uuid (FK → profiles.id) | Admin who created the invite |
| `display_name` | text (nullable) | Optional pre-filled name for the invitee |
| `role` | text (default 'editor') | Role granted to the temp user |
| `convertible` | boolean (default false) | Whether the temp account can be converted to permanent |
| `session_expires_at` | timestamptz (not null) | When the temp user's access ends |
| `expires_at` | timestamptz (not null) | When the invite link itself expires (created_at + 15 min) |
| `claimed_by` | uuid (FK → profiles.id, nullable) | Set when someone claims the invite |
| `claimed_at` | timestamptz (nullable) | When the invite was claimed |
| `created_at` | timestamptz (default now()) | When the invite was created |

### Modified Table: `profiles`

Three new columns:

| Column | Type | Description |
|--------|------|-------------|
| `is_temporary` | boolean (default false) | Whether this is a temp/guest account |
| `session_expires_at` | timestamptz (nullable) | When the temp user's access ends |
| `invite_id` | uuid (FK → invites.id, nullable) | Which invite created this profile |

### RLS Policies for `invites`

- **Select:** Admin only
- **Insert:** Admin only
- **Update:** Admin only (claim action uses service role server action)
- **Delete:** Admin only

## Invite Creation Flow (Admin Side)

### UI: `/admin/invites`

New page in the admin panel with:

1. **Invite list table** — Shows all invites with columns: Name, Status (Active/Pending/Expired), Convertible, Created. Active = claimed and session not expired. Pending = unclaimed and link not expired. Expired = link expired or session expired.

2. **Create invite dialog** — Triggered by "+ Create Invite" button:
   - **Display Name** (optional text input) — Leave blank to let the user enter their name on arrival
   - **Session Expires** (time picker, defaults to 23:59 today) — Sets end-of-day expiry
   - **Allow conversion to permanent account** (checkbox, default unchecked)
   - "Generate Invite" button

3. **Share screen** — After creation:
   - Large QR code (generated client-side via `qrcode.react`)
   - Copyable invite URL below
   - Live countdown showing time remaining until link expires (15 min)

### Token Generation

- 32 bytes via `crypto.randomBytes(32).toString('base64url')`
- Raw token appears only in the URL — stored as SHA-256 hash in the database
- Lookup: hash incoming token, compare against stored hash

## Invite Claim Flow (Temp User Side)

### Route: `/invite/[token]`

**Step 1: Landing page**

Server action validates the token:
- Hash the URL token, look up in `invites` table
- Check: not expired (`expires_at > now()`), not already claimed (`claimed_by IS NULL`)
- If invalid: show error page (expired or already claimed)

If valid, render landing page:
- Site name and branding
- Access expiry information ("Your access expires: Today at 11:59 PM")
- If admin pre-filled name: greeting ("Welcome, Sarah!") with no name input
- If no pre-filled name: text input for the user to enter their name
- "Get Started" button

**Step 2: Claim action**

On "Get Started" click, server action:
1. Re-validate the token (prevent race conditions)
2. Call `supabase.auth.signInAnonymously()`
3. Create profile row: `is_temporary = true`, `session_expires_at` from invite, `role = 'editor'`, `display_name` from form or invite, `invite_id` set
4. Update invite: set `claimed_by` and `claimed_at`
5. Redirect to `/manage`

**Error states:**
- **Expired invite:** "This invite link is no longer valid. Ask your organizer for a new one."
- **Already claimed:** "This invite has already been claimed. Ask your organizer for a new one."

## Session Management & Middleware

### Middleware Changes (`src/lib/supabase/middleware.ts`)

For every protected route, after existing auth checks:

1. Query profile for `is_temporary` and `session_expires_at`
2. If `is_temporary = true` and `session_expires_at < now()`: call `supabase.auth.signOut()`, redirect to `/session-expired`
3. If active: pass through normally (temp users have same access as editors)

### Guest Badge in Navigation

Existing layout components check `is_temporary` on the user's profile:
- If temp: show amber "Guest — expires [time]" badge in the nav bar
- When < 30 minutes remain: badge turns red
- Dismissible info banner on first visit: "You're contributing as a guest. Your access expires today at [time]. All your contributions will be saved."

### `/session-expired` Page (New)

- Message: "Your guest session has ended. Thanks for contributing!"
- If invite was `convertible`: "Your admin may convert your account to permanent. Check back with them."
- Link to public map view

## Account Conversion (Admin Side)

In `/admin/invites`, active temp users whose invite is marked `convertible` show a "Convert to Permanent" button.

### Conversion Dialog

- Shows the temp user's display name
- Admin enters email and password for the new permanent account (same pattern as setup wizard admin creation)
- Confirm button

### Conversion Action

1. Call `supabase.auth.admin.updateUser(userId, { email, password })` — converts anonymous user to full user
2. Update profile: `is_temporary = false`, `session_expires_at = null`, role stays `editor`
3. User's existing session stays valid — no disruption
4. All prior contributions stay attributed (same user ID throughout)

### Non-Conversion Path

- Session expires at end of day, user loses access
- Data stays in the system attributed to their display name
- Anonymous auth user cleaned up by cron
- Profile row remains as historical record

## Cleanup

### Cron Job (Supabase Edge Function or pg_cron, runs hourly)

1. Delete unclaimed invites where `expires_at < now()`
2. Find profiles where `is_temporary = true AND session_expires_at < now()` and not pending conversion
3. Call `auth.admin.deleteUser(id)` for those anonymous auth users
4. Set `deleted_at` timestamp on the profile row (keep for attribution history)

## Security

### Token Security
- 32-byte cryptographically random tokens (base64url encoded)
- Stored hashed (SHA-256) — raw token only exists in the URL
- 15-minute expiry window — scan-it-now model
- Single-use — once claimed, cannot be reused

### Rate Limiting
- Invite creation: max 20 active (unclaimed, unexpired) invites per admin
- Claim endpoint: standard rate limiting on server action

### RLS
- Anonymous Supabase users are `authenticated` role — existing RLS policies work as-is
- No RLS changes needed for temp users to read/write items, updates, photos
- `invites` table restricted to admin access; claim uses service role

### Session Security
- Anonymous auth sessions use standard Supabase JWT + httpOnly cookies
- Middleware enforces expiry on every request — no stale sessions
- Sign-out is server-side — user cannot extend their own session

## New Files & Modified Files

### New Files
- `supabase/migrations/004_invites_and_temp_accounts.sql` — New table, profile columns, RLS policies, indexes
- `src/app/invite/[token]/page.tsx` — Invite claim landing page
- `src/app/invite/[token]/actions.ts` — Claim server actions
- `src/app/session-expired/page.tsx` — Session expired page
- `src/app/admin/invites/page.tsx` — Admin invite management page
- `src/app/admin/invites/actions.ts` — Admin invite server actions (create, convert, revoke)
- `src/components/manage/GuestBadge.tsx` — Guest status badge component
- `supabase/functions/cleanup-temp-accounts/index.ts` — Cleanup Edge Function

### Modified Files
- `src/lib/types.ts` — Add `Invite` interface, update `Profile` interface
- `src/lib/supabase/middleware.ts` — Add temp user expiry checks
- `src/app/manage/layout.tsx` — Add guest badge to nav
- `src/middleware.ts` — Add `/invite` and `/session-expired` to public routes
