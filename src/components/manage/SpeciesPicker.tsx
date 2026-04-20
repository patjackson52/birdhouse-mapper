'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useNetworkStatus } from '@/lib/offline/network';
import { getOfflineDb } from '@/lib/offline/db';
import { enqueueMutation } from '@/lib/offline/mutations';
import type { SpeciesResult } from '@/lib/types';
import SpeciesPill from './species-picker/SpeciesPill';
import SpeciesPickerSheet from './species-picker/SpeciesPickerSheet';
import type { SelectedEntitySeed } from './species-picker/staged-selection';

interface SpeciesPickerProps {
  entityTypeId: string;
  entityTypeName: string;
  orgId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  lat?: number;
  lng?: number;
}

interface SelectedEntityRow {
  id: string;
  name: string;
  description: string | null;
  external_id: string | null;
  custom_field_values: Record<string, unknown> | null;
}

interface PillEntity {
  id: string;
  name: string;
  photo_url: string | null;
  photo_square_url: string | null;
  taxonId: number | null;
  scientific: string | null;
  wikipedia_url: string | null;
}

export default function SpeciesPicker({
  entityTypeId,
  entityTypeName,
  orgId,
  selectedIds,
  onChange,
  lat,
  lng,
}: SpeciesPickerProps) {
  const { isOnline } = useNetworkStatus();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedEntities, setSelectedEntities] = useState<PillEntity[]>([]);

  useEffect(() => {
    if (selectedIds.length === 0) {
      setSelectedEntities([]);
      return;
    }

    let cancelled = false;
    const run = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('entities')
        .select('id, name, description, external_id, custom_field_values')
        .in('id', selectedIds);

      if (cancelled) return;
      const rows = (data ?? []) as SelectedEntityRow[];
      const mapped: PillEntity[] = selectedIds.map((sid) => {
        const row = rows.find((r) => r.id === sid);
        const cfv = row?.custom_field_values ?? {};
        const photoUrl =
          typeof cfv.photo_url === 'string' ? (cfv.photo_url as string) : null;
        const photoSquare =
          typeof cfv.photo_square_url === 'string'
            ? (cfv.photo_square_url as string)
            : null;
        const taxonId = row?.external_id ? Number(row.external_id) : null;
        const scientific =
          typeof cfv.scientific_name === 'string'
            ? (cfv.scientific_name as string)
            : row?.description ?? null;
        const wikipedia_url =
          typeof cfv.wikipedia_url === 'string' ? (cfv.wikipedia_url as string) : null;
        return {
          id: sid,
          name: row?.name ?? 'Unknown',
          photo_url: photoUrl,
          photo_square_url: photoSquare,
          taxonId: taxonId !== null && Number.isFinite(taxonId) ? taxonId : null,
          scientific,
          wikipedia_url,
        };
      });
      setSelectedEntities(mapped);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedIds]);

  const seeds: SelectedEntitySeed[] = useMemo(() => {
    return selectedEntities
      .filter((e): e is PillEntity & { taxonId: number } => e.taxonId !== null)
      .map((e) => ({
        entityId: e.id,
        taxonId: e.taxonId,
        card: {
          id: e.taxonId,
          name: e.scientific ?? e.name,
          common_name: e.name,
          photo_url: e.photo_url,
          photo_square_url: e.photo_square_url,
          rank: 'species',
          observations_count: 0,
          wikipedia_url: e.wikipedia_url,
        } satisfies SpeciesResult,
      }));
  }, [selectedEntities]);

  const handleRemove = useCallback(
    (entityId: string) => {
      onChange(selectedIds.filter((id) => id !== entityId));
    },
    [onChange, selectedIds]
  );

  const handleCommit = useCallback(
    async (plan: { newTaxa: SpeciesResult[]; keptEntityIds: string[] }) => {
      const newEntityIds: string[] = [];

      if (plan.newTaxa.length === 0) {
        onChange(plan.keptEntityIds);
        return;
      }

      if (isOnline) {
        const supabase = createClient();
        for (const card of plan.newTaxa) {
          const externalId = String(card.id);
          const { data: existing } = await supabase
            .from('entities')
            .select('id')
            .eq('entity_type_id', entityTypeId)
            .eq('external_id', externalId)
            .maybeSingle();

          let entityId: string | null = existing?.id ?? null;
          if (!entityId) {
            const { data: inserted, error } = await supabase
              .from('entities')
              .insert({
                entity_type_id: entityTypeId,
                org_id: orgId,
                name: card.common_name,
                description: card.name,
                external_id: externalId,
                photo_path: null,
                custom_field_values: {
                  scientific_name: card.name,
                  photo_url: card.photo_url,
                  photo_square_url: card.photo_square_url,
                  wikipedia_url: card.wikipedia_url,
                  observations_count: card.observations_count,
                },
              })
              .select('id')
              .single();
            if (error || !inserted) continue;
            entityId = inserted.id;
          }
          if (entityId) newEntityIds.push(entityId);
        }
      } else {
        // Offline: local write + enqueue mutation.
        const db = getOfflineDb();
        for (const card of plan.newTaxa) {
          const id = crypto.randomUUID();
          const externalId = String(card.id);
          const payload = {
            id,
            entity_type_id: entityTypeId,
            org_id: orgId,
            name: card.common_name,
            description: card.name,
            external_id: externalId,
            photo_path: null,
            custom_field_values: {
              scientific_name: card.name,
              photo_url: card.photo_url,
              photo_square_url: card.photo_square_url,
              wikipedia_url: card.wikipedia_url,
              observations_count: card.observations_count,
            },
          };
          const nowIso = new Date().toISOString();
          await db.entities.put({
            ...payload,
            external_link: null,
            sort_order: 0,
            created_at: nowIso,
            updated_at: nowIso,
            _synced_at: '',
          });
          await enqueueMutation(db, {
            table: 'entities',
            operation: 'insert',
            record_id: id,
            payload,
            org_id: orgId,
            property_id: '',
          });
          newEntityIds.push(id);
        }
      }

      onChange([...plan.keptEntityIds, ...newEntityIds]);
    },
    [entityTypeId, orgId, isOnline, onChange]
  );

  return (
    <div>
      {selectedEntities.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedEntities.map((e) => (
            <SpeciesPill
              key={e.id}
              name={e.name}
              photoUrl={e.photo_square_url ?? e.photo_url}
              onRemove={() => handleRemove(e.id)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="btn-secondary w-full justify-center"
      >
        Add {entityTypeName.toLowerCase()}
      </button>

      <SpeciesPickerSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        orgId={orgId}
        entityTypeId={entityTypeId}
        entityTypeName={entityTypeName}
        lat={lat}
        lng={lng}
        seeds={seeds}
        onCommit={handleCommit}
      />
    </div>
  );
}
