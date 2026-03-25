'use client';

import Link from 'next/link';

interface PlatformNavProps {
  minimal?: boolean;
}

export default function PlatformNav({ minimal = false }: PlatformNavProps) {
  const logo = (
    <Link href="/" className="flex items-center text-xl font-bold tracking-tight">
      <span className="text-indigo-500">Field</span>
      <span className="text-indigo-700">Mapper</span>
    </Link>
  );

  if (minimal) {
    return (
      <nav className="w-full border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          {logo}
          <Link
            href="/signin"
            className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </nav>
    );
  }

  return (
    <nav className="w-full border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {logo}
        <div className="flex items-center gap-6">
          <a
            href="#features"
            className="hidden text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors sm:block"
          >
            Features
          </a>
          <Link
            href="/signin"
            className="hidden rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-indigo-400 hover:text-indigo-600 transition-colors sm:block"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
          >
            Start Free Trial
          </Link>
        </div>
      </div>
    </nav>
  );
}
