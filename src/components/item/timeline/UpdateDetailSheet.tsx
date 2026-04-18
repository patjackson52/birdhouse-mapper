'use client';

import { useEffect, useState, useRef } from 'react';
import type { UpdateTypeField, IconValue } from '@/lib/types';
import type { TimelineUpdate } from './timeline-helpers';
import { detectPrimaryContent, getKeyFieldValues } from './timeline-helpers';
import { IconRenderer } from '@/components/shared/IconPicker';
import PhotoViewer from '@/components/ui/PhotoViewer';
import { getPhotoUrl } from '@/lib/photos';
import { formatDate } from '@/lib/utils';

interface UpdateDetailSheetProps {
  update: TimelineUpdate;
  updateTypeFields: UpdateTypeField[];
  isOpen: boolean;
  onClose: () => void;
  canEdit: boolean;
  canDelete: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function UpdateDetailSheet({
  update,
  updateTypeFields,
  isOpen,
  onClose,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: UpdateDetailSheetProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const editAvailable = canEdit && typeof onEdit === 'function';
  const deleteAvailable = canDelete && typeof onDelete === 'function';
  const kebabAvailable = editAvailable || deleteAvailable;

  useEffect(() => {
    if (isOpen) closeBtnRef.current?.focus();
    if (!isOpen) setMenuOpen(false);
  }, [isOpen]);

  // Body scroll lock while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const primary = detectPrimaryContent(update);
  const typeName = update.update_type?.name ?? 'Update';
  const typeIcon = update.update_type?.icon ?? '📝';
  const absoluteDate = formatDate(update.update_date);
  const time = new Date(update.update_date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const keyFields = getKeyFieldValues(update, updateTypeFields, 20);

  // Sections
  const photosSection =
    update.photos && update.photos.length > 0 ? (
      <div key="photos" className="mb-4">
        {primary === 'photos' ? (
          <div className="max-h-[40vh] md:max-h-[400px] overflow-hidden rounded-lg">
            <PhotoViewer photos={update.photos} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {update.photos.map((p) => (
              <div key={p.id} className="aspect-square overflow-hidden rounded-md bg-sage-light/40">
                <img src={getPhotoUrl(p.storage_path)} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    ) : null;

  const contentSection = update.content ? (
    <div key="content" className="mb-4">
      <p className="text-sm text-forest-dark/90 leading-relaxed whitespace-pre-wrap">
        {update.content}
      </p>
    </div>
  ) : null;

  const fieldsSection =
    keyFields.length > 0 ? (
      <dl key="fields" className={primary === 'fields' ? 'mb-4 space-y-2' : 'mb-4 space-y-1 text-sm'}>
        {keyFields.map((kf, i) => (
          <div key={i} className={primary === 'fields' ? 'flex flex-col' : 'flex gap-2'}>
            <dt
              className={
                primary === 'fields'
                  ? 'text-xs font-medium text-sage uppercase tracking-wide'
                  : 'text-xs font-medium text-sage'
              }
            >
              {kf.label}
            </dt>
            <dd className={primary === 'fields' ? 'text-base text-forest-dark font-medium' : 'text-sm text-forest-dark'}>
              {kf.value}
            </dd>
          </div>
        ))}
      </dl>
    ) : null;

  const entitiesSection =
    update.entities && update.entities.length > 0 ? (
      <div key="entities" className="mb-2">
        {(() => {
          const grouped = new Map<string, { type: { id: string; name: string; icon: IconValue }; entities: NonNullable<typeof update.entities> }>();
          for (const e of update.entities) {
            const key = e.entity_type.id;
            if (!grouped.has(key)) grouped.set(key, { type: e.entity_type, entities: [] });
            grouped.get(key)!.entities.push(e);
          }
          return Array.from(grouped.values()).map(({ type, entities }) => (
            <div key={type.id} className="mb-2">
              <div className="flex items-center gap-1 text-xs font-medium text-sage uppercase tracking-wide mb-1">
                <IconRenderer icon={type.icon} size={12} />
                <span>{type.name}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {entities.map((e) => (
                  <span
                    key={e.id}
                    className="inline-flex items-center gap-1 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full"
                  >
                    {e.name}
                  </span>
                ))}
              </div>
            </div>
          ));
        })()}
      </div>
    ) : null;

  // Section order per primary content type
  const ordered =
    primary === 'photos'
      ? [photosSection, contentSection, fieldsSection]
      : primary === 'content'
      ? [contentSection, photosSection, fieldsSection]
      : [fieldsSection, contentSection, photosSection];

  const body = (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-sage-light/50">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-light text-base" aria-hidden>
            <IconRenderer icon={typeIcon} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-forest-dark">{typeName}</h2>
            <p className="text-xs text-sage">
              {absoluteDate} · {time}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {kebabAvailable && (
            <div className="relative">
              <button
                type="button"
                aria-label="Update actions"
                onClick={() => setMenuOpen((v) => !v)}
                className="p-2 rounded-md text-sage hover:bg-sage-light/40"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v.01M12 12v.01M12 18v.01" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 min-w-[120px] bg-white border border-sage-light rounded-md shadow-lg overflow-hidden z-10">
                  {editAvailable && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit?.();
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-sage-light/30"
                    >
                      Edit
                    </button>
                  )}
                  {deleteAvailable && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        if (window.confirm('Delete this update? This cannot be undone.')) {
                          onDelete?.();
                        }
                      }}
                      className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-2 rounded-md text-sage hover:bg-sage-light/40"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Adaptive body */}
      <div data-testid="layout-variant" data-variant={primary} className="pt-4">
        {ordered.filter(Boolean)}
      </div>

      {/* Footer (entities always last) */}
      {entitiesSection}
    </div>
  );

  // Fullscreen responsive wrapper: on mobile, fixed full-height overlay;
  // on desktop, centered card. Single implementation, no new primitive.
  return (
    <div className="fixed inset-0 z-[60] flex items-stretch md:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-white w-full md:max-w-lg md:rounded-xl md:shadow-2xl md:max-h-[85vh] h-full md:h-auto overflow-y-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="p-4">{body}</div>
      </div>
    </div>
  );
}
