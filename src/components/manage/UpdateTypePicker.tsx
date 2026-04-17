'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOfflineStore } from '@/lib/offline/provider';
import { useConfig } from '@/lib/config/client';
import { usePermissions } from '@/lib/permissions/hooks';
import { canPerformUpdateTypeAction } from '@/lib/permissions/resolve';
import { IconRenderer } from '@/components/shared/IconPicker';
import type { Item, UpdateType } from '@/lib/types';

interface UpdateTypePickerProps {
  itemId: string;
}

export default function UpdateTypePicker({ itemId }: UpdateTypePickerProps) {
  const router = useRouter();
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : null;

  const config = useConfig();
  const propertyId = config.propertyId;
  const offlineStore = useOfflineStore();
  const { userBaseRole, loading: permsLoading } = usePermissions();

  const [item, setItem] = useState<Item | null>(null);
  const [updateTypes, setUpdateTypes] = useState<UpdateType[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      if (!propertyId) return;
      const property = await offlineStore.db.properties.get(propertyId);
      const orgId = property?.org_id;
      if (!orgId) return;
      const [fetchedItem, types] = await Promise.all([
        offlineStore.getItem(itemId),
        offlineStore.getUpdateTypes(orgId),
      ]);
      setItem(fetchedItem ?? null);
      setUpdateTypes(types ?? []);
      setLoaded(true);
    }
    load();
  }, [itemId, propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const eligibleTypes = useMemo(() => {
    if (!item) return [];
    return updateTypes
      .filter((t) => t.is_global || t.item_type_id === item.item_type_id)
      .filter((t) => canPerformUpdateTypeAction(userBaseRole, t, 'create') !== false)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [item, updateTypes, userBaseRole]);

  // Auto-redirect when exactly one type is eligible.
  useEffect(() => {
    if (!loaded || permsLoading) return;
    if (eligibleTypes.length === 1 && slug) {
      router.replace(`/p/${slug}/update/${itemId}/${eligibleTypes[0].id}`);
    }
  }, [loaded, permsLoading, eligibleTypes, slug, itemId, router]);

  if (!loaded || permsLoading) {
    return (
      <div className="py-8 text-center text-sm text-sage">Loading…</div>
    );
  }

  if (eligibleTypes.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-sage mb-2">No update types configured.</p>
        <p className="text-xs text-sage">
          Ask an admin to set up update types in the admin panel.
        </p>
      </div>
    );
  }

  if (eligibleTypes.length === 1) {
    // Redirecting in the effect above; show a brief loading state.
    return <div className="py-8 text-center text-sm text-sage">Loading…</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {eligibleTypes.map((t) => (
        <Link
          key={t.id}
          href={slug ? `/p/${slug}/update/${itemId}/${t.id}` : `#`}
          className="card flex flex-col items-center justify-center gap-2 py-6 hover:border-forest transition-colors"
        >
          <span className="text-3xl" aria-hidden="true">
            {typeof t.icon === 'string' ? t.icon : <IconRenderer icon={t.icon} size={32} />}
          </span>
          <span className="text-sm font-medium text-forest-dark text-center">
            {t.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
