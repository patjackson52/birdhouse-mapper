"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type {
  Item,
  ItemWithDetails,
  ItemType,
  CustomField,
  UpdateType,
  Species,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import DetailPanel from "@/components/item/DetailPanel";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-sage-light">
      <LoadingSpinner />
    </div>
  ),
});

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] flex items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}

function HomePageContent() {
  const [items, setItems] = useState<Item[]>([]);
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemWithDetails | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const deepLinkedRef = useRef(false);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const [itemRes, typeRes, fieldRes] = await Promise.all([
        supabase
          .from("items")
          .select("*")
          .neq("status", "removed")
          .order("created_at", { ascending: true }),
        supabase
          .from("item_types")
          .select("*")
          .order("sort_order", { ascending: true }),
        supabase
          .from("custom_fields")
          .select("*")
          .order("sort_order", { ascending: true }),
      ]);

      if (itemRes.data) setItems(itemRes.data);
      if (typeRes.data) setItemTypes(typeRes.data);
      if (fieldRes.data) setCustomFields(fieldRes.data);
      setLoading(false);
    }

    fetchData();
  }, []);

  // Auto-open detail panel when navigating with ?item=id
  useEffect(() => {
    if (loading || deepLinkedRef.current) return;
    const itemId = searchParams.get("item");
    if (!itemId) return;
    const item = items.find((i) => i.id === itemId);
    if (item) {
      deepLinkedRef.current = true;
      handleMarkerClick(item);
    }
  }, [loading, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleMarkerClick(item: Item) {
    const supabase = createClient();

    const [updateRes, photoRes, updateTypeRes, itemSpeciesRes] = await Promise.all([
      supabase
        .from("item_updates")
        .select("*")
        .eq("item_id", item.id)
        .order("update_date", { ascending: false }),
      supabase.from("photos").select("*").eq("item_id", item.id),
      supabase
        .from("update_types")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase
        .from("item_species")
        .select("species_id, species(*)")
        .eq("item_id", item.id),
    ]);

    const updateTypes = updateTypeRes.data || [];
    const typeMap = new Map(updateTypes.map((t) => [t.id, t]));
    const itemType = itemTypes.find((t) => t.id === item.item_type_id);
    const fields = customFields.filter(
      (f) => f.item_type_id === item.item_type_id,
    );

    const itemSpecies: Species[] = (itemSpeciesRes.data || []).map(
      (row: { species_id: string; species: Species }) => row.species
    );

    // Fetch species for each update
    const updateIds = (updateRes.data || []).map((u) => u.id);
    const updateSpeciesRes = updateIds.length > 0
      ? await supabase
          .from('update_species')
          .select('update_id, species_id, species(*)')
          .in('update_id', updateIds)
      : { data: [] };

    const updateSpeciesMap = new Map<string, Species[]>();
    for (const row of (updateSpeciesRes.data || []) as { update_id: string; species_id: string; species: Species }[]) {
      if (!updateSpeciesMap.has(row.update_id)) updateSpeciesMap.set(row.update_id, []);
      updateSpeciesMap.get(row.update_id)!.push(row.species);
    }

    setSelectedItem({
      ...item,
      item_type: itemType!,
      updates: (updateRes.data || []).map((u) => ({
        ...u,
        update_type: typeMap.get(u.update_type_id)!,
        photos: [],
        species: updateSpeciesMap.get(u.id) || [],
      })),
      photos: photoRes.data || [],
      custom_fields: fields,
      species: itemSpecies,
    });
  }

  if (loading) {
    return (
      <div className="h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-3.5rem-4rem)] md:h-[calc(100vh-4rem)]">
      <MapView
        items={items}
        itemTypes={itemTypes}
        onMarkerClick={handleMarkerClick}
      />

      {/* List view link */}
      <Link
        href="/list"
        className="absolute top-4 right-4 z-10 bg-white backdrop-blur-sm rounded-lg shadow-lg border border-sage-light px-3 py-2 text-xs font-medium text-forest-dark hover:bg-sage-light transition-colors"
      >
        View as List
      </Link>

      {/* Detail panel */}
      <DetailPanel item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}
