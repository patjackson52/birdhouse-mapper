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
import { useOfflineStore } from "@/lib/offline/provider";
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
  const offlineStore = useOfflineStore();

  const [geoLayers, setGeoLayers] = useState<GeoLayerSummary[]>([]);
  const [visibleGeoLayerIds, setVisibleGeoLayerIds] = useState<Set<string>>(new Set());
  const [geoLayerData, setGeoLayerData] = useState<Map<string, FeatureCollection>>(new Map());
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!propertyId) { setLoading(false); return; }

      // Resolve orgId from the properties table in IndexedDB
      const property = await offlineStore.db.properties.get(propertyId);
      const orgId = property?.org_id;

      // If no property in IndexedDB yet and we're online, sync first to bootstrap
      if (!property && offlineStore.isOnline) {
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          // Get the property from Supabase to find orgId
          const { data: propData } = await supabase.from('properties').select('*').eq('id', propertyId).single();
          if (propData) {
            await offlineStore.db.properties.put({ ...propData, _synced_at: new Date().toISOString() });
            await offlineStore.syncProperty(propertyId, propData.org_id);
            // Re-read property after sync
            const freshProp = await offlineStore.db.properties.get(propertyId);
            if (freshProp) {
              const [itemData, typeData, fieldData] = await Promise.all([
                offlineStore.getItems(propertyId),
                offlineStore.getItemTypes(freshProp.org_id),
                offlineStore.getCustomFields(freshProp.org_id),
              ]);
              setItems(itemData);
              setItemTypes(typeData);
              setCustomFields(fieldData);
            }
          }
          const { data: { user } } = await supabase.auth.getUser();
          setIsAuthenticated(!!user);
        } catch {
          setIsAuthenticated(false);
        }
        setLoading(false);
        return;
      }

      // Read from IndexedDB (cached data available)
      const [itemData, typeData, fieldData] = await Promise.all([
        offlineStore.getItems(propertyId),
        orgId ? offlineStore.getItemTypes(orgId) : Promise.resolve([]),
        orgId ? offlineStore.getCustomFields(orgId) : Promise.resolve([]),
      ]);

      setItems(itemData);
      setItemTypes(typeData);
      setCustomFields(fieldData);

      // Check authentication via cached session
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        setIsAuthenticated(!!user);
      } catch {
        setIsAuthenticated(false);
      }

      setLoading(false);

      // Trigger background sync and refresh data when done
      if (orgId && offlineStore.isOnline) {
        offlineStore.syncProperty(propertyId, orgId).then(async () => {
          const [freshItems, freshTypes, freshFields] = await Promise.all([
            offlineStore.getItems(propertyId),
            offlineStore.getItemTypes(orgId!),
            offlineStore.getCustomFields(orgId!),
          ]);
          setItems(freshItems);
          setItemTypes(freshTypes);
          setCustomFields(freshFields);
        });
      }
    }

    fetchData();
  }, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Fetch fresh item data from offline store (state may be stale after editing)
    const freshItem = await offlineStore.getItem(item.id);
    const currentItem = freshItem || item;

    const orgId = currentItem.org_id;

    const [updates, photos, updateTypeData, entities, entityTypes] = await Promise.all([
      offlineStore.getItemUpdates(item.id),
      offlineStore.getPhotos(item.id),
      offlineStore.getUpdateTypes(orgId),
      offlineStore.getEntities(orgId),
      offlineStore.getEntityTypes(orgId),
    ]);

    const typeMap = new Map(updateTypeData.map((t) => [t.id, t]));
    const entityTypeMap = new Map(entityTypes.map((t) => [t.id, t]));
    const itemType = itemTypes.find((t) => t.id === currentItem.item_type_id);
    const fields = customFields.filter(
      (f) => f.item_type_id === currentItem.item_type_id,
    );

    // For entity associations, we read from the entities cached in IndexedDB.
    // item_entities join table isn't cached separately, so entities are included directly.
    // TODO: When item_entities are synced to IndexedDB, filter them here.
    const itemEntities: (Entity & { entity_type: EntityType })[] = [];

    setSelectedItem({
      ...currentItem,
      item_type: itemType!,
      updates: updates.map((u) => ({
        ...u,
        update_type: typeMap.get(u.update_type_id)!,
        photos: [],
        entities: [],
      })),
      photos: photos,
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
