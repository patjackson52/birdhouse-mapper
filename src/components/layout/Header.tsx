'use client';

import Link from 'next/link';
import { useConfig } from '@/lib/config/client';

export default function Header() {
  const config = useConfig();

  if (!config.locationName) return null;

  return (
    <div className="bg-forest-dark text-white py-1 text-center text-xs">
      <span>
        <Link href={config.aboutPageEnabled ? '/about' : '/'} className="underline hover:text-golden">
          {config.siteName}
        </Link>{' '}
        — {config.locationName}
      </span>
    </div>
  );
}
