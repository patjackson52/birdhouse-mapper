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
