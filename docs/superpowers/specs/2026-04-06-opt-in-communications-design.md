# Opt-In Communications System

**Issue:** #218 — [public contributors] allow opt-in communication
**Date:** 2026-04-06
**Status:** Approved

## Summary

Public visitors to property sites can opt in to receive communications (email + in-app) about topics defined by the org and property. Opting in creates a full authenticated account via magic link or Google OAuth. Logged-in users see a notification bell with unread count and an avatar in the property site header. Org admins manage topics and send notifications through admin settings.

## Goals

- Allow public visitors to subscribe to org/property communications with minimal friction
- Give orgs full control over what topics are available and per which properties
- Support both email and in-app notification channels with per-topic user preferences
- Make logged-in users visible in the property site header (avatar + notification bell)
- Optimize for mobile UX throughout

## Non-Goals

- Scheduled/recurring sends (future enhancement)
- Push notifications (future enhancement)
- Per-org custom sending domains in Resend (future enhancement)
- Chat or direct messaging between users

## Data Model

### New Tables

#### `communication_topics`

Org/property-defined topics visitors can subscribe to.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default `gen_random_uuid()` |
| org_id | uuid FK → orgs | Always set |
| property_id | uuid FK → properties | Nullable — null means org-wide topic |
| name | text NOT NULL | e.g., "Volunteering", "Wildlife Updates" |
| description | text | Short description shown at opt-in |
| is_active | boolean NOT NULL DEFAULT true | Org can enable/disable |
| sort_order | int NOT NULL DEFAULT 0 | Display ordering |
| created_at | timestamptz NOT NULL DEFAULT now() | |

**RLS:** Public read for active topics within the user's resolved org/property context. Write restricted to org admins.

#### `user_subscriptions`

Links authenticated users to topics with per-channel preferences.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default `gen_random_uuid()` |
| user_id | uuid FK → auth.users | |
| topic_id | uuid FK → communication_topics | |
| email_enabled | boolean NOT NULL DEFAULT true | |
| in_app_enabled | boolean NOT NULL DEFAULT true | |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| **UNIQUE** | (user_id, topic_id) | |

**RLS:** Users can read/write only their own rows.

#### `notifications`

In-app notification records delivered to users.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default `gen_random_uuid()` |
| user_id | uuid FK → auth.users | Recipient |
| org_id | uuid FK → orgs | Context |
| property_id | uuid FK → properties | Nullable |
| topic_id | uuid FK → communication_topics | Nullable |
| title | text NOT NULL | |
| body | text NOT NULL | |
| link | text | Nullable — deep link on click |
| is_read | boolean NOT NULL DEFAULT false | |
| created_at | timestamptz NOT NULL DEFAULT now() | |

**RLS:** Users can read/update (mark read) only their own rows. Org admins can insert for users within their org.

#### `notification_sends`

Audit trail for notification delivery across channels.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default `gen_random_uuid()` |
| notification_id | uuid FK → notifications | Nullable — set for in-app sends, null for email-only |
| user_id | uuid FK → auth.users | |
| topic_id | uuid FK → communication_topics | Which topic this send is for |
| channel | text NOT NULL | 'email' or 'in_app' |
| status | text NOT NULL DEFAULT 'pending' | 'pending', 'sent', 'failed' |
| sent_at | timestamptz | |
| error_message | text | Nullable — failure details |

**RLS:** Read-only for org admins within their org. System-write via service role.

### Changes to Existing Tables

#### `orgs`

| Column | Type | Notes |
|--------|------|-------|
| communications_enabled | boolean NOT NULL DEFAULT false | Master switch for communications |

#### `properties`

| Column | Type | Notes |
|--------|------|-------|
| communications_enabled | boolean NOT NULL DEFAULT true | Per-property override (only applies when org has it enabled) |

No changes to `org_memberships.notification_prefs` — that field remains unused and can be cleaned up in a future migration.

## Public Visitor Opt-In Flow

### Two Entry Points

**Entry A — Contextual "Stay Updated" prompt:**
- Bottom sheet on mobile, slide-in panel on desktop
- Triggered by engagement: visitor on page for 30 seconds OR scrolled past the fold (whichever first)
- Shows org-wide + property-specific active topics as checkboxes
- "Get Updates" CTA button
- Suppression via cookies:
  - `fm_prompt_dismissed` — set on dismiss, expires in 30 days
  - `fm_prompt_subscribed` — set after successful subscription
- Never shown to already-logged-in users
- Never shown when `communications_enabled` is false for the org or property

**Entry B — Puck "Subscribe" component:**
- New Puck component `SubscribeBlock` that orgs place on landing pages via the site builder
- Always visible where placed (not dismissable like the prompt)
- Shows same topic checkboxes + email input + Google OAuth button
- Puck editor props: heading text, description text, layout (compact/expanded)

### Authentication Flow

Both entry points lead to the same account creation flow:

1. Visitor selects topics of interest
2. Enters email address OR clicks "Continue with Google"
3. **Email path:** Magic link sent via Supabase Auth → user clicks link → account created → redirected back to property site as logged-in user with subscriptions saved
4. **Google path:** OAuth flow → account created → redirected back with subscriptions saved
5. Selected topic preferences stored in `user_subscriptions` as part of the post-auth callback
6. If user already has an account, they log in and subscriptions are added to their existing preferences

**Implementation detail:** Topic selections are stored in a URL parameter or session storage before the auth redirect, then processed in the auth callback handler.

## Logged-In Header Experience

### Header Bar Changes

When a user is authenticated, the property site header shows two new elements in the right section:

1. **Notification bell** — bell icon with a red badge showing unread notification count. Click navigates to `/account/notifications`.
2. **Avatar** — circular element showing user initials (from `display_name` or email). Click opens a dropdown menu with: Account, Notification Settings, Sign Out.

### Mobile Bottom Tab Bar

On mobile, the existing 3-tab bottom bar (Home, Map, List) expands to 5 tabs for logged-in users:
- Home, Map, List, **Alerts** (bell with badge), **Account** (avatar)

Anonymous visitors continue to see the existing 3-tab bar.

### Puck Component Updates

Both `HeaderBar` and `NavBar` Puck chrome components already have a `showAuthActions` prop that renders `AuthActions`. The `AuthActions` component needs to be extended to include the notification bell alongside the existing gear icon and avatar menu.

## Admin Experience

### Topic Management

New section in org admin settings: **Communication Topics**.

- List view of all topics with name, scope (org-wide / property name), active status, subscriber count
- Create/edit topic form: name, description, scope (org-wide or specific property), active toggle, sort order
- Delete topic (soft — deactivate, don't remove subscriber links)

### Send Notification

New page in org admin: **Send Notification**.

- Form fields: select topic(s) via checkboxes, title, body (plain text), optional deep link URL
- Recipient preview: "This will reach N subscribers via email and M via in-app"
- Channel selection: email only, in-app only, or both
- Send button with confirmation dialog
- Server action flow:
  1. Query `user_subscriptions` for selected topics, filtered by channel preferences
  2. Create `notifications` rows for users with `in_app_enabled`
  3. Call Resend API for users with `email_enabled`
  4. Create `notification_sends` rows for audit trail

### Safety

- Server action validates org admin role before sending
- Rate limit: max 1 send per topic per hour (prevents accidental double-sends)
- Recipient count preview before confirming

## User Notification Settings

Replace the current stub at `/account/notifications` with a full settings page.

- Topics grouped by org, then by property within each org
- Per-topic toggles: email on/off, in-app on/off
- "Unsubscribe from all" button with confirmation
- Link to this page from avatar dropdown menu

## Email Infrastructure

### Resend Setup

- Add `resend` npm package
- `RESEND_API_KEY` environment variable
- Utility module at `src/lib/email/resend.ts` — thin wrapper around Resend client with error handling

### React Email Templates

Located in `src/lib/email/templates/`:

- `NotificationEmail.tsx` — org logo (from org settings), notification title, body text, CTA button (if deep link provided), unsubscribe link in footer
- Styled with org's primary color from theme settings
- Mobile-responsive layout

### Unsubscribe Handling

- Each email includes a unique unsubscribe token in the footer
- `List-Unsubscribe` and `List-Unsubscribe-Post` headers set for native email client unsubscribe
- Unsubscribe link hits a server action that:
  - Token-only (no login required): toggles `email_enabled = false` for that topic
  - "Unsubscribe from all" variant: toggles all email subscriptions off
- Unsubscribe tokens stored as signed JWTs containing user_id + topic_id (no extra DB table needed)

## Contextual Prompt Behavior

### Component

Client component `<SubscribePrompt />` rendered in the property site layout (below `Navigation`).

### Trigger Conditions

Both configurable per org/property in the future, with sensible defaults for MVP:

- **Time-based:** visitor on page for 30 seconds
- **Scroll-based:** visitor scrolled past the first viewport fold
- Whichever condition fires first shows the prompt

### Suppression

- `fm_prompt_dismissed` cookie: set on dismiss, 30-day expiry, prevents re-showing
- `fm_prompt_subscribed` cookie: set on successful subscription, prevents re-showing
- Not shown to authenticated users (checked via Supabase client auth state)
- Not shown when org or property has `communications_enabled = false`

### Animation

- Mobile: bottom sheet slides up from bottom edge, with drag handle for dismiss
- Desktop: slides in from bottom-right corner
- Dismiss via X button, clicking outside, or swiping down (mobile)

## File Structure

```
src/
  lib/
    email/
      resend.ts                    # Resend client wrapper
      templates/
        NotificationEmail.tsx      # React Email template
    communications/
      actions.ts                   # Server actions: subscribe, unsubscribe, send, manage topics
      queries.ts                   # Query helpers: get topics, get subscriptions, get unread count
      types.ts                     # TypeScript types for communications domain
  components/
    communications/
      SubscribePrompt.tsx          # Contextual opt-in bottom sheet / slide-in
      SubscribeForm.tsx            # Shared form (topics + auth) used by prompt and Puck block
      NotificationBell.tsx         # Bell icon with unread badge
  lib/puck/
    components/
      content/
        SubscribeBlock.tsx         # Puck site builder subscribe component
  app/
    account/
      notifications/
        page.tsx                   # User notification settings (replace stub)
    org/
      [slug]/
        settings/
          communications/
            page.tsx               # Topic management
        notifications/
          page.tsx                 # Send notification form
supabase/
  migrations/
    0XX_communications.sql         # New tables, RLS policies, org/property column additions
```

## Testing Strategy

- **Unit tests:** Server actions for subscribe/unsubscribe/send, topic CRUD validation, unsubscribe token generation/verification
- **Component tests:** SubscribePrompt trigger/suppression logic, NotificationBell badge rendering, SubscribeForm validation
- **E2E tests:** Full opt-in flow (topic selection → auth → subscription created), admin send flow, unsubscribe via email link
