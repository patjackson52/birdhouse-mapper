'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useConfig } from '@/lib/config/client';
import { createClient } from '@/lib/supabase/client';

export default function Navigation({
  isAuthenticated: initialAuth = false,
}: {
  isAuthenticated?: boolean;
}) {
  const pathname = usePathname();
  const config = useConfig();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuth);

  // Keep auth state in sync for client-side navigations (login/logout)
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Hide org navigation on platform pages — they render their own PlatformNav.
  // Detect via cookie set by middleware for platform context.
  if (typeof document !== 'undefined' && document.cookie.includes('x-tenant-source=platform')) {
    return null;
  }

  // Hide on routes that have their own shell navigation
  if (pathname.startsWith('/org') || pathname.startsWith('/account') || /^\/p\/[^/]+\/(admin|add|edit|list|activity)/.test(pathname) || /^\/p\/[^/]+$/.test(pathname)) {
    return null;
  }

  const baseLinks = config.landingPage?.enabled
    ? [
        { href: '/', label: 'Home', icon: HomeIcon },
        { href: '/map', label: 'Map', icon: MapIcon },
        { href: '/list', label: 'List', icon: ListIcon },
        { href: '/about', label: 'About', icon: InfoIcon },
      ]
    : [
        { href: '/', label: 'Map', icon: MapIcon },
        { href: '/list', label: 'List', icon: ListIcon },
        { href: '/about', label: 'About', icon: InfoIcon },
      ];

  const publicLinks = baseLinks.filter(
    (link) => link.href !== '/about' || config.aboutPageEnabled
  );

  const isAdmin = pathname.startsWith('/org') || pathname.startsWith('/admin');

  return (
    <>
      {/* Desktop top nav */}
      <header className="hidden md:block bg-white border-b border-sage-light sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="text-2xl">📍</span>
              <div>
                <span className="font-heading font-semibold text-forest-dark text-lg leading-tight block">
                  {config.siteName}
                </span>
                {config.tagline && (
                  <span className="text-xs text-sage leading-tight">
                    {config.tagline}
                  </span>
                )}
              </div>
            </Link>

            <nav className="flex items-center gap-1">
              {publicLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? 'bg-sage-light text-forest-dark'
                      : 'text-sage hover:text-forest-dark hover:bg-sage-light'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              {isAuthenticated && (
                <>
                  <div className="w-px h-6 bg-sage-light mx-2" />
                  <Link
                    href="/org"
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isAdmin
                        ? 'bg-forest text-white'
                        : 'text-sage hover:text-forest-dark hover:bg-sage-light'
                    }`}
                  >
                    Admin
                  </Link>
                </>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="md:hidden bg-white border-b border-sage-light sticky top-0 z-30">
        <div className="flex items-center justify-between h-14 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">📍</span>
            <span className="font-heading font-semibold text-forest-dark text-base">
              {config.siteName}
            </span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-sage hover:bg-sage-light"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-sage-light bg-white animate-fade-in">
            <nav className="px-4 py-2 space-y-1">
              {publicLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? 'bg-sage-light text-forest-dark'
                      : 'text-sage hover:bg-sage-light'
                  }`}
                >
                  <link.icon className="w-5 h-5" />
                  {link.label}
                </Link>
              ))}
              {isAuthenticated && (
                <Link
                  href="/org"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isAdmin
                      ? 'bg-forest text-white'
                      : 'text-sage hover:bg-sage-light'
                  }`}
                >
                  <GearIcon className="w-5 h-5" />
                  Admin
                </Link>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-sage-light z-30 safe-area-pb">
        <div className="flex items-center justify-around h-16">
          {publicLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                  isActive ? 'text-forest' : 'text-sage'
                }`}
              >
                <link.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{link.label}</span>
              </Link>
            );
          })}
          {isAuthenticated && (
            <>
              <Link
                href="/account/notifications"
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                  pathname === '/account/notifications' ? 'text-forest' : 'text-sage'
                }`}
              >
                <BellIcon className="w-5 h-5" />
                <span className="text-[10px] font-medium">Alerts</span>
              </Link>
              <Link
                href="/account"
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                  pathname === '/account' ? 'text-forest' : 'text-sage'
                }`}
              >
                <UserIcon className="w-5 h-5" />
                <span className="text-[10px] font-medium">Account</span>
              </Link>
            </>
          )}
        </div>
      </nav>
    </>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

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

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}
