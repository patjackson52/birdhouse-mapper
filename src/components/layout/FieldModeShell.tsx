'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MobileBottomTabs, type TabItem } from './MobileBottomTabs';
import { AvatarMenu } from './AvatarMenu';

interface FieldModeShellProps {
  propertyName: string;
  propertySlug: string;
  userEmail: string;
  children: React.ReactNode;
}

// SVG icon components (inline, no external deps)
function MapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export function FieldModeShell({ propertyName, propertySlug, userEmail, children }: FieldModeShellProps) {
  const pathname = usePathname();
  const base = `/p/${propertySlug}`;

  const tabs: TabItem[] = [
    { href: base, label: 'Map', icon: MapIcon },
    { href: `${base}/list`, label: 'List', icon: ListIcon },
    { href: `${base}/add`, label: 'Add', icon: PlusIcon },
    { href: `${base}/activity`, label: 'Activity', icon: ActivityIcon },
  ];

  // Don't show field mode chrome on admin sub-routes
  const isAdminRoute = pathname.startsWith(`${base}/admin`);
  if (isAdminRoute) {
    return <>{children}</>;
  }

  return (
    <div className="pb-20 md:pb-0">
      {/* Top bar */}
      <div className="bg-forest-dark text-white sticky top-0 z-30">
        <div className="px-4 flex items-center justify-between h-12">
          <span className="text-sm font-medium truncate">{propertyName}</span>
          <div className="flex items-center gap-2">
            <Link
              href={`${base}/admin`}
              className="p-1.5 text-white/60 hover:text-white transition-colors"
              title="Admin"
            >
              <GearIcon className="w-4 h-4" />
            </Link>
            <AvatarMenu userEmail={userEmail} />
          </div>
        </div>
      </div>

      {children}

      {/* Mobile bottom tabs */}
      <MobileBottomTabs tabs={tabs} />
    </div>
  );
}
