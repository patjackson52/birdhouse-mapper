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
    const specific = prefs.find(
      (p) => p.channel === channel && p.notification_type === notificationType
    );
    if (specific !== undefined) {
      result[channel] = specific.enabled;
      continue;
    }

    const wildcard = prefs.find(
      (p) => p.channel === channel && p.notification_type === '*'
    );
    if (wildcard !== undefined) {
      result[channel] = wildcard.enabled;
      continue;
    }

    result[channel] = DEFAULT_CHANNEL_ENABLED[channel] ?? false;
  }

  return result;
}
