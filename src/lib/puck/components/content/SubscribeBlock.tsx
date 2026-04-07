// src/lib/puck/components/content/SubscribeBlock.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SubscribeForm } from '@/components/communications/SubscribeForm';
import type { CommunicationTopic } from '@/lib/communications/types';
import { useConfig } from '@/lib/config/client';

export interface SubscribeBlockProps {
  heading: string;
  description: string;
  layout: 'compact' | 'expanded';
}

export function SubscribeBlock({ heading, description, layout }: SubscribeBlockProps) {
  const config = useConfig();
  const [topics, setTopics] = useState<CommunicationTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTopics() {
      const supabase = createClient();
      const { data } = await supabase
        .from('communication_topics')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      setTopics(data ?? []);
      setLoading(false);
    }
    fetchTopics();
  }, []);

  if (loading) {
    return (
      <div className={`${layout === 'expanded' ? 'py-8 px-6' : 'py-4 px-4'}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-sage-light/50 rounded w-1/3" />
          <div className="h-4 bg-sage-light/50 rounded w-2/3" />
          <div className="h-10 bg-sage-light/50 rounded" />
        </div>
      </div>
    );
  }

  if (topics.length === 0) return <></> ;

  return (
    <div className={`${layout === 'expanded' ? 'py-8 px-6' : 'py-4 px-4'}`}>
      <SubscribeForm
        topics={topics}
        heading={heading || `Get involved with ${config.siteName}`}
        description={description || "Choose what you'd like to hear about:"}
      />
    </div>
  );
}
