'use client';

import { useEffect, useState } from 'react';
import { getKnowledgeItems } from '@/lib/knowledge/actions';
import type { KnowledgeItem } from '@/lib/knowledge/types';
import type { KnowledgeListProps } from '../../types';
import { proseSizeClasses } from '../../text-styles';

export function KnowledgeList({ tagFilter = [], maxItems = 6, layout = 'grid', columns = 3, textSize = 'medium' }: KnowledgeListProps) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // For public Puck pages, we need to fetch public knowledge items
      // This relies on the RLS policy allowing public visibility reads
      const { items: data } = await getKnowledgeItems('', {
        tags: tagFilter.length > 0 ? tagFilter : undefined,
        visibility: 'public',
      });
      setItems(data.slice(0, maxItems));
      setLoading(false);
    }
    load();
  }, [tagFilter, maxItems]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className={`grid gap-6 ${columns === 2 ? 'grid-cols-1 md:grid-cols-2' : columns === 4 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
          {Array.from({ length: maxItems }).map((_, i) => (
            <div key={i} className="animate-pulse h-48 bg-sage-light rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 text-center">
        <p className="text-sage text-sm">No knowledge articles available.</p>
      </div>
    );
  }

  const proseSize = proseSizeClasses[textSize];

  if (layout === 'list') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-4">
        {items.map((item) => (
          <a key={item.id} href={`/knowledge/${item.slug}`} className="block card p-4 hover:shadow-md transition-shadow">
            <div className="flex gap-4">
              {item.cover_image_url && (
                <img src={item.cover_image_url} alt="" className="w-20 h-20 object-cover rounded" />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-heading font-semibold text-forest-dark">{item.title}</h3>
                {item.excerpt && <p className={`text-sage mt-1 ${proseSize} line-clamp-2`}>{item.excerpt}</p>}
                {item.tags.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {item.tags.map((tag) => (
                      <span key={tag} className="text-[10px] bg-forest/10 text-forest-dark px-1.5 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    );
  }

  // Grid layout
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className={`grid gap-6 ${columns === 2 ? 'grid-cols-1 md:grid-cols-2' : columns === 4 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
        {items.map((item) => (
          <a key={item.id} href={`/knowledge/${item.slug}`} className="card overflow-hidden hover:shadow-md transition-shadow">
            {item.cover_image_url && (
              <img src={item.cover_image_url} alt="" className="w-full h-40 object-cover" />
            )}
            <div className="p-4">
              <h3 className="font-heading font-semibold text-forest-dark">{item.title}</h3>
              {item.excerpt && <p className={`text-sage mt-1 text-sm line-clamp-3`}>{item.excerpt}</p>}
              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {item.tags.map((tag) => (
                    <span key={tag} className="text-[10px] bg-forest/10 text-forest-dark px-1.5 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
