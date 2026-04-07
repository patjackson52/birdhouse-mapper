// src/components/communications/SubscribeForm.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CommunicationTopic } from '@/lib/communications/types';

interface SubscribeFormProps {
  topics: CommunicationTopic[];
  heading?: string;
  description?: string;
  /** Called after successful subscription + auth */
  onSuccess?: () => void;
}

export function SubscribeForm({ topics, heading, description, onSuccess }: SubscribeFormProps) {
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(
    topics.filter((t) => t.is_active).map((t) => t.id)
  );
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]
    );
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedTopicIds.length === 0) {
      setError('Please select at least one topic.');
      return;
    }
    setError('');
    setLoading(true);

    const supabase = createClient();

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(window.location.pathname)}&subscribe_topics=${encodeURIComponent(JSON.stringify(selectedTopicIds))}`,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setMagicLinkSent(true);
    setLoading(false);
  }

  async function handleGoogleSignIn() {
    if (selectedTopicIds.length === 0) {
      setError('Please select at least one topic.');
      return;
    }
    setError('');
    setGoogleLoading(true);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(window.location.pathname)}&subscribe_topics=${encodeURIComponent(JSON.stringify(selectedTopicIds))}`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
  }

  if (magicLinkSent) {
    return (
      <div className="text-center py-4">
        <p className="text-forest-dark font-medium mb-2">Check your email!</p>
        <p className="text-sage text-sm">
          We sent a sign-in link to <strong>{email}</strong>. Click the link to complete your subscription.
        </p>
      </div>
    );
  }

  return (
    <div>
      {heading && (
        <h3 className="font-heading font-semibold text-forest-dark text-lg mb-1">{heading}</h3>
      )}
      {description && (
        <p className="text-sage text-sm mb-4">{description}</p>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">
          {error}
        </div>
      )}

      {/* Topic checkboxes */}
      <div className="space-y-2 mb-4">
        {topics.map((topic) => (
          <label
            key={topic.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-sage-light/30 hover:bg-sage-light/50 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedTopicIds.includes(topic.id)}
              onChange={() => toggleTopic(topic.id)}
              className="w-4 h-4 rounded border-sage text-forest focus:ring-forest"
            />
            <div>
              <span className="text-sm font-medium text-forest-dark">{topic.name}</span>
              {topic.description && (
                <span className="text-xs text-sage block">{topic.description}</span>
              )}
            </div>
          </label>
        ))}
      </div>

      {/* Email input */}
      <form onSubmit={handleEmailSubmit} className="flex gap-2 mb-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="input-field flex-1"
        />
        <button
          type="submit"
          disabled={loading || googleLoading}
          className="btn-primary whitespace-nowrap"
        >
          {loading ? 'Sending...' : 'Get Updates'}
        </button>
      </form>

      {/* Google OAuth */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading || googleLoading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-sage-light rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-sage-light/30 transition-colors disabled:opacity-50"
      >
        {googleLoading ? (
          <span className="h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        )}
        {googleLoading ? 'Redirecting...' : 'Continue with Google'}
      </button>

      <p className="text-[11px] text-sage text-center mt-3">
        Creates a free account to manage your preferences
      </p>
    </div>
  );
}
