'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const tabs = [
    { href: '/manage', label: 'Dashboard' },
    { href: '/manage/add', label: 'Add Item' },
    { href: '/manage/update', label: 'Add Update' },
  ];

  return (
    <div className="pb-20 md:pb-0">
      <div className="bg-forest-dark text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12">
            <div className="flex items-center gap-4 overflow-x-auto">
              {tabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`whitespace-nowrap px-3 py-1.5 rounded text-sm transition-colors ${
                    pathname === tab.href
                      ? 'bg-white/20 text-white font-medium'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
            <button
              onClick={handleSignOut}
              className="text-white/60 hover:text-white text-sm transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
