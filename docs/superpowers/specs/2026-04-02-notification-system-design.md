# Notification System Design

**Date:** 2026-04-02
**Status:** Approved

## Overview

A notification infrastructure for FieldMapper that any feature can tie into. Users receive notifications through multiple channels (in-app, email, SMS), configurable per user. The first use case is task/deadline reminders on items, processed by a periodic pg_cron job.

## Goals

- Generic notification pipeline that features can integrate with via a simple `notify()` call
- Multi-channel delivery: in-app, email, SMS
- Per-user, per-org channel preferences
- Provider-agnostic adapter pattern for email/SMS (concrete providers chosen later)
- First use case: configurable per-task deadline reminders
- Recipient resolution: assigned user + watchers + role-based

## Non-Goals (Future)

- Real-time push via Supabase Realtime (upgrade path from polling)
- Notification digests (daily summary emails)
- Rich preferences UI (quiet hours, per-property settings)
- Email templates with branding

---

## Data Model

### `tasks`

Core table for deadline/scheduled items, linked to items.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | default `gen_random_uuid()` |
| `org_id` | uuid FK → orgs | NOT NULL, tenant isolation |
| `property_id` | uuid FK → properties | nullable |
| `item_id` | uuid FK → items | nullable — the linked item |
| `title` | text | NOT NULL |
| `description` | text | nullable |
| `due_date` | timestamptz | NOT NULL |
| `status` | text | `pending`, `completed`, `cancelled` — default `pending` |
| `assigned_to` | uuid FK → users | nullable |
| `created_by` | uuid FK → users | NOT NULL |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` |

Indexes: `(org_id, status, due_date)` for the cron query.

RLS: scoped to org via `org_memberships`. Task permissions already stubbed in the roles system (`tasks.view_assigned`, `tasks.view_all`, `tasks.create`, `tasks.assign`, `tasks.complete`).

### `task_watchers`

Users or roles watching a task for notifications.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | default `gen_random_uuid()` |
| `task_id` | uuid FK → tasks | NOT NULL, ON DELETE CASCADE |
| `user_id` | uuid FK → users | nullable — direct user watcher |
| `role_id` | uuid FK → roles | nullable — all users with this role get notified |

Constraint: exactly one of `user_id` or `role_id` must be non-null (`CHECK`).

### `task_reminders`

Per-task configurable reminder schedule.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | default `gen_random_uuid()` |
| `task_id` | uuid FK → tasks | NOT NULL, ON DELETE CASCADE |
| `remind_before` | interval | NOT NULL, e.g., `'7 days'`, `'1 day'`, `'2 hours'` |
| `sent_at` | timestamptz | null until processed — prevents re-sends |

Unique constraint: `(task_id, remind_before)` — no duplicate intervals per task.

### `notifications`

Central notification table. Serves as both the in-app notification store and the delivery queue for all channels.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | default `gen_random_uuid()` |
| `org_id` | uuid FK → orgs | NOT NULL |
| `user_id` | uuid FK → users | NOT NULL — the recipient |
| `type` | text | NOT NULL — `task_reminder`, `task_assigned`, etc. |
| `title` | text | NOT NULL |
| `body` | text | nullable |
| `reference_type` | text | NOT NULL — `task`, `item`, etc. |
| `reference_id` | uuid | NOT NULL — the linked entity |
| `channel` | text | NOT NULL — `in_app`, `email`, `sms` |
| `status` | text | NOT NULL — `pending`, `sent`, `failed` — default `pending` |
| `error` | text | nullable — error message on failure |
| `read_at` | timestamptz | nullable — for in-app read tracking |
| `created_at` | timestamptz | default `now()` |

Indexes:
- `(user_id, channel, created_at DESC)` — in-app notification queries
- `(status, channel)` — dispatch route picking up pending external notifications
- `(user_id, channel, read_at)` — unread count

RLS: users can only read/update their own notifications within their orgs.

### `user_notification_preferences`

Per-user, per-org channel toggles.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | default `gen_random_uuid()` |
| `user_id` | uuid FK → users | NOT NULL |
| `org_id` | uuid FK → orgs | NOT NULL |
| `channel` | text | NOT NULL — `in_app`, `email`, `sms` |
| `notification_type` | text | NOT NULL — specific type or `*` for wildcard |
| `enabled` | boolean | NOT NULL, default `true` |

Unique constraint: `(user_id, org_id, channel, notification_type)`.

Defaults (when no row exists): in-app enabled, email enabled, SMS disabled.

RLS: users can only read/update their own preferences.

---

## pg_cron Job: `process_task_reminders()`

A plpgsql function scheduled via pg_cron every 15 minutes.

### Step 1 — Find due reminders

```sql
SELECT tr.id, tr.task_id, t.org_id, t.title, t.assigned_to
FROM task_reminders tr
JOIN tasks t ON t.id = tr.task_id
WHERE t.status = 'pending'
  AND t.due_date - tr.remind_before <= now()
  AND tr.sent_at IS NULL;
```

### Step 2 — Resolve recipients

For each task with a due reminder, collect the union of:

1. `tasks.assigned_to` (if set)
2. `task_watchers.user_id` (direct watchers)
3. All users holding `task_watchers.role_id` via `org_memberships` (role-based)

Deduplicate so no user receives the same reminder twice.

### Step 3 — Check preferences and create notifications

For each resolved recipient, check `user_notification_preferences`:
- If channel enabled for this notification type (or `*` wildcard), insert into `notifications` with `status = 'pending'`
- If no preference row exists, apply defaults: in-app enabled, email enabled, SMS disabled
- In-app notifications are inserted with `status = 'sent'` (no external delivery needed)

Mark `task_reminders.sent_at = now()`.

### Step 4 — Trigger external dispatch

Call the dispatch route via `pg_net`:

```sql
SELECT net.http_post(
  url := current_setting('app.base_url') || '/api/notifications/dispatch',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
    'Content-Type', 'application/json'
  ),
  body := '{}'::jsonb
);
```

This is async/fire-and-forget. If it fails, pending notifications are picked up on the next cycle.

### Schedule

```sql
SELECT cron.schedule(
  'process-task-reminders',
  '*/15 * * * *',
  $$SELECT process_task_reminders()$$
);
```

---

## Dispatch Route: `/api/notifications/dispatch`

Next.js API route secured with `CRON_SECRET` bearer token (same pattern as existing cron routes).

### Flow

1. Query `notifications` where `status = 'pending'` and `channel != 'in_app'`, limit 50
2. For each notification, look up user contact info:
   - Email: from `auth.users` (already available)
   - Phone: from `users` profile (new `phone` column needed)
3. Call the appropriate channel adapter
4. Update `status` to `sent` or `failed` (with error message)
5. Return JSON with processed/failed counts

### Idempotency

The route is safe to call multiple times. It only processes `status = 'pending'` rows, and updates status atomically. Multiple concurrent calls would race on the same rows, but a `FOR UPDATE SKIP LOCKED` pattern prevents double-sends.

### Batching

Limit 50 per invocation. If more pending notifications exist, the next cron tick (or a future self-invocation pattern) handles them. For early/moderate usage this is sufficient. At scale, the route can be moved to a Supabase Edge Function with no timeout constraints — the data model doesn't change.

---

## Provider Adapter Pattern

### Interface

```typescript
interface NotificationAdapter {
  channel: 'email' | 'sms';
  send(payload: {
    to: string;          // email address or phone number
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; error?: string }>;
}
```

### Registry

```typescript
const adapters: Record<string, NotificationAdapter> = {
  email: new ConsoleEmailAdapter(),  // logs to console in dev
  sms: new ConsoleSmsAdapter(),      // logs to console in dev
};
```

Swap in real providers by replacing the adapter instance. One file change per provider.

### Console Adapters

For development, console adapters log the notification payload to stdout. No external services needed to build and test the full pipeline.

---

## `notify()` Helper

Server-side utility for application code to create notifications.

```typescript
async function notify(params: {
  orgId: string;
  type: string;
  title: string;
  body?: string;
  referenceType: string;
  referenceId: string;
  recipients: {
    userIds?: string[];
    roleIds?: string[];
  };
}): Promise<void>
```

### Flow

1. Resolve `roleIds` → user IDs via `org_memberships`
2. Deduplicate all user IDs
3. For each user, check `user_notification_preferences` for enabled channels
4. Insert rows into `notifications` for each (user x enabled channel)
5. In-app notifications inserted with `status = 'sent'`
6. External channel notifications inserted with `status = 'pending'`
7. Fire-and-forget fetch to `/api/notifications/dispatch` for prompt delivery

### Usage by features

```typescript
// Task assigned
await notify({
  orgId,
  type: 'task_assigned',
  title: `You've been assigned: ${task.title}`,
  referenceType: 'task',
  referenceId: task.id,
  recipients: { userIds: [assigneeId] },
});

// Item comment (future)
await notify({
  orgId,
  type: 'item_comment',
  title: `New comment on ${item.name}`,
  referenceType: 'item',
  referenceId: item.id,
  recipients: { userIds: watcherIds, roleIds: [adminRoleId] },
});
```

---

## Notification Types Registry

```typescript
const NOTIFICATION_TYPES = {
  TASK_REMINDER: 'task_reminder',
  TASK_ASSIGNED: 'task_assigned',
  TASK_COMPLETED: 'task_completed',
} as const;
```

New features add entries here. The `user_notification_preferences` table uses these values for per-type toggles.

---

## In-App Notifications

### `useNotifications` Hook

- Queries `notifications` where `user_id = current_user`, `channel = 'in_app'`, ordered by `created_at DESC`
- Polls via React Query `refetchInterval` (60 seconds)
- Returns notifications list and unread count (`read_at IS NULL`)
- Exposes `markAsRead(id)` and `markAllAsRead()` mutations

### Bell Component

- Bell icon in the app header, next to existing user menu
- Badge with unread count
- Dropdown/popover with recent notifications
- Each notification links to its reference entity (task → task detail, item → item detail)
- "Mark all as read" action

---

## User Notification Preferences UI

Minimal settings page, accessible from user settings. Simple toggle grid:

| Notification Type | In-App | Email | SMS |
|---|---|---|---|
| Task reminders | toggle | toggle | toggle |
| Task assigned | toggle | toggle | toggle |
| All (`*` wildcard) | toggle | toggle | toggle |

- Per-org preferences (if user belongs to multiple orgs)
- SMS toggles disabled/greyed out until an SMS provider is configured
- Defaults applied when no preference row exists: in-app on, email on, SMS off

---

## Schema Changes Summary

New tables:
- `tasks`
- `task_watchers`
- `task_reminders`
- `notifications`
- `user_notification_preferences`

Modified tables:
- `users` — add `phone` column (text, nullable) for SMS delivery

New pg_cron job:
- `process_task_reminders` — every 15 minutes

New API routes:
- `POST /api/notifications/dispatch` — process pending external notifications

New components:
- Notification bell + dropdown
- Notification preferences page

New server utilities:
- `notify()` helper
- Notification adapter interface + console adapters
- Notification types registry

---

## Testing Strategy

### Database

- Migration tested via `supabase db reset`
- `process_task_reminders()` tested by inserting test tasks/reminders, calling the function directly, and asserting on `notifications` table
- RLS policies tested by querying as different user roles

### Application

- `notify()` helper: unit tests verifying correct notification insertion for various recipient combos (direct user, watcher, role-based)
- Dispatch route: unit tests with console adapters verifying status transitions
- Preference resolution: tests for enabled/disabled channels, defaults, wildcard

### E2E

- Playwright: create a task with a reminder, trigger processing, verify notification appears in bell dropdown

---

## Rollout Phases

### Phase 1 — Foundation (this spec)

- Tasks, reminders, watchers tables
- Notifications table + in-app delivery
- pg_cron job for reminder processing
- `notify()` helper for feature integration
- Console adapters for email/SMS
- Bell component + preferences UI (basic)
- Dispatch route

### Phase 2 — Real Providers (future)

- Email provider integration (Resend, Postmark, etc.)
- Phone number field on user profile
- SMS provider integration (Twilio, etc.)
- Email templates with org branding

### Phase 3 — Enhancements (future)

- Supabase Realtime for instant in-app push
- Notification digests (daily summary email)
- Richer preferences UI (quiet hours, per-property settings)
- Additional notification types as features ship
