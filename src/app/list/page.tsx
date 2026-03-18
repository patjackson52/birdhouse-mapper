'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Item, ItemStatus, ItemType, CustomField } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import ItemCard from '@/components/item/ItemCard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Footer from '@/components/layout/Footer';

type SortOption = 'name' | 'date' | 'status';

export default function ListPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ItemStatus | 'all'>('all');
  const [sort, setSort] = useState<SortOption>('name');

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const [itemRes, typeRes, fieldRes] = await Promise.all([
        supabase.from('items').select('*').order('name', { ascending: true }),
        supabase.from('item_types').select('*').order('sort_order', { ascending: true }),
        supabase.from('custom_fields').select('*').order('sort_order', { ascending: true }),
      ]);

      if (itemRes.data) setItems(itemRes.data);
      if (typeRes.data) setItemTypes(typeRes.data);
      if (fieldRes.data) setCustomFields(fieldRes.data);
      setLoading(false);
    }

    fetchData();
  }, []);

  const typeMap = new Map(itemTypes.map((t) => [t.id, t]));

  const filtered = items.filter((item) =>
    filter === 'all' ? true : item.status === filter
  );

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'date':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'status':
        return a.status.localeCompare(b.status);
      default:
        return 0;
    }
  });

  return (
    <div className="pb-20 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-forest-dark">
              All Items
            </h1>
            <p className="text-sm text-sage mt-1">
              {items.length} item{items.length !== 1 ? 's' : ''} tracked
            </p>
          </div>
          <Link
            href="/"
            className="btn-secondary text-sm"
          >
            View on Map
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <label htmlFor="filter" className="text-xs font-medium text-sage">
              Filter:
            </label>
            <select
              id="filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value as ItemStatus | 'all')}
              className="input-field w-auto text-sm py-1.5"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="planned">Planned</option>
              <option value="damaged">Needs Repair</option>
              <option value="removed">Removed</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="sort" className="text-xs font-medium text-sage">
              Sort:
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="input-field w-auto text-sm py-1.5"
            >
              <option value="name">Name</option>
              <option value="date">Date</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>

        {/* Loading */}
        {loading && <LoadingSpinner className="py-12" />}

        {/* Grid */}
        {!loading && sorted.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sage text-sm">No items found.</p>
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                itemType={typeMap.get(item.item_type_id)}
                customFields={customFields.filter((f) => f.item_type_id === item.item_type_id)}
              />
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
