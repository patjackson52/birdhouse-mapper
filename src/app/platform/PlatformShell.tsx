'use client';

import { AdminSidebar, type SidebarItem } from '@/components/admin/AdminSidebar';
import { AvatarMenu } from '@/components/layout/AvatarMenu';
import { useState } from 'react';

const PLATFORM_NAV_ITEMS: SidebarItem[] = [
  { label: 'Dashboard', href: '/platform' },
  { label: 'Organizations', href: '/platform/orgs' },
  { label: 'Tier Reference', href: '/platform/tiers' },
];

interface PlatformShellProps {
  userEmail: string;
  children: React.ReactNode;
}

export function PlatformShell({ userEmail, children }: PlatformShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Header — indigo accent to distinguish from org admin (amber) */}
      <div className="bg-indigo-800 text-white flex-shrink-0">
        <div className="px-4 flex items-center justify-between h-12">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <button
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="md:hidden text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="font-medium truncate leading-none">Platform Admin</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <AvatarMenu userEmail={userEmail} />
          </div>
        </div>
      </div>

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
              title="Platform Admin"
              items={PLATFORM_NAV_ITEMS}
              onNavClick={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        <div className="hidden md:block">
          <AdminSidebar title="Platform Admin" items={PLATFORM_NAV_ITEMS} hideTitle />
        </div>
        <main className="flex-1 overflow-auto flex flex-col">{children}</main>
      </div>
    </div>
  );
}
