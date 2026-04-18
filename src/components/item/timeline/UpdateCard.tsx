'use client';

import { useState } from 'react';
import type { UpdateTypeField } from '@/lib/types';
import type { TimelineUpdate } from './timeline-helpers';
import { getKeyFieldValues } from './timeline-helpers';
import { formatRelativeDate, formatDate } from '@/lib/utils';
import { IconRenderer } from '@/components/shared/IconPicker';
import { getPhotoUrl } from '@/lib/photos';

interface UpdateCardProps {
  update: TimelineUpdate;
  updateTypeFields: UpdateTypeField[];
  onTap: () => void;
  isScheduled?: boolean;
  showPhotos?: boolean;
  showFieldValues?: boolean;
  showEntityChips?: boolean;
}

export default function UpdateCard({
  update,
  updateTypeFields,
  onTap,
  isScheduled = false,
  showPhotos = true,
  showFieldValues = true,
  showEntityChips = true,
}: UpdateCardProps) {
  const [imgError, setImgError] = useState(false);

  const typeName = update.update_type?.name ?? 'Update';
  const typeIcon = update.update_type?.icon ?? '📝';

  const relativeDate = isScheduled
    ? `Scheduled for ${new Date(update.update_date).toLocaleDateString()}`
    : formatRelativeDate(update.update_date);
  const absoluteDate = formatDate(update.update_date);

  const firstPhoto = update.photos?.[0];
  const keyFields = showFieldValues ? getKeyFieldValues(update, updateTypeFields, 2) : [];

  const allEntities = update.entities ?? [];
  const shownEntities = showEntityChips ? allEntities.slice(0, 3) : [];
  const overflowCount = showEntityChips ? Math.max(0, allEntities.length - 3) : 0;

  return (
    <button
      type="button"
      onClick={onTap}
      className={[
        'w-full text-left rounded-xl border bg-white p-3 shadow-sm hover:shadow-md transition-shadow',
        'flex gap-3 items-start',
        isScheduled
          ? 'border-dashed border-sage-light/50 opacity-90'
          : 'border-sage-light',
      ].join(' ')}
    >
      {/* Type icon chip */}
      <div
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base',
          isScheduled ? 'bg-sage-light/40' : 'bg-sage-light',
        ].join(' ')}
        aria-hidden
      >
        <IconRenderer icon={typeIcon} size={18} />
      </div>

      {/* Main content column */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-forest-dark">{typeName}</span>
          <span
            className={['text-xs text-sage', isScheduled ? 'italic' : ''].join(' ')}
            title={absoluteDate}
          >
            {relativeDate}
          </span>
        </div>

        {update.content && (
          <p className="text-sm text-forest-dark/80 leading-relaxed mt-0.5 line-clamp-2">
            {update.content}
          </p>
        )}

        {keyFields.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {keyFields.map((kf, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[11px] text-sage bg-sage-light/30 rounded-full px-2 py-0.5"
              >
                <span className="font-medium">{kf.label}:</span>
                <span>{kf.value}</span>
              </span>
            ))}
          </div>
        )}

        {shownEntities.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {shownEntities.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center bg-forest/10 text-forest-dark text-[11px] px-2 py-0.5 rounded-full"
              >
                {e.name}
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="text-[11px] text-sage px-1">+{overflowCount} more</span>
            )}
          </div>
        )}
      </div>

      {/* Photo thumbnail */}
      {showPhotos && firstPhoto && !imgError && (
        <div
          data-testid="update-card-thumb"
          className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-sage-light/40"
        >
          <img
            src={getPhotoUrl(firstPhoto.storage_path)}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      )}
    </button>
  );
}
