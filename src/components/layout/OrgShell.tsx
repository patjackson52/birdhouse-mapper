'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AdminSidebar, type SidebarItem } from '@/components/admin/AdminSidebar';
import { ContextBar } from './ContextBar';
import { AvatarMenu } from './AvatarMenu';

interface OrgShellProps {
  orgId: string;
  orgSlug: string;
  userEmail: string;
  children: React.ReactNode;
}

const ORG_NAV_ITEMS: SidebarItem[] = [
  { label: 'Dashboard', href: '/org' },
  { label: 'Properties', href: '/org/properties' },
  { type: 'section', label: 'People' },
  { label: 'Members', href: '/org/members' },
  { label: 'Roles', href: '/org/roles' },
  { type: 'section', label: 'Data' },
  { label: 'Knowledge', href: '/admin/knowledge' },
  { label: 'Item Types', href: '/org/types' },
  { label: 'Entity Types', href: '/org/entity-types' },
  { label: 'Data Vault', href: '/org/vault' },
  { label: 'AI Context', href: '/org/ai-context' },
  { label: 'Geo Layers', href: '/org/geo-layers' },
  { type: 'section', label: 'Config' },
  { label: 'Domains', href: '/org/domains' },
  { label: 'Access & Tokens', href: '/org/access' },
  { label: 'Settings', href: '/org/settings' },
];

export function OrgShell({ orgId, orgSlug, userEmail, children }: OrgShellProps) {
  const [orgName, setOrgName] = useState<string>(orgSlug);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    supabase
      .from('orgs')
      .select('name')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (data?.name) setOrgName(data.name);
      });
  }, [orgId]);

  return (
    <div className="h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)] flex flex-col overflow-hidden">
      <ContextBar
        orgName={orgName}
        orgHref="/org"
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
              title={orgName}
              items={ORG_NAV_ITEMS}
              onNavClick={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="hidden md:block">
          <AdminSidebar title={orgName} items={ORG_NAV_ITEMS} hideTitle />
        </div>
        <main className="flex-1 overflow-auto flex flex-col">{children}</main>
      </div>
    </div>
  );
}
