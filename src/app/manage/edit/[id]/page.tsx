'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import EditItemForm from '@/components/manage/EditItemForm';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { Photo } from '@/lib/types';

export default function EditItemPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [formProps, setFormProps] = useState<{
    initialData: {
      name: string;
      description: string | null;
      latitude: number;
      longitude: number;
      status: string;
      item_type_id: string;
      custom_field_values: Record<string, unknown>;
    };
    initialSpeciesIds: string[];
    initialPhotos: Photo[];
    isAdmin: boolean;
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const [
        { data: item, error: itemError },
        { data: itemSpecies },
        { data: photos },
        { data: profile },
      ] = await Promise.all([
        supabase.from('items').select('*').eq('id', id).single(),
        supabase.from('item_species').select('species_id').eq('item_id', id),
        supabase.from('photos').select('*').eq('item_id', id),
        supabase.from('profiles').select('role').eq('id', user.id).single(),
      ]);

      if (!item || itemError) {
        router.push('/manage');
        return;
      }

      setFormProps({
        initialData: {
          name: item.name,
          description: item.description,
          latitude: item.latitude,
          longitude: item.longitude,
          status: item.status,
          item_type_id: item.item_type_id,
          custom_field_values: item.custom_field_values ?? {},
        },
        initialSpeciesIds: (itemSpecies ?? []).map((s: { species_id: string }) => s.species_id),
        initialPhotos: photos ?? [],
        isAdmin: profile?.role === 'admin',
      });
      setLoading(false);
    }

    loadData();
  }, [id, router]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <LoadingSpinner />
      </div>
    );
  }

  if (!formProps) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">
        Edit Item
      </h1>
      <EditItemForm
        itemId={id}
        initialData={formProps.initialData}
        initialSpeciesIds={formProps.initialSpeciesIds}
        initialPhotos={formProps.initialPhotos}
        isAdmin={formProps.isAdmin}
      />
    </div>
  );
}
