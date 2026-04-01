'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Item, ItemStatus, ItemType, CustomField } from '@/lib/types';
import { useOfflineStore } from '@/lib/offline/provider';
import { useConfig } from '@/lib/config/client';
import ItemCard from '@/components/item/ItemCard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Footer from '@/components/layout/Footer';
import { useUserLocation } from '@/lib/location/provider';
import { getDistanceToItem } from '@/lib/location/utils';

type SortOption = 'name' | 'date' | 'status' | 'distance';

export default function ListPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ItemStatus | 'all'>('all');
  const [sort, setSort] = useState<SortOption>('name');
  const { position } = useUserLocation();
  const config = useConfig();
  const propertyId = config.propertyId;
  const offlineStore = useOfflineStore();

  useEffect(() => {
    async function fetchData() {
      if (!propertyId) { setLoading(false); return; }

      // Resolve orgId from the properties table in IndexedDB
      let property = await offlineStore.db.properties.get(propertyId);

      // If no property in IndexedDB yet and we're online, bootstrap from Supabase
      if (!property && offlineStore.isOnline) {
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          const { data: propData } = await supabase.from('properties').select('*').eq('id', propertyId).single();
          if (propData) {
            await offlineStore.db.properties.put({ ...propData, _synced_at: new Date().toISOString() });
            await offlineStore.syncProperty(propertyId, propData.org_id);
            property = await offlineStore.db.properties.get(propertyId);
          }
        } catch {
          // Fall through to read whatever is cached
        }
      }

      const orgId = property?.org_id;

      const [itemData, typeData, fieldData] = await Promise.all([
        offlineStore.getItems(propertyId),
        orgId ? offlineStore.getItemTypes(orgId) : Promise.resolve([]),
        orgId ? offlineStore.getCustomFields(orgId) : Promise.resolve([]),
      ]);

      setItems(itemData);
      setItemTypes(typeData);
      setCustomFields(fieldData);
      setLoading(false);

      // Background sync refresh
      if (orgId && offlineStore.isOnline) {
        offlineStore.syncProperty(propertyId, orgId).then(async () => {
          const [freshItems, freshTypes, freshFields] = await Promise.all([
            offlineStore.getItems(propertyId),
            offlineStore.getItemTypes(orgId!),
            offlineStore.getCustomFields(orgId!),
          ]);
          setItems(freshItems);
          setItemTypes(freshTypes);
          setCustomFields(freshFields);
        });
      }
    }

    fetchData();
  }, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      case 'distance': {
        if (!position) return 0;
        const dA = getDistanceToItem(position, a) ?? Infinity;
        const dB = getDistanceToItem(position, b) ?? Infinity;
        return dA - dB;
      }
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
              {position && <option value="distance">Distance</option>}
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
                distance={getDistanceToItem(position, item)}
              />
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
