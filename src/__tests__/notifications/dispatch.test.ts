import { describe, it, expect, vi, beforeEach } from 'vitest';

let pendingNotifications: Record<string, unknown>[] = [];
let updatedIds: { id: string; status: string; error: string | null }[] = [];
let adapterSendResult: { success: boolean; error?: string } = { success: true };
let getUserByIdResult: { data: { user: { email: string } | null }; error: null } = {
  data: { user: { email: 'user@example.com' } },
  error: null,
};
let selectFetchError: { message: string } | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'notifications') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              neq: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({
                  data: selectFetchError ? null : pendingNotifications,
                  error: selectFetchError,
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
        getUserById: vi.fn(() => Promise.resolve(getUserByIdResult)),
      },
    },
  }),
}));

vi.mock('@/lib/notifications/adapters', () => ({
  getAdapter: vi.fn((channel: string) => {
    if (channel === 'email' || channel === 'sms') {
      return {
        channel,
        send: vi.fn(() => Promise.resolve(adapterSendResult)),
      };
    }
    return null;
  }),
}));

describe('POST /api/notifications/dispatch', () => {
  beforeEach(() => {
    pendingNotifications = [];
    updatedIds = [];
    adapterSendResult = { success: true };
    getUserByIdResult = { data: { user: { email: 'user@example.com' } }, error: null };
    selectFetchError = null;
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

  it('marks notification as failed when adapter send fails', async () => {
    process.env.CRON_SECRET = 'test-secret';
    adapterSendResult = { success: false, error: 'Provider error' };
    pendingNotifications = [
      { id: 'n-fail', user_id: 'u-1', channel: 'email', title: 'Test', body: 'Body' },
    ];

    const { POST } = await import('@/app/api/notifications/dispatch/route');
    const req = new Request('http://localhost/api/notifications/dispatch', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.failed).toBe(1);
    expect(json.processed).toBe(0);
    const failedEntry = updatedIds.find((u) => u.id === 'n-fail');
    expect(failedEntry?.status).toBe('failed');
    expect(failedEntry?.error).toBe('Provider error');
  });

  it('marks notification as failed when no contact info found', async () => {
    process.env.CRON_SECRET = 'test-secret';
    getUserByIdResult = { data: { user: null }, error: null };
    pendingNotifications = [
      { id: 'n-nocontact', user_id: 'u-ghost', channel: 'email', title: 'Test', body: 'Body' },
    ];

    const { POST } = await import('@/app/api/notifications/dispatch/route');
    const req = new Request('http://localhost/api/notifications/dispatch', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.failed).toBe(1);
    const failedEntry = updatedIds.find((u) => u.id === 'n-nocontact');
    expect(failedEntry?.status).toBe('failed');
    expect(failedEntry?.error).toContain('No contact info');
  });

  it('handles fetch error gracefully and returns 500', async () => {
    process.env.CRON_SECRET = 'test-secret';
    selectFetchError = { message: 'DB connection error' };

    const { POST } = await import('@/app/api/notifications/dispatch/route');
    const req = new Request('http://localhost/api/notifications/dispatch', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
  });
});
