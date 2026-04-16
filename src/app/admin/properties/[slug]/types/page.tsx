'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ItemType, CustomField, EntityType, IconValue } from '@/lib/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ItemTypeEditor from '@/components/admin/ItemTypeEditor';
import LayoutEditor from '@/components/layout/builder/LayoutEditor';
import { saveTypeWithLayout } from './layout-actions';

export default function TypesPage() {
  const queryClient = useQueryClient();
  const params = useParams();
  const slug = params.slug as string;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📍');
  const [newColor, setNewColor] = useState('#5D7F3A');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'layout' | 'fields' | 'settings'>('layout');

  const { data, isLoading: loading } = useQuery({
    queryKey: ['admin', 'property', slug, 'types'],
    queryFn: async () => {
      const supabase = createClient();

      const [typeRes, itemRes, fieldRes, entityRes] = await Promise.all([
        supabase.from('item_types').select('*').order('sort_order', { ascending: true }),
        supabase.from('items').select('id, item_type_id'),
        supabase.from('custom_fields').select('*').order('sort_order', { ascending: true }),
        supabase.from('entity_types').select('*').order('sort_order', { ascending: true }),
      ]);

      const itemTypes: ItemType[] = typeRes.data ?? [];
      const customFields: CustomField[] = fieldRes.data ?? [];
      const entityTypes: EntityType[] = entityRes.data ?? [];

      // Count items per type
      const itemCounts: Record<string, number> = {};
      if (itemRes.data) {
        for (const item of itemRes.data) {
          itemCounts[item.item_type_id] = (itemCounts[item.item_type_id] || 0) + 1;
        }
      }

      return { itemTypes, itemCounts, customFields, entityTypes };
    },
  });

  const itemTypes = data?.itemTypes ?? [];
  const itemCounts = data?.itemCounts ?? {};
  const customFields = data?.customFields ?? [];
  const entityTypes = data?.entityTypes ?? [];

  async function handleAddType(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    setAdding(true);
    setAddError('');

    try {
      const supabase = createClient();
      const maxSortOrder = itemTypes.length > 0 ? Math.max(...itemTypes.map((t) => t.sort_order)) : -1;

      const { data, error } = await supabase
        .from('item_types')
        .insert({ name: newName.trim(), icon: newIcon, color: newColor, sort_order: maxSortOrder + 1 })
        .select()
        .single();

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['admin', 'property', slug, 'types'] });
      setNewName('');
      setNewIcon('📍');
      setNewColor('#5D7F3A');
      setShowAddForm(false);
      setExpandedId(data.id);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add type.');
    }
    setAdding(false);
  }

  async function handleSaveType(id: string, updates: { name: string; icon: IconValue; color: string; sort_order: number }) {
    const supabase = createClient();
    const { error } = await supabase.from('item_types').update(updates).eq('id', id);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ['admin', 'property', slug, 'types'] });
  }

  async function handleDeleteType(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('item_types').delete().eq('id', id);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ['admin', 'property', slug, 'types'] });
    if (expandedId === id) setExpandedId(null);
  }

  async function handleReorder(id: string, direction: 'up' | 'down') {
    const index = itemTypes.findIndex((t) => t.id === id);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= itemTypes.length) return;

    const supabase = createClient();
    const current = itemTypes[index];
    const swap = itemTypes[swapIndex];

    await Promise.all([
      supabase.from('item_types').update({ sort_order: swap.sort_order }).eq('id', current.id),
      supabase.from('item_types').update({ sort_order: current.sort_order }).eq('id', swap.id),
    ]);

    await queryClient.invalidateQueries({ queryKey: ['admin', 'property', slug, 'types'] });
  }

  if (loading) return <LoadingSpinner className="py-12" />;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">Item Types</h1>
        <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary text-sm">
          + Add Type
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleAddType} className="card mb-6 space-y-4">
          <h2 className="font-heading text-lg font-semibold text-forest-dark">New Item Type</h2>
          {addError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{addError}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Name *</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="label">Icon (emoji)</label>
              <input type="text" value={newIcon} onChange={(e) => setNewIcon(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">Color</label>
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="input-field h-10" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={adding} className="btn-primary text-sm">
              {adding ? 'Adding...' : 'Add Type'}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Empty state */}
      {itemTypes.length === 0 && !showAddForm && (
        <div className="card text-center py-12">
          <p className="text-sage mb-4">No item types configured yet. Add your first item type to get started.</p>
          <button onClick={() => setShowAddForm(true)} className="btn-primary">
            + Add Your First Type
          </button>
        </div>
      )}

      {/* Item type list */}
      <div className="space-y-3">
        {itemTypes.map((type, index) => (
          <div key={type.id}>
            <ItemTypeEditor
              itemType={type}
              itemCount={itemCounts[type.id] || 0}
              isExpanded={expandedId === type.id}
              onToggleExpand={() => setExpandedId(expandedId === type.id ? null : type.id)}
              onSave={(updates) => handleSaveType(type.id, updates)}
              onDelete={() => handleDeleteType(type.id)}
              onMoveUp={() => handleReorder(type.id, 'up')}
              onMoveDown={() => handleReorder(type.id, 'down')}
              isFirst={index === 0}
              isLast={index === itemTypes.length - 1}
            />
            {expandedId === type.id && (
              <div className="card mt-2">
                <div className="flex border-b border-sage-light mb-4">
                  {(['layout', 'fields', 'settings'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 text-sm font-medium ${
                        activeTab === tab
                          ? 'text-forest border-b-2 border-forest'
                          : 'text-sage hover:text-forest-dark'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                {activeTab === 'layout' && (
                  <LayoutEditor
                    itemType={type}
                    initialLayout={type.layout}
                    customFields={customFields.filter((f) => f.item_type_id === type.id)}
                    entityTypes={entityTypes}
                    onSave={async (layout, newFields) => {
                      const fieldsForType = customFields.filter((f) => f.item_type_id === type.id);
                      const result = await saveTypeWithLayout({
                        itemTypeId: type.id,
                        layout,
                        newFields: newFields.map((f, i) => ({
                          ...f,
                          options: f.options.length > 0 ? f.options : null,
                          sort_order: fieldsForType.length + i,
                        })),
                      });
                      if (result && 'error' in result) throw new Error(result.error);
                      queryClient.invalidateQueries({ queryKey: ['admin', 'property', slug, 'types'] });
                    }}
                    onCancel={() => setActiveTab('settings')}
                  />
                )}
                {activeTab === 'fields' && (
                  <p className="text-sage text-sm py-4">Custom fields are managed within the type editor above.</p>
                )}
                {activeTab === 'settings' && (
                  <p className="text-sage text-sm py-4">Settings are managed within the type editor above.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
