# Notification System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic notification infrastructure with multi-channel delivery (in-app, email, SMS), starting with task deadline reminders processed by pg_cron.

**Architecture:** New database tables (tasks, task_watchers, task_reminders, notifications, user_notification_preferences) with RLS. A pg_cron function scans for due reminders, resolves recipients (assigned + watchers + roles), and inserts notifications. A dispatch API route processes pending external notifications via provider-agnostic adapters. A `notify()` server helper lets any feature create notifications. In-app delivery via React Query polling with a bell component.

**Tech Stack:** Supabase PostgreSQL (pg_cron, pg_net), Next.js 14 API routes, React Query, Tailwind CSS

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/027_notification_system.sql` | All new tables, RLS, indexes, triggers, pg_cron function + schedule |
| `src/lib/notifications/types.ts` | TypeScript types for notifications, tasks, preferences |
| `src/lib/notifications/constants.ts` | Notification type registry, channel defaults |
| `src/lib/notifications/adapters.ts` | Adapter interface + console adapters |
| `src/lib/notifications/notify.ts` | Server-side `notify()` helper |
| `src/lib/notifications/preferences.ts` | Preference resolution logic |
| `src/app/api/notifications/dispatch/route.ts` | Dispatch route for external channels |
| `src/components/notifications/NotificationBell.tsx` | Bell icon + dropdown |
| `src/components/notifications/NotificationItem.tsx` | Single notification row in dropdown |
| `src/app/admin/notifications/page.tsx` | Notification preferences page |
| `src/app/admin/notifications/actions.ts` | Server actions for preferences CRUD |
| `src/__tests__/notifications/notify.test.ts` | Tests for notify() helper |
| `src/__tests__/notifications/adapters.test.ts` | Tests for adapters |
| `src/__tests__/notifications/preferences.test.ts` | Tests for preference resolution |
| `src/__tests__/notifications/dispatch.test.ts` | Tests for dispatch route |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add Task, Notification, and preference types + union types |
| `src/components/layout/Navigation.tsx` | Add NotificationBell to desktop and mobile nav |

---

## Task 1: Database Migration — Tables and RLS

**Files:**
- Create: `supabase/migrations/027_notification_system.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- =============================================================
-- 027_notification_system.sql — Tasks, notifications, preferences
-- =============================================================

-- ---------------------------------------------------------------------------
-- 1. Extensions (pg_cron and pg_net for scheduled processing)
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 2. Tasks table
-- ---------------------------------------------------------------------------

create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  property_id uuid references properties(id) on delete set null,
  item_id uuid references items(id) on delete set null,
  title text not null,
  description text,
  due_date timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tasks_org_status_due on tasks(org_id, status, due_date);
create index idx_tasks_assigned on tasks(assigned_to) where assigned_to is not null;

alter table tasks enable row level security;

create policy tasks_select on tasks
  for select to authenticated
  using (org_id in (select unnest(user_active_org_ids())));

create policy tasks_insert on tasks
  for insert to authenticated
  with check (org_id in (select unnest(user_active_org_ids())));

create policy tasks_update on tasks
  for update to authenticated
  using (org_id in (select unnest(user_active_org_ids())));

create policy tasks_delete on tasks
  for delete to authenticated
  using (org_id in (select unnest(user_active_org_ids())));

-- Auto-update updated_at
create or replace function update_tasks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_tasks_updated_at
before update on tasks
for each row execute function update_tasks_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Task watchers
-- ---------------------------------------------------------------------------

create table task_watchers (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role_id uuid references roles(id) on delete cascade,
  constraint task_watchers_one_target check (
    (user_id is not null and role_id is null) or
    (user_id is null and role_id is not null)
  )
);

create index idx_task_watchers_task on task_watchers(task_id);

alter table task_watchers enable row level security;

create policy task_watchers_select on task_watchers
  for select to authenticated
  using (task_id in (select id from tasks where org_id in (select unnest(user_active_org_ids()))));

create policy task_watchers_insert on task_watchers
  for insert to authenticated
  with check (task_id in (select id from tasks where org_id in (select unnest(user_active_org_ids()))));

create policy task_watchers_delete on task_watchers
  for delete to authenticated
  using (task_id in (select id from tasks where org_id in (select unnest(user_active_org_ids()))));

-- ---------------------------------------------------------------------------
-- 4. Task reminders
-- ---------------------------------------------------------------------------

create table task_reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  remind_before interval not null,
  sent_at timestamptz,
  constraint task_reminders_unique_interval unique (task_id, remind_before)
);

create index idx_task_reminders_pending on task_reminders(task_id) where sent_at is null;

alter table task_reminders enable row level security;

create policy task_reminders_select on task_reminders
  for select to authenticated
  using (task_id in (select id from tasks where org_id in (select unnest(user_active_org_ids()))));

create policy task_reminders_insert on task_reminders
  for insert to authenticated
  with check (task_id in (select id from tasks where org_id in (select unnest(user_active_org_ids()))));

create policy task_reminders_delete on task_reminders
  for delete to authenticated
  using (task_id in (select id from tasks where org_id in (select unnest(user_active_org_ids()))));

-- ---------------------------------------------------------------------------
-- 5. Notifications table
-- ---------------------------------------------------------------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  reference_type text not null,
  reference_id uuid not null,
  channel text not null check (channel in ('in_app', 'email', 'sms')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_inapp on notifications(user_id, created_at desc)
  where channel = 'in_app';
create index idx_notifications_pending on notifications(status, channel)
  where status = 'pending' and channel != 'in_app';
create index idx_notifications_unread on notifications(user_id, read_at)
  where channel = 'in_app' and read_at is null;

alter table notifications enable row level security;

-- Users can read their own notifications
create policy notifications_select on notifications
  for select to authenticated
  using (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
create policy notifications_update on notifications
  for update to authenticated
  using (user_id = auth.uid());

-- Service role inserts (no RLS insert policy for authenticated — only server-side)

-- ---------------------------------------------------------------------------
-- 6. User notification preferences
-- ---------------------------------------------------------------------------

create table user_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'sms')),
  notification_type text not null,
  enabled boolean not null default true,
  constraint unp_unique unique (user_id, org_id, channel, notification_type)
);

alter table user_notification_preferences enable row level security;

create policy unp_select on user_notification_preferences
  for select to authenticated
  using (user_id = auth.uid());

create policy unp_insert on user_notification_preferences
  for insert to authenticated
  with check (user_id = auth.uid());

create policy unp_update on user_notification_preferences
  for update to authenticated
  using (user_id = auth.uid());

create policy unp_delete on user_notification_preferences
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. Add phone column to users table
-- ---------------------------------------------------------------------------

alter table users add column if not exists phone text;
```

- [ ] **Step 2: Run the migration**

Run: `cd /Users/patrick/birdhousemapper && npx supabase db reset`

Expected: Migration applies cleanly, all 27 migrations succeed.

- [ ] **Step 3: Verify tables exist**

Run: `cd /Users/patrick/birdhousemapper && npx supabase db lint`

Expected: No errors for the new tables.

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhousemapper
git add supabase/migrations/027_notification_system.sql
git commit -m "feat: add notification system database tables and RLS"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/lib/notifications/types.ts`
- Create: `src/lib/notifications/constants.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Create notification types**

```typescript
// src/lib/notifications/types.ts

export type TaskStatus = 'pending' | 'completed' | 'cancelled';

export type NotificationChannel = 'in_app' | 'email' | 'sms';

export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface Task {
  id: string;
  org_id: string;
  property_id: string | null;
  item_id: string | null;
  title: string;
  description: string | null;
  due_date: string;
  status: TaskStatus;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskWatcher {
  id: string;
  task_id: string;
  user_id: string | null;
  role_id: string | null;
}

export interface TaskReminder {
  id: string;
  task_id: string;
  remind_before: string; // PostgreSQL interval as string
  sent_at: string | null;
}

export interface Notification {
  id: string;
  org_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  reference_type: string;
  reference_id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  error: string | null;
  read_at: string | null;
  created_at: string;
}

export interface UserNotificationPreference {
  id: string;
  user_id: string;
  org_id: string;
  channel: NotificationChannel;
  notification_type: string;
  enabled: boolean;
}

export interface NotifyParams {
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
}

export interface NotificationAdapterPayload {
  to: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationAdapterResult {
  success: boolean;
  error?: string;
}

export interface NotificationAdapter {
  channel: 'email' | 'sms';
  send(payload: NotificationAdapterPayload): Promise<NotificationAdapterResult>;
}
```

- [ ] **Step 2: Create notification constants**

```typescript
// src/lib/notifications/constants.ts

export const NOTIFICATION_TYPES = {
  TASK_REMINDER: 'task_reminder',
  TASK_ASSIGNED: 'task_assigned',
  TASK_COMPLETED: 'task_completed',
} as const;

export type NotificationTypeName = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/** Labels for the preferences UI */
export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  [NOTIFICATION_TYPES.TASK_REMINDER]: 'Task reminders',
  [NOTIFICATION_TYPES.TASK_ASSIGNED]: 'Task assigned to me',
  [NOTIFICATION_TYPES.TASK_COMPLETED]: 'Task completed',
  '*': 'All notifications',
};

/** Default channel settings when no preference row exists */
export const DEFAULT_CHANNEL_ENABLED: Record<string, boolean> = {
  in_app: true,
  email: true,
  sms: false,
};

export const CHANNELS = ['in_app', 'email', 'sms'] as const;
```

- [ ] **Step 3: Add Task and Notification to main types.ts**

Add after the existing `Entity` interface block (around line 264) in `src/lib/types.ts`:

```typescript
// Re-export notification types for convenience
export type { Task, TaskWatcher, TaskReminder, Notification, UserNotificationPreference } from '@/lib/notifications/types';
```

- [ ] **Step 4: Verify types compile**

Run: `cd /Users/patrick/birdhousemapper && npm run type-check`

Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper
git add src/lib/notifications/types.ts src/lib/notifications/constants.ts src/lib/types.ts
git commit -m "feat: add notification system TypeScript types and constants"
```

---

## Task 3: Notification Adapters

**Files:**
- Create: `src/lib/notifications/adapters.ts`
- Create: `src/__tests__/notifications/adapters.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/notifications/adapters.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ConsoleEmailAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the email payload and returns success', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { ConsoleEmailAdapter } = await import('@/lib/notifications/adapters');
    const adapter = new ConsoleEmailAdapter();

    const result = await adapter.send({
      to: 'user@example.com',
      title: 'Reminder: Task due tomorrow',
      body: 'Your task "Fix fence" is due in 1 day.',
    });

    expect(result.success).toBe(true);
    expect(adapter.channel).toBe('email');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[EMAIL]'),
      expect.objectContaining({ to: 'user@example.com' })
    );
  });
});

describe('ConsoleSmsAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the SMS payload and returns success', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { ConsoleSmsAdapter } = await import('@/lib/notifications/adapters');
    const adapter = new ConsoleSmsAdapter();

    const result = await adapter.send({
      to: '+15551234567',
      title: 'Task due',
      body: 'Your task is due tomorrow.',
    });

    expect(result.success).toBe(true);
    expect(adapter.channel).toBe('sms');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[SMS]'),
      expect.objectContaining({ to: '+15551234567' })
    );
  });
});

describe('getAdapter', () => {
  it('returns email adapter for email channel', async () => {
    const { getAdapter } = await import('@/lib/notifications/adapters');
    const adapter = getAdapter('email');
    expect(adapter.channel).toBe('email');
  });

  it('returns sms adapter for sms channel', async () => {
    const { getAdapter } = await import('@/lib/notifications/adapters');
    const adapter = getAdapter('sms');
    expect(adapter.channel).toBe('sms');
  });

  it('returns null for in_app channel', async () => {
    const { getAdapter } = await import('@/lib/notifications/adapters');
    const adapter = getAdapter('in_app');
    expect(adapter).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/__tests__/notifications/adapters.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the adapters implementation**

```typescript
// src/lib/notifications/adapters.ts
import type { NotificationAdapter, NotificationAdapterPayload, NotificationAdapterResult } from './types';

export class ConsoleEmailAdapter implements NotificationAdapter {
  channel = 'email' as const;

  async send(payload: NotificationAdapterPayload): Promise<NotificationAdapterResult> {
    console.log('[EMAIL] Notification dispatched:', {
      to: payload.to,
      title: payload.title,
      body: payload.body,
      metadata: payload.metadata,
    });
    return { success: true };
  }
}

export class ConsoleSmsAdapter implements NotificationAdapter {
  channel = 'sms' as const;

  async send(payload: NotificationAdapterPayload): Promise<NotificationAdapterResult> {
    console.log('[SMS] Notification dispatched:', {
      to: payload.to,
      title: payload.title,
      body: payload.body,
      metadata: payload.metadata,
    });
    return { success: true };
  }
}

const adapters: Record<string, NotificationAdapter> = {
  email: new ConsoleEmailAdapter(),
  sms: new ConsoleSmsAdapter(),
};

export function getAdapter(channel: string): NotificationAdapter | null {
  return adapters[channel] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/__tests__/notifications/adapters.test.ts`

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper
git add src/lib/notifications/adapters.ts src/__tests__/notifications/adapters.test.ts
git commit -m "feat: add notification adapter interface with console adapters"
```

---

## Task 4: Preference Resolution Logic

**Files:**
- Create: `src/lib/notifications/preferences.ts`
- Create: `src/__tests__/notifications/preferences.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/notifications/preferences.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserNotificationPreference } from '@/lib/notifications/types';

// We test the pure logic function, not Supabase queries
describe('resolveChannelsForUser', () => {
  it('returns defaults when no preferences exist', async () => {
    const { resolveChannelsForUser } = await import('@/lib/notifications/preferences');
    const result = resolveChannelsForUser([], 'task_reminder');
    expect(result).toEqual({ in_app: true, email: true, sms: false });
  });

  it('respects specific type preference', async () => {
    const { resolveChannelsForUser } = await import('@/lib/notifications/preferences');
    const prefs: Pick<UserNotificationPreference, 'channel' | 'notification_type' | 'enabled'>[] = [
      { channel: 'email', notification_type: 'task_reminder', enabled: false },
    ];
    const result = resolveChannelsForUser(prefs, 'task_reminder');
    expect(result).toEqual({ in_app: true, email: false, sms: false });
  });

  it('wildcard preference applies to all types', async () => {
    const { resolveChannelsForUser } = await import('@/lib/notifications/preferences');
    const prefs: Pick<UserNotificationPreference, 'channel' | 'notification_type' | 'enabled'>[] = [
      { channel: 'email', notification_type: '*', enabled: false },
    ];
    const result = resolveChannelsForUser(prefs, 'task_reminder');
    expect(result).toEqual({ in_app: true, email: false, sms: false });
  });

  it('specific type overrides wildcard', async () => {
    const { resolveChannelsForUser } = await import('@/lib/notifications/preferences');
    const prefs: Pick<UserNotificationPreference, 'channel' | 'notification_type' | 'enabled'>[] = [
      { channel: 'email', notification_type: '*', enabled: false },
      { channel: 'email', notification_type: 'task_reminder', enabled: true },
    ];
    const result = resolveChannelsForUser(prefs, 'task_reminder');
    expect(result).toEqual({ in_app: true, email: true, sms: false });
  });

  it('enables sms when explicitly set', async () => {
    const { resolveChannelsForUser } = await import('@/lib/notifications/preferences');
    const prefs: Pick<UserNotificationPreference, 'channel' | 'notification_type' | 'enabled'>[] = [
      { channel: 'sms', notification_type: 'task_reminder', enabled: true },
    ];
    const result = resolveChannelsForUser(prefs, 'task_reminder');
    expect(result).toEqual({ in_app: true, email: true, sms: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/__tests__/notifications/preferences.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the preferences implementation**

```typescript
// src/lib/notifications/preferences.ts
import { DEFAULT_CHANNEL_ENABLED, CHANNELS } from './constants';
import type { NotificationChannel } from './types';

interface PreferenceRow {
  channel: NotificationChannel | string;
  notification_type: string;
  enabled: boolean;
}

/**
 * Resolve which channels are enabled for a user and notification type.
 * Priority: specific type > wildcard (*) > defaults.
 */
export function resolveChannelsForUser(
  prefs: PreferenceRow[],
  notificationType: string
): Record<string, boolean> {
  const result: Record<string, boolean> = {};

  for (const channel of CHANNELS) {
    // Look for specific type preference first
    const specific = prefs.find(
      (p) => p.channel === channel && p.notification_type === notificationType
    );
    if (specific !== undefined) {
      result[channel] = specific.enabled;
      continue;
    }

    // Fall back to wildcard
    const wildcard = prefs.find(
      (p) => p.channel === channel && p.notification_type === '*'
    );
    if (wildcard !== undefined) {
      result[channel] = wildcard.enabled;
      continue;
    }

    // Fall back to defaults
    result[channel] = DEFAULT_CHANNEL_ENABLED[channel] ?? false;
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/__tests__/notifications/preferences.test.ts`

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper
git add src/lib/notifications/preferences.ts src/__tests__/notifications/preferences.test.ts
git commit -m "feat: add notification preference resolution logic"
```

---

## Task 5: `notify()` Server Helper

**Files:**
- Create: `src/lib/notifications/notify.ts`
- Create: `src/__tests__/notifications/notify.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/notifications/notify.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let insertedRows: Record<string, unknown>[] = [];
let selectData: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'org_memberships') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => Promise.resolve({
                data: selectData,
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === 'user_notification_preferences') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        };
      }
      if (table === 'notifications') {
        return {
          insert: vi.fn((rows: Record<string, unknown>[]) => {
            insertedRows.push(...rows);
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {};
    },
  }),
}));

// Mock fetch for dispatch trigger (fire-and-forget)
global.fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));

describe('notify', () => {
  beforeEach(() => {
    insertedRows = [];
    selectData = [];
    vi.clearAllMocks();
  });

  it('creates in_app and email notifications for a direct user recipient', async () => {
    const { notify } = await import('@/lib/notifications/notify');

    await notify({
      orgId: 'org-1',
      type: 'task_assigned',
      title: 'You have a new task',
      referenceType: 'task',
      referenceId: 'task-1',
      recipients: { userIds: ['user-1'] },
    });

    // Defaults: in_app=true, email=true, sms=false → 2 rows
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows.find((r) => r.channel === 'in_app')).toBeTruthy();
    expect(insertedRows.find((r) => r.channel === 'email')).toBeTruthy();
    // in_app should be 'sent', email should be 'pending'
    expect(insertedRows.find((r) => r.channel === 'in_app')?.status).toBe('sent');
    expect(insertedRows.find((r) => r.channel === 'email')?.status).toBe('pending');
  });

  it('resolves role IDs to user IDs and deduplicates', async () => {
    selectData = [
      { user_id: 'user-1' },
      { user_id: 'user-2' },
    ];

    const { notify } = await import('@/lib/notifications/notify');

    await notify({
      orgId: 'org-1',
      type: 'task_reminder',
      title: 'Task due soon',
      referenceType: 'task',
      referenceId: 'task-1',
      recipients: {
        userIds: ['user-1'], // Overlaps with role resolution
        roleIds: ['role-1'],
      },
    });

    // user-1 appears in both userIds and role resolution — should be deduplicated
    // 2 unique users × 2 channels (in_app + email) = 4 rows
    expect(insertedRows).toHaveLength(4);
    const userIds = [...new Set(insertedRows.map((r) => r.user_id))];
    expect(userIds).toHaveLength(2);
    expect(userIds).toContain('user-1');
    expect(userIds).toContain('user-2');
  });

  it('does nothing when no recipients resolve', async () => {
    const { notify } = await import('@/lib/notifications/notify');

    await notify({
      orgId: 'org-1',
      type: 'task_reminder',
      title: 'Task due soon',
      referenceType: 'task',
      referenceId: 'task-1',
      recipients: {},
    });

    expect(insertedRows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/__tests__/notifications/notify.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the notify implementation**

```typescript
// src/lib/notifications/notify.ts
'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { resolveChannelsForUser } from './preferences';
import type { NotifyParams, NotificationChannel } from './types';

export async function notify(params: NotifyParams): Promise<void> {
  const { orgId, type, title, body, referenceType, referenceId, recipients } = params;
  const supabase = createServiceClient();

  // Step 1: Collect all user IDs
  const userIdSet = new Set<string>(recipients.userIds ?? []);

  // Resolve role IDs → user IDs
  if (recipients.roleIds && recipients.roleIds.length > 0) {
    const { data: memberships } = await supabase
      .from('org_memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .in('role_id', recipients.roleIds);

    if (memberships) {
      for (const m of memberships) {
        if (m.user_id) userIdSet.add(m.user_id);
      }
    }
  }

  const userIds = [...userIdSet];
  if (userIds.length === 0) return;

  // Step 2: For each user, resolve channel preferences and create notifications
  const rows: Record<string, unknown>[] = [];

  for (const userId of userIds) {
    // Fetch preferences for this user + org
    const { data: prefs } = await supabase
      .from('user_notification_preferences')
      .select('channel, notification_type, enabled')
      .eq('user_id', userId)
      .eq('org_id', orgId);

    const channels = resolveChannelsForUser(prefs ?? [], type);

    for (const [channel, enabled] of Object.entries(channels)) {
      if (!enabled) continue;

      rows.push({
        org_id: orgId,
        user_id: userId,
        type,
        title,
        body: body ?? null,
        reference_type: referenceType,
        reference_id: referenceId,
        channel: channel as NotificationChannel,
        // In-app notifications are immediately "sent" (readable).
        // External channels are "pending" until dispatched.
        status: channel === 'in_app' ? 'sent' : 'pending',
      });
    }
  }

  if (rows.length === 0) return;

  // Step 3: Bulk insert
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) {
    console.error('Failed to insert notifications:', error);
    return;
  }

  // Step 4: Trigger dispatch for external channels (fire-and-forget)
  const hasPending = rows.some((r) => r.status === 'pending');
  if (hasPending) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL ?? 'http://localhost:3000';
    const url = `${baseUrl}/api/notifications/dispatch`;
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    }).catch((err) => {
      console.error('Failed to trigger notification dispatch:', err);
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/__tests__/notifications/notify.test.ts`

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper
git add src/lib/notifications/notify.ts src/__tests__/notifications/notify.test.ts
git commit -m "feat: add notify() server helper for creating notifications"
```

---

## Task 6: Dispatch API Route

**Files:**
- Create: `src/app/api/notifications/dispatch/route.ts`
- Create: `src/__tests__/notifications/dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/notifications/dispatch.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let pendingNotifications: Record<string, unknown>[] = [];
let updatedIds: { id: string; status: string; error: string | null }[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'notifications') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              neq: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({
                  data: pendingNotifications,
                  error: null,
                })),
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn((col: string, val: string) => {
              updatedIds.push({
                id: val,
                status: payload.status as string,
                error: (payload.error as string) ?? null,
              });
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }
      if (table === 'users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: { phone: '+15551234567' },
              error: null,
            })),
          })),
        };
      }
      return {};
    },
    auth: {
      admin: {
        getUserById: vi.fn(() => Promise.resolve({
          data: { user: { email: 'user@example.com' } },
          error: null,
        })),
      },
    },
  }),
}));

vi.mock('@/lib/notifications/adapters', () => ({
  getAdapter: vi.fn((channel: string) => {
    if (channel === 'email' || channel === 'sms') {
      return {
        channel,
        send: vi.fn(() => Promise.resolve({ success: true })),
      };
    }
    return null;
  }),
}));

describe('POST /api/notifications/dispatch', () => {
  beforeEach(() => {
    pendingNotifications = [];
    updatedIds = [];
    vi.clearAllMocks();
  });

  it('returns 401 without valid auth', async () => {
    const { POST } = await import('@/app/api/notifications/dispatch/route');
    const req = new Request('http://localhost/api/notifications/dispatch', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('processes pending notifications and marks as sent', async () => {
    process.env.CRON_SECRET = 'test-secret';
    pendingNotifications = [
      { id: 'n-1', user_id: 'u-1', channel: 'email', title: 'Test', body: 'Body' },
      { id: 'n-2', user_id: 'u-1', channel: 'sms', title: 'Test', body: 'Body' },
    ];

    const { POST } = await import('@/app/api/notifications/dispatch/route');
    const req = new Request('http://localhost/api/notifications/dispatch', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.processed).toBe(2);
    expect(json.failed).toBe(0);
    expect(updatedIds).toHaveLength(2);
    expect(updatedIds.every((u) => u.status === 'sent')).toBe(true);
  });

  it('returns 200 with zero counts when nothing pending', async () => {
    process.env.CRON_SECRET = 'test-secret';
    pendingNotifications = [];

    const { POST } = await import('@/app/api/notifications/dispatch/route');
    const req = new Request('http://localhost/api/notifications/dispatch', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.processed).toBe(0);
    expect(json.failed).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/__tests__/notifications/dispatch.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the dispatch route**

```typescript
// src/app/api/notifications/dispatch/route.ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAdapter } from '@/lib/notifications/adapters';

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch pending external notifications
  const { data: pending, error: fetchError } = await supabase
    .from('notifications')
    .select('id, user_id, channel, title, body')
    .eq('status', 'pending')
    .neq('channel', 'in_app')
    .limit(50);

  if (fetchError) {
    console.error('Failed to fetch pending notifications:', fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0, failed: 0 });
  }

  let processed = 0;
  let failed = 0;

  for (const notification of pending) {
    const adapter = getAdapter(notification.channel);
    if (!adapter) {
      await supabase
        .from('notifications')
        .update({ status: 'failed', error: `No adapter for channel: ${notification.channel}` })
        .eq('id', notification.id);
      failed++;
      continue;
    }

    // Look up contact info
    let to = '';
    if (notification.channel === 'email') {
      const { data: authData } = await supabase.auth.admin.getUserById(notification.user_id);
      to = authData?.user?.email ?? '';
    } else if (notification.channel === 'sms') {
      const { data: profile } = await supabase
        .from('users')
        .select('phone')
        .eq('id', notification.user_id);
      to = (profile as { phone: string } | null)?.phone ?? '';
    }

    if (!to) {
      await supabase
        .from('notifications')
        .update({ status: 'failed', error: `No contact info for channel: ${notification.channel}` })
        .eq('id', notification.id);
      failed++;
      continue;
    }

    const result = await adapter.send({
      to,
      title: notification.title,
      body: notification.body ?? '',
    });

    if (result.success) {
      await supabase
        .from('notifications')
        .update({ status: 'sent' })
        .eq('id', notification.id);
      processed++;
    } else {
      await supabase
        .from('notifications')
        .update({ status: 'failed', error: result.error ?? 'Unknown error' })
        .eq('id', notification.id);
      failed++;
    }
  }

  return NextResponse.json({ processed, failed });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/__tests__/notifications/dispatch.test.ts`

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper
git add src/app/api/notifications/dispatch/route.ts src/__tests__/notifications/dispatch.test.ts
git commit -m "feat: add notification dispatch API route with adapter pattern"
```

---

## Task 7: pg_cron Function — `process_task_reminders()`

**Files:**
- Modify: `supabase/migrations/027_notification_system.sql`

This task adds the pg_cron function and schedule to the existing migration file. Since the migration hasn't been deployed to production yet, we append to the same file.

- [ ] **Step 1: Append the pg_cron function to the migration**

Add the following at the end of `supabase/migrations/027_notification_system.sql`:

```sql
-- ---------------------------------------------------------------------------
-- 8. process_task_reminders() — pg_cron function
-- ---------------------------------------------------------------------------

create or replace function process_task_reminders()
returns void as $$
declare
  r record;
  recipient_id uuid;
  pref record;
  ch text;
  ch_enabled boolean;
  channels text[] := array['in_app', 'email', 'sms'];
  default_enabled boolean;
begin
  -- Find all due reminders that haven't been sent
  for r in
    select tr.id as reminder_id, tr.task_id, t.org_id, t.title as task_title,
           t.assigned_to, t.description as task_description
    from task_reminders tr
    join tasks t on t.id = tr.task_id
    where t.status = 'pending'
      and t.due_date - tr.remind_before <= now()
      and tr.sent_at is null
  loop
    -- Collect all unique recipient user IDs for this task
    for recipient_id in
      -- Assigned user
      select r.assigned_to where r.assigned_to is not null
      union
      -- Direct watchers
      select tw.user_id from task_watchers tw
        where tw.task_id = r.task_id and tw.user_id is not null
      union
      -- Role-based watchers: resolve role → users via org_memberships
      select om.user_id from task_watchers tw
        join org_memberships om on om.role_id = tw.role_id and om.org_id = r.org_id
        where tw.task_id = r.task_id and tw.role_id is not null
          and om.status = 'active' and om.user_id is not null
    loop
      -- For each channel, check preferences
      foreach ch in array channels
      loop
        -- Default: in_app=true, email=true, sms=false
        if ch = 'sms' then default_enabled := false;
        else default_enabled := true;
        end if;

        -- Check for specific type preference
        select enabled into ch_enabled
        from user_notification_preferences
        where user_id = recipient_id
          and org_id = r.org_id
          and channel = ch
          and notification_type = 'task_reminder';

        if not found then
          -- Check wildcard preference
          select enabled into ch_enabled
          from user_notification_preferences
          where user_id = recipient_id
            and org_id = r.org_id
            and channel = ch
            and notification_type = '*';

          if not found then
            ch_enabled := default_enabled;
          end if;
        end if;

        if ch_enabled then
          insert into notifications (
            org_id, user_id, type, title, body,
            reference_type, reference_id, channel, status
          ) values (
            r.org_id,
            recipient_id,
            'task_reminder',
            'Reminder: ' || r.task_title,
            r.task_description,
            'task',
            r.task_id,
            ch,
            case when ch = 'in_app' then 'sent' else 'pending' end
          );
        end if;
      end loop;
    end loop;

    -- Mark reminder as sent
    update task_reminders set sent_at = now() where id = r.reminder_id;
  end loop;

  -- Trigger external dispatch via pg_net (fire-and-forget)
  -- Only if there are pending external notifications
  if exists (select 1 from notifications where status = 'pending' and channel != 'in_app' limit 1) then
    perform net.http_post(
      url := current_setting('app.settings.base_url', true) || '/api/notifications/dispatch',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  end if;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 9. Schedule the cron job (every 15 minutes)
-- ---------------------------------------------------------------------------

select cron.schedule(
  'process-task-reminders',
  '*/15 * * * *',
  $$select process_task_reminders()$$
);
```

- [ ] **Step 2: Run the migration**

Run: `cd /Users/patrick/birdhousemapper && npx supabase db reset`

Expected: All migrations apply cleanly. The cron job is scheduled.

- [ ] **Step 3: Verify the function exists**

Run: `cd /Users/patrick/birdhousemapper && npx supabase db lint`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhousemapper
git add supabase/migrations/027_notification_system.sql
git commit -m "feat: add process_task_reminders pg_cron function"
```

---

## Task 8: In-App Notification Bell Component

**Files:**
- Create: `src/components/notifications/NotificationBell.tsx`
- Create: `src/components/notifications/NotificationItem.tsx`
- Modify: `src/components/layout/Navigation.tsx`

- [ ] **Step 1: Create NotificationItem component**

```typescript
// src/components/notifications/NotificationItem.tsx
'use client';

import Link from 'next/link';
import type { Notification } from '@/lib/notifications/types';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getNotificationHref(notification: Notification): string {
  if (notification.reference_type === 'task') {
    return `/manage?task=${notification.reference_id}`;
  }
  if (notification.reference_type === 'item') {
    return `/manage/edit?id=${notification.reference_id}`;
  }
  return '/manage';
}

export default function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
}) {
  const isUnread = !notification.read_at;

  return (
    <Link
      href={getNotificationHref(notification)}
      onClick={() => { if (isUnread) onMarkRead(notification.id); }}
      className={`block px-4 py-3 hover:bg-sage-light/50 transition-colors ${
        isUnread ? 'bg-meadow/5' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {isUnread && (
          <span className="mt-1.5 w-2 h-2 rounded-full bg-meadow flex-shrink-0" />
        )}
        <div className={`flex-1 min-w-0 ${isUnread ? '' : 'ml-4'}`}>
          <p className="text-sm font-medium text-forest-dark truncate">
            {notification.title}
          </p>
          {notification.body && (
            <p className="text-xs text-sage mt-0.5 truncate">
              {notification.body}
            </p>
          )}
          <p className="text-xs text-sage/70 mt-1">
            {timeAgo(notification.created_at)}
          </p>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create NotificationBell component**

```typescript
// src/components/notifications/NotificationBell.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import NotificationItem from './NotificationItem';
import type { Notification } from '@/lib/notifications/types';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const supabase = createClient();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications', 'in_app'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('channel', 'in_app')
        .order('created_at', { ascending: false })
        .limit(20);
      return (data as Notification[]) ?? [];
    },
    refetchInterval: 60_000,
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'in_app'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
      if (unreadIds.length === 0) return;
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'in_app'] });
    },
  });

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg transition-colors text-sage hover:text-forest-dark hover:bg-sage-light relative"
        title="Notifications"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-meadow text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-sage-light overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-sage-light">
            <h3 className="text-sm font-semibold text-forest-dark">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-meadow hover:text-meadow/80 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-sage-light/50">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-sm text-sage text-center">
                No notifications yet
              </p>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={(id) => markRead.mutate(id)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add NotificationBell to Navigation.tsx**

In `src/components/layout/Navigation.tsx`, add the import at the top (after existing imports):

```typescript
import NotificationBell from '@/components/notifications/NotificationBell';
```

Then in the desktop nav, add the bell between the "Manage" link and the "Settings" icon. Find this block (around line 100-110):

```typescript
                  <Link
                    href="/admin/settings"
                    className={`p-2 rounded-lg transition-colors ${
```

Add the `NotificationBell` just before it:

```typescript
                  <NotificationBell />
                  <Link
                    href="/admin/settings"
                    className={`p-2 rounded-lg transition-colors ${
```

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/patrick/birdhousemapper && npm run type-check`

Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper
git add src/components/notifications/NotificationBell.tsx src/components/notifications/NotificationItem.tsx src/components/layout/Navigation.tsx
git commit -m "feat: add notification bell component with in-app polling"
```

---

## Task 9: Notification Preferences Server Actions

**Files:**
- Create: `src/app/admin/notifications/actions.ts`

- [ ] **Step 1: Write the server actions**

```typescript
// src/app/admin/notifications/actions.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';
import type { UserNotificationPreference } from '@/lib/notifications/types';

export async function getNotificationPreferences(): Promise<{
  data?: UserNotificationPreference[];
  error?: string;
}> {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .eq('org_id', tenant.orgId);

  if (error) return { error: error.message };
  return { data: (data as UserNotificationPreference[]) ?? [] };
}

export async function updateNotificationPreference(params: {
  channel: string;
  notificationType: string;
  enabled: boolean;
}): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('user_notification_preferences')
    .upsert(
      {
        user_id: user.id,
        org_id: tenant.orgId,
        channel: params.channel,
        notification_type: params.notificationType,
        enabled: params.enabled,
      },
      { onConflict: 'user_id,org_id,channel,notification_type' }
    );

  if (error) return { error: error.message };
  return { success: true };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/patrick/birdhousemapper && npm run type-check`

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper
git add src/app/admin/notifications/actions.ts
git commit -m "feat: add notification preferences server actions"
```

---

## Task 10: Notification Preferences UI Page

**Files:**
- Create: `src/app/admin/notifications/page.tsx`

- [ ] **Step 1: Write the preferences page**

```typescript
// src/app/admin/notifications/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotificationPreferences, updateNotificationPreference } from './actions';
import { NOTIFICATION_TYPE_LABELS, CHANNELS, DEFAULT_CHANNEL_ENABLED } from '@/lib/notifications/constants';
import type { UserNotificationPreference, NotificationChannel } from '@/lib/notifications/types';

function resolveEnabled(
  prefs: UserNotificationPreference[],
  channel: string,
  type: string
): boolean {
  const specific = prefs.find(
    (p) => p.channel === channel && p.notification_type === type
  );
  if (specific) return specific.enabled;
  return DEFAULT_CHANNEL_ENABLED[channel] ?? false;
}

export default function NotificationPreferencesPage() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const { data: prefs = [], isLoading } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const result = await getNotificationPreferences();
      if (result.error) return [];
      return result.data ?? [];
    },
  });

  const notificationTypes = Object.entries(NOTIFICATION_TYPE_LABELS);

  async function handleToggle(channel: string, type: string, currentEnabled: boolean) {
    const key = `${channel}-${type}`;
    setSaving(key);
    setMessage('');

    const result = await updateNotificationPreference({
      channel,
      notificationType: type,
      enabled: !currentEnabled,
    });

    if (result.error) {
      setMessage(`Error: ${result.error}`);
    } else {
      await queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    }
    setSaving(null);
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-1/3" />
          <div className="h-64 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">
        Notification Preferences
      </h1>

      {message && (
        <div
          className={`mb-6 rounded-lg px-3 py-2 text-sm ${
            message.startsWith('Error')
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-green-50 border border-green-200 text-green-700'
          }`}
        >
          {message}
        </div>
      )}

      <section className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light">
                <th className="text-left py-3 px-2 text-sm font-semibold text-forest-dark">
                  Notification Type
                </th>
                {CHANNELS.map((ch) => (
                  <th key={ch} className="text-center py-3 px-2 text-sm font-semibold text-forest-dark capitalize">
                    {ch === 'in_app' ? 'In-App' : ch === 'sms' ? 'SMS' : 'Email'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notificationTypes.map(([type, label]) => (
                <tr key={type} className="border-b border-sage-light/50">
                  <td className="py-3 px-2 text-sm text-forest-dark">{label}</td>
                  {CHANNELS.map((ch) => {
                    const enabled = resolveEnabled(prefs, ch, type);
                    const key = `${ch}-${type}`;
                    const isSms = ch === 'sms';
                    return (
                      <td key={ch} className="text-center py-3 px-2">
                        <button
                          onClick={() => handleToggle(ch, type, enabled)}
                          disabled={saving === key || (isSms && type !== '*')}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            enabled
                              ? 'bg-meadow'
                              : 'bg-sage-light'
                          } ${
                            isSms && type !== '*' ? 'opacity-40 cursor-not-allowed' : ''
                          }`}
                          title={isSms && type !== '*' ? 'SMS not yet configured' : undefined}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-sage">
          SMS notifications are not yet available. Toggle will be enabled once an SMS provider is configured.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/patrick/birdhousemapper && npm run type-check`

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper
git add src/app/admin/notifications/page.tsx
git commit -m "feat: add notification preferences UI page"
```

---

## Task 11: Full Build Verification and Type Check

**Files:** None — verification only.

- [ ] **Step 1: Run type check**

Run: `cd /Users/patrick/birdhousemapper && npm run type-check`

Expected: No TypeScript errors.

- [ ] **Step 2: Run all notification tests**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/__tests__/notifications/`

Expected: All tests PASS.

- [ ] **Step 3: Run full test suite**

Run: `cd /Users/patrick/birdhousemapper && npm run test`

Expected: All existing tests still pass, new notification tests pass.

- [ ] **Step 4: Run build**

Run: `cd /Users/patrick/birdhousemapper && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit any fixes if needed**

If any issues were found in steps 1-4, fix them and commit:

```bash
cd /Users/patrick/birdhousemapper
git add -A
git commit -m "fix: resolve notification system build issues"
```
