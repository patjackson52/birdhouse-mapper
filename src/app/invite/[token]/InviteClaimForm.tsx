'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { completeInviteClaim } from './actions';

export default function InviteClaimForm({
  token,
  displayName,
  sessionExpiresAt,
}: {
  token: string;
  displayName: string | null;
  sessionExpiresAt: string;
}) {
  const [name, setName] = useState(displayName || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const expiryDate = new Date(sessionExpiresAt);
  const expiryDisplay = expiryDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Step 1: Call signInAnonymously via browser client (sets session cookies)
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();

    if (authError || !authData.user) {
      setError('Failed to create session. Please try again.');
      setLoading(false);
      return;
    }

    // Step 2: Server action creates profile and claims invite via service role
    const result = await completeInviteClaim(token, authData.user.id, name);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Full page navigation to ensure middleware picks up the new session
    window.location.href = '/manage';
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-6">
        <span className="text-4xl mb-3 block">📍</span>
        {displayName ? (
          <>
            <h1 className="font-heading text-2xl font-semibold text-forest-dark">
              Welcome, {displayName}!
            </h1>
            <p className="text-sm text-sage mt-1">
              You&apos;ve been invited to contribute
            </p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-2xl font-semibold text-forest-dark">
              Welcome!
            </h1>
            <p className="text-sm text-sage mt-1">
              You&apos;ve been invited to contribute
            </p>
          </>
        )}
      </div>

      <div className="card">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        <div className="rounded-lg bg-sage-light px-4 py-3 mb-4">
          <div className="text-xs text-sage mb-1">Your access expires</div>
          <div className="text-sm font-semibold text-forest-dark">
            Today at {expiryDisplay}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!displayName && (
            <div>
              <label htmlFor="name" className="label">
                Your Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder="Enter your name"
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (!displayName && !name.trim())}
            className="btn-primary w-full"
          >
            {loading ? 'Setting up...' : 'Get Started'}
          </button>
        </form>

        <p className="text-xs text-sage text-center mt-3">
          By continuing you agree to contribute observations to this project
        </p>
      </div>
    </div>
  );
}
