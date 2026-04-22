'use client';

import { useState } from 'react';
import type { EnrichedUpdate } from '@/lib/types';
import { usePathname, useRouter } from 'next/navigation';
import { Attribution } from './Attribution';
import { SpeciesRow } from '@/components/species/SpeciesRow';
import { DropdownMenu, DropdownMenuDivider, DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { DeleteConfirmModal, type DeletePermission } from '@/components/delete/DeleteConfirmModal';
import './timeline.css';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtRel(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 86_400_000;
  if (diff < 1) return `${Math.max(1, Math.round(diff * 24))}h ago`;
  if (diff < 7) return `${Math.round(diff)}d ago`;
  if (diff < 30) return `${Math.round(diff / 7)}w ago`;
  return fmtDate(iso);
}

export function UpdateDetailSheet({
  update,
  onClose,
  onRequestDelete,
  deletePermission,
  currentUserId,
}: {
  update: EnrichedUpdate | null;
  onClose: () => void;
  /** Called when user clicks "Delete permanently" in the confirm modal. */
  onRequestDelete: (update: EnrichedUpdate, permission: DeletePermission) => void;
  /** null = user cannot delete; menu item rendered disabled with "Only author or admin" */
  deletePermission: DeletePermission | null;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (!update) return null;
  const photos = update.photos ?? [];
  const species = update.species ?? [];
  const fields = update.fields ?? [];
  const updateType = update.update_type ?? { id: '', name: 'Update', icon: '📝' };
  const firstPhoto = photos[0];
  const extraPhotos = photos.slice(1);
  const photoCount = photos.length;
  const speciesCount = species.length;

  return (
    <div className="fm-slide-up fixed inset-0 z-[100] flex flex-col bg-white">
      <div
        className={`relative shrink-0 ${firstPhoto ? 'bg-sage-light' : 'bg-forest-dark'}`}
        style={{ height: firstPhoto ? 240 : 140 }}
      >
        {firstPhoto && <img src={(firstPhoto as any).url ?? ''} alt="" className="h-full w-full object-cover" />}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-forest-dark/35 via-transparent to-forest-dark/75" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute left-[14px] top-[58px] flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur"
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-forest-dark"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="absolute right-[14px] top-[58px]">
          <button
            type="button"
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" className="text-forest-dark">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
          <DropdownMenu open={menuOpen} onClose={() => setMenuOpen(false)}>
            <DropdownMenuItem onSelect={() => { setMenuOpen(false); }}>Share</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { setMenuOpen(false); }}>Copy link</DropdownMenuItem>
            <DropdownMenuDivider />
            {deletePermission ? (
              <DropdownMenuItem
                danger
                badge={deletePermission.kind === 'admin' ? 'ADMIN' : undefined}
                onSelect={() => { setMenuOpen(false); setConfirmOpen(true); }}
              >
                {deletePermission.kind === 'admin' ? 'Delete (admin)' : 'Delete'}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled note="Only author or admin" danger onSelect={() => {}}>
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenu>
        </div>
        <div className="absolute inset-x-4 bottom-3 text-white">
          <div className="flex items-center gap-[6px] font-mono text-[11px] uppercase tracking-[1px] opacity-90">
            <span>{updateType.icon}</span>
            <span>{updateType.name}</span>
          </div>
          <h2 className="mt-[3px] font-heading text-[22px] font-medium leading-tight">{fmtDate(update.update_date)}</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-24 pt-4">
        <div className="mb-[14px] flex items-center gap-[10px] rounded-xl border border-forest-border-soft bg-parchment px-3 py-[10px]">
          <Attribution update={update} />
          <div className="ml-auto text-right text-[11px] text-sage">
            <div>{fmtTime(update.update_date)}</div>
            <div>{fmtRel(update.update_date)}</div>
          </div>
        </div>

        {update.content && (
          <p className="mb-[18px] text-[15px] leading-[1.55] font-body">{update.content}</p>
        )}

        {species.length > 0 && (
          <div className="mb-[18px]">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.8px] text-sage font-body">
                Species observed · {species.length}
              </div>
              <div className="font-mono text-[10.5px] text-forest">iNat</div>
            </div>
            <div className="flex flex-col gap-2">
              {species.map((s) => (
                <SpeciesRow
                  key={s.external_id}
                  species={{
                    external_id: s.external_id,
                    common_name: s.common_name,
                    scientific_name: s.common_name,
                    photo_url: s.photo_url,
                    native: s.native,
                    cavity_nester: s.cavity_nester,
                  }}
                  onOpen={() => router.push(`/species/${s.external_id}?from=${encodeURIComponent(pathname ?? '/')}`)}
                />
              ))}
            </div>
          </div>
        )}

        {extraPhotos.length > 0 && (
          <div className="mb-[18px]">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-sage font-body">Photos</div>
            <div className="grid grid-cols-2 gap-2">
              {extraPhotos.map((p) => (
                <div key={p.id} className="aspect-square overflow-hidden rounded-[10px] bg-sage-light">
                  <img src={(p as any).url ?? ''} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {fields.length > 0 && (
          <div className="mb-[18px]">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-sage font-body">Details</div>
            <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-forest-border-soft bg-white">
              {fields.map((f, i, arr) => {
                const odd = arr.length % 2 !== 0 && i === arr.length - 1;
                return (
                  <div
                    key={i}
                    className={[
                      'px-3 py-[10px]',
                      i % 2 === 0 && !odd ? 'border-r border-forest-border-soft' : '',
                      i >= 2 ? 'border-t border-forest-border-soft' : '',
                      odd ? 'col-span-2' : '',
                    ].join(' ')}
                  >
                    <div className="mb-[2px] text-[10px] font-medium uppercase tracking-[0.6px] text-sage font-body">{f.label}</div>
                    <div className="text-[13.5px] font-medium font-body">{f.value}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-6 font-mono text-[11px] text-sage">Update · #{update.id.toUpperCase()}</div>
      </div>

      {deletePermission && (
        <DeleteConfirmModal
          open={confirmOpen}
          permission={deletePermission}
          photoCount={photoCount}
          speciesCount={speciesCount}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onRequestDelete(update, deletePermission);
          }}
        />
      )}
    </div>
  );
}
