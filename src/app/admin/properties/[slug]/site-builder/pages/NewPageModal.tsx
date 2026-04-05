'use client';

import { useState, useRef } from 'react';
import { slugify, validatePageSlug, type PageMeta } from '@/lib/puck/page-utils';

interface NewPageModalProps {
  existingMeta: Record<string, PageMeta>;
  onClose: () => void;
  onCreate: (title: string, slug: string, isLandingPage: boolean) => void;
}

export function NewPageModal({ existingMeta, onClose, onCreate }: NewPageModalProps) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [isLandingPage, setIsLandingPage] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const slugError = slug ? validatePageSlug(slug, existingMeta) : null;
  const canCreate = title.trim() && slug.trim() && !slugError;

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugManuallyEdited) {
      setSlug(slugify(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugManuallyEdited(true);
    setSlug(value);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">New Page</h3>

        <div className="mb-4">
          <label className="label" htmlFor="page-title">
            Title
          </label>
          <input
            ref={titleRef}
            id="page-title"
            className="input-field"
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g. About Us"
            autoFocus
          />
        </div>

        <div className="mb-4">
          <label className="label" htmlFor="page-slug">
            URL Slug
          </label>
          <input
            id="page-slug"
            className="input-field"
            type="text"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="e.g. about-us"
          />
          {slugError && (
            <p className="mt-1 text-sm text-red-600">{slugError}</p>
          )}
        </div>

        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isLandingPage}
              onChange={(e) => setIsLandingPage(e.target.checked)}
              className="rounded border-gray-300"
            />
            Set as landing page
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!canCreate}
            onClick={() => onCreate(title.trim(), slug.trim(), isLandingPage)}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
