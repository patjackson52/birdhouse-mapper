'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getKnowledgeItem } from '@/lib/knowledge/actions';
import KnowledgeEditor from '@/components/knowledge/KnowledgeEditor';
import type { KnowledgeItem } from '@/lib/knowledge/types';

export default function EditKnowledgePage() {
  const params = useParams();
  const slug = params.slug as string;
  const [orgId, setOrgId] = useState<string | null>(null);
  const [item, setItem] = useState<KnowledgeItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: membership } = await supabase
        .from('org_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!membership) { setLoading(false); return; }

      const id = membership.org_id as string;
      setOrgId(id);

      const { item: knowledgeItem } = await getKnowledgeItem(slug, id);
      setItem(knowledgeItem);
      setLoading(false);
    }
    init();
  }, [slug]);

  function handleSaved(updated: KnowledgeItem) {
    setItem(updated);
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-64 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  if (!item || !orgId) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <p className="text-sage">Article not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">Edit Article</h1>
      <KnowledgeEditor orgId={orgId} item={item} onSaved={handleSaved} />
    </div>
  );
}
