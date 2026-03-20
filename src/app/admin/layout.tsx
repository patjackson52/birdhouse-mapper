'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AdminLayout({
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

  return (
    <div className="pb-20 md:pb-0">
      <div className="bg-amber-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Admin Panel</span>
              <Link
                href="/admin"
                className={`text-sm transition-colors ${
                  pathname === '/admin'
                    ? 'text-white font-medium'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Data
              </Link>
              <Link
                href="/admin/settings"
                className={`text-sm transition-colors ${
                  pathname.startsWith('/admin/settings')
                    ? 'text-white font-medium'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Settings
              </Link>
              <Link
                href="/admin/types"
                className={`text-sm transition-colors ${
                  pathname.startsWith('/admin/types')
                    ? 'text-white font-medium'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Types
              </Link>
              <Link
                href="/admin/species"
                className={`text-sm transition-colors ${
                  pathname.startsWith('/admin/species')
                    ? 'text-white font-medium'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Species
              </Link>
              <Link
                href="/admin/invites"
                className={`text-sm transition-colors ${
                  pathname.startsWith('/admin/invites')
                    ? 'text-white font-medium'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Invites
              </Link>
              <Link
                href="/manage"
                className="text-white/60 hover:text-white text-sm transition-colors"
              >
                &larr; Back
              </Link>
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
