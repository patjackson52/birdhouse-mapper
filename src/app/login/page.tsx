'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Footer from '@/components/layout/Footer';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/manage';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Full page navigation to ensure middleware picks up the new session cookies
    window.location.href = redirect;
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

      <form onSubmit={handleSubmit} className="card space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

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
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

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
