'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useFocusTrap } from './useFocusTrap';

interface Property {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  mode: 'org' | 'property';
  properties: Property[];
  /** Property mode: required href to the create form. */
  createHref?: string;
  /** Per-property create-form URL keyed by slug; pre-computed server-side. */
  createHrefBySlug: Record<string, string>;
}

export function NewProjectButton({ mode, properties, createHref, createHrefBySlug }: Props) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, () => setOpen(false));

  if (properties.length === 0) return null;

  // Property mode: direct link.
  if (mode === 'property') {
    const href = createHref ?? createHrefBySlug[properties[0].slug] ?? '#';
    return (
      <Link href={href} className="btn-primary">
        + New project
      </Link>
    );
  }

  // Org mode + 1 property: skip chooser, direct link.
  if (properties.length === 1) {
    return (
      <Link href={createHrefBySlug[properties[0].slug] ?? '#'} className="btn-primary">
        + New project
      </Link>
    );
  }

  // Org mode + 2+ properties: button + chooser modal.
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        + New project
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-project-chooser-title"
            className="card max-w-sm w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="new-project-chooser-title" className="font-heading text-forest-dark text-base mb-3">
              Which property?
            </h2>
            <ul className="space-y-1.5">
              {properties.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      window.location.assign(createHrefBySlug[p.slug] ?? '#');
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg border border-sage-light hover:bg-sage-light/30 text-sm font-medium text-forest-dark"
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full text-center text-xs text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
