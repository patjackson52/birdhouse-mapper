// src/components/communications/SubscribePrompt.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SubscribeForm } from './SubscribeForm';
import type { CommunicationTopic } from '@/lib/communications/types';

interface SubscribePromptProps {
  topics: CommunicationTopic[];
  siteName: string;
}

export function SubscribePrompt({ topics, siteName }: SubscribePromptProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const shouldSuppress = useCallback(() => {
    if (typeof document === 'undefined') return true;
    // Check suppression cookies
    if (document.cookie.includes('fm_prompt_dismissed')) return true;
    if (document.cookie.includes('fm_prompt_subscribed')) return true;
    return false;
  }, []);

  useEffect(() => {
    if (shouldSuppress()) return;
    if (topics.length === 0) return;

    // Check if user is authenticated — don't show to logged-in users
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) return;

      // Set up triggers: 30s timer OR scroll past fold
      let triggered = false;

      function trigger() {
        if (triggered) return;
        triggered = true;
        setVisible(true);
        window.removeEventListener('scroll', handleScroll);
        clearTimeout(timer);
      }

      const timer = setTimeout(trigger, 30_000);

      function handleScroll() {
        if (window.scrollY > window.innerHeight * 0.5) {
          trigger();
        }
      }

      window.addEventListener('scroll', handleScroll, { passive: true });

      return () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', handleScroll);
      };
    });
  }, [shouldSuppress, topics.length]);

  function handleDismiss() {
    setDismissed(true);
    setVisible(false);
    // Set cookie to suppress for 30 days
    document.cookie = 'fm_prompt_dismissed=1; max-age=2592000; path=/; samesite=lax';
  }

  function handleSuccess() {
    setVisible(false);
    document.cookie = 'fm_prompt_subscribed=1; max-age=31536000; path=/; samesite=lax';
  }

  if (!visible || dismissed || topics.length === 0) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 md:hidden"
        onClick={handleDismiss}
      />
      {/* Mobile: bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden animate-slide-up">
        <div className="bg-white rounded-t-2xl shadow-xl p-5 pb-8 safe-area-pb">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-1 bg-sage-light rounded-full mx-auto" />
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-1 text-sage hover:text-forest-dark"
              aria-label="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <SubscribeForm
            topics={topics}
            heading={`Stay updated on ${siteName}`}
            description="Get notified about opportunities and updates."
            onSuccess={handleSuccess}
          />
        </div>
      </div>
      {/* Desktop: slide-in from bottom-right */}
      <div className="hidden md:block fixed bottom-6 right-6 z-50 w-96 animate-slide-up">
        <div className="bg-white rounded-xl shadow-xl border border-sage-light p-5 relative">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1 text-sage hover:text-forest-dark"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <SubscribeForm
            topics={topics}
            heading={`Stay updated on ${siteName}`}
            description="Get notified about opportunities and updates."
            onSuccess={handleSuccess}
          />
        </div>
      </div>
    </>
  );
}
