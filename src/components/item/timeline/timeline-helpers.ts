import type { ItemUpdate, UpdateTypeField, Photo, Entity, EntityType } from '@/lib/types';

export type TimelineUpdate = ItemUpdate & {
  update_type?: { id: string; name: string; icon: string };
  photos?: Photo[];
  entities?: (Entity & { entity_type: EntityType })[];
};

export function partitionScheduled(
  updates: TimelineUpdate[],
  now: Date = new Date(),
): { scheduled: TimelineUpdate[]; past: TimelineUpdate[] } {
  const nowMs = now.getTime();
  const scheduled: TimelineUpdate[] = [];
  const past: TimelineUpdate[] = [];
  for (const u of updates) {
    const t = new Date(u.update_date).getTime();
    if (t > nowMs) scheduled.push(u);
    else past.push(u);
  }
  scheduled.sort((a, b) => new Date(a.update_date).getTime() - new Date(b.update_date).getTime());
  past.sort((a, b) => new Date(b.update_date).getTime() - new Date(a.update_date).getTime());
  return { scheduled, past };
}

export type PrimaryContent = 'photos' | 'content' | 'fields';

export function detectPrimaryContent(update: TimelineUpdate): PrimaryContent {
  if (update.photos && update.photos.length >= 1) return 'photos';
  if (update.content && update.content.length > 40) return 'content';
  if (update.custom_field_values) {
    const hasFieldValue = Object.values(update.custom_field_values).some(
      (v) => v !== null && v !== undefined && v !== '',
    );
    if (hasFieldValue) return 'fields';
  }
  return 'content';
}

export interface KeyFieldValue {
  label: string;
  value: string;
}

export function getKeyFieldValues(
  update: TimelineUpdate,
  updateTypeFields: UpdateTypeField[],
  limit: number,
): KeyFieldValue[] {
  const fields = updateTypeFields
    .filter((f) => f.update_type_id === update.update_type_id)
    .sort((a, b) => a.sort_order - b.sort_order);

  const result: KeyFieldValue[] = [];
  for (const f of fields) {
    if (result.length >= limit) break;
    const raw = update.custom_field_values[f.id];
    if (raw === null || raw === undefined || raw === '') continue;
    let value = String(raw);
    if (f.field_type === 'date' && value) {
      value = new Date(value).toLocaleDateString();
    }
    result.push({ label: f.name, value });
  }
  return result;
}
