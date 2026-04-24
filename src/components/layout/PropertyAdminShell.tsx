'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AdminSidebar, type SidebarItem } from '@/components/admin/AdminSidebar';
import { ContextBar } from './ContextBar';
import { AvatarMenu } from './AvatarMenu';
import type { EntityType } from '@/lib/types';
import { iconDisplayName } from '@/lib/types';

interface PropertyAdminShellProps {
  orgId: string;
  orgSlug: string;
  propertySlug: string;
  userEmail: string;
  children: React.ReactNode;
}

export function PropertyAdminShell({
  orgId,
  orgSlug,
  propertySlug,
  userEmail,
  children,
}: PropertyAdminShellProps) {
  const [orgName, setOrgName] = useState<string>(orgSlug);
  const [propertyName, setPropertyName] = useState<string>(propertySlug);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('orgs')
      .select('name')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (data?.name) setOrgName(data.name);
      });

    supabase
      .from('properties')
      .select('name, org_id')
      .eq('slug', propertySlug)
      .single()
      .then(({ data }) => {
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
  }, [orgId, propertySlug]);

  const base = `/p/${propertySlug}/admin`;
  const items: SidebarItem[] = [
    { label: 'Dashboard', href: base },
    { type: 'section', label: 'Field Work' },
    { label: 'Map', href: `/p/${propertySlug}` },
    { label: 'Data', href: `${base}/data` },
    { label: 'Maintenance', href: `${base}/maintenance` },
    { label: 'Geo Layers', href: `${base}/geo-layers/discover` },
    { label: 'Parcel Lookup', href: `${base}/parcel-lookup` },
    { type: 'section', label: 'Content' },
    { label: 'Data Vault', href: `${base}/vault` },
    { type: 'section', label: 'Site' },
    { label: 'Landing Page', href: `${base}/landing` },
    { label: 'Site Builder', href: `${base}/site-builder/templates` },
    { label: 'QR Codes', href: `${base}/qr-codes` },
    ...entityTypes.map((et) => ({
      label: `${iconDisplayName(et.icon)} ${et.name}`,
      href: `${base}/entities/${et.id}`,
    })),
    { type: 'section', label: 'People' },
    { label: 'Members', href: `${base}/members` },
    { label: 'Invites', href: `${base}/invites` },
    { type: 'section', label: 'Config' },
    { label: 'Settings', href: `${base}/settings` },
  ];

  const backLink = { label: `Back to ${orgName}`, href: '/org' };

  return (
    <div className="h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)] flex flex-col overflow-hidden">
      <ContextBar
        orgName={orgName}
        orgHref="/org"
        propertyName={propertyName}
        propertyHref={base}
        leftContent={
          <button
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            className="md:hidden text-white/80 hover:text-white transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <rect x="2" y="4" width="16" height="2" rx="1" />
              <rect x="2" y="9" width="16" height="2" rx="1" />
              <rect x="2" y="14" width="16" height="2" rx="1" />
            </svg>
          </button>
        }
        rightContent={<AvatarMenu userEmail={userEmail} />}
      />

      {/* Mobile drawer */}
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

      <div className="flex flex-1 min-h-0">
        <div className="hidden md:block">
          <AdminSidebar title={propertyName} items={items} backLink={backLink} hideTitle />
        </div>
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </div>
    </div>
  );
}
