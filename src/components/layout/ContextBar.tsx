'use client';

import Link from 'next/link';

interface ContextBarProps {
  orgName: string;
  orgHref: string;
  propertyName?: string;
  propertyHref?: string;
  rightContent?: React.ReactNode;
}

export function ContextBar({ orgName, orgHref, propertyName, propertyHref, rightContent }: ContextBarProps) {
  return (
    <div className="bg-amber-800 text-white flex-shrink-0">
      <div className="px-4 flex items-center justify-between h-12">
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          {propertyName ? (
            <>
              {/* Mobile: back chevron + property name */}
              <Link
                href={orgHref}
                className="md:hidden text-white/80 hover:text-white flex items-center gap-1 shrink-0"
                title={`Back to ${orgName}`}
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </Link>
              {/* Desktop: full breadcrumb */}
              <Link
                href={orgHref}
                className="hidden md:inline text-white/70 hover:text-white transition-colors truncate"
              >
                {orgName}
              </Link>
              <span className="hidden md:inline text-white/40">/</span>
              <span className="font-medium truncate">{propertyName}</span>
            </>
          ) : (
            <span className="font-medium truncate">{orgName}</span>
          )}
        </div>
        {rightContent && <div className="flex items-center gap-2 shrink-0">{rightContent}</div>}
      </div>
    </div>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}
