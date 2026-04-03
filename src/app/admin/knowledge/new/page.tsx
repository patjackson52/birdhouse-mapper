'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import KnowledgeEditor from '@/components/knowledge/KnowledgeEditor';
import type { KnowledgeItem } from '@/lib/knowledge/types';

export default function NewKnowledgePage() {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from('org_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (membership) setOrgId(membership.org_id as string);
    }
    init();
  }, []);

  function handleSaved(item: KnowledgeItem) {
    router.push(`/admin/knowledge/${item.slug}`);
  }

  if (!orgId) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse h-8 bg-sage-light rounded w-48" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">New Article</h1>
      <KnowledgeEditor orgId={orgId} onSaved={handleSaved} />
    </div>
  );
}
