// src/app/org/settings/communications/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TopicWithCount } from '@/lib/communications/types';

interface PropertyOption {
  id: string;
  name: string;
  slug: string;
}

export default function CommunicationsSettingsPage() {
  const [topics, setTopics] = useState<TopicWithCount[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTopic, setEditingTopic] = useState<TopicWithCount | null>(null);
  const [orgId, setOrgId] = useState<string>('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPropertyId, setFormPropertyId] = useState<string>('');
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      // Get org_id from cookie/header
      const cookies = document.cookie.split(';').map((c) => c.trim());
      const orgIdCookie = cookies.find((c) => c.startsWith('x-org-id='));
      const currentOrgId = orgIdCookie?.split('=')[1] || '';
      setOrgId(currentOrgId);

      if (!currentOrgId) {
        setLoading(false);
        return;
      }

      const [topicsResult, propsResult] = await Promise.all([
        supabase
          .from('communication_topics')
          .select('*, user_subscriptions(count)')
          .eq('org_id', currentOrgId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('properties')
          .select('id, name, slug')
          .eq('org_id', currentOrgId)
          .eq('is_active', true)
          .order('name'),
      ]);

      setTopics(
        (topicsResult.data ?? []).map((t) => ({
          ...t,
          subscriber_count: (t as { user_subscriptions?: { count: number }[] }).user_subscriptions?.[0]?.count ?? 0,
        }))
      );
      setProperties(propsResult.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  function openCreateForm() {
    setEditingTopic(null);
    setFormName('');
    setFormDescription('');
    setFormPropertyId('');
    setFormSortOrder(topics.length);
    setShowForm(true);
    setError('');
  }

  function openEditForm(topic: TopicWithCount) {
    setEditingTopic(topic);
    setFormName(topic.name);
    setFormDescription(topic.description ?? '');
    setFormPropertyId(topic.property_id ?? '');
    setFormSortOrder(topic.sort_order);
    setShowForm(true);
    setError('');
  }

  async function handleSave() {
    if (!formName.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');

    const supabase = createClient();

    if (editingTopic) {
      const { error: updateError } = await supabase
        .from('communication_topics')
        .update({
          name: formName.trim(),
          description: formDescription.trim() || null,
          property_id: formPropertyId || null,
          sort_order: formSortOrder,
        })
        .eq('id', editingTopic.id);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      setTopics((prev) =>
        prev.map((t) =>
          t.id === editingTopic.id
            ? { ...t, name: formName.trim(), description: formDescription.trim() || null, property_id: formPropertyId || null, sort_order: formSortOrder }
            : t
        )
      );
    } else {
      const { data, error: insertError } = await supabase
        .from('communication_topics')
        .insert({
          org_id: orgId,
          property_id: formPropertyId || null,
          name: formName.trim(),
          description: formDescription.trim() || null,
          sort_order: formSortOrder,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }

      setTopics((prev) => [...prev, { ...data, subscriber_count: 0 }]);
    }

    setShowForm(false);
    setSaving(false);
  }

  async function handleToggleActive(topic: TopicWithCount) {
    const supabase = createClient();
    const newActive = !topic.is_active;
    await supabase
      .from('communication_topics')
      .update({ is_active: newActive })
      .eq('id', topic.id);

    setTopics((prev) =>
      prev.map((t) => (t.id === topic.id ? { ...t, is_active: newActive } : t))
    );
  }

  if (loading) {
    return (
      <div className="card p-6 animate-pulse space-y-4">
        <div className="h-6 bg-sage-light/50 rounded w-1/3" />
        <div className="h-4 bg-sage-light/50 rounded w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-forest-dark">Communication Topics</h2>
        <button onClick={openCreateForm} className="btn-primary text-sm">
          Add Topic
        </button>
      </div>

      {/* Topic list */}
      <div className="card divide-y divide-sage-light">
        {topics.length === 0 ? (
          <div className="px-4 py-8 text-center text-sage text-sm">
            No topics yet. Create one to start collecting subscribers.
          </div>
        ) : (
          topics.map((topic) => (
            <div key={topic.id} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${topic.is_active ? 'text-forest-dark' : 'text-sage line-through'}`}>
                    {topic.name}
                  </p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sage-light text-sage">
                    {topic.property_id
                      ? properties.find((p) => p.id === topic.property_id)?.name ?? 'Property'
                      : 'All properties'}
                  </span>
                </div>
                {topic.description && (
                  <p className="text-xs text-sage mt-0.5">{topic.description}</p>
                )}
                <p className="text-[10px] text-sage mt-1">{topic.subscriber_count} subscriber{topic.subscriber_count !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleActive(topic)}
                  className={`text-xs px-2 py-1 rounded ${topic.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                >
                  {topic.is_active ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => openEditForm(topic)}
                  className="text-xs text-forest hover:underline"
                >
                  Edit
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading font-semibold text-forest-dark mb-4">
              {editingTopic ? 'Edit Topic' : 'New Topic'}
            </h3>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">{error}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="input-field"
                  placeholder="e.g., Volunteer Opportunities"
                />
              </div>
              <div>
                <label className="label">Description</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="input-field"
                  placeholder="Brief description shown to subscribers"
                />
              </div>
              <div>
                <label className="label">Scope</label>
                <select
                  value={formPropertyId}
                  onChange={(e) => setFormPropertyId(e.target.value)}
                  className="input-field"
                >
                  <option value="">All properties (org-wide)</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Sort Order</label>
                <input
                  type="number"
                  value={formSortOrder}
                  onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                  className="input-field"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving...' : editingTopic ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
