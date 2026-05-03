'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConfig } from '@/lib/config/client';
import { useState } from 'react';
import type { NavBarProps } from '../../types';
import { AuthActions } from './AuthActions';

export function NavBar({ style, position, showMobileBottomBar, showAuthActions }: NavBarProps) {
  const config = useConfig();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    ...(config.puckPages?.['/'] ? [{ label: 'Home', href: '/' }] : []),
    { label: 'Map', href: '/map' },
    { label: 'List', href: '/list' },
    ...(config.aboutPageEnabled ? [{ label: 'About', href: '/about' }] : []),
    ...(config.customNavItems ?? []),
  ];

  const positionClass = position === 'sticky' ? 'sticky top-0 z-50' : '';

  if (style === 'hamburger') {
    return (
      <nav className={`bg-white border-b border-gray-200 px-4 py-2 ${positionClass}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 text-gray-600" aria-label="Toggle menu">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
          {showAuthActions && <AuthActions />}
        </div>
        {menuOpen && (
          <div className="border-t border-gray-100 py-2">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setMenuOpen(false)}>{item.label}</Link>
            ))}
          </div>
        )}
      </nav>
    );
  }

  return (
    <>
      <nav className={`bg-white border-b border-gray-200 px-4 py-2 ${positionClass}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-6">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}
                  className={`text-sm font-medium transition ${isActive ? 'text-[var(--color-primary)]' : 'text-gray-600 hover:text-gray-900'}`}>
                  {item.label}
                </Link>
              );
            })}
          </div>
          {showAuthActions && <AuthActions />}
        </div>
      </nav>
      {showMobileBottomBar && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-gray-200 bg-white md:hidden">
          {navItems.slice(0, 4).map((item) => (
            <Link key={item.href} href={item.href} className="flex flex-1 flex-col items-center py-2 text-xs text-gray-600">{item.label}</Link>
          ))}
        </nav>
      )}
    </>
  );
}
