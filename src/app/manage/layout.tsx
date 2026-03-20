'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import GuestBadge from '@/components/manage/GuestBadge';

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [guestExpiresAt, setGuestExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    async function checkTempStatus() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_temporary, session_expires_at')
        .eq('id', user.id)
        .single();

      if (profile?.is_temporary && profile.session_expires_at) {
        setGuestExpiresAt(profile.session_expires_at);
      }
    }

    checkTempStatus();
  }, []);

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
            <div className="flex items-center gap-3">
              {guestExpiresAt && <GuestBadge expiresAt={guestExpiresAt} />}
              <button
                onClick={handleSignOut}
                className="text-white/60 hover:text-white text-sm transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
