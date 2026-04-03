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
        userIds: ['user-1'],
        roleIds: ['role-1'],
      },
    });

    // user-1 appears in both userIds and role resolution — should be deduplicated
    // 2 unique users × 2 channels (in_app + email) = 4 rows
    expect(insertedRows).toHaveLength(4);
    const userIds = Array.from(new Set(insertedRows.map((r) => r.user_id)));
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
