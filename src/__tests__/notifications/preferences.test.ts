import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserNotificationPreference } from '@/lib/notifications/types';

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
