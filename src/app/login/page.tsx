'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Footer from '@/components/layout/Footer';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/manage';
  const authError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    authError === 'auth' ? 'Authentication failed. Please try again.' : ''
  );
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [existingUser, setExistingUser] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setExistingUser(user.email);
      }
      setCheckingSession(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // Full page navigation to ensure middleware picks up the new session cookies
    window.location.href = redirect;
  }

  async function handleGoogleSignIn() {
    setError('');
    setGoogleLoading(true);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(redirect)}`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
    // On success the browser navigates away; no need to reset loading state
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setExistingUser(null);
  }

  if (checkingSession) {
    return (
      <div className="w-full max-w-sm flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (existingUser) {
    return (
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl mb-3 block">📍</span>
          <h1 className="font-heading text-2xl font-semibold text-forest-dark">
            Welcome back
          </h1>
        </div>
        <div className="card space-y-4 text-center">
          <p className="text-sm text-gray-600">
            You&apos;re signed in as
          </p>
          <p className="font-medium text-gray-900">{existingUser}</p>
          <a
            href="/"
            className="btn-primary w-full block text-center"
          >
            Continue to your organization &rarr;
          </a>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sign in as a different account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <span className="text-4xl mb-3 block">📍</span>
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">
          Sign In
        </h1>
        <p className="text-sm text-sage mt-1">
          Access the management portal
        </p>
      </div>

      <div className="card space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {googleLoading ? (
            <span className="h-5 w-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}
          {googleLoading ? 'Redirecting...' : 'Continue with Google'}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Email/password */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="btn-primary w-full"
          >
            {loading ? 'Signing in...' : 'Sign In with Email'}
          </button>
        </form>
      </div>

      <p className="text-xs text-sage text-center mt-4">
        This portal is for project administrators only.
        <br />
        Contact the project lead for access.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="pb-20 md:pb-0">
      <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
        <Suspense fallback={<LoadingSpinner />}>
          <LoginForm />
        </Suspense>
      </div>
      <Footer />
    </div>
  );
}
