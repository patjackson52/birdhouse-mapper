'use client';

import { useEffect, useState } from 'react';
import { useConfig } from '@/lib/config/client';
import { useOfflineStore } from '@/lib/offline/provider';
import { OfflineCacheManager } from '@/components/manage/OfflineCacheManager';
import type { Property } from '@/lib/types';

export default function OfflinePage() {
  const config = useConfig();
  const { db } = useOfflineStore();
  const [properties, setProperties] = useState<Property[]>([]);
  const [orgId, setOrgId] = useState<string>('');

  useEffect(() => {
    async function loadProperties() {
      const orgs = await db.orgs.toArray();
      if (orgs.length > 0) { setOrgId(orgs[0].id); }
      const props = await db.properties.toArray();
      setProperties(props);
    }
    loadProperties();
  }, [db]);

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Offline Data</h1>
      <p className="text-gray-600 mb-6">
        Download data for offline use in the field. Cached data and maps will be
        available without an internet connection.
      </p>
      {orgId && <OfflineCacheManager orgId={orgId} properties={properties} />}
    </div>
  );
}
