'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AdminSidebar, type SidebarItem } from '@/components/admin/AdminSidebar';

interface AdminShellProps {
  orgId: string;
  orgSlug: string;
  propertyId: string | null;
  propertySlug: string | null;
  children: React.ReactNode;
}

const ORG_NAV_ITEMS: SidebarItem[] = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Properties', href: '/admin/properties' },
  { label: 'Members', href: '/admin/members' },
  { label: 'Roles', href: '/admin/roles' },
  { type: 'section', label: 'Data' },
  { label: 'Data Vault', href: '/admin/vault' },
  { label: 'AI Context', href: '/admin/ai-context' },
  { label: 'Geo Layers', href: '/admin/geo-layers' },
  { type: 'section', label: 'Settings' },
  { label: 'Domains', href: '/admin/domains' },
  { label: 'Access & Tokens', href: '/admin/access' },
  { label: 'Org Settings', href: '/admin/settings' },
];

export function AdminShell({
  orgId,
  orgSlug,
  propertyId,
  propertySlug,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [orgName, setOrgName] = useState<string>(orgSlug);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Detect if we're on a property sub-route — the property layout handles its own sidebar
  const isPropertyRoute =
    pathname != null && /^\/admin\/properties\/[^/]+/.test(pathname);

  // True when we're on /admin but have a property context (property domain) and are about
  // to redirect — we suppress the org sidebar during this brief moment.
  const isPropertyDomainRoot =
    propertyId != null && propertySlug != null && pathname === '/admin';

  useEffect(() => {
    // If we're on /admin with a property context (property domain),
    // redirect to the property admin
    if (propertyId && propertySlug && pathname === '/admin') {
      router.replace(`/admin/properties/${propertySlug}`);
    }
  }, [propertyId, propertySlug, pathname, router]);

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

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <div className="h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)] flex flex-col overflow-hidden">
      {/* Top header bar */}
      <div className="bg-amber-800 text-white flex-shrink-0">
        <div className="px-4 flex items-center justify-between h-12">
          <div className="flex items-center gap-3">
            {!isPropertyRoute && !isPropertyDomainRoot && (
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
            )}
            <span className="text-sm font-medium">Admin</span>
          </div>
          <button
            onClick={handleSignOut}
            className="text-white/60 hover:text-white text-sm transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Mobile drawer overlay */}
      {drawerOpen && !isPropertyRoute && !isPropertyDomainRoot && (
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

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0">
        {!isPropertyRoute && !isPropertyDomainRoot && (
          <div className="hidden md:block">
            <AdminSidebar
              title={orgName}
              items={ORG_NAV_ITEMS}
            />
          </div>
        )}
        <main className="flex-1 overflow-auto flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
