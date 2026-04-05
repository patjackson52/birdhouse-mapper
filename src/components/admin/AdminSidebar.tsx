'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type SidebarItem =
  | { label: string; href: string }
  | { type: 'section'; label: string };

interface AdminSidebarProps {
  title: string;
  items: SidebarItem[];
  backLink?: { label: string; href: string };
  onNavClick?: () => void;
}

export function AdminSidebar({ title, items, backLink, onNavClick }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <nav className="w-56 bg-parchment border-r border-sage-light flex-shrink-0 h-full overflow-auto">
      {backLink && (
        <Link
          href={backLink.href}
          className="block px-4 py-2 text-xs text-golden hover:text-golden/80"
          onClick={onNavClick}
        >
          ← {backLink.label}
        </Link>
      )}
      <div className="px-4 py-3 font-bold text-forest-dark text-sm">
        {title}
      </div>
      {items.map((item, i) => {
        if ('type' in item && item.type === 'section') {
          return (
            <div
              key={`section-${i}`}
              className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sage"
            >
              {item.label}
            </div>
          );
        }

        const navItem = item as { label: string; href: string };
        const isActive =
          pathname === navItem.href ||
          (navItem.href !== '/admin' && navItem.href !== '/org' && pathname.startsWith(navItem.href));
        return (
          <Link
            key={navItem.href}
            href={navItem.href}
            className={`block px-4 py-2 text-sm ${
              isActive
                ? 'bg-sage-light/50 text-forest-dark font-semibold border-l-3 border-golden'
                : 'text-gray-600 hover:bg-sage-light/30'
            }`}
            onClick={onNavClick}
          >
            {navItem.label}
          </Link>
        );
      })}
    </nav>
  );
}
