'use client';

import { useParams } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { EntityType } from '@/lib/types';

export default function PropertyAdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const slug = params.slug as string;
  const [propertyName, setPropertyName] = useState(slug);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('properties').select('name, org_id').eq('slug', slug).single().then(({ data }) => {
      if (data) {
        setPropertyName(data.name);
        supabase
          .from('entity_types')
          .select('*')
          .eq('org_id', data.org_id)
          .order('sort_order', { ascending: true })
          .then(({ data: etData }) => {
            if (etData) setEntityTypes(etData);
          });
      }
    });
  }, [slug]);

  const base = `/admin/properties/${slug}`;
  const items = [
    { label: 'Data', href: `${base}/data` },
    { label: 'Settings', href: `${base}/settings` },
    { label: 'Landing Page', href: `${base}/landing` },
    { label: 'QR Codes', href: `${base}/qr-codes` },
    { label: 'Types', href: `${base}/types` },
    { label: 'Entity Types', href: `${base}/entity-types` },
    ...entityTypes.map((et) => ({
      label: `${et.icon} ${et.name}`,
      href: `${base}/entities/${et.id}`,
    })),
    { label: 'Members', href: `${base}/members` },
    { label: 'Invites', href: `${base}/invites` },
  ];

  const backLink = { label: 'Back to Org', href: '/admin' };

  return (
    <div className="flex flex-col flex-1">
      {/* Mobile top nav bar */}
      <div className="md:hidden bg-parchment border-b border-sage-light flex-shrink-0">
        <div className="px-4 flex items-center h-12 gap-3">
          <button
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            className="text-forest-dark/80 hover:text-forest-dark transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <rect x="2" y="4" width="16" height="2" rx="1" />
              <rect x="2" y="9" width="16" height="2" rx="1" />
              <rect x="2" y="14" width="16" height="2" rx="1" />
            </svg>
          </button>
          <span className="text-sm font-medium text-forest-dark">{propertyName}</span>
        </div>
      </div>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 bottom-0 shadow-xl">
            <AdminSidebar
              title={propertyName}
              items={items}
              backLink={backLink}
              onNavClick={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Body: sidebar + content */}
      <div className="flex flex-1">
        {/* Desktop sidebar — hidden on mobile */}
        <div className="hidden md:block">
          <AdminSidebar
            title={propertyName}
            items={items}
            backLink={backLink}
          />
        </div>
        <div className="flex-1 p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
