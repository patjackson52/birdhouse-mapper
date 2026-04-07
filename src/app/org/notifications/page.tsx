// src/app/org/notifications/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CommunicationTopic } from '@/lib/communications/types';

export default function SendNotificationPage() {
  const [topics, setTopics] = useState<CommunicationTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState('');

  // Form state
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [channels, setChannels] = useState<Set<'email' | 'in_app'>>(new Set<'email' | 'in_app'>(['email', 'in_app']));
  const [recipientCount, setRecipientCount] = useState<{ email: number; inApp: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const cookies = document.cookie.split(';').map((c) => c.trim());
      const orgIdCookie = cookies.find((c) => c.startsWith('x-org-id='));
      const currentOrgId = orgIdCookie?.split('=')[1] || '';
      setOrgId(currentOrgId);

      if (!currentOrgId) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('communication_topics')
        .select('*')
        .eq('org_id', currentOrgId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      setTopics(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  // Fetch recipient counts when topics change
  useEffect(() => {
    async function fetchCounts() {
      if (selectedTopicIds.length === 0) {
        setRecipientCount(null);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from('user_subscriptions')
        .select('email_enabled, in_app_enabled')
        .in('topic_id', selectedTopicIds);

      const rows = data ?? [];
      setRecipientCount({
        email: rows.filter((r) => r.email_enabled).length,
        inApp: rows.filter((r) => r.in_app_enabled).length,
      });
    }
    fetchCounts();
  }, [selectedTopicIds]);

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]
    );
  }

  function toggleChannel(ch: 'email' | 'in_app') {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });
  }

  async function handleSend() {
    if (selectedTopicIds.length === 0) return;
    if (!title.trim() || !body.trim()) return;
    if (channels.size === 0) return;

    if (!confirm(`Send this notification to ${recipientCount ? Math.max(recipientCount.email, recipientCount.inApp) : 0} subscribers?`)) return;

    setSending(true);
    setResult(null);

    const { sendNotification } = await import('@/lib/communications/actions');
    const res = await sendNotification({
      org_id: orgId,
      topic_ids: selectedTopicIds,
      title: title.trim(),
      body: body.trim(),
      link: link.trim() || undefined,
      channels: Array.from(channels),
    });

    if ('error' in res) {
      setResult({ success: false, message: res.error });
    } else {
      setResult({
        success: true,
        message: `Sent! ${res.sent.email} emails, ${res.sent.inApp} in-app notifications.`,
      });
      setTitle('');
      setBody('');
      setLink('');
      setSelectedTopicIds([]);
    }
    setSending(false);
  }

  if (loading) {
    return (
      <div className="card p-6 animate-pulse space-y-4">
        <div className="h-6 bg-sage-light/50 rounded w-1/3" />
        <div className="h-4 bg-sage-light/50 rounded w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-lg font-semibold text-forest-dark">Send Notification</h2>

      {result && (
        <div className={`rounded-lg px-3 py-2 text-sm ${result.success ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {result.message}
        </div>
      )}

      <div className="card p-4 space-y-4">
        {/* Topic selection */}
        <div>
          <label className="label">Topics</label>
          <div className="space-y-2 mt-1">
            {topics.length === 0 ? (
              <p className="text-sm text-sage">No active topics. Create topics in Communications Settings first.</p>
            ) : (
              topics.map((topic) => (
                <label key={topic.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sage-light/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTopicIds.includes(topic.id)}
                    onChange={() => toggleTopic(topic.id)}
                    className="w-4 h-4 rounded border-sage text-forest focus:ring-forest"
                  />
                  <span className="text-sm text-forest-dark">{topic.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Recipient preview */}
        {recipientCount && (
          <div className="text-sm text-sage bg-sage-light/20 rounded-lg px-3 py-2">
            This will reach <strong>{recipientCount.email}</strong> via email and <strong>{recipientCount.inApp}</strong> via in-app.
          </div>
        )}

        {/* Title */}
        <div>
          <label className="label">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field"
            placeholder="Notification title"
          />
        </div>

        {/* Body */}
        <div>
          <label className="label">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="input-field min-h-[100px]"
            placeholder="Write your notification message..."
          />
        </div>

        {/* Link */}
        <div>
          <label className="label">Link (optional)</label>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="input-field"
            placeholder="https://..."
          />
        </div>

        {/* Channel selection */}
        <div>
          <label className="label">Channels</label>
          <div className="flex gap-4 mt-1">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={channels.has('email')}
                onChange={() => toggleChannel('email')}
                className="w-4 h-4 rounded border-sage text-forest focus:ring-forest"
              />
              Email
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={channels.has('in_app')}
                onChange={() => toggleChannel('in_app')}
                className="w-4 h-4 rounded border-sage text-forest focus:ring-forest"
              />
              In-app
            </label>
          </div>
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={sending || selectedTopicIds.length === 0 || !title.trim() || !body.trim() || channels.size === 0}
          className="btn-primary w-full"
        >
          {sending ? 'Sending...' : 'Send Notification'}
        </button>
      </div>
    </div>
  );
}
