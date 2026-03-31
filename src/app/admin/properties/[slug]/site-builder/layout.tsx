'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';

export default function SiteBuilderLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { slug } = useParams<{ slug: string }>();
  const base = `/admin/properties/${slug}/site-builder`;

  const tabs = [
    { label: 'Landing Page', href: `${base}/landing` },
    { label: 'Header & Footer', href: `${base}/chrome` },
    { label: 'Templates', href: `${base}/templates` },
  ];

  const handlePreview = () => {
    window.open('/?preview=true', '_blank');
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between border-b border-gray-200">
        <nav className="flex gap-4">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`border-b-2 px-1 pb-3 text-sm font-medium transition ${
                  isActive
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={handlePreview}
          className="mb-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Preview Site ↗
        </button>
      </div>
      {children}
    </div>
  );
}
