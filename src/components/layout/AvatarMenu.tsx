'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface AvatarMenuProps {
  userEmail: string;
}

export function AvatarMenu({ userEmail }: AvatarMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const initial = userEmail.charAt(0).toUpperCase();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="User menu"
        className="w-8 h-8 rounded-full bg-white/20 text-white text-sm font-medium flex items-center justify-center hover:bg-white/30 transition-colors"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-sage-light py-1 z-50">
          <div className="px-3 py-2 text-xs text-sage border-b border-sage-light truncate">
            {userEmail}
          </div>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-gray-700 hover:bg-sage-light/30"
          >
            Profile
          </Link>
          <Link
            href="/account/notifications"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-gray-700 hover:bg-sage-light/30"
          >
            Notifications
          </Link>
          <div className="border-t border-sage-light mt-1 pt-1">
            <button
              onClick={handleSignOut}
              className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
