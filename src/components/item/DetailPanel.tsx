'use client';

import type { ItemWithDetails } from '@/lib/types';
import StatusBadge from './StatusBadge';
import UpdateTimeline from './UpdateTimeline';
import BottomSheet from '@/components/ui/BottomSheet';
import { formatDate } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useUserLocation } from '@/lib/location/provider';
import { getDistanceToItem, formatDistance } from '@/lib/location/utils';
import Link from 'next/link';
import PhotoViewer from '@/components/ui/PhotoViewer';

interface DetailPanelProps {
  item: ItemWithDetails | null;
  onClose: () => void;
  isAuthenticated?: boolean;
}

export default function DetailPanel({ item, onClose, isAuthenticated }: DetailPanelProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const { position } = useUserLocation();

  if (!item) return null;

  const distance = getDistanceToItem(position, item);

  const content = (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {item.item_type && <span className="text-xl">{item.item_type.icon}</span>}
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
        const grouped = new Map<string, { type: { id: string; name: string; icon: string }; entities: typeof item.entities }>();
        for (const e of item.entities) {
          const key = e.entity_type.id;
          if (!grouped.has(key)) grouped.set(key, { type: e.entity_type, entities: [] });
          grouped.get(key)!.entities.push(e);
        }
        return Array.from(grouped.values()).map(({ type, entities }) => (
          <div key={type.id} className="mb-3">
            <span className="text-xs font-medium text-sage uppercase tracking-wide">
              {type.icon} {type.name}
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

      {/* Action bar for authenticated users */}
      {isAuthenticated && (
        <div className="flex gap-2 mb-4">
          <Link
            href={`/manage/edit/${item.id}`}
            className="btn-primary text-sm flex-1 text-center"
          >
            Edit Item
          </Link>
          <Link
            href={`/manage/update?item=${item.id}`}
            className="btn-secondary text-sm flex-1 text-center"
          >
            Add Update
          </Link>
        </div>
      )}

      {/* Updates timeline */}
      <div>
        <h3 className="text-xs font-medium text-sage uppercase tracking-wide mb-3">
          Updates
        </h3>
        <UpdateTimeline updates={item.updates} />
      </div>
    </div>
  );

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <BottomSheet isOpen={!!item} onClose={onClose}>
        {content}
      </BottomSheet>
    );
  }

  // Desktop: side panel
  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-2xl border-l border-sage-light z-20 overflow-y-auto animate-slide-in-right">
      <div className="p-5">{content}</div>
    </div>
  );
}
