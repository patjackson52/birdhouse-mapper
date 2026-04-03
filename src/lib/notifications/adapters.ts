import type { NotificationAdapter, NotificationAdapterPayload, NotificationAdapterResult } from './types';

class ConsoleAdapter implements NotificationAdapter {
  channel: 'email' | 'sms';
  private label: string;

  constructor(channel: 'email' | 'sms') {
    this.channel = channel;
    this.label = channel.toUpperCase();
  }

  async send(payload: NotificationAdapterPayload): Promise<NotificationAdapterResult> {
    console.log(`[${this.label}] Notification dispatched:`, {
      to: payload.to,
      title: payload.title,
      body: payload.body,
      metadata: payload.metadata,
    });
    return { success: true };
  }
}

// Exported for tests that reference the class name
export { ConsoleAdapter as ConsoleEmailAdapter };
export { ConsoleAdapter as ConsoleSmsAdapter };

const adapters: Record<string, NotificationAdapter> = {
  email: new ConsoleAdapter('email'),
  sms: new ConsoleAdapter('sms'),
};

export function getAdapter(channel: string): NotificationAdapter | null {
  return adapters[channel] ?? null;
}
