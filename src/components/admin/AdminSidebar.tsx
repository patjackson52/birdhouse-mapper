'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type SidebarItem =
  | { label: string; href: string; badge?: number }
  | { type: 'section'; label: string };

interface AdminSidebarProps {
  title: string;
  items: SidebarItem[];
  backLink?: { label: string; href: string };
  onNavClick?: () => void;
  hideTitle?: boolean;
}

export function AdminSidebar({ title, items, backLink, onNavClick, hideTitle }: AdminSidebarProps) {
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
      {!hideTitle && (
        <div className="px-4 py-3 font-bold text-forest-dark text-sm">
          {title}
        </div>
      )}
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

        const navItem = item as { label: string; href: string; badge?: number };
        const isActive =
          pathname === navItem.href ||
          (navItem.href !== '/admin' && navItem.href !== '/org' && pathname.startsWith(navItem.href));
        return (
          <Link
            key={navItem.href}
            href={navItem.href}
            className={`flex items-center justify-between px-4 py-2 text-sm ${
              isActive
                ? 'bg-golden/10 text-forest-dark font-semibold border-l-4 border-golden'
                : 'text-gray-600 hover:bg-sage-light/30'
            }`}
            onClick={onNavClick}
          >
            <span>{navItem.label}</span>
            {navItem.badge != null && navItem.badge > 0 && (
              <span className="ml-2 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold">
                {navItem.badge > 99 ? '99+' : navItem.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
