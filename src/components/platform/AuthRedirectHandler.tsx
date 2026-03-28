'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Detects Supabase auth callback tokens in the URL hash fragment
 * (from email confirmation implicit flow) and redirects to /onboard.
 * Mount this on any page that might receive a redirect from Supabase auth.
 */
export function AuthRedirectHandler() {
  const router = useRouter();

  useEffect(() => {
    // Only act if the URL hash looks like a Supabase auth callback
    if (!window.location.hash.includes('access_token')) return;

    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        router.replace('/onboard');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
