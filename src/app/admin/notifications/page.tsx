'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotificationPreferences, updateNotificationPreference } from './actions';
import { NOTIFICATION_TYPE_LABELS, CHANNELS, DEFAULT_CHANNEL_ENABLED } from '@/lib/notifications/constants';
import type { UserNotificationPreference } from '@/lib/notifications/types';

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
