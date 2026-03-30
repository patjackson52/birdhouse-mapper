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
  Entity,
  EntityType,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import DetailPanel from "@/components/item/DetailPanel";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { usePermissions } from "@/lib/permissions/hooks";
import { useConfig } from "@/lib/config/client";
import { getPropertyGeoLayersPublic, getGeoLayerPublic } from "@/app/admin/geo-layers/actions";
import { clipLayerToBoundary, filterItemsByBoundary } from "@/lib/geo/spatial";
import type { GeoLayerSummary, GeoLayerProperty } from "@/lib/geo/types";
import type { FeatureCollection } from "geojson";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-sage-light">
      <LoadingSpinner />
    </div>
  ),
});

export function HomeMapView() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] flex items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    >
      <HomeMapViewContent />
    </Suspense>
  );
}

function HomeMapViewContent() {
  const [items, setItems] = useState<Item[]>([]);
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemWithDetails | null>(
    null,
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { permissions } = usePermissions();
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const deepLinkedRef = useRef(false);
  const config = useConfig();
  const propertyId = config.propertyId;

  const [geoLayers, setGeoLayers] = useState<GeoLayerSummary[]>([]);
  const [visibleGeoLayerIds, setVisibleGeoLayerIds] = useState<Set<string>>(new Set());
  const [geoLayerData, setGeoLayerData] = useState<Map<string, FeatureCollection>>(new Map());
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const [itemRes, typeRes, fieldRes, userRes] = await Promise.all([
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
        supabase.auth.getUser(),
      ]);

      if (itemRes.data) setItems(itemRes.data);
      if (typeRes.data) setItemTypes(typeRes.data);
      if (fieldRes.data) setCustomFields(fieldRes.data);
      setIsAuthenticated(!!userRes.data.user);
      setLoading(false);
    }

    fetchData();
  }, []);

  // Fetch geo layers for this property
  useEffect(() => {
    if (!propertyId) return;
    getPropertyGeoLayersPublic(propertyId).then(async (result) => {
      if (!('success' in result)) return;
      setGeoLayers(result.layers);

      // Set default visible layers
      const defaultVisible = new Set(
        result.assignments
          .filter((a: GeoLayerProperty) => a.visible_default)
          .map((a: GeoLayerProperty) => a.geo_layer_id)
      );
      setVisibleGeoLayerIds(defaultVisible);

      // Load GeoJSON for default visible layers
      for (const layerId of Array.from(defaultVisible)) {
        const layerResult = await getGeoLayerPublic(layerId);
        if ('success' in layerResult) {
          setGeoLayerData((prev) => new Map(prev).set(layerId, layerResult.layer.geojson));
        }
      }

      // Load boundary layer if one is marked as property boundary
      const boundaryLayer = result.layers.find((l) => l.is_property_boundary);
      if (boundaryLayer) {
        const boundaryResult = await getGeoLayerPublic(boundaryLayer.id);
        if ('success' in boundaryResult) {
          setBoundaryGeoJSON(boundaryResult.layer.geojson);
        }
      }
    });
  }, [propertyId]);

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

  function handleToggleGeoLayer(layerId: string) {
    setVisibleGeoLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
        // Fetch GeoJSON if not already loaded
        if (!geoLayerData.has(layerId)) {
          getGeoLayerPublic(layerId).then((result) => {
            if ('success' in result) {
              const geojson = boundaryGeoJSON
                ? clipLayerToBoundary(result.layer.geojson, boundaryGeoJSON)
                : result.layer.geojson;
              setGeoLayerData((prev) => new Map(prev).set(layerId, geojson));
            }
          });
        }
      }
      return next;
    });
  }

  async function handleMarkerClick(item: Item) {
    const supabase = createClient();

    // Fetch fresh item data (state may be stale after editing)
    const { data: freshItem } = await supabase
      .from('items')
      .select('*')
      .eq('id', item.id)
      .single();

    const currentItem = freshItem || item;

    const [updateRes, photoRes, updateTypeRes, itemEntitiesRes] = await Promise.all([
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
        .from("item_entities")
        .select("entity_id, entities(*, entity_types(*))")
        .eq("item_id", item.id),
    ]);

    const updateTypes = updateTypeRes.data || [];
    const typeMap = new Map(updateTypes.map((t) => [t.id, t]));
    const itemType = itemTypes.find((t) => t.id === currentItem.item_type_id);
    const fields = customFields.filter(
      (f) => f.item_type_id === currentItem.item_type_id,
    );

    const itemEntities: (Entity & { entity_type: EntityType })[] = ((itemEntitiesRes.data || []) as unknown as { entity_id: string; entities: Entity & { entity_types: EntityType } }[]).map(
      (row) => ({ ...row.entities, entity_type: row.entities.entity_types })
    );

    // Fetch entities for each update
    const updateIds = (updateRes.data || []).map((u) => u.id);
    const updateEntitiesRes = updateIds.length > 0
      ? await supabase
          .from('update_entities')
          .select('update_id, entity_id, entities(*, entity_types(*))')
          .in('update_id', updateIds)
      : { data: [] };

    const updateEntitiesMap = new Map<string, (Entity & { entity_type: EntityType })[]>();
    for (const row of ((updateEntitiesRes.data || []) as unknown as { update_id: string; entity_id: string; entities: Entity & { entity_types: EntityType } }[])) {
      if (!updateEntitiesMap.has(row.update_id)) updateEntitiesMap.set(row.update_id, []);
      updateEntitiesMap.get(row.update_id)!.push({ ...row.entities, entity_type: row.entities.entity_types });
    }

    setSelectedItem({
      ...currentItem,
      item_type: itemType!,
      updates: (updateRes.data || []).map((u) => ({
        ...u,
        update_type: typeMap.get(u.update_type_id)!,
        photos: [],
        entities: updateEntitiesMap.get(u.id) || [],
      })),
      photos: photoRes.data || [],
      custom_fields: fields,
      entities: itemEntities,
    });
  }

  if (loading) {
    return (
      <div className="h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const filteredItems = boundaryGeoJSON
    ? filterItemsByBoundary(items, boundaryGeoJSON)
    : items;

  return (
    <div className="relative h-[calc(100vh-3.5rem-4rem)] md:h-[calc(100vh-4rem)]">
      <MapView
        items={filteredItems}
        itemTypes={itemTypes}
        onMarkerClick={handleMarkerClick}
        geoLayers={geoLayers}
        geoLayerData={geoLayerData}
        boundaryGeoJSON={boundaryGeoJSON}
        visibleGeoLayerIds={visibleGeoLayerIds}
        onToggleGeoLayer={handleToggleGeoLayer}
      />

      {/* List view link */}
      <Link
        href="/list"
        className="absolute top-4 right-4 z-10 bg-white backdrop-blur-sm rounded-lg shadow-lg border border-sage-light px-3 py-2 text-xs font-medium text-forest-dark hover:bg-sage-light transition-colors"
      >
        View as List
      </Link>

      {/* Detail panel */}
      <DetailPanel
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        isAuthenticated={isAuthenticated}
        canEditItem={permissions.items.edit_any || permissions.items.edit_assigned}
        canAddUpdate={permissions.updates.create}
      />
    </div>
  );
}
