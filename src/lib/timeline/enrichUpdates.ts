import type {
  AuthorCard,
  EnrichedUpdate,
  EnrichedUpdateField,
  EnrichedUpdateSpecies,
  Entity,
  EntityType,
  ItemUpdate,
  Photo,
  UpdateType,
  UpdateTypeField,
} from '@/lib/types';

type EnrichInput = {
  updates: ItemUpdate[];
  updateTypes: UpdateType[];
  updateTypeFields: UpdateTypeField[];
  photosByUpdateId: Map<string, Photo[]>;
  entitiesByUpdateId: Map<string, Array<Entity & { entity_type: EntityType }>>;
  authorCards: Map<string, AuthorCard>;
};

function speciesFromEntity(e: Entity & { entity_type: EntityType }): EnrichedUpdateSpecies | null {
  if ((e.entity_type as any).api_source !== 'inaturalist') return null;
  const externalId = Number((e as any).external_id);
  if (!Number.isFinite(externalId)) return null;
  return {
    external_id: externalId,
    entity_id: e.id,
    common_name: (e as any).common_name || e.name,
    photo_url: (e as any).photo_url ?? null,
    native: (e as any).native ?? null,
    cavity_nester: (e as any).cavity_nester ?? null,
  };
}

function fieldsFromValues(
  values: Record<string, unknown>,
  defs: UpdateTypeField[],
): EnrichedUpdateField[] {
  const ordered = [...defs].sort((a, b) => a.sort_order - b.sort_order);
  const out: EnrichedUpdateField[] = [];
  for (const def of ordered) {
    const raw = values[def.id];
    if (raw === null || raw === undefined || raw === '') continue;
    out.push({ label: def.name, value: String(raw) });
  }
  return out;
}

export function enrichUpdates(input: EnrichInput): EnrichedUpdate[] {
  const typeMap = new Map(input.updateTypes.map((t) => [t.id, t]));
  const fieldsByType = new Map<string, UpdateTypeField[]>();
  for (const f of input.updateTypeFields) {
    const arr = fieldsByType.get(f.update_type_id) ?? [];
    arr.push(f);
    fieldsByType.set(f.update_type_id, arr);
  }

  return input.updates.map((u) => {
    const type = typeMap.get(u.update_type_id);
    if (!type) throw new Error(`enrichUpdates: missing update_type ${u.update_type_id}`);
    const entities = input.entitiesByUpdateId.get(u.id) ?? [];
    const species = entities
      .map(speciesFromEntity)
      .filter((s): s is EnrichedUpdateSpecies => s !== null);
    const fields = fieldsFromValues(u.custom_field_values ?? {}, fieldsByType.get(type.id) ?? []);
    const profile = u.created_by ? input.authorCards.get(u.created_by) ?? null : null;
    return {
      ...u,
      update_type: type,
      photos: input.photosByUpdateId.get(u.id) ?? [],
      species,
      fields,
      createdByProfile: profile,
    };
  });
}
