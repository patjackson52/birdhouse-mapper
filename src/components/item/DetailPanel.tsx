'use client';

import type { ItemWithDetails } from '@/lib/types';
import type { IconValue } from '@/lib/types';
import { IconRenderer } from '@/components/shared/IconPicker';
import StatusBadge from './StatusBadge';
import { TimelineRail } from './timeline/TimelineRail';
import MultiSnapBottomSheet, { type SheetState } from '@/components/ui/MultiSnapBottomSheet';
import { formatDate } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { getOfflineDb } from '@/lib/offline/db';
import { useUserLocation } from '@/lib/location/provider';
import { getDistanceToItem, formatDistance } from '@/lib/location/utils';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import PhotoViewer from '@/components/ui/PhotoViewer';
import LayoutRendererDispatch from '@/components/layout/LayoutRendererDispatch';
import { createClient } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/permissions/hooks';
import { softDeleteUpdate } from '@/app/items/[itemId]/updates/actions';
import { useDeleteStore } from '@/stores/deleteSlice';
import { DeleteToastHost } from '@/components/delete/DeleteToastHost';
import { track } from '@/lib/telemetry/track';
import type { DeletePermission } from '@/components/delete/DeleteConfirmModal';

/**
 * Map the existing app's userBaseRole (public_admin / org_admin / org_staff /
 * contributor / viewer / public) onto the simplified role type expected by
 * TimelineRail's computeDeletePermission, which only distinguishes
 * admin/coordinator (full delete rights) vs member/public_contributor (can
 * only delete own updates).
 */
function mapUserBaseRole(
  userBaseRole: string
): 'admin' | 'coordinator' | 'member' | 'public_contributor' | null {
  switch (userBaseRole) {
    case 'platform_admin':
    case 'org_admin':
      return 'admin';
    case 'org_staff':
      return 'coordinator';
    case 'contributor':
    case 'viewer':
      return 'member';
    case 'public':
      return 'public_contributor';
    default:
      return null;
  }
}

interface DetailPanelProps {
  item: ItemWithDetails | null;
  onClose: () => void;
  isAuthenticated?: boolean;
  canEditItem?: boolean;
  canAddUpdate?: boolean;
  onSheetStateChange?: (state: SheetState | null) => void;
}

export default function DetailPanel({ item, onClose, isAuthenticated, canEditItem, canAddUpdate, onSheetStateChange }: DetailPanelProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [itemPropertySlug, setItemPropertySlug] = useState<string | null>(null);
  const params = useParams();
  const router = useRouter();
  const slug = typeof params?.slug === 'string' ? params.slug : null;
  const { userBaseRole } = usePermissions();
  const userRole = mapUserBaseRole(userBaseRole);
  const setPending = useDeleteStore((s) => s.setPending);
  const markHidden = useDeleteStore((s) => s.markHidden);
  const hiddenUpdateIds = useDeleteStore((s) => s.hiddenUpdateIds);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setCurrentUserId(data.user?.id ?? null);
      } catch {
        if (!cancelled) setCurrentUserId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!item) {
      onSheetStateChange?.(null);
    }
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve the item's property slug from the offline cache so child blocks
  // (e.g. UpcomingMaintenanceBlock) can build property-scoped URLs even on
  // routes without a [slug] segment (e.g. /map on the default org).
  useEffect(() => {
    const propertyId = item?.property_id;
    if (!propertyId) {
      setItemPropertySlug(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const property = await getOfflineDb().properties.get(propertyId);
        if (!cancelled) setItemPropertySlug(property?.slug ?? null);
      } catch {
        if (!cancelled) setItemPropertySlug(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item?.property_id]);

  const { position } = useUserLocation();

  const handleDeleteUpdate = async (
    updateId: string,
    permission: DeletePermission
  ) => {
    track('update.delete.initiated', {
      update_id: updateId,
      role: permission.kind,
      is_own: permission.kind === 'author',
    });
    // Save the original row (from item.updates, hydrated from the offline
    // cache) so we can restore it to IndexedDB if the user undoes.
    const savedUpdate = item?.updates.find((u) => u.id === updateId) ?? null;
    const res = await softDeleteUpdate(updateId);
    if ('error' in res) {
      console.error('delete failed:', res.error);
      return;
    }
    track('update.delete.confirmed', {
      update_id: updateId,
      role: permission.kind,
    });
    setPending({
      updateId,
      undoToken: res.undoToken,
      expiresAtMs: res.expiresAtMs,
      update: savedUpdate,
    });
    // Optimistic UI: hide this id from the current render. item.updates is
    // parent-owned React state hydrated from IndexedDB at marker-click time,
    // so we can't mutate it here — filter via the store in `filteredItem`.
    markHidden(updateId);
    // Evict from the offline IndexedDB cache so subsequent reads (on next
    // marker click or sync reconciliation) don't repopulate the stale row.
    // If this fails, the sync reconciliation pass will eventually clean it up.
    try {
      await getOfflineDb().item_updates.delete(updateId);
    } catch {
      // best-effort; no action needed
    }
    router.refresh();
  };

  // NOTE: Keep DeleteToastHost mounted even when no item is selected so the
  // undo toast persists if the user closes the panel immediately after a
  // delete. Only the DetailPanel chrome is gated on `item`.
  if (!item) return <DeleteToastHost />;

  // Filter optimistically-hidden updates out before handing to children.
  const filteredItem = hiddenUpdateIds.length === 0
    ? item
    : {
        ...item,
        updates: item.updates.filter((u) => !hiddenUpdateIds.includes(u.id)),
      };

  const distance = getDistanceToItem(position, item);
  const layout = item.item_type?.layout ?? null;

  const content = layout ? (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {item.item_type && <IconRenderer icon={item.item_type.icon} size={20} />}
            <h2 className="font-heading font-semibold text-forest-dark text-xl">
              {item.name}
            </h2>
          </div>
          {distance != null && (
            <span className="text-xs text-forest">
              {formatDistance(distance)} away
            </span>
          )}
        </div>
        {!isMobile && (
          <button
            onClick={onClose}
            className="ml-2 p-1 rounded-lg text-sage hover:bg-sage-light transition-colors"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <LayoutRendererDispatch
        layout={layout}
        item={filteredItem}
        mode="live"
        context={isMobile ? 'bottom-sheet' : 'side-panel'}
        sheetState={isMobile ? 'full' : undefined}
        customFields={item.custom_fields ?? []}
        canEdit={canEditItem}
        canAddUpdate={canAddUpdate}
        isAuthenticated={isAuthenticated}
        canEditUpdate={canEditItem}
        canDeleteUpdate={canEditItem}
        currentUserId={currentUserId}
        userRole={userRole}
        propertySlug={itemPropertySlug ?? slug}
        onDeleteUpdate={handleDeleteUpdate}
      />
    </div>
  ) : (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {item.item_type && <IconRenderer icon={item.item_type.icon} size={20} />}
            <h2 className="font-heading font-semibold text-forest-dark text-xl">
              {item.name}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={item.status} />
            {distance != null && (
              <span className="text-xs text-forest">
                {formatDistance(distance)} away
              </span>
            )}
          </div>
        </div>
        {!isMobile && (
          <button
            onClick={onClose}
            className="ml-2 p-1 rounded-lg text-sage hover:bg-sage-light transition-colors"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Custom fields */}
      {item.custom_fields && item.custom_fields.length > 0 && (
        <div className="space-y-2 mb-3">
          {item.custom_fields
            .filter((f) => item.custom_field_values[f.id] != null)
            .map((field) => (
              <div key={field.id}>
                <span className="text-xs font-medium text-sage uppercase tracking-wide">
                  {field.name}
                </span>
                <p className="text-sm text-forest-dark font-medium">
                  {field.field_type === 'date' && item.custom_field_values[field.id]
                    ? formatDate(String(item.custom_field_values[field.id]))
                    : String(item.custom_field_values[field.id])}
                </p>
              </div>
            ))}
        </div>
      )}

      {/* Entities grouped by type */}
      {item.entities && item.entities.length > 0 && (() => {
        const grouped = new Map<string, { type: { id: string; name: string; icon: IconValue }; entities: typeof item.entities }>();
        for (const e of item.entities) {
          const key = e.entity_type.id;
          if (!grouped.has(key)) grouped.set(key, { type: e.entity_type, entities: [] });
          grouped.get(key)!.entities.push(e);
        }
        return Array.from(grouped.values()).map(({ type, entities }) => (
          <div key={type.id} className="mb-3">
            <span className="text-xs font-medium text-sage uppercase tracking-wide">
              <IconRenderer icon={type.icon} size={12} /> {type.name}
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {entities.map((e) => (
                <span key={e.id} className="inline-flex items-center gap-1 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full">
                  {e.name}
                </span>
              ))}
            </div>
          </div>
        ));
      })()}

      {item.description && (
        <div className="mb-4">
          <span className="text-xs font-medium text-sage uppercase tracking-wide">
            Description
          </span>
          <p className="text-sm text-forest-dark/80 leading-relaxed mt-0.5">
            {item.description}
          </p>
        </div>
      )}

      {/* Photos */}
      {item.photos.length > 0 && (
        <div className="mb-4">
          <PhotoViewer photos={item.photos} />
        </div>
      )}

      {/* Action bar — show buttons based on permissions */}
      {isAuthenticated && (canEditItem || canAddUpdate) && (
        <div className="flex gap-2 mb-4">
          {canEditItem && (
            <Link
              href={`/manage/edit/${item.id}`}
              className="btn-primary text-sm flex-1 text-center"
            >
              Edit Item
            </Link>
          )}
          {canAddUpdate && (
            <Link
              href={slug ? `/p/${slug}/update/${item.id}` : `/manage/update?item=${item.id}`}
              className="btn-secondary text-sm flex-1 text-center"
            >
              Add Update
            </Link>
          )}
        </div>
      )}

      {/* Updates timeline */}
      <div className="pb-24">
        <h3 className="text-xs font-medium text-sage uppercase tracking-wide mb-3">
          Updates
        </h3>
        <TimelineRail
          updates={filteredItem.updates}
          maxItems={10}
          showScheduled={true}
          canAddUpdate={!!canAddUpdate}
          currentUserId={currentUserId}
          userRole={userRole}
          onDeleteUpdate={handleDeleteUpdate}
        />
      </div>
    </div>
  );

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <>
        <MultiSnapBottomSheet isOpen={!!item} onClose={onClose} onStateChange={(s) => { onSheetStateChange?.(s); }}>
          {content}
        </MultiSnapBottomSheet>
        <DeleteToastHost />
      </>
    );
  }

  // Desktop: side panel
  return (
    <>
      <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-2xl border-l border-sage-light z-20 overflow-y-auto animate-slide-in-right">
        <div className="p-5">{content}</div>
      </div>
      <DeleteToastHost />
    </>
  );
}
