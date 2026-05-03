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
  Entity,
  EntityType,
  Photo,
  AuthorCard,
  ItemHeaderStats,
} from "@/lib/types";
import { useOfflineStore } from "@/lib/offline/provider";
import { enrichUpdates } from "@/lib/timeline/enrichUpdates";
import { getAuthorCards } from "@/lib/attribution/getAuthorCards";
import { createClient } from "@/lib/supabase/client";
import DetailPanel from "@/components/item/DetailPanel";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import PublicContributeButton from "@/components/map/PublicContributeButton";
import { usePermissions } from "@/lib/permissions/hooks";
import { useConfig } from "@/lib/config/client";
import { getPropertyGeoLayersPublic, getGeoLayerPublic, getGeoLayerPublicIfNewer } from "@/app/admin/geo-layers/actions";
import {
  bulkGetCachedLayers,
  getCachedLayer,
  putCachedLayer,
} from "@/lib/offline/geo-layer-cache";
import { clipLayerToBoundary, filterItemsByBoundary } from "@/lib/geo/spatial";
import type { GeoLayerSummary, GeoLayerProperty } from "@/lib/geo/types";
import type { FeatureCollection } from "geojson";
import type { SheetState } from "@/components/ui/MultiSnapBottomSheet";
import { mark } from '@/lib/perf/marks';

function runWhenIdle(fn: () => void, timeoutMs = 2000): void {
  if (typeof window === 'undefined') return;
  const ric = (window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(fn, { timeout: timeoutMs });
  } else {
    window.setTimeout(fn, 0);
  }
}

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
  const { controls: mapControls } = config.mapDisplayConfig;
  const propertyId = config.propertyId;
  const offlineStore = useOfflineStore();

  const [sheetState, setSheetState] = useState<SheetState | null>(null);
  const [allowPublicContributions, setAllowPublicContributions] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  const [geoLayers, setGeoLayers] = useState<GeoLayerSummary[]>([]);
  const [visibleGeoLayerIds, setVisibleGeoLayerIds] = useState<Set<string>>(new Set());
  const [geoLayerData, setGeoLayerData] = useState<Map<string, FeatureCollection>>(new Map());
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<FeatureCollection | null>(null);

  mark('ttrc:hydrate-start');

  // Safety net: if loading work hangs (e.g. IDB versionchange upgrade blocked
  // by another connection — Dexie's db.open() can wait indefinitely with no
  // throw), force the spinner off after 8s so the user isn't stuck. The map
  // will render with whatever state we have (typically empty), and any later
  // success path will populate it.
  useEffect(() => {
    const safetyNet = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(safetyNet);
  }, []);

  useEffect(() => {
    async function fetchData() {
      if (!propertyId) { setLoading(false); return; }

      try {
        // Resolve orgId from the properties table in IndexedDB
        const property = await offlineStore.db.properties.get(propertyId);
        const resolvedOrgId = property?.org_id;

        // If no property in IndexedDB yet and we're online, sync first to bootstrap
        if (!property && offlineStore.isOnline) {
          try {
            const { createClient } = await import("@/lib/supabase/client");
            const supabase = createClient();
            // Get the property from Supabase to find resolvedOrgId
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
                mark('ttrc:idb-resolved');
              }
              // Fetch org public-contribution settings
              if (propData.org_id) {
                setOrgId(propData.org_id);
                const { data: orgSettings } = await supabase
                  .from('orgs')
                  .select('allow_public_contributions')
                  .eq('id', propData.org_id)
                  .single();
                setAllowPublicContributions(orgSettings?.allow_public_contributions ?? false);
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
          resolvedOrgId ? offlineStore.getItemTypes(resolvedOrgId) : Promise.resolve([]),
          resolvedOrgId ? offlineStore.getCustomFields(resolvedOrgId) : Promise.resolve([]),
        ]);

        setItems(itemData);
        setItemTypes(typeData);
        setCustomFields(fieldData);
        mark('ttrc:idb-resolved');

        // Check authentication and org settings in parallel
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          const [{ data: { user } }, orgSettingsResult] = await Promise.all([
            supabase.auth.getUser(),
            resolvedOrgId
              ? supabase
                  .from('orgs')
                  .select('allow_public_contributions')
                  .eq('id', resolvedOrgId)
                  .single()
              : Promise.resolve({ data: null }),
          ]);
          setIsAuthenticated(!!user);
          if (resolvedOrgId) {
            setOrgId(resolvedOrgId);
            setAllowPublicContributions(orgSettingsResult.data?.allow_public_contributions ?? false);
          }
        } catch {
          setIsAuthenticated(false);
        }

        // Trigger background sync after the browser is idle so it doesn't compete with first-paint
        if (resolvedOrgId && offlineStore.isOnline) {
          runWhenIdle(() => {
            offlineStore.syncProperty(propertyId, resolvedOrgId).then(async () => {
              const [freshItems, freshTypes, freshFields] = await Promise.all([
                offlineStore.getItems(propertyId),
                offlineStore.getItemTypes(resolvedOrgId!),
                offlineStore.getCustomFields(resolvedOrgId!),
              ]);
              setItems(freshItems);
              setItemTypes(freshTypes);
              setCustomFields(freshFields);
            });
          });
        }
      } catch (err) {
        console.error('Failed to load map data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch geo layers for this property
  useEffect(() => {
    if (!propertyId) return;
    const offlineDb = offlineStore.db;

    getPropertyGeoLayersPublic(propertyId).then(async (result) => {
      if (!('success' in result)) return;
      setGeoLayers(result.layers);

      // Map layer-id -> server's current updated_at, from the manifest the action just returned.
      const versionByLayerId = new Map(
        result.layers.map((l) => [l.id, l.updated_at] as const),
      );

      const defaultVisible = new Set(
        result.assignments
          .filter((a: GeoLayerProperty) => a.visible_default)
          .map((a: GeoLayerProperty) => a.geo_layer_id),
      );
      setVisibleGeoLayerIds(defaultVisible);

      const defaultIds = Array.from(defaultVisible);

      // 1. Read cache for default-visible layers — render immediately.
      const cached = await bulkGetCachedLayers(offlineDb, defaultIds);
      if (cached.size > 0) {
        setGeoLayerData((prev) => {
          const next = new Map(prev);
          for (const [id, row] of Array.from(cached)) {
            next.set(id, row.geojson);
          }
          return next;
        });
      }

      // 2. Revalidate / fetch in parallel.
      const settled = await Promise.all(
        defaultIds.map(async (layerId) => {
          const cachedRow = cached.get(layerId);
          const serverVersion = versionByLayerId.get(layerId);
          if (cachedRow && serverVersion && cachedRow.version === serverVersion) {
            // Local cache already matches server's manifest version — no network needed.
            return { layerId, replaced: false as const };
          }
          if (cachedRow) {
            const r = await getGeoLayerPublicIfNewer(layerId, cachedRow.version);
            if ('unchanged' in r) {
              return { layerId, replaced: false as const };
            }
            if ('success' in r) {
              await putCachedLayer(offlineDb, layerId, r.layer.updated_at, r.layer.geojson);
              return { layerId, replaced: true as const, geojson: r.layer.geojson };
            }
            return { layerId, replaced: false as const };
          }
          // No cache row — full fetch.
          const r = await getGeoLayerPublic(layerId);
          if ('success' in r) {
            await putCachedLayer(offlineDb, layerId, r.layer.updated_at, r.layer.geojson);
            return { layerId, replaced: true as const, geojson: r.layer.geojson };
          }
          return { layerId, replaced: false as const };
        }),
      );

      const newGeoJsonByLayerId = new Map<string, FeatureCollection>();
      for (const s of settled) {
        if (s.replaced) newGeoJsonByLayerId.set(s.layerId, s.geojson);
      }
      if (newGeoJsonByLayerId.size > 0) {
        setGeoLayerData((prev) => {
          const next = new Map(prev);
          for (const [id, geojson] of Array.from(newGeoJsonByLayerId)) {
            next.set(id, geojson);
          }
          return next;
        });
      }

      mark('ttrc:geolayers-resolved');

      // 3. Boundary layer (separate from default-visible flow).
      const boundaryLayer = result.layers.find((l) => l.is_property_boundary);
      if (boundaryLayer) {
        const cachedBoundary = await getCachedLayer(offlineDb, boundaryLayer.id);
        if (cachedBoundary) {
          setBoundaryGeoJSON(cachedBoundary.geojson);
          if (cachedBoundary.version !== boundaryLayer.updated_at) {
            const r = await getGeoLayerPublicIfNewer(boundaryLayer.id, cachedBoundary.version);
            if ('success' in r) {
              await putCachedLayer(offlineDb, boundaryLayer.id, r.layer.updated_at, r.layer.geojson);
              setBoundaryGeoJSON(r.layer.geojson);
            }
          }
        } else {
          const r = await getGeoLayerPublic(boundaryLayer.id);
          if ('success' in r) {
            await putCachedLayer(offlineDb, boundaryLayer.id, r.layer.updated_at, r.layer.geojson);
            setBoundaryGeoJSON(r.layer.geojson);
          }
        }
      }
    });
  }, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (!geoLayerData.has(layerId)) {
          loadLayerCacheFirst(layerId);
        }
      }
      return next;
    });
  }

  async function loadLayerCacheFirst(layerId: string) {
    const offlineDb = offlineStore.db;
    // 1. Cache read — render immediately if present.
    const cached = await getCachedLayer(offlineDb, layerId);
    if (cached) {
      const geojson = boundaryGeoJSON
        ? clipLayerToBoundary(cached.geojson, boundaryGeoJSON)
        : cached.geojson;
      setGeoLayerData((prev) => new Map(prev).set(layerId, geojson));
      // Background revalidate — replace if newer.
      const r = await getGeoLayerPublicIfNewer(layerId, cached.version);
      if ('success' in r) {
        await putCachedLayer(offlineDb, layerId, r.layer.updated_at, r.layer.geojson);
        const fresh = boundaryGeoJSON
          ? clipLayerToBoundary(r.layer.geojson, boundaryGeoJSON)
          : r.layer.geojson;
        setGeoLayerData((prev) => new Map(prev).set(layerId, fresh));
      }
      return;
    }
    // 2. No cache — full fetch.
    const result = await getGeoLayerPublic(layerId);
    if ('success' in result) {
      await putCachedLayer(offlineDb, layerId, result.layer.updated_at, result.layer.geojson);
      const geojson = boundaryGeoJSON
        ? clipLayerToBoundary(result.layer.geojson, boundaryGeoJSON)
        : result.layer.geojson;
      setGeoLayerData((prev) => new Map(prev).set(layerId, geojson));
    }
  }

  async function handleMarkerClick(item: Item) {
    // Fetch fresh item data from offline store (state may be stale after editing)
    const freshItem = await offlineStore.getItem(item.id);
    const currentItem = freshItem || item;
    const orgId = currentItem.org_id;

    const [updates, photos, updateTypes, entities, entityTypes, updateTypeFields] =
      await Promise.all([
        offlineStore.getItemUpdates(item.id),
        offlineStore.getPhotos(item.id),
        offlineStore.getUpdateTypes(orgId),
        offlineStore.getEntities(orgId),
        offlineStore.getEntityTypes(orgId),
        offlineStore.getUpdateTypeFields(orgId),
      ]);

    // Resolve author cards online. Offline-mode: skip; profile renders as null.
    const userIds = Array.from(
      new Set(updates.map((u) => u.created_by).filter((x): x is string => Boolean(x))),
    );
    let authorCards: Map<string, AuthorCard> = new Map();
    if (userIds.length > 0 && typeof navigator !== "undefined" && navigator.onLine) {
      try {
        const supabase = createClient();
        authorCards = await getAuthorCards(supabase as any, orgId, userIds);
      } catch {
        authorCards = new Map();
      }
    }

    // Build per-update photos map from flat list.
    const photosByUpdateId = new Map<string, Photo[]>();
    for (const p of photos) {
      if (!p.update_id) continue;
      const arr = photosByUpdateId.get(p.update_id) ?? [];
      arr.push(p);
      photosByUpdateId.set(p.update_id, arr);
    }

    // Build per-update entities map. If offlineStore.getUpdateEntities is not available,
    // leave the map empty (species stack will be empty on rail cards until offline cache
    // is extended in a follow-up).
    const entityTypeMap = new Map(entityTypes.map((t) => [t.id, t]));
    const entitiesByUpdateId = new Map<string, Array<Entity & { entity_type: EntityType }>>();
    const getUpdateEntities = (offlineStore as any).getUpdateEntities;
    if (typeof getUpdateEntities === "function") {
      // Expected signature: getUpdateEntities(orgId: string) => Promise<{ update_id: string; entity_id: string }[]>
      const joinRows: Array<{ update_id: string; entity_id: string }> =
        await getUpdateEntities.call(offlineStore, orgId);
      const entityMap = new Map(entities.map((e) => [e.id, e]));
      for (const row of joinRows) {
        const entity = entityMap.get(row.entity_id);
        if (!entity) continue;
        const entityType = entityTypeMap.get(entity.entity_type_id);
        if (!entityType) continue;
        const arr = entitiesByUpdateId.get(row.update_id) ?? [];
        arr.push({ ...entity, entity_type: entityType });
        entitiesByUpdateId.set(row.update_id, arr);
      }
    }

    const enriched = enrichUpdates({
      updates,
      updateTypes,
      updateTypeFields,
      photosByUpdateId,
      entitiesByUpdateId,
      authorCards,
    });

    const stats: ItemHeaderStats = {
      updatesCount: updates.length,
      speciesCount: new Set(
        enriched.flatMap((u) => u.species.map((s) => s.external_id)),
      ).size,
      contributorsCount: new Set(
        updates.map((u) => u.created_by).filter(Boolean),
      ).size,
    };

    const itemType = itemTypes.find((t) => t.id === currentItem.item_type_id);
    const fields = customFields.filter(
      (f) => f.item_type_id === currentItem.item_type_id,
    );

    setSelectedItem({
      ...currentItem,
      item_type: itemType!,
      updates: enriched,
      photos,
      custom_fields: fields,
      entities: [],
      stats,
    } as any);
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
        sheetState={selectedItem ? sheetState : null}
      />

      {/* List view link */}
      {mapControls.viewAsList && (
        <Link
          href="/list"
          className="absolute top-4 right-4 z-10 bg-white backdrop-blur-sm rounded-lg shadow-lg border border-sage-light px-3 py-2 text-xs font-medium text-forest-dark hover:bg-sage-light transition-colors"
        >
          View as List
        </Link>
      )}

      {/* Detail panel */}
      <DetailPanel
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        isAuthenticated={isAuthenticated}
        canEditItem={permissions.items.edit_any || permissions.items.edit_assigned}
        canAddUpdate={permissions.updates.create}
        onSheetStateChange={setSheetState}
      />

      {/* Public photo submission button */}
      {allowPublicContributions && orgId && (
        <PublicContributeButton orgId={orgId} />
      )}
    </div>
  );
}
