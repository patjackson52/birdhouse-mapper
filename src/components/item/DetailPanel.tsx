'use client';

import type { ItemWithDetails } from '@/lib/types';
import type { IconValue } from '@/lib/types';
import { IconRenderer } from '@/components/shared/IconPicker';
import StatusBadge from './StatusBadge';
import { ItemHeader } from './ItemHeader';
import { TimelineRail } from './timeline/TimelineRail';
import { deleteUpdate } from '@/app/manage/update/[id]/actions';
import MultiSnapBottomSheet, { type SheetState } from '@/components/ui/MultiSnapBottomSheet';
import { formatDate } from '@/lib/utils';
import { getPhotoUrl } from '@/lib/photos';
import { useEffect, useState } from 'react';
import { useUserLocation } from '@/lib/location/provider';
import { getDistanceToItem, formatDistance } from '@/lib/location/utils';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import PhotoViewer from '@/components/ui/PhotoViewer';
import LayoutRendererDispatch from '@/components/layout/LayoutRendererDispatch';

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
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : null;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!item) {
      onSheetStateChange?.(null);
    }
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { position } = useUserLocation();

  if (!item) return null;

  const distance = getDistanceToItem(position, item);
  const layout = item.item_type?.layout ?? null;

  const firstPhoto = item.photos[0];
  const photoUrl = firstPhoto ? getPhotoUrl(firstPhoto.storage_path) : null;

  const content = layout ? (
    <div>
      <ItemHeader
        item={item}
        location={distance != null ? `${formatDistance(distance)} away` : null}
        photoUrl={photoUrl}
        stats={item.stats}
        onBack={onClose}
        onShare={() => {}}
      />
      <LayoutRendererDispatch
        layout={layout}
        item={item}
        mode="live"
        context={isMobile ? 'bottom-sheet' : 'side-panel'}
        sheetState={isMobile ? 'full' : undefined}
        customFields={item.custom_fields ?? []}
        canEdit={canEditItem}
        canAddUpdate={canAddUpdate}
        isAuthenticated={isAuthenticated}
        canEditUpdate={canEditItem}
        canDeleteUpdate={canEditItem}
        onDeleteUpdate={async (updateId: string) => {
          await deleteUpdate(updateId);
        }}
      />
    </div>
  ) : (
    <div>
      <ItemHeader
        item={item}
        location={distance != null ? `${formatDistance(distance)} away` : null}
        photoUrl={photoUrl}
        stats={item.stats}
        onBack={onClose}
        onShare={() => {}}
      />
      <div className="px-1 pt-3 mb-3">
        <StatusBadge status={item.status} />
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
      <div>
        <h3 className="text-xs font-medium text-sage uppercase tracking-wide mb-3">
          Updates
        </h3>
        <TimelineRail
          updates={item.updates}
          maxItems={10}
          showScheduled={true}
          canAddUpdate={!!canAddUpdate}
          onDeleteUpdate={(updateId: string) => {
            void deleteUpdate(updateId);
          }}
        />
      </div>
    </div>
  );

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <MultiSnapBottomSheet isOpen={!!item} onClose={onClose} onStateChange={(s) => { onSheetStateChange?.(s); }}>
        {content}
      </MultiSnapBottomSheet>
    );
  }

  // Desktop: side panel
  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-2xl border-l border-sage-light z-20 overflow-y-auto animate-slide-in-right">
      <div className="p-5">{content}</div>
    </div>
  );
}
