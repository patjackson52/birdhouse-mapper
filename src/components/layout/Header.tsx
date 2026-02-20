'use client';

import Link from 'next/link';

export default function Header() {
  return (
    <div className="bg-forest-dark text-white py-1 text-center text-xs">
      <span>
        An{' '}
        <Link href="/about" className="underline hover:text-golden">
          Eagle Scout Project
        </Link>{' '}
        at IslandWood, Bainbridge Island
      </span>
    </div>
  );
}
