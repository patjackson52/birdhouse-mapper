'use client';

import { useParams } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PropertyAdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const slug = params.slug as string;
  const [propertyName, setPropertyName] = useState(slug);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('properties').select('name').eq('slug', slug).single().then(({ data }) => {
      if (data) setPropertyName(data.name);
    });
  }, [slug]);

  const base = `/admin/properties/${slug}`;
  const items = [
    { label: 'Data', href: `${base}/data` },
    { label: 'Settings', href: `${base}/settings` },
    { label: 'Landing Page', href: `${base}/landing` },
    { label: 'Types', href: `${base}/types` },
    { label: 'Species', href: `${base}/species` },
    { label: 'Members', href: `${base}/members` },
    { label: 'Invites', href: `${base}/invites` },
  ];

  return (
    <div className="flex flex-1 -m-6">
      <AdminSidebar
        title={propertyName}
        items={items}
        backLink={{ label: 'Back to Org', href: '/admin' }}
      />
      <div className="flex-1 p-6">
        {children}
      </div>
    </div>
  );
}
