'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { createPage, deletePage, setLandingPage } from '@/app/admin/site-builder/actions';
import { NewPageModal } from './NewPageModal';
import type { PageMeta } from '@/lib/puck/page-utils';

interface PageEntry {
  path: string;
  title: string;
  slug: string;
  isLanding: boolean;
  hasPublished: boolean;
  hasDraft: boolean;
}

interface PagesListClientProps {
  puckPages: Record<string, unknown> | null;
  puckPagesDraft: Record<string, unknown> | null;
  puckPageMeta: Record<string, PageMeta> | null;
}

export function PagesListClient({ puckPages, puckPagesDraft, puckPageMeta }: PagesListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { slug } = useParams<{ slug: string }>();
  const [showNewModal, setShowNewModal] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const base = pathname.includes('/p/')
    ? `/p/${slug}/admin/site-builder`
    : `/admin/properties/${slug}/site-builder`;

  // Build page list
  const pages: PageEntry[] = [];

  // Landing page (path "/")
  const hasLandingPublished = !!puckPages?.['/'];
  const hasLandingDraft = !!puckPagesDraft?.['/'];
  if (hasLandingPublished || hasLandingDraft) {
    const meta = puckPageMeta?.['/'];
    pages.push({
      path: '/',
      title: meta?.title ?? 'Home',
      slug: '',
      isLanding: true,
      hasPublished: hasLandingPublished,
      hasDraft: hasLandingDraft,
    });
  }

  // All entries from puckPageMeta (excluding "/")
  if (puckPageMeta) {
    for (const [path, meta] of Object.entries(puckPageMeta)) {
      if (path === '/') continue;
      pages.push({
        path,
        title: meta.title,
        slug: meta.slug,
        isLanding: false,
        hasPublished: !!puckPages?.[path],
        hasDraft: !!puckPagesDraft?.[path],
      });
    }
  }

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function getEditorHref(page: PageEntry) {
    if (page.path === '/') return `${base}/pages/home`;
    return `${base}/pages${page.path}`;
  }

  async function handleSetLanding(path: string) {
    setOpenMenu(null);
    setLoading(true);
    const result = await setLandingPage(path);
    if ('error' in result) {
      alert(result.error);
    }
    setLoading(false);
    router.refresh();
  }

  async function handleDelete(path: string) {
    setOpenMenu(null);
    if (!confirm('Are you sure you want to delete this page? This cannot be undone.')) return;
    setLoading(true);
    const result = await deletePage(path);
    if ('error' in result) {
      alert(result.error);
    }
    setLoading(false);
    router.refresh();
  }

  async function handleCreate(title: string, slugVal: string, isLandingPage: boolean) {
    setLoading(true);
    const result = await createPage(title, slugVal, isLandingPage);
    if ('error' in result) {
      alert(result.error);
      setLoading(false);
      return;
    }
    setLoading(false);
    setShowNewModal(false);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Pages</h2>
        <button
          className="btn-primary"
          onClick={() => setShowNewModal(true)}
          disabled={loading}
        >
          + New Page
        </button>
      </div>

      {pages.length === 0 ? (
        <p className="text-gray-500">No pages yet. Create your first page to get started.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <div
              key={page.path}
              className="card relative cursor-pointer transition hover:shadow-md"
              onClick={() => router.push(getEditorHref(page))}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium text-gray-900">
                    {page.isLanding && '🏠 '}{page.title}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {page.path === '/' ? '/' : page.path}
                  </p>
                </div>
                <div className="ml-2 flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      page.hasPublished
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {page.hasPublished ? 'Published' : 'Draft'}
                  </span>
                  {!page.isLanding && (
                    <div className="relative" ref={openMenu === page.path ? menuRef : undefined}>
                      <button
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenu(openMenu === page.path ? null : page.path);
                        }}
                      >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                      {openMenu === page.path && (
                        <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                          <button
                            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetLanding(page.path);
                            }}
                          >
                            Set as landing page
                          </button>
                          <button
                            className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(page.path);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewModal && (
        <NewPageModal
          existingMeta={puckPageMeta ?? {}}
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
