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
    expect(adapter!.channel).toBe('email');
  });

  it('returns sms adapter for sms channel', async () => {
    const { getAdapter } = await import('@/lib/notifications/adapters');
    const adapter = getAdapter('sms');
    expect(adapter!.channel).toBe('sms');
  });

  it('returns null for in_app channel', async () => {
    const { getAdapter } = await import('@/lib/notifications/adapters');
    const adapter = getAdapter('in_app');
    expect(adapter).toBeNull();
  });
});
