// src/app/account/notifications/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SubscriptionWithTopic } from '@/lib/communications/types';
import type { Notification } from '@/lib/communications/types';

export default function NotificationsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithTopic[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'notifications' | 'settings'>('notifications');

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [subsResult, notifsResult] = await Promise.all([
        supabase
          .from('user_subscriptions')
          .select('*, topic:communication_topics(*)')
          .eq('user_id', user.id),
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      setSubscriptions(
        (subsResult.data ?? []).map((row: any) => ({ ...row, topic: row.topic }))
      );
      setNotifications(notifsResult.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function toggleSubscription(subId: string, field: 'email_enabled' | 'in_app_enabled', value: boolean) {
    const supabase = createClient();
    await supabase
      .from('user_subscriptions')
      .update({ [field]: value })
      .eq('id', subId);

    setSubscriptions((prev) =>
      prev.map((s) => (s.id === subId ? { ...s, [field]: value } : s))
    );
  }

  async function handleUnsubscribeAll() {
    if (!confirm('Are you sure you want to unsubscribe from all notifications?')) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('user_subscriptions')
      .update({ email_enabled: false, in_app_enabled: false })
      .eq('user_id', user.id);

    setSubscriptions((prev) =>
      prev.map((s) => ({ ...s, email_enabled: false, in_app_enabled: false }))
    );
  }

  async function markAsRead(notifId: string) {
    const supabase = createClient();
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
    );
  }

  async function markAllRead() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  if (loading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-sage-light/50 rounded w-1/3" />
          <div className="h-4 bg-sage-light/50 rounded w-full" />
          <div className="h-4 bg-sage-light/50 rounded w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-sage-light/30 rounded-lg p-1">
        <button
          onClick={() => setTab('notifications')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'notifications' ? 'bg-white text-forest-dark shadow-sm' : 'text-sage hover:text-forest-dark'
          }`}
        >
          Notifications
          {notifications.filter((n) => !n.is_read).length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
              {notifications.filter((n) => !n.is_read).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('settings')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'settings' ? 'bg-white text-forest-dark shadow-sm' : 'text-sage hover:text-forest-dark'
          }`}
        >
          Settings
        </button>
      </div>

      {tab === 'notifications' && (
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-sage-light">
            <h2 className="font-heading text-lg font-semibold text-forest-dark">Notifications</h2>
            {notifications.some((n) => !n.is_read) && (
              <button onClick={markAllRead} className="text-xs text-forest hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sage text-sm">No notifications yet.</div>
          ) : (
            <div className="divide-y divide-sage-light">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`px-4 py-3 ${!notif.is_read ? 'bg-blue-50/30' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!notif.is_read ? 'font-semibold text-forest-dark' : 'text-gray-700'}`}>
                        {notif.title}
                      </p>
                      <p className="text-xs text-sage mt-0.5 line-clamp-2">{notif.body}</p>
                      <p className="text-[10px] text-sage mt-1">
                        {new Date(notif.created_at).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    {!notif.is_read && (
                      <button
                        onClick={() => markAsRead(notif.id)}
                        className="text-[10px] text-forest hover:underline whitespace-nowrap mt-1"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                  {notif.link && (
                    <a href={notif.link} className="text-xs text-forest hover:underline mt-1 inline-block">
                      View details &rarr;
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="card">
          <div className="px-4 py-3 border-b border-sage-light">
            <h2 className="font-heading text-lg font-semibold text-forest-dark">Subscription Settings</h2>
          </div>
          {subscriptions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sage text-sm">
              You haven&apos;t subscribed to any topics yet.
            </div>
          ) : (
            <>
              <div className="divide-y divide-sage-light">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-forest-dark">{sub.topic.name}</p>
                        {sub.topic.description && (
                          <p className="text-xs text-sage">{sub.topic.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-4 mt-2">
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={sub.email_enabled}
                          onChange={(e) => toggleSubscription(sub.id, 'email_enabled', e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-sage text-forest focus:ring-forest"
                        />
                        Email
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={sub.in_app_enabled}
                          onChange={(e) => toggleSubscription(sub.id, 'in_app_enabled', e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-sage text-forest focus:ring-forest"
                        />
                        In-app
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-sage-light">
                <button
                  onClick={handleUnsubscribeAll}
                  className="text-xs text-red-600 hover:underline"
                >
                  Unsubscribe from all
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
