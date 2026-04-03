'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getKnowledgeItems, deleteKnowledgeItem } from '@/lib/knowledge/actions';
import type { KnowledgeItem } from '@/lib/knowledge/types';
import Link from 'next/link';

export default function KnowledgeListPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'' | 'org' | 'public'>('');
  const [activeTag, setActiveTag] = useState<string>('');

  const allTags = [...new Set(items.flatMap((i) => i.tags))].sort();

  const loadData = useCallback(
    async (currentOrgId: string) => {
      const filters: { search?: string; tags?: string[]; visibility?: 'org' | 'public' } = {};
      if (search.trim()) filters.search = search.trim();
      if (activeTag) filters.tags = [activeTag];
      if (visibilityFilter) filters.visibility = visibilityFilter;

      const { items: data } = await getKnowledgeItems(currentOrgId, filters);
      setItems(data);
    },
    [search, activeTag, visibilityFilter]
  );

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
      await loadData(id);
      setLoading(false);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (orgId) loadData(orgId);
  }, [orgId, loadData]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this article? This cannot be undone.')) return;
    await deleteKnowledgeItem(id);
    if (orgId) loadData(orgId);
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-48 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-forest-dark">Knowledge</h1>
          <p className="text-sm text-sage mt-1">Manage how-to guides, reference articles, and documentation.</p>
        </div>
        <Link href="/admin/knowledge/new" className="btn-primary text-sm">
          + New Article
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Search articles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field text-sm w-52"
        />
        <select
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value as '' | 'org' | 'public')}
          className="input-field text-sm"
        >
          <option value="">All visibility</option>
          <option value="org">Org only</option>
          <option value="public">Public</option>
        </select>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setActiveTag('')}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${!activeTag ? 'bg-sage text-white' : 'bg-sage-light text-forest-dark'}`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
                className={`text-xs px-2 py-1 rounded-full transition-colors ${activeTag === tag ? 'bg-sage text-white' : 'bg-sage-light text-forest-dark'}`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sage">No knowledge articles yet.</p>
          <Link href="/admin/knowledge/new" className="text-sm text-sage hover:text-forest-dark mt-2 inline-block">
            Create your first article →
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sage-light bg-parchment/50">
                <th className="text-left px-4 py-3 font-medium text-sage text-xs uppercase">Title</th>
                <th className="text-left px-4 py-3 font-medium text-sage text-xs uppercase">Tags</th>
                <th className="text-left px-4 py-3 font-medium text-sage text-xs uppercase">Visibility</th>
                <th className="text-left px-4 py-3 font-medium text-sage text-xs uppercase">AI</th>
                <th className="text-left px-4 py-3 font-medium text-sage text-xs uppercase">Updated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-sage-light/50 hover:bg-parchment/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/admin/knowledge/${item.slug}`} className="font-medium text-forest-dark hover:text-sage transition-colors">
                      {item.title}
                    </Link>
                    {item.excerpt && (
                      <p className="text-xs text-sage mt-0.5 line-clamp-1">{item.excerpt}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.tags.map((tag) => (
                        <span key={tag} className="text-[10px] bg-forest/10 text-forest-dark px-1.5 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${item.visibility === 'public' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {item.visibility}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {item.is_ai_context && <span title="Included in AI context">⭐</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-sage">
                    {new Date(item.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-red-500 hover:text-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
