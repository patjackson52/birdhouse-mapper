'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarItem {
  label: string;
  href: string;
}

interface AdminSidebarProps {
  title: string;
  items: SidebarItem[];
  backLink?: { label: string; href: string };
}

export function AdminSidebar({ title, items, backLink }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <nav className="w-56 bg-parchment border-r border-sage-light flex-shrink-0 min-h-screen">
      {backLink && (
        <Link
          href={backLink.href}
          className="block px-4 py-2 text-xs text-golden hover:text-golden/80"
        >
          ← {backLink.label}
        </Link>
      )}
      <div className="px-4 py-3 font-bold text-forest-dark text-sm">
        {title}
      </div>
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== '/admin' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-4 py-2 text-sm ${
              isActive
                ? 'bg-sage-light/50 text-forest-dark font-semibold border-l-3 border-golden'
                : 'text-gray-600 hover:bg-sage-light/30'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
