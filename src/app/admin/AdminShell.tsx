'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

interface AdminShellProps {
  orgId: string;
  orgSlug: string;
  propertyId: string | null;
  propertySlug: string | null;
  children: React.ReactNode;
}

const ORG_NAV_ITEMS = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Properties', href: '/admin/properties' },
  { label: 'Members', href: '/admin/members' },
  { label: 'Roles', href: '/admin/roles' },
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
      .from('organizations')
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
    <div className="min-h-screen flex flex-col">
      {/* Top header bar */}
      <div className="bg-amber-800 text-white flex-shrink-0">
        <div className="px-4 flex items-center justify-between h-12">
          <span className="text-sm font-medium">Admin</span>
          <button
            onClick={handleSignOut}
            className="text-white/60 hover:text-white text-sm transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1">
        {!isPropertyRoute && !isPropertyDomainRoot && (
          <AdminSidebar
            title={orgName}
            items={ORG_NAV_ITEMS}
          />
        )}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
