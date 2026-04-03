import type { ItemUpdate, UpdateType as UpdateTypeRecord, Photo, Entity, EntityType, UpdateTypeField } from '@/lib/types';
import { formatShortDate } from '@/lib/utils';

interface UpdateTimelineProps {
  updates: (ItemUpdate & {
    update_type?: { id: string; name: string; icon: string };
    photos?: Photo[];
    entities?: (Entity & { entity_type: EntityType })[];
  })[];
  updateTypeFields?: UpdateTypeField[];
}

export default function UpdateTimeline({ updates, updateTypeFields = [] }: UpdateTimelineProps) {
  if (updates.length === 0) {
    return (
      <p className="text-sm text-sage italic">No updates yet.</p>
    );
  }

  const sorted = [...updates].sort(
    (a, b) => new Date(b.update_date).getTime() - new Date(a.update_date).getTime()
  );

  return (
    <div className="space-y-4">
      {sorted.map((update, index) => (
        <div key={update.id} className="relative pl-8">
          {/* Timeline line */}
          {index < sorted.length - 1 && (
            <div className="absolute left-3 top-8 bottom-0 w-px bg-sage-light" />
          )}
          {/* Timeline dot */}
          <div className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-sage-light text-sm">
            {update.update_type?.icon || '📝'}
          </div>
          {/* Content */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-forest">
                {update.update_type?.name || 'Update'}
              </span>
              <span className="text-xs text-sage">
                {formatShortDate(update.update_date)}
              </span>
            </div>
            {update.content && (
              <p className="text-sm text-forest-dark/80 leading-relaxed">
                {update.content}
              </p>
            )}
            {update.entities && update.entities.length > 0 && (() => {
              const grouped = new Map<string, { type: { id: string; name: string; icon: string }; entities: NonNullable<typeof update.entities> }>();
              for (const e of update.entities) {
                const key = e.entity_type.id;
                if (!grouped.has(key)) grouped.set(key, { type: e.entity_type, entities: [] });
                grouped.get(key)!.entities.push(e);
              }
              return Array.from(grouped.values()).map(({ type, entities }) => (
                <div key={type.id} className="flex flex-wrap items-center gap-1 mt-1">
                  <span className="text-[10px] text-sage">{type.icon}</span>
                  {entities.map((e) => (
                    <span key={e.id} className="inline-flex items-center bg-forest/10 text-forest-dark text-[10px] px-1.5 py-0.5 rounded-full">
                      {e.name}
                    </span>
                  ))}
                </div>
              ));
            })()}
              {update.custom_field_values && Object.keys(update.custom_field_values).length > 0 && (() => {
                const fields = updateTypeFields.filter((f) => f.update_type_id === update.update_type_id);
                const entries = Object.entries(update.custom_field_values);
                if (entries.length === 0) return null;
                return (
                  <div className="mt-1.5 space-y-0.5">
                    {entries.map(([fieldId, value]) => {
                      const fieldDef = fields.find((f) => f.id === fieldId);
                      const label = fieldDef?.name ?? fieldId;
                      let displayValue = String(value ?? '');
                      if (fieldDef?.field_type === 'date' && displayValue) {
                        displayValue = new Date(displayValue).toLocaleDateString();
                      }
                      return (
                        <div key={fieldId} className="text-[10px] text-sage">
                          <span className="font-medium">{label}:</span> {displayValue}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
          </div>
        </div>
      ))}
    </div>
  );
}
