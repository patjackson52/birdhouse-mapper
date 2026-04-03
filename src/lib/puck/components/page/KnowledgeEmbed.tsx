'use client';

import { useEffect, useState } from 'react';
import { getKnowledgeItem, getAttachments } from '@/lib/knowledge/actions';
import KnowledgeRenderer from '@/components/knowledge/KnowledgeRenderer';
import type { KnowledgeItem } from '@/lib/knowledge/types';
import type { KnowledgeEmbedProps } from '../../types';

export function KnowledgeEmbed({ knowledgeItemId, showTitle = true, showAttachments = true, textSize = 'medium' }: KnowledgeEmbedProps) {
  const [item, setItem] = useState<KnowledgeItem | null>(null);
  const [attachments, setAttachments] = useState<Array<{ vault_item_id: string; file_name: string; mime_type: string | null; file_size: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!knowledgeItemId) {
      setLoading(false);
      return;
    }

    async function load() {
      const { item: data } = await getKnowledgeItem(knowledgeItemId);
      setItem(data);

      if (data && showAttachments) {
        const { attachments: attachData } = await getAttachments(knowledgeItemId);
        setAttachments(attachData);
      }

      setLoading(false);
    }
    load();
  }, [knowledgeItemId, showAttachments]);

  if (loading) {
    return <div className="animate-pulse h-32 bg-sage-light rounded-lg mx-auto max-w-4xl" />;
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 text-center">
        <p className="text-sage text-sm">
          {knowledgeItemId ? 'Knowledge article not found.' : 'Select a knowledge article.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <KnowledgeRenderer
        item={item}
        showTitle={showTitle}
        showAttachments={showAttachments}
        textSize={textSize === 'xl' ? 'large' : textSize}
        attachments={attachments}
      />
    </div>
  );
}
