# Item Timeline v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `TimelineOverview` on the item detail surface with a photo-led vertical rail, rewrite the update detail sheet, and add a URL-driven species detail view with an item/property/org scope toggle. Extend the public submission form with an optional anonymous nickname.

**Architecture:** Minimal DB change (one nullable column + one SQL view with `security_invoker`). Author attribution joins the existing `users` + `org_memberships` + `roles` tables. Components live under `src/components/item/timeline/` and `src/components/species/`. Species routing uses Next.js intercepting + parallel routes at the app root.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres 15, RLS), Tailwind CSS, Vitest + @testing-library/react, Playwright, react-query (`@tanstack/react-query` v5).

**Spec:** `docs/superpowers/specs/2026-04-20-item-timeline-v2-design.md`

---

## Reference material the executor must have open

- **Spec:** `docs/superpowers/specs/2026-04-20-item-timeline-v2-design.md`
- **Prototype:** `components/timeline.jsx` in the design project (pasted into the spec's conversation thread). Used for verbatim RailCard layout, Attribution variants, and SpeciesCitingsBody scope rendering.
- **Loader entry point:** `src/components/map/HomeMapView.tsx` `handleMarkerClick` function (approx. lines 252–291) — where `ItemWithDetails` is assembled from the offline store.
- **Migration convention:** existing migrations under `supabase/migrations/` — the next number is `046`.

---

## Phase 1 — Schema

### Task 1: Add the migration

**Files:**
- Create: `supabase/migrations/046_item_timeline_v2.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/046_item_timeline_v2.sql`:

```sql
-- 046_item_timeline_v2.sql
-- Adds anon_name nickname to item_updates and species_sightings_v read model.

-- 1. Optional nickname for public-form submissions.
--    is_anon is NOT stored; it is derived from the author's active org role
--    (org_memberships.role_id -> roles.base_role = 'public_contributor').
alter table item_updates
  add column anon_name text null;

-- 2. Read model for species citings across item/property/org scopes.
--    security_invoker = on so RLS on the underlying tables applies to the
--    calling user, not the view owner. This is NOT the Postgres default.
create or replace view species_sightings_v
with (security_invoker = on)
as
select
  iu.id                 as update_id,
  e.external_id         as species_id,   -- iNat taxon_id (bigint)
  iu.item_id,
  i.property_id,
  p.org_id,
  iu.update_date        as observed_at,
  iu.created_by
from item_updates iu
join update_entities ue on ue.update_id = iu.id
join entities e        on e.id = ue.entity_id
join entity_types et   on et.id = e.entity_type_id
join items i           on i.id = iu.item_id
join properties p      on p.id = i.property_id
where et.api_source = 'inaturalist'
  and e.external_id is not null;

comment on view species_sightings_v is
  'One row per (update, species) pair for iNaturalist-backed species. Used by the species detail scope toggle (item / property / org).';
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: migrations apply cleanly, including `046_item_timeline_v2.sql`. If the project uses a different migration command (check `AGENTS.md` or `package.json` scripts), use that instead.

- [ ] **Step 3: Sanity-check the view shape**

Run: `npx supabase db query "select column_name, data_type from information_schema.columns where table_name = 'species_sightings_v' order by ordinal_position;"`

Expected output: 7 rows — `update_id uuid`, `species_id bigint`, `item_id uuid`, `property_id uuid`, `org_id uuid`, `observed_at timestamptz`, `created_by uuid`.

If `npx supabase db query` is not available, run the equivalent SQL via Supabase Studio SQL editor.

- [ ] **Step 4: Sanity-check the view returns rows and filters correctly**

Run:
```bash
npx supabase db query "select count(*) from species_sightings_v;"
npx supabase db query "select count(*) from update_entities ue join entities e on e.id=ue.entity_id join entity_types et on et.id=e.entity_type_id where et.api_source='inaturalist' and e.external_id is not null;"
```

Both counts must match. If dev data has no iNat entities, both return 0, which still passes the test.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/046_item_timeline_v2.sql
git commit -m "feat(db): migration 046 — item_updates.anon_name + species_sightings_v"
```

---

## Phase 2 — Types + loader enrichment

### Task 2: Extend core types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add `anon_name` to `ItemUpdate` interface**

Open `src/lib/types.ts`. Find the `ItemUpdate` interface (search for `export interface ItemUpdate`). Add the new field after `created_by`:

```ts
  anon_name: string | null;
```

- [ ] **Step 2: Add author + enriched-update types**

Append to the same file, after the `ItemWithDetails` interface:

```ts
// --- Attribution ---

export interface AuthorCard {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;            // base_role from the user's active membership in the item's org
  update_count: number;    // updates by this user in that org (all items)
}

// --- Timeline rail ---

export interface EnrichedUpdateSpecies {
  external_id: number;     // iNat taxon_id
  entity_id: string;
  common_name: string;
  photo_url: string | null;
  native: boolean | null;
  cavity_nester: boolean | null;
}

export interface EnrichedUpdateField {
  label: string;
  value: string;
}

export interface EnrichedUpdate extends ItemUpdate {
  update_type: UpdateType;
  photos: Photo[];
  species: EnrichedUpdateSpecies[];
  fields: EnrichedUpdateField[];
  createdByProfile: AuthorCard | null;
}

// --- Species citings (scope toggle) ---

export interface SpeciesCitingsItem {
  count: number;
  lastObserved: string | null;
}

export interface SpeciesCitingsPropertyItem {
  item_id: string;
  item_name: string;
  count: number;
  last: string;
  current: boolean;
}

export interface SpeciesCitingsProperty {
  total: { count: number; itemCount: number };
  items: SpeciesCitingsPropertyItem[];
}

export interface SpeciesCitingsOrgProperty {
  property_id: string;
  property_name: string;
  item_count: number;
  count: number;
  last: string;
  current: boolean;
}

export interface SpeciesCitingsOrg {
  total: { count: number; propertyCount: number; itemCount: number };
  properties: SpeciesCitingsOrgProperty[];
}

// --- Item header stats ---

export interface ItemHeaderStats {
  updatesCount: number;
  speciesCount: number;
  contributorsCount: number;
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors. If callers of `ItemUpdate` fail because of the new required `anon_name: string | null` field, the callers need null defaults. Grep for direct `ItemUpdate` construction (mock factories in tests) and add `anon_name: null`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add anon_name, AuthorCard, EnrichedUpdate, SpeciesCitings* types"
```

---

### Task 3: Author lookup helper

**Files:**
- Create: `src/lib/attribution/getAuthorCards.ts`
- Create: `src/lib/attribution/__tests__/getAuthorCards.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/attribution/__tests__/getAuthorCards.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { getAuthorCards } from '../getAuthorCards';

function mockSupabase(rows: any[]) {
  return {
    from(table: string) {
      expect(table).toBe('users');
      return {
        select: () => ({
          in: () => Promise.resolve({ data: rows, error: null }),
        }),
      };
    },
    rpc: vi.fn(),
  } as any;
}

describe('getAuthorCards', () => {
  it('returns empty map for empty input', async () => {
    const out = await getAuthorCards({} as any, 'org-1', []);
    expect(out.size).toBe(0);
  });

  it('maps users by id and attaches role + update_count', async () => {
    const rows = [
      { id: 'u1', display_name: 'Alice', avatar_url: 'a.png', role: 'org_admin', update_count: 12 },
      { id: 'u2', display_name: 'Bob', avatar_url: null, role: 'public_contributor', update_count: 1 },
    ];
    const out = await getAuthorCards(mockSupabase(rows), 'org-1', ['u1', 'u2']);
    expect(out.get('u1')?.role).toBe('org_admin');
    expect(out.get('u1')?.update_count).toBe(12);
    expect(out.get('u2')?.role).toBe('public_contributor');
    expect(out.get('u2')?.avatar_url).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — it fails**

Run: `npx vitest run src/lib/attribution/__tests__/getAuthorCards.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/lib/attribution/getAuthorCards.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthorCard } from '@/lib/types';

/**
 * Load author cards for the given user ids, joined to the org's membership role
 * and a per-org update count. Returns a Map keyed by user id. Users without an
 * active membership in the org are still returned with role='viewer' as a
 * defensive default; anon derivation uses role === 'public_contributor'.
 */
export async function getAuthorCards(
  supabase: SupabaseClient,
  orgId: string,
  userIds: string[],
): Promise<Map<string, AuthorCard>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  // Single query: users joined to org_memberships (for this org) + roles,
  // plus a correlated count of item_updates in this org. The SQL runs as a
  // Postgres RPC for clarity; if the project prefers inline SELECTs, inline
  // the equivalent view/query here.
  const { data, error } = await supabase.rpc('get_author_cards', {
    p_org_id: orgId,
    p_user_ids: ids,
  });

  if (error) throw new Error(`getAuthorCards: ${error.message}`);

  const map = new Map<string, AuthorCard>();
  for (const row of (data ?? []) as AuthorCard[]) {
    map.set(row.id, row);
  }
  return map;
}
```

- [ ] **Step 4: Add the backing RPC**

Append to `supabase/migrations/046_item_timeline_v2.sql`:

```sql
-- RPC: bundle author card lookup (profile fields + org role + per-org update count).
create or replace function get_author_cards(
  p_org_id uuid,
  p_user_ids uuid[]
)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  role text,
  update_count bigint
)
language sql
security invoker
stable
as $$
  select
    u.id,
    u.display_name,
    u.avatar_url,
    coalesce(r.base_role, 'viewer') as role,
    coalesce((
      select count(*) from item_updates
      where created_by = u.id and org_id = p_org_id
    ), 0) as update_count
  from users u
  left join org_memberships om
    on om.user_id = u.id
   and om.org_id = p_org_id
   and om.status = 'active'
  left join roles r on r.id = om.role_id
  where u.id = any(p_user_ids);
$$;

comment on function get_author_cards is
  'Returns author card rows (display_name, avatar_url, base_role, update_count) for a set of user ids scoped to one org.';
```

Re-apply migrations: `npx supabase db reset`

Expected: `046_item_timeline_v2.sql` applies cleanly.

- [ ] **Step 5: Update the test to match the RPC shape and run**

The mock already matches the RPC contract. Run: `npx vitest run src/lib/attribution/__tests__/getAuthorCards.test.ts`

Expected: FAIL — the mock returns data via `.from('users').select().in()`, but the implementation calls `supabase.rpc('get_author_cards', ...)`. Update the test mock:

```ts
function mockSupabase(rows: any[]) {
  return {
    rpc: vi.fn((name: string, args: any) => {
      expect(name).toBe('get_author_cards');
      return Promise.resolve({ data: rows, error: null });
    }),
  } as any;
}
```

Remove the `from()` mock method. Re-run: tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/attribution/ supabase/migrations/046_item_timeline_v2.sql
git commit -m "feat(attribution): getAuthorCards helper + get_author_cards RPC"
```

---

### Task 4: Update enrichment helper

**Files:**
- Create: `src/lib/timeline/enrichUpdates.ts`
- Create: `src/lib/timeline/__tests__/enrichUpdates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/timeline/__tests__/enrichUpdates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { enrichUpdates } from '../enrichUpdates';
import type { AuthorCard, Entity, EntityType, ItemUpdate, Photo, UpdateType, UpdateTypeField } from '@/lib/types';

const updateType: UpdateType = {
  id: 'ut-1', org_id: 'o1', name: 'Nest check', icon: '🐣',
  is_global: true, item_type_id: null, sort_order: 0,
  min_role_create: null, min_role_edit: null, min_role_delete: null,
};

const birdEntityType: EntityType = { id: 'et-bird', org_id: 'o1', name: 'Bird', icon: '🐦', api_source: 'inaturalist' as any } as any;
const otherEntityType: EntityType = { id: 'et-other', org_id: 'o1', name: 'Plant', icon: '🌱', api_source: null as any } as any;

const birdEntity: Entity & { entity_type: EntityType } = {
  id: 'e-bird', org_id: 'o1', entity_type_id: 'et-bird', name: 'Eastern Bluebird',
  external_id: 14886 as any, photo_url: 'bluebird.png',
  native: true, cavity_nester: true,
  entity_type: birdEntityType,
} as any;

const plantEntity: Entity & { entity_type: EntityType } = {
  id: 'e-plant', org_id: 'o1', entity_type_id: 'et-other', name: 'Oak',
  external_id: null as any, photo_url: null,
  entity_type: otherEntityType,
} as any;

const baseUpdate = (overrides: Partial<ItemUpdate> = {}): ItemUpdate => ({
  id: 'u1', item_id: 'i1', update_type_id: 'ut-1', content: 'hi',
  update_date: '2026-04-19T10:00:00Z', created_at: '2026-04-19T10:00:00Z',
  created_by: 'user-a', org_id: 'o1', property_id: 'p1',
  custom_field_values: {},
  anon_name: null,
  ...overrides,
});

const authorCards: Map<string, AuthorCard> = new Map([
  ['user-a', { id: 'user-a', display_name: 'Alice', avatar_url: null, role: 'contributor', update_count: 5 }],
  ['user-b', { id: 'user-b', display_name: 'Bob', avatar_url: null, role: 'public_contributor', update_count: 1 }],
]);

describe('enrichUpdates', () => {
  it('maps update_type and filters species entities by api_source', () => {
    const out = enrichUpdates({
      updates: [baseUpdate()],
      updateTypes: [updateType],
      updateTypeFields: [],
      photosByUpdateId: new Map(),
      entitiesByUpdateId: new Map([['u1', [birdEntity, plantEntity]]]),
      authorCards,
    });
    expect(out).toHaveLength(1);
    expect(out[0].update_type.name).toBe('Nest check');
    expect(out[0].species).toHaveLength(1);
    expect(out[0].species[0].external_id).toBe(14886);
    expect(out[0].species[0].common_name).toBe('Eastern Bluebird');
  });

  it('attaches createdByProfile for members', () => {
    const out = enrichUpdates({
      updates: [baseUpdate()],
      updateTypes: [updateType],
      updateTypeFields: [],
      photosByUpdateId: new Map(),
      entitiesByUpdateId: new Map(),
      authorCards,
    });
    expect(out[0].createdByProfile?.display_name).toBe('Alice');
    expect(out[0].createdByProfile?.role).toBe('contributor');
  });

  it('attaches createdByProfile for public contributors (anon variants key off role)', () => {
    const out = enrichUpdates({
      updates: [baseUpdate({ created_by: 'user-b', anon_name: 'BirdFan42' })],
      updateTypes: [updateType],
      updateTypeFields: [],
      photosByUpdateId: new Map(),
      entitiesByUpdateId: new Map(),
      authorCards,
    });
    expect(out[0].createdByProfile?.role).toBe('public_contributor');
    expect(out[0].anon_name).toBe('BirdFan42');
  });

  it('flattens custom_field_values to {label, value} using update type fields', () => {
    const field: UpdateTypeField = {
      id: 'f1', update_type_id: 'ut-1', org_id: 'o1', name: 'Outcome',
      field_type: 'text', options: null, required: false, sort_order: 0,
    };
    const out = enrichUpdates({
      updates: [baseUpdate({ custom_field_values: { f1: 'fledged' } })],
      updateTypes: [updateType],
      updateTypeFields: [field],
      photosByUpdateId: new Map(),
      entitiesByUpdateId: new Map(),
      authorCards,
    });
    expect(out[0].fields).toEqual([{ label: 'Outcome', value: 'fledged' }]);
  });
});
```

- [ ] **Step 2: Run — FAIL (module missing)**

Run: `npx vitest run src/lib/timeline/__tests__/enrichUpdates.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/timeline/enrichUpdates.ts`:

```ts
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
```

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/lib/timeline/__tests__/enrichUpdates.test.ts`
Expected: 4 tests pass. Fix any field-name mismatches (the `Entity` type may use slightly different property names for `common_name` / `native` / `cavity_nester`; adjust the `speciesFromEntity` casts if so).

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline/ src/lib/attribution/
git commit -m "feat(timeline): enrichUpdates helper produces EnrichedUpdate[] from raw parts"
```

---

### Task 5: Wire enrichment into HomeMapView + compute stats

**Files:**
- Modify: `src/components/map/HomeMapView.tsx` (`handleMarkerClick`)

- [ ] **Step 1: Locate `handleMarkerClick`**

Open `src/components/map/HomeMapView.tsx`. Locate the function `handleMarkerClick(item)` (approx. lines 252–291). Read the whole function to confirm it currently assembles `ItemWithDetails` from the offline store.

- [ ] **Step 2: Extend the function**

Replace the body of `handleMarkerClick` with this enriched version. Adjust import paths to match existing imports in the file:

```ts
import { enrichUpdates } from '@/lib/timeline/enrichUpdates';
import { getAuthorCards } from '@/lib/attribution/getAuthorCards';
import { createClient } from '@/lib/supabase/client';
import type { ItemHeaderStats, AuthorCard } from '@/lib/types';

async function handleMarkerClick(item: Item) {
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

  // Resolve author cards online (offline-mode: skip; profile renders as null).
  const userIds = [...new Set(updates.map((u) => u.created_by).filter((x): x is string => Boolean(x)))];
  let authorCards: Map<string, AuthorCard> = new Map();
  if (userIds.length > 0 && navigator.onLine) {
    try {
      const supabase = createClient();
      authorCards = await getAuthorCards(supabase as any, orgId, userIds);
    } catch {
      authorCards = new Map();
    }
  }

  // Build the per-update photos + entities maps from the flat lists.
  const photosByUpdateId = new Map<string, Photo[]>();
  for (const p of photos) {
    if (!p.update_id) continue;
    const arr = photosByUpdateId.get(p.update_id) ?? [];
    arr.push(p);
    photosByUpdateId.set(p.update_id, arr);
  }
  const entityTypeMap = new Map(entityTypes.map((t) => [t.id, t]));
  const entitiesByUpdateId = new Map<string, Array<Entity & { entity_type: EntityType }>>();
  // NOTE: if offlineStore doesn't cache update_entities, we skip species enrichment
  // here; the rail card's species stack will be empty and the detail sheet's
  // species section will be hidden. A follow-up sync-engine change to cache
  // update_entities is tracked separately.
  // For now, if there is an existing helper (e.g. offlineStore.getUpdateEntities),
  // use it here. Otherwise leave the map empty.

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
    speciesCount: new Set(enriched.flatMap((u) => u.species.map((s) => s.external_id))).size,
    contributorsCount: new Set(updates.map((u) => u.created_by).filter(Boolean)).size,
  };

  const itemType = itemTypes.find((t) => t.id === currentItem.item_type_id);
  const fields = customFields.filter((f) => f.item_type_id === currentItem.item_type_id);

  setSelectedItem({
    ...currentItem,
    item_type: itemType!,
    updates: enriched, // now EnrichedUpdate[]
    photos,
    custom_fields: fields,
    entities: [],
    stats, // new field; see Task 6 for the type update
  } as any);
}
```

- [ ] **Step 3: Add `offlineStore.getUpdateTypeFields(orgId)` if missing**

Grep for `getUpdateTypeFields`: `git grep -n getUpdateTypeFields`. If not defined, add to `src/lib/offline/store.ts` alongside existing `getUpdateTypes`:

```ts
async getUpdateTypeFields(orgId: string): Promise<UpdateTypeField[]> {
  const db = await this.db;
  return db.getAllFromIndex('update_type_fields', 'by-org', orgId);
}
```

The `update_type_fields` store may need to be added to the IndexedDB schema in `src/lib/offline/db.ts` + sync in `sync-engine.ts`. If this is non-trivial, stub it by returning `[]` for now and file a TODO ticket — the rail still works without field labels (detail sheet's Details section will be empty).

- [ ] **Step 4: Update `ItemWithDetails`**

Open `src/lib/types.ts`. Replace the `updates:` line on `ItemWithDetails` and add `stats`:

```ts
export interface ItemWithDetails extends Item {
  item_type: ItemType;
  updates: EnrichedUpdate[];
  photos: Photo[];
  custom_fields: CustomField[];
  entities: (Entity & { entity_type: EntityType })[];
  stats: ItemHeaderStats;
}
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`

Fix call sites that construct `ItemWithDetails` manually (test mocks, storybook stories). The common fix is to spread existing + add `stats: { updatesCount: 0, speciesCount: 0, contributorsCount: 0 }`.

- [ ] **Step 6: Commit**

```bash
git add src/components/map/HomeMapView.tsx src/lib/types.ts src/lib/offline/
git commit -m "feat(timeline): enrich updates + compute header stats in map loader"
```

---

## Phase 3 — Primitive components

### Task 6: Tailwind tokens for timeline borders

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Add border tokens**

Open `tailwind.config.ts`. Extend the `forest` color object:

```ts
forest: {
  DEFAULT: 'var(--color-primary)',
  dark: 'var(--color-primary-dark)',
  light: 'var(--color-muted)',
  border: '#DBE0D3',
  'border-soft': '#E8ECE3',
},
```

These are literal hex values (not CSS vars) because the theme system does not expose border tokens. Safelist is not needed since Tailwind picks them up at build time.

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(theme): add forest.border and forest.border-soft tokens"
```

---

### Task 7: `Tag` primitive

**Files:**
- Create: `src/components/species/Tag.tsx`
- Create: `src/components/species/__tests__/Tag.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/species/__tests__/Tag.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Tag } from '../Tag';

describe('Tag', () => {
  it('renders native style with label', () => {
    render(<Tag kind="native">Native</Tag>);
    const el = screen.getByText('Native');
    expect(el).toBeInTheDocument();
    expect(el.closest('span')).toHaveClass('text-forest-dark');
  });

  it('renders intro style', () => {
    render(<Tag kind="intro">Introduced</Tag>);
    expect(screen.getByText('Introduced')).toBeInTheDocument();
  });

  it('renders cavity style', () => {
    render(<Tag kind="cavity">Cavity</Tag>);
    expect(screen.getByText('Cavity')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npx vitest run src/components/species/__tests__/Tag.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/components/species/Tag.tsx`:

```tsx
import type { ReactNode } from 'react';

type Kind = 'native' | 'intro' | 'cavity';

const styles: Record<Kind, { bg: string; fg: string; dot: string }> = {
  native: { bg: 'bg-forest/10',       fg: 'text-forest-dark', dot: 'bg-forest' },
  intro:  { bg: 'bg-[#A03B1B]/10',    fg: 'text-[#A03B1B]',   dot: 'bg-[#C76142]' },
  cavity: { bg: 'bg-forest-dark/10',  fg: 'text-forest-dark', dot: 'bg-forest-dark' },
};

export function Tag({ kind = 'native', children }: { kind?: Kind; children: ReactNode }) {
  const s = styles[kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10.5px] font-medium tracking-[0.1px] whitespace-nowrap ${s.bg} ${s.fg}`}>
      <span className={`h-[5px] w-[5px] rounded-full ${s.dot}`} />
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/components/species/__tests__/Tag.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/species/Tag.tsx src/components/species/__tests__/Tag.test.tsx
git commit -m "feat(species): Tag primitive (native / intro / cavity)"
```

---

### Task 8: `SpeciesAvatar` primitive

**Files:**
- Create: `src/components/species/SpeciesAvatar.tsx`
- Create: `src/components/species/__tests__/SpeciesAvatar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/species/__tests__/SpeciesAvatar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SpeciesAvatar } from '../SpeciesAvatar';

describe('SpeciesAvatar', () => {
  it('renders an image with the common name as alt/title', () => {
    render(<SpeciesAvatar photoUrl="bird.png" commonName="Eastern Bluebird" />);
    const img = screen.getByAltText('Eastern Bluebird') as HTMLImageElement;
    expect(img.src).toContain('bird.png');
    expect(img.title).toBe('Eastern Bluebird');
  });

  it('respects size prop', () => {
    render(<SpeciesAvatar photoUrl="x.png" commonName="X" size={20} />);
    const img = screen.getByAltText('X') as HTMLImageElement;
    expect(img.style.width).toBe('20px');
    expect(img.style.height).toBe('20px');
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npx vitest run src/components/species/__tests__/SpeciesAvatar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/components/species/SpeciesAvatar.tsx`:

```tsx
export function SpeciesAvatar({
  photoUrl,
  commonName,
  size = 28,
}: {
  photoUrl: string | null;
  commonName: string;
  size?: number;
}) {
  return (
    <img
      src={photoUrl ?? ''}
      alt={commonName}
      title={commonName}
      style={{ width: size, height: size }}
      className="rounded-full border-2 border-white bg-sage-light object-cover"
    />
  );
}
```

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/components/species/__tests__/SpeciesAvatar.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/species/SpeciesAvatar.tsx src/components/species/__tests__/SpeciesAvatar.test.tsx
git commit -m "feat(species): SpeciesAvatar primitive"
```

---

### Task 9: `SpeciesRow`

**Files:**
- Create: `src/components/species/SpeciesRow.tsx`
- Create: `src/components/species/__tests__/SpeciesRow.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/species/__tests__/SpeciesRow.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SpeciesRow } from '../SpeciesRow';

const species = {
  external_id: 14886,
  common_name: 'Eastern Bluebird',
  scientific_name: 'Sialia sialis',
  photo_url: 'b.png',
  native: true,
  cavity_nester: true,
};

describe('SpeciesRow', () => {
  it('renders common name, scientific name, and tags', () => {
    render(<SpeciesRow species={species} onOpen={() => {}} />);
    expect(screen.getByText('Eastern Bluebird')).toBeInTheDocument();
    expect(screen.getByText('Sialia sialis')).toBeInTheDocument();
    expect(screen.getByText('Native')).toBeInTheDocument();
    expect(screen.getByText('Cavity')).toBeInTheDocument();
  });

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn();
    render(<SpeciesRow species={species} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows Introduced tag when native=false', () => {
    render(<SpeciesRow species={{ ...species, native: false, cavity_nester: false }} onOpen={() => {}} />);
    expect(screen.getByText('Introduced')).toBeInTheDocument();
    expect(screen.queryByText('Cavity')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npx vitest run src/components/species/__tests__/SpeciesRow.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/components/species/SpeciesRow.tsx`:

```tsx
import { Tag } from './Tag';

export type SpeciesRowItem = {
  external_id: number;
  common_name: string;
  scientific_name: string;
  photo_url: string | null;
  native: boolean | null;
  cavity_nester: boolean | null;
};

export function SpeciesRow({ species, onOpen }: { species: SpeciesRowItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-forest-border-soft bg-white p-[10px] text-left font-body hover:bg-parchment"
    >
      <img
        src={species.photo_url ?? ''}
        alt=""
        className="h-12 w-12 shrink-0 rounded-[10px] bg-sage-light object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-semibold leading-tight">{species.common_name}</div>
        <div className="mt-[2px] text-[12px] italic leading-tight text-sage">{species.scientific_name}</div>
        <div className="mt-[5px] flex gap-[5px]">
          <Tag kind={species.native ? 'native' : 'intro'}>{species.native ? 'Native' : 'Introduced'}</Tag>
          {species.cavity_nester && <Tag kind="cavity">Cavity</Tag>}
        </div>
      </div>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-sage" aria-hidden>
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/components/species/__tests__/SpeciesRow.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/species/SpeciesRow.tsx src/components/species/__tests__/SpeciesRow.test.tsx
git commit -m "feat(species): SpeciesRow component"
```

---

### Task 10: `SpeciesTaxonomySection` (extracted from picker)

**Files:**
- Create: `src/components/species/SpeciesTaxonomySection.tsx`
- Create: `src/components/species/__tests__/SpeciesTaxonomySection.test.tsx`
- Modify: `src/components/manage/species-picker/SpeciesPickerDetail.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/species/__tests__/SpeciesTaxonomySection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SpeciesTaxonomySection } from '../SpeciesTaxonomySection';

describe('SpeciesTaxonomySection', () => {
  it('renders tags and summary', () => {
    render(
      <SpeciesTaxonomySection
        native
        cavityNester
        iucnStatus="LC"
        summary="Small thrush found across eastern North America."
      />,
    );
    expect(screen.getByText('Native')).toBeInTheDocument();
    expect(screen.getByText('Cavity nester')).toBeInTheDocument();
    expect(screen.getByText('IUCN LC')).toBeInTheDocument();
    expect(screen.getByText(/Small thrush/)).toBeInTheDocument();
  });

  it('omits cavity tag when not a cavity nester', () => {
    render(<SpeciesTaxonomySection native={false} cavityNester={false} iucnStatus="LC" summary="x" />);
    expect(screen.getByText('Introduced')).toBeInTheDocument();
    expect(screen.queryByText('Cavity nester')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npx vitest run src/components/species/__tests__/SpeciesTaxonomySection.test.tsx`

- [ ] **Step 3: Implement**

Create `src/components/species/SpeciesTaxonomySection.tsx`:

```tsx
import { Tag } from './Tag';

export function SpeciesTaxonomySection({
  native,
  cavityNester,
  iucnStatus,
  summary,
}: {
  native: boolean | null;
  cavityNester: boolean | null;
  iucnStatus: string | null;
  summary: string | null;
}) {
  return (
    <>
      <div className="mb-[14px] flex flex-wrap gap-[6px]">
        <Tag kind={native ? 'native' : 'intro'}>{native ? 'Native' : 'Introduced'}</Tag>
        {cavityNester && <Tag kind="cavity">Cavity nester</Tag>}
        {iucnStatus && <Tag kind="cavity">IUCN {iucnStatus}</Tag>}
      </div>
      {summary && (
        <p className="mb-4 text-[14px] leading-[1.55] font-body">{summary}</p>
      )}
    </>
  );
}
```

- [ ] **Step 4: Refactor `SpeciesPickerDetail.tsx`**

Open `src/components/manage/species-picker/SpeciesPickerDetail.tsx`. Replace the inline taxonomy block (tag row + summary paragraph) with:

```tsx
import { SpeciesTaxonomySection } from '@/components/species/SpeciesTaxonomySection';

// ...inside the render tree, where the taxonomy block currently lives:
<SpeciesTaxonomySection
  native={detail.native}
  cavityNester={detail.cavity_nester}
  iucnStatus={detail.iucn_status}
  summary={detail.summary}
/>
```

Verify by looking at the surrounding JSX that no other state depends on the previously inlined markup. If the picker's taxonomy block has additional fields (Family, Observations, Nearby), **keep them** — `SpeciesTaxonomySection` is only the tag row + summary paragraph; extra sections stay inline in the picker.

- [ ] **Step 5: Run tests — PASS + picker still renders**

Run: `npx vitest run src/components/species/ src/components/manage/species-picker/`
Expected: all pass.

Manually open the species picker in the dev server (`npm run dev`) and confirm the tag row still renders.

- [ ] **Step 6: Commit**

```bash
git add src/components/species/SpeciesTaxonomySection.tsx \
        src/components/species/__tests__/SpeciesTaxonomySection.test.tsx \
        src/components/manage/species-picker/SpeciesPickerDetail.tsx
git commit -m "feat(species): extract SpeciesTaxonomySection; picker consumes it"
```

---

### Task 11: `Attribution` component

**Files:**
- Create: `src/components/item/timeline/Attribution.tsx`
- Create: `src/components/item/timeline/__tests__/Attribution.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/item/timeline/__tests__/Attribution.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Attribution } from '../Attribution';
import type { AuthorCard } from '@/lib/types';

const member: AuthorCard = {
  id: 'u1',
  display_name: 'Alice Jones',
  avatar_url: 'a.png',
  role: 'contributor',
  update_count: 7,
};

const anon: AuthorCard = {
  id: 'u2',
  display_name: null,
  avatar_url: null,
  role: 'public_contributor',
  update_count: 1,
};

describe('Attribution', () => {
  it('renders member variant with name and role', () => {
    render(<Attribution update={{ anon_name: null, createdByProfile: member }} />);
    expect(screen.getByText('Alice Jones')).toBeInTheDocument();
    expect(screen.getByText(/contributor/)).toBeInTheDocument();
    expect(screen.getByText(/7 updates/)).toBeInTheDocument();
  });

  it('renders strict anon variant (no name)', () => {
    render(<Attribution update={{ anon_name: null, createdByProfile: anon }} />);
    expect(screen.getByText('Anonymous contributor')).toBeInTheDocument();
    expect(screen.getByText('ANON')).toBeInTheDocument();
    expect(screen.getByText(/submitted via public form/)).toBeInTheDocument();
  });

  it('renders named anon variant', () => {
    render(<Attribution update={{ anon_name: 'BirdFan42', createdByProfile: anon }} />);
    expect(screen.getByText('BirdFan42')).toBeInTheDocument();
    expect(screen.getByText('ANON')).toBeInTheDocument();
  });

  it('compact mode renders single inline name', () => {
    render(<Attribution update={{ anon_name: null, createdByProfile: member }} compact />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText(/updates/)).toBeNull();
  });

  it('returns null when no createdByProfile and no anon_name', () => {
    const { container } = render(<Attribution update={{ anon_name: null, createdByProfile: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npx vitest run src/components/item/timeline/__tests__/Attribution.test.tsx`

- [ ] **Step 3: Implement**

Create `src/components/item/timeline/Attribution.tsx`:

```tsx
import type { AuthorCard } from '@/lib/types';

type UpdateForAttribution = {
  anon_name: string | null;
  createdByProfile: AuthorCard | null;
};

export function Attribution({ update, compact = false }: { update: UpdateForAttribution; compact?: boolean }) {
  const isAnon = update.createdByProfile?.role === 'public_contributor' || !update.createdByProfile;
  const avatarSize = compact ? 20 : 32;

  if (isAnon) {
    // Public-form submission. Show dashed "?" avatar + optional nickname + ANON pill.
    const name = update.anon_name || (compact ? 'Anon' : 'Anonymous contributor');
    return (
      <div className={`flex items-center ${compact ? 'gap-[6px]' : 'gap-2'}`}>
        <div
          style={{ width: avatarSize, height: avatarSize }}
          className="flex shrink-0 items-center justify-center rounded-full border border-dashed border-forest-border bg-sage-light font-body text-sage"
        >
          <span className={compact ? 'text-[9px] font-semibold' : 'text-[12px] font-semibold'}>?</span>
        </div>
        {compact ? (
          <span className="text-[11.5px] font-medium text-sage">{name}</span>
        ) : (
          <div className="min-w-0">
            <div className="flex items-center gap-[6px] text-[13px] font-medium">
              {name}
              <span className="rounded-full bg-sage-light px-[6px] py-[1px] text-[10px] font-medium tracking-[0.3px] text-sage">ANON</span>
            </div>
            <div className="text-[11.5px] text-sage">submitted via public form</div>
          </div>
        )}
      </div>
    );
  }

  const u = update.createdByProfile!;
  const display = u.display_name ?? 'Unknown';
  return (
    <div className={`flex items-center ${compact ? 'gap-[6px]' : 'gap-2'}`}>
      <img
        src={u.avatar_url ?? ''}
        alt=""
        style={{ width: avatarSize, height: avatarSize }}
        className="shrink-0 rounded-full bg-sage-light object-cover"
      />
      {compact ? (
        <span className="text-[11.5px] font-medium">{display.split(' ')[0]}</span>
      ) : (
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">{display}</div>
          <div className="text-[11.5px] text-sage">{u.role} · {u.update_count} updates</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/components/item/timeline/__tests__/Attribution.test.tsx`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/item/timeline/Attribution.tsx \
        src/components/item/timeline/__tests__/Attribution.test.tsx
git commit -m "feat(timeline): Attribution component (member / anon / named anon)"
```

---

## Phase 4 — Timeline components

### Task 12: Animation keyframes stylesheet

**Files:**
- Create: `src/components/item/timeline/timeline.css`

- [ ] **Step 1: Create the stylesheet**

Create `src/components/item/timeline/timeline.css`:

```css
@keyframes fmSlideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

@keyframes fmSlideIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

.fm-slide-up { animation: fmSlideUp 0.28s cubic-bezier(0.2, 0.8, 0.2, 1); }
.fm-slide-in { animation: fmSlideIn  0.26s cubic-bezier(0.2, 0.8, 0.2, 1); }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/item/timeline/timeline.css
git commit -m "feat(timeline): slide-up and slide-in keyframes"
```

---

### Task 13: `RailCard`

**Files:**
- Create: `src/components/item/timeline/RailCard.tsx`
- Create: `src/components/item/timeline/__tests__/RailCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/item/timeline/__tests__/RailCard.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RailCard } from '../RailCard';
import type { EnrichedUpdate } from '@/lib/types';

function makeUpdate(overrides: Partial<EnrichedUpdate> = {}): EnrichedUpdate {
  return {
    id: 'u1', item_id: 'i1', update_type_id: 'ut1', content: 'Saw a bluebird',
    update_date: '2026-04-19T10:00:00Z', created_at: '2026-04-19T10:00:00Z',
    created_by: 'user-a', org_id: 'o1', property_id: 'p1',
    custom_field_values: {}, anon_name: null,
    update_type: { id: 'ut1', org_id: 'o1', name: 'Nest check', icon: '🐣', is_global: true, item_type_id: null, sort_order: 0, min_role_create: null, min_role_edit: null, min_role_delete: null },
    photos: [],
    species: [],
    fields: [],
    createdByProfile: { id: 'user-a', display_name: 'Alice', avatar_url: null, role: 'contributor', update_count: 3 },
    ...overrides,
  };
}

describe('RailCard', () => {
  it('renders type name and content', () => {
    render(<RailCard update={makeUpdate()} onOpen={() => {}} isLast={false} />);
    expect(screen.getByText('Nest check')).toBeInTheDocument();
    expect(screen.getByText('Saw a bluebird')).toBeInTheDocument();
  });

  it('uses icon fallback when no photo', () => {
    render(<RailCard update={makeUpdate()} onOpen={() => {}} isLast={false} />);
    expect(screen.getByText('🐣')).toBeInTheDocument();
  });

  it('uses photo when present', () => {
    const update = makeUpdate({ photos: [{ id: 'ph1', update_id: 'u1', storage_path: 'p.png', url: 'p.png' } as any] });
    render(<RailCard update={update} onOpen={() => {}} isLast={false} />);
    expect(screen.queryByText('🐣')).toBeNull();
    // thumb image present — any img with src p.png
    expect(document.querySelector('img[src="p.png"]')).toBeInTheDocument();
  });

  it('caps species avatar stack at 3', () => {
    const update = makeUpdate({
      species: [
        { external_id: 1, entity_id: 'e1', common_name: 'A', photo_url: 'a.png', native: true, cavity_nester: false },
        { external_id: 2, entity_id: 'e2', common_name: 'B', photo_url: 'b.png', native: true, cavity_nester: false },
        { external_id: 3, entity_id: 'e3', common_name: 'C', photo_url: 'c.png', native: true, cavity_nester: false },
        { external_id: 4, entity_id: 'e4', common_name: 'D', photo_url: 'd.png', native: true, cavity_nester: false },
      ],
    });
    render(<RailCard update={update} onOpen={() => {}} isLast={false} />);
    const avatars = Array.from(document.querySelectorAll('img[alt="A"], img[alt="B"], img[alt="C"], img[alt="D"]'));
    expect(avatars).toHaveLength(3);
  });

  it('onOpen fires on click', () => {
    const onOpen = vi.fn();
    render(<RailCard update={makeUpdate()} onOpen={onOpen} isLast={false} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('hides the rail line when isLast', () => {
    render(<RailCard update={makeUpdate()} onOpen={() => {}} isLast />);
    // rail line is rendered with data-testid="rail-line"
    expect(document.querySelector('[data-testid="rail-line"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npx vitest run src/components/item/timeline/__tests__/RailCard.test.tsx`

- [ ] **Step 3: Implement**

Create `src/components/item/timeline/RailCard.tsx`:

```tsx
import type { EnrichedUpdate } from '@/lib/types';
import { Attribution } from './Attribution';
import { SpeciesAvatar } from '@/components/species/SpeciesAvatar';

function fmtRel(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 86_400_000;
  if (diff < 1) return `${Math.max(1, Math.round(diff * 24))}h ago`;
  if (diff < 7) return `${Math.round(diff)}d ago`;
  if (diff < 30) return `${Math.round(diff / 7)}w ago`;
  const dt = new Date(iso);
  if (diff < 365) return dt.toLocaleString('en-US', { month: 'short', day: 'numeric' });
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function RailCard({
  update,
  onOpen,
  isLast,
}: {
  update: EnrichedUpdate;
  onOpen: () => void;
  isLast: boolean;
}) {
  const firstPhoto = update.photos[0];
  const speciesStack = update.species.slice(0, 3);
  return (
    <div className="relative pl-7" style={{ paddingBottom: isLast ? 0 : 14 }}>
      {!isLast && (
        <div
          data-testid="rail-line"
          className="absolute left-[10px] top-5 bottom-0 w-[1.5px] bg-forest-border-soft"
        />
      )}
      <div className="absolute left-1 top-[6px] h-[14px] w-[14px] rounded-full border-[2.5px] border-forest bg-white ring-[3px] ring-parchment" />
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full gap-3 rounded-[14px] border border-forest-border-soft bg-white p-3 text-left font-body"
      >
        {firstPhoto ? (
          <div className="h-[66px] w-[66px] shrink-0 overflow-hidden rounded-[10px] bg-sage-light">
            <img src={firstPhoto.url ?? ''} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-[10px] bg-sage-light text-[26px]">
            {update.update_type.icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-[6px]">
            <span className="text-[13px] font-semibold text-forest-dark">{update.update_type.name}</span>
            <span className="font-mono text-[11px] text-sage">{fmtRel(update.update_date)}</span>
          </div>
          {update.content && (
            <p className="mt-[3px] line-clamp-2 text-[13px] leading-[1.4]">{update.content}</p>
          )}
          <div className="mt-[6px] flex items-center gap-2">
            <Attribution update={update} compact />
            {speciesStack.length > 0 && (
              <div className="ml-auto flex">
                {speciesStack.map((s, i) => (
                  <div key={s.external_id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                    <SpeciesAvatar photoUrl={s.photo_url} commonName={s.common_name} size={20} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/components/item/timeline/__tests__/RailCard.test.tsx`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/item/timeline/RailCard.tsx \
        src/components/item/timeline/__tests__/RailCard.test.tsx
git commit -m "feat(timeline): RailCard (photo-led vertical rail card)"
```

---

### Task 14: `TimelineRail` (replaces TimelineOverview)

**Files:**
- Create: `src/components/item/timeline/TimelineRail.tsx`
- Create: `src/components/item/timeline/__tests__/TimelineRail.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/item/timeline/__tests__/TimelineRail.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TimelineRail } from '../TimelineRail';
import type { EnrichedUpdate } from '@/lib/types';

function make(i: number): EnrichedUpdate {
  return {
    id: `u${i}`, item_id: 'i1', update_type_id: 'ut1', content: `update ${i}`,
    update_date: '2026-04-19T10:00:00Z', created_at: '2026-04-19T10:00:00Z',
    created_by: 'user-a', org_id: 'o1', property_id: 'p1',
    custom_field_values: {}, anon_name: null,
    update_type: { id: 'ut1', org_id: 'o1', name: 'Type', icon: '🐣', is_global: true, item_type_id: null, sort_order: 0, min_role_create: null, min_role_edit: null, min_role_delete: null },
    photos: [], species: [], fields: [],
    createdByProfile: { id: 'user-a', display_name: 'A', avatar_url: null, role: 'contributor', update_count: 1 },
  };
}

describe('TimelineRail', () => {
  it('renders all updates when under cap', () => {
    const updates = [make(1), make(2), make(3)];
    render(<TimelineRail updates={updates} maxItems={10} canAddUpdate={false} onDeleteUpdate={() => {}} />);
    expect(screen.getByText('update 1')).toBeInTheDocument();
    expect(screen.getByText('update 3')).toBeInTheDocument();
    expect(screen.queryByText(/View all/i)).toBeNull();
  });

  it('caps at maxItems and shows View all', () => {
    const updates = [make(1), make(2), make(3), make(4)];
    render(<TimelineRail updates={updates} maxItems={2} canAddUpdate={false} onDeleteUpdate={() => {}} />);
    expect(screen.getByText('update 1')).toBeInTheDocument();
    expect(screen.getByText('update 2')).toBeInTheDocument();
    expect(screen.queryByText('update 3')).toBeNull();
    expect(screen.getByRole('button', { name: /view all/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Create `src/components/item/timeline/TimelineRail.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { EnrichedUpdate } from '@/lib/types';
import { RailCard } from './RailCard';
import { UpdateDetailSheet } from './UpdateDetailSheet';
import { AllUpdatesSheet } from './AllUpdatesSheet';
// ScheduledUpdatesSection kept from prior work; re-exported.
import { ScheduledUpdatesSection } from './ScheduledUpdatesSection';
import { partitionScheduled } from './timeline-helpers';

export function TimelineRail({
  updates,
  maxItems,
  showScheduled = true,
  canAddUpdate,
  onAddUpdate,
  onDeleteUpdate,
}: {
  updates: EnrichedUpdate[];
  maxItems?: number;
  showScheduled?: boolean;
  canAddUpdate: boolean;
  onAddUpdate?: () => void;
  onDeleteUpdate: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [speciesOpenExternalId, setSpeciesOpenExternalId] = useState<number | null>(null);

  const { scheduled, past } = partitionScheduled(updates as any); // helper still types loosely
  const cap = maxItems ?? past.length;
  const capped = past.slice(0, cap);
  const hasMore = past.length > cap;

  const open = updates.find((u) => u.id === openId) ?? null;

  return (
    <div className="pb-24">
      {showScheduled && scheduled.length > 0 && (
        <ScheduledUpdatesSection updates={scheduled as any} onOpen={(u: any) => setOpenId(u.id)} />
      )}
      <div className="px-4 pt-[14px]">
        {capped.map((u, i) => (
          <RailCard
            key={u.id}
            update={u}
            onOpen={() => setOpenId(u.id)}
            isLast={i === capped.length - 1}
          />
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={() => setAllOpen(true)}
            className="mt-3 w-full rounded-xl border border-forest-border-soft bg-white px-4 py-2 text-sm font-medium text-forest-dark"
          >
            View all {past.length} updates
          </button>
        )}
      </div>
      <UpdateDetailSheet
        update={open}
        onClose={() => setOpenId(null)}
        onSpeciesOpen={(externalId) => setSpeciesOpenExternalId(externalId)}
        canEdit={false}
        canDelete={false}
        onDelete={() => {
          if (open) onDeleteUpdate(open.id);
          setOpenId(null);
        }}
      />
      {allOpen && (
        <AllUpdatesSheet
          updates={past}
          onClose={() => setAllOpen(false)}
          onOpen={(u) => {
            setAllOpen(false);
            setOpenId(u.id);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — FAIL (missing siblings)**

Run: `npx vitest run src/components/item/timeline/__tests__/TimelineRail.test.tsx`
Expected: FAIL — `UpdateDetailSheet` and `AllUpdatesSheet` have not been rewritten yet. The test imports `TimelineRail` which imports these. Skip this test for now by inserting `describe.skip(...)` and run later after Task 15 and 16.

Actually: keep the test blocking. The fix is to **stub the dependencies first** in Task 15 + 16 before this test runs green. Run all three tasks then come back.

- [ ] **Step 5: Defer test run**

Move on to Task 15; return to run the TimelineRail test after Task 16 completes.

---

### Task 15: `UpdateDetailSheet` rewrite

**Files:**
- Modify (rewrite): `src/components/item/timeline/UpdateDetailSheet.tsx`
- Create: `src/components/item/timeline/__tests__/UpdateDetailSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/item/timeline/__tests__/UpdateDetailSheet.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UpdateDetailSheet } from '../UpdateDetailSheet';
import type { EnrichedUpdate } from '@/lib/types';

function make(overrides: Partial<EnrichedUpdate> = {}): EnrichedUpdate {
  return {
    id: 'u1', item_id: 'i1', update_type_id: 'ut1', content: 'Bluebird fledged!',
    update_date: '2026-04-19T10:00:00Z', created_at: '2026-04-19T10:00:00Z',
    created_by: 'user-a', org_id: 'o1', property_id: 'p1',
    custom_field_values: {}, anon_name: null,
    update_type: { id: 'ut1', org_id: 'o1', name: 'Nest check', icon: '🐣', is_global: true, item_type_id: null, sort_order: 0, min_role_create: null, min_role_edit: null, min_role_delete: null },
    photos: [],
    species: [],
    fields: [],
    createdByProfile: { id: 'user-a', display_name: 'Alice', avatar_url: null, role: 'contributor', update_count: 7 },
    ...overrides,
  };
}

describe('UpdateDetailSheet', () => {
  it('renders nothing when update is null', () => {
    const { container } = render(<UpdateDetailSheet update={null} onClose={() => {}} onSpeciesOpen={() => {}} canEdit={false} canDelete={false} onDelete={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders content and attribution', () => {
    render(<UpdateDetailSheet update={make()} onClose={() => {}} onSpeciesOpen={() => {}} canEdit={false} canDelete={false} onDelete={() => {}} />);
    expect(screen.getByText('Bluebird fledged!')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('close button fires onClose', () => {
    const onClose = vi.fn();
    render(<UpdateDetailSheet update={make()} onClose={onClose} onSpeciesOpen={() => {}} canEdit={false} canDelete={false} onDelete={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('species row click fires onSpeciesOpen with external_id', () => {
    const onSpeciesOpen = vi.fn();
    const update = make({
      species: [{ external_id: 14886, entity_id: 'e1', common_name: 'Eastern Bluebird', photo_url: 'b.png', native: true, cavity_nester: true }],
    });
    render(<UpdateDetailSheet update={update} onClose={() => {}} onSpeciesOpen={onSpeciesOpen} canEdit={false} canDelete={false} onDelete={() => {}} />);
    fireEvent.click(screen.getByText('Eastern Bluebird'));
    expect(onSpeciesOpen).toHaveBeenCalledWith(14886);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Rewrite the file**

Replace the entire contents of `src/components/item/timeline/UpdateDetailSheet.tsx`:

```tsx
'use client';

import type { EnrichedUpdate } from '@/lib/types';
import { Attribution } from './Attribution';
import { SpeciesRow } from '@/components/species/SpeciesRow';
import './timeline.css';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtRel(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 86_400_000;
  if (diff < 1) return `${Math.max(1, Math.round(diff * 24))}h ago`;
  if (diff < 7) return `${Math.round(diff)}d ago`;
  if (diff < 30) return `${Math.round(diff / 7)}w ago`;
  return fmtDate(iso);
}

export function UpdateDetailSheet({
  update,
  onClose,
  onSpeciesOpen,
  onDelete,
  canEdit,
  canDelete,
}: {
  update: EnrichedUpdate | null;
  onClose: () => void;
  onSpeciesOpen: (externalId: number) => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  if (!update) return null;
  const firstPhoto = update.photos[0];
  const extraPhotos = update.photos.slice(1);

  return (
    <div className="fm-slide-up fixed inset-0 z-[100] flex flex-col bg-white">
      {/* Hero */}
      <div
        className={`relative shrink-0 ${firstPhoto ? 'bg-sage-light' : 'bg-forest-dark'}`}
        style={{ height: firstPhoto ? 240 : 140 }}
      >
        {firstPhoto && <img src={firstPhoto.url ?? ''} alt="" className="h-full w-full object-cover" />}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-forest-dark/35 via-transparent to-forest-dark/75" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute left-[14px] top-[58px] flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur"
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-forest-dark"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        {(canEdit || canDelete) && (
          <button
            type="button"
            aria-label="More"
            className="absolute right-[14px] top-[58px] flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur"
            onClick={canDelete ? onDelete : undefined}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" className="text-forest-dark">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        )}
        <div className="absolute inset-x-4 bottom-3 text-white">
          <div className="flex items-center gap-[6px] font-mono text-[11px] uppercase tracking-[1px] opacity-90">
            <span>{update.update_type.icon}</span>
            <span>{update.update_type.name}</span>
          </div>
          <h2 className="mt-[3px] font-heading text-[22px] font-medium leading-tight">{fmtDate(update.update_date)}</h2>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-4 pb-24 pt-4">
        <div className="mb-[14px] flex items-center gap-[10px] rounded-xl border border-forest-border-soft bg-parchment px-3 py-[10px]">
          <Attribution update={update} />
          <div className="ml-auto text-right text-[11px] text-sage">
            <div>{fmtTime(update.update_date)}</div>
            <div>{fmtRel(update.update_date)}</div>
          </div>
        </div>

        {update.content && (
          <p className="mb-[18px] text-[15px] leading-[1.55] font-body">{update.content}</p>
        )}

        {update.species.length > 0 && (
          <div className="mb-[18px]">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.8px] text-sage font-body">
                Species observed · {update.species.length}
              </div>
              <div className="font-mono text-[10.5px] text-forest">iNat</div>
            </div>
            <div className="flex flex-col gap-2">
              {update.species.map((s) => (
                <SpeciesRow
                  key={s.external_id}
                  species={{
                    external_id: s.external_id,
                    common_name: s.common_name,
                    scientific_name: s.common_name, // scientific name not carried yet on EnrichedUpdateSpecies; follow-up to add
                    photo_url: s.photo_url,
                    native: s.native,
                    cavity_nester: s.cavity_nester,
                  }}
                  onOpen={() => onSpeciesOpen(s.external_id)}
                />
              ))}
            </div>
          </div>
        )}

        {extraPhotos.length > 0 && (
          <div className="mb-[18px]">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-sage font-body">Photos</div>
            <div className="grid grid-cols-2 gap-2">
              {extraPhotos.map((p) => (
                <div key={p.id} className="aspect-square overflow-hidden rounded-[10px] bg-sage-light">
                  <img src={p.url ?? ''} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {update.fields.length > 0 && (
          <div className="mb-[18px]">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-sage font-body">Details</div>
            <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-forest-border-soft bg-white">
              {update.fields.map((f, i, arr) => {
                const odd = arr.length % 2 !== 0 && i === arr.length - 1;
                return (
                  <div
                    key={i}
                    className={[
                      'px-3 py-[10px]',
                      i % 2 === 0 && !odd ? 'border-r border-forest-border-soft' : '',
                      i >= 2 ? 'border-t border-forest-border-soft' : '',
                      odd ? 'col-span-2' : '',
                    ].join(' ')}
                  >
                    <div className="mb-[2px] text-[10px] font-medium uppercase tracking-[0.6px] text-sage font-body">{f.label}</div>
                    <div className="text-[13.5px] font-medium font-body">{f.value}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-6 font-mono text-[11px] text-sage">Update · #{update.id.toUpperCase()}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/components/item/timeline/__tests__/UpdateDetailSheet.test.tsx`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/item/timeline/UpdateDetailSheet.tsx \
        src/components/item/timeline/__tests__/UpdateDetailSheet.test.tsx
git commit -m "feat(timeline): rewrite UpdateDetailSheet (full-screen slide-up)"
```

---

### Task 16: `AllUpdatesSheet` rewrite to use RailCard

**Files:**
- Modify: `src/components/item/timeline/AllUpdatesSheet.tsx`

- [ ] **Step 1: Rewrite the file**

Replace the contents of `src/components/item/timeline/AllUpdatesSheet.tsx`:

```tsx
'use client';

import type { EnrichedUpdate } from '@/lib/types';
import { RailCard } from './RailCard';
import './timeline.css';

export function AllUpdatesSheet({
  updates,
  onClose,
  onOpen,
}: {
  updates: EnrichedUpdate[];
  onClose: () => void;
  onOpen: (u: EnrichedUpdate) => void;
}) {
  return (
    <div className="fm-slide-up fixed inset-0 z-[100] flex flex-col bg-parchment">
      <header className="flex items-center justify-between border-b border-forest-border-soft bg-white px-4 pb-3 pt-[58px]">
        <h2 className="font-heading text-lg font-medium text-forest-dark">All updates</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-light"
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <div className="flex-1 overflow-auto px-4 pt-4">
        {updates.map((u, i) => (
          <RailCard
            key={u.id}
            update={u}
            onOpen={() => onOpen(u)}
            isLast={i === updates.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run TimelineRail test (now unblocked) + suite**

Run: `npx vitest run src/components/item/timeline/`
Expected: all timeline tests pass (`Attribution`, `RailCard`, `TimelineRail`, `UpdateDetailSheet`).

- [ ] **Step 3: Commit**

```bash
git add src/components/item/timeline/AllUpdatesSheet.tsx \
        src/components/item/timeline/TimelineRail.tsx \
        src/components/item/timeline/__tests__/TimelineRail.test.tsx
git commit -m "feat(timeline): TimelineRail + AllUpdatesSheet rewrite"
```

---

### Task 17: Wire `TimelineBlock` and `DetailPanel`, delete old files

**Files:**
- Modify: `src/components/layout/blocks/TimelineBlock.tsx`
- Modify: `src/components/item/DetailPanel.tsx`
- Delete: `src/components/item/timeline/TimelineOverview.tsx`
- Delete: `src/components/item/timeline/UpdateCard.tsx`

- [ ] **Step 1: Update `TimelineBlock.tsx`**

Open `src/components/layout/blocks/TimelineBlock.tsx`. Replace the `TimelineOverview` import and usage with `TimelineRail`:

```tsx
import { TimelineRail } from '@/components/item/timeline/TimelineRail';

// inside the component body, wherever <TimelineOverview ... /> is rendered:
<TimelineRail
  updates={item.updates}
  maxItems={config.maxItems}
  showScheduled={config.showScheduled}
  canAddUpdate={canAddUpdate}
  onAddUpdate={onAddUpdate}
  onDeleteUpdate={onDeleteUpdate}
/>
```

- [ ] **Step 2: Update `DetailPanel.tsx`**

Open `src/components/item/DetailPanel.tsx`. Replace any legacy `UpdateTimeline` or `TimelineOverview` import with `TimelineRail`. Same prop surface as above. If `DetailPanel` currently renders its own item header inline (name, status, photos), leave that alone for now — `ItemHeader` ships in Task 18.

- [ ] **Step 3: Delete deprecated files**

```bash
git rm src/components/item/timeline/TimelineOverview.tsx
git rm src/components/item/timeline/UpdateCard.tsx
```

Also grep for any stray imports: `git grep -n 'TimelineOverview\|UpdateCard'`. Any callers that still reference these need to be updated to `TimelineRail` / `RailCard`.

- [ ] **Step 4: Type-check + full test suite**

Run: `npm run type-check && npx vitest run`
Expected: no new errors; all component tests pass. If `timeline-helpers.ts` references are now unused (the `detectPrimaryContent` / `getKeyFieldValues` functions), leave them for now — they're pure and don't hurt; a later cleanup commit can remove them.

- [ ] **Step 5: Manual dev-server smoke**

Run: `npm run dev`. Open the app, click an item marker on the map, and confirm:
- Timeline now shows rail cards with photo thumbs and attribution.
- Clicking a card opens the new full-screen update detail sheet.
- Close button closes the sheet.
- "View all" button appears if there are more than `maxItems` updates.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/blocks/TimelineBlock.tsx src/components/item/DetailPanel.tsx
git commit -m "feat(timeline): wire TimelineRail into TimelineBlock + DetailPanel; remove old components"
```

---

### Task 18: `ItemHeader` component + wire into DetailPanel

**Files:**
- Create: `src/components/item/ItemHeader.tsx`
- Create: `src/components/item/__tests__/ItemHeader.test.tsx`
- Modify: `src/components/item/DetailPanel.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/item/__tests__/ItemHeader.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ItemHeader } from '../ItemHeader';

const item = {
  id: 'i1', name: 'Meadow Box #7', custom_field_values: {},
  item_type: { name: 'Nest Box' },
} as any;

describe('ItemHeader', () => {
  it('renders name, location, and stats', () => {
    render(
      <ItemHeader
        item={item}
        location="Meadow Loop"
        photoUrl="box.png"
        stats={{ updatesCount: 24, speciesCount: 3, contributorsCount: 5 }}
        onBack={() => {}}
        onShare={() => {}}
      />,
    );
    expect(screen.getByText('Meadow Box #7')).toBeInTheDocument();
    expect(screen.getByText('Meadow Loop')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Updates')).toBeInTheDocument();
    expect(screen.getByText('Species')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Create `src/components/item/ItemHeader.tsx`:

```tsx
import type { Item, ItemHeaderStats } from '@/lib/types';

export function ItemHeader({
  item,
  location,
  photoUrl,
  stats,
  onBack,
  onShare,
}: {
  item: Item & { item_type?: { name?: string } };
  location: string | null;
  photoUrl: string | null;
  stats: ItemHeaderStats;
  onBack: () => void;
  onShare: () => void;
}) {
  const cells = [
    { v: stats.updatesCount, l: 'Updates' },
    { v: stats.speciesCount, l: 'Species' },
    { v: stats.contributorsCount, l: 'People' },
  ];
  return (
    <div>
      <div className="relative h-[180px] bg-sage-light">
        {photoUrl && <img src={photoUrl} alt="" className="h-full w-full object-cover" />}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-forest-dark/65" />
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="absolute left-[14px] top-[58px] flex h-9 w-9 items-center justify-center rounded-full bg-white/92 backdrop-blur"
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-forest-dark"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <button
          type="button"
          onClick={onShare}
          aria-label="Share"
          className="absolute right-[14px] top-[58px] flex h-9 w-9 items-center justify-center rounded-full bg-white/92 backdrop-blur"
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-forest-dark"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
        </button>
        <div className="absolute inset-x-4 bottom-3 text-white">
          {location && (
            <div className="flex items-center gap-[5px] font-mono text-[11px] tracking-[0.5px] opacity-90">
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s7-8 7-13a7 7 0 10-14 0c0 5 7 13 7 13z" /><circle cx="12" cy="9" r="2.5" /></svg>
              {location}
            </div>
          )}
          <h1 className="mt-[3px] font-heading text-[26px] font-medium leading-tight tracking-[-0.3px]">{item.name}</h1>
        </div>
      </div>
      <div className="grid grid-cols-3 border-b border-forest-border bg-white">
        {cells.map((c, i) => (
          <div
            key={c.l}
            className={`px-1 py-3 text-center ${i < 2 ? 'border-r border-forest-border-soft' : ''}`}
          >
            <div className="font-heading text-[20px] font-medium leading-none text-forest-dark">{c.v}</div>
            <div className="mt-[3px] text-[10px] uppercase tracking-[0.6px] text-sage">{c.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/components/item/__tests__/ItemHeader.test.tsx`

- [ ] **Step 5: Wire into `DetailPanel.tsx`**

Open `src/components/item/DetailPanel.tsx`. At the top of the rendered item panel, replace whatever name/status/header markup currently exists with:

```tsx
import { ItemHeader } from './ItemHeader';

// inside the render:
<ItemHeader
  item={item}
  location={/* existing derivation, e.g. item property name or null */ null}
  photoUrl={item.photos[0]?.url ?? null}
  stats={item.stats}
  onBack={onClose}
  onShare={() => {/* existing share handler if any; otherwise no-op */}}
/>
```

Keep the meta row and custom-fields rendering that follow the header — only the name+stats block is replaced.

- [ ] **Step 6: Dev server smoke + commit**

Run: `npm run dev`. Open an item, confirm the new header renders with stats strip.

```bash
git add src/components/item/ItemHeader.tsx \
        src/components/item/__tests__/ItemHeader.test.tsx \
        src/components/item/DetailPanel.tsx
git commit -m "feat(item): ItemHeader component with 3-stat strip"
```

---

## Phase 5 — Species detail + routing

### Task 19: `getSpeciesDetail` shared fetcher

**Files:**
- Create: `src/lib/species/getSpeciesDetail.ts`
- Create: `src/lib/species/__tests__/getSpeciesDetail.test.ts`

- [ ] **Step 1: Find the existing iNat fetch used by the picker**

Run: `git grep -n 'inaturalist\|iNat\|taxa/' src/components/manage/species-picker/`

Identify the function that fetches species detail by taxon_id (likely in `SpeciesPickerDetail.tsx` or a sibling helper). Note its signature and return shape.

- [ ] **Step 2: Write the failing test**

Create `src/lib/species/__tests__/getSpeciesDetail.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSpeciesDetail } from '../getSpeciesDetail';

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('getSpeciesDetail', () => {
  it('maps iNat taxa response to SpeciesDetail shape', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          id: 14886,
          preferred_common_name: 'Eastern Bluebird',
          name: 'Sialia sialis',
          default_photo: { medium_url: 'b.png', original_url: 'big.png' },
          conservation_status: { iucn: 'LC' },
          wikipedia_summary: 'A small thrush.',
        }],
      }),
    });
    const out = await getSpeciesDetail(14886);
    expect(out.external_id).toBe(14886);
    expect(out.common_name).toBe('Eastern Bluebird');
    expect(out.scientific_name).toBe('Sialia sialis');
    expect(out.photo_url).toBe('b.png');
    expect(out.iucn_status).toBe('LC');
    expect(out.summary).toBe('A small thrush.');
  });

  it('returns null fields when data missing', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: 1, name: 'X' }] }),
    });
    const out = await getSpeciesDetail(1);
    expect(out.common_name).toBe('X');
    expect(out.iucn_status).toBeNull();
  });
});
```

- [ ] **Step 3: Run — FAIL**

- [ ] **Step 4: Implement**

Create `src/lib/species/getSpeciesDetail.ts`:

```ts
export type SpeciesDetail = {
  external_id: number;
  common_name: string;
  scientific_name: string;
  photo_url: string | null;
  large_photo_url: string | null;
  native: boolean | null;       // filled by local entity lookup, not iNat
  cavity_nester: boolean | null; // filled by local entity lookup, not iNat
  iucn_status: string | null;
  summary: string | null;
};

export async function getSpeciesDetail(externalId: number): Promise<SpeciesDetail> {
  const res = await fetch(`https://api.inaturalist.org/v1/taxa/${externalId}`);
  if (!res.ok) throw new Error(`iNat taxa ${externalId}: ${res.status}`);
  const body = await res.json();
  const t = body.results?.[0];
  if (!t) throw new Error(`iNat taxa ${externalId}: no results`);
  return {
    external_id: externalId,
    common_name: t.preferred_common_name ?? t.name ?? 'Unknown',
    scientific_name: t.name ?? '',
    photo_url: t.default_photo?.medium_url ?? null,
    large_photo_url: t.default_photo?.original_url ?? t.default_photo?.medium_url ?? null,
    native: null,
    cavity_nester: null,
    iucn_status: t.conservation_status?.iucn ?? null,
    summary: t.wikipedia_summary ?? null,
  };
}
```

- [ ] **Step 5: Refactor the picker to use this helper**

Open `src/components/manage/species-picker/SpeciesPickerDetail.tsx`. If it has its own inline iNat fetch, replace it with `import { getSpeciesDetail } from '@/lib/species/getSpeciesDetail'`. Match the call site to the helper's return shape. If the picker already returns additional iNat fields not in the helper (observations count, family, etc.), keep the picker-specific fetch for those extras, but have `getSpeciesDetail` for the shared subset.

- [ ] **Step 6: Run all tests + commit**

```bash
npx vitest run src/lib/species/ src/components/manage/species-picker/
git add src/lib/species/
git commit -m "feat(species): getSpeciesDetail shared fetcher"
```

---

### Task 20: Scope-query server actions

**Files:**
- Create: `src/app/species/[id]/actions.ts`
- Create: `src/app/species/[id]/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/species/[id]/__tests__/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => {
  const builder = {
    _filter: {} as Record<string, any>,
    eq(this: any, col: string, v: any) { this._filter[col] = v; return this; },
    select(this: any) { return this; },
    then(this: any, cb: any) { return cb({ data: this._rows ?? [], error: null }); },
  };
  return {
    createClient: () => ({
      from(table: string) {
        return {
          ...builder,
          _rows: (globalThis as any).__mockRows?.[table] ?? [],
        };
      },
    }),
  };
});

beforeEach(() => {
  (globalThis as any).__mockRows = {};
});

describe('getSpeciesCitingsAtItem', () => {
  it('counts rows and picks max observed_at', async () => {
    (globalThis as any).__mockRows = {
      species_sightings_v: [
        { observed_at: '2026-01-10' },
        { observed_at: '2026-04-01' },
        { observed_at: '2026-02-05' },
      ],
    };
    const { getSpeciesCitingsAtItem } = await import('../actions');
    const out = await getSpeciesCitingsAtItem(14886, 'item-1');
    expect(out.count).toBe(3);
    expect(out.lastObserved).toBe('2026-04-01');
  });

  it('returns zero count when no rows', async () => {
    (globalThis as any).__mockRows = { species_sightings_v: [] };
    const { getSpeciesCitingsAtItem } = await import('../actions');
    const out = await getSpeciesCitingsAtItem(14886, 'item-1');
    expect(out.count).toBe(0);
    expect(out.lastObserved).toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npx vitest run src/app/species/\[id\]/__tests__/actions.test.ts`

- [ ] **Step 3: Implement**

Create `src/app/species/[id]/actions.ts`:

```ts
'use server';

import { createClient } from '@/lib/supabase/server';
import type {
  SpeciesCitingsItem,
  SpeciesCitingsProperty,
  SpeciesCitingsOrg,
} from '@/lib/types';

type Row = { observed_at: string; item_id: string; property_id: string };

export async function getSpeciesCitingsAtItem(
  speciesId: number,
  itemId: string,
): Promise<SpeciesCitingsItem> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('species_sightings_v')
    .select('observed_at')
    .eq('species_id', speciesId)
    .eq('item_id', itemId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Pick<Row, 'observed_at'>[];
  const count = rows.length;
  const lastObserved = rows.reduce<string | null>((acc, r) => {
    if (!acc || r.observed_at > acc) return r.observed_at;
    return acc;
  }, null);
  return { count, lastObserved };
}

export async function getSpeciesCitingsAtProperty(
  speciesId: number,
  propertyId: string,
  currentItemId: string,
): Promise<SpeciesCitingsProperty> {
  const supabase = createClient();
  // One broad read; aggregate in app code. The property table lookup
  // is done in a single follow-up query for item names.
  const { data: sightings, error } = await supabase
    .from('species_sightings_v')
    .select('item_id, observed_at')
    .eq('species_id', speciesId)
    .eq('property_id', propertyId);
  if (error) throw new Error(error.message);
  const byItem = new Map<string, { count: number; last: string }>();
  for (const r of (sightings ?? []) as Pick<Row, 'item_id' | 'observed_at'>[]) {
    const cur = byItem.get(r.item_id);
    if (!cur) byItem.set(r.item_id, { count: 1, last: r.observed_at });
    else {
      cur.count += 1;
      if (r.observed_at > cur.last) cur.last = r.observed_at;
    }
  }
  const itemIds = [...byItem.keys()];
  let names = new Map<string, string>();
  if (itemIds.length > 0) {
    const { data: items, error: ierr } = await supabase
      .from('items')
      .select('id, name')
      .in('id', itemIds);
    if (ierr) throw new Error(ierr.message);
    for (const it of (items ?? []) as { id: string; name: string }[]) names.set(it.id, it.name);
  }
  const items: SpeciesCitingsProperty['items'] = itemIds.map((id) => ({
    item_id: id,
    item_name: names.get(id) ?? 'Unknown',
    count: byItem.get(id)!.count,
    last: byItem.get(id)!.last,
    current: id === currentItemId,
  }));
  items.sort((a, b) => b.count - a.count);
  const totalCount = items.reduce((s, i) => s + i.count, 0);
  return {
    total: { count: totalCount, itemCount: items.length },
    items,
  };
}

export async function getSpeciesCitingsAtOrg(
  speciesId: number,
  orgId: string,
  currentPropertyId: string,
): Promise<SpeciesCitingsOrg> {
  const supabase = createClient();
  const { data: sightings, error } = await supabase
    .from('species_sightings_v')
    .select('property_id, item_id, observed_at')
    .eq('species_id', speciesId)
    .eq('org_id', orgId);
  if (error) throw new Error(error.message);
  const byProp = new Map<string, { count: number; last: string; items: Set<string> }>();
  for (const r of (sightings ?? []) as Row[]) {
    const cur = byProp.get(r.property_id);
    if (!cur) byProp.set(r.property_id, { count: 1, last: r.observed_at, items: new Set([r.item_id]) });
    else {
      cur.count += 1;
      if (r.observed_at > cur.last) cur.last = r.observed_at;
      cur.items.add(r.item_id);
    }
  }
  const propIds = [...byProp.keys()];
  let names = new Map<string, string>();
  if (propIds.length > 0) {
    const { data: props, error: perr } = await supabase
      .from('properties')
      .select('id, name')
      .in('id', propIds);
    if (perr) throw new Error(perr.message);
    for (const p of (props ?? []) as { id: string; name: string }[]) names.set(p.id, p.name);
  }
  const properties: SpeciesCitingsOrg['properties'] = propIds.map((id) => ({
    property_id: id,
    property_name: names.get(id) ?? 'Unknown',
    item_count: byProp.get(id)!.items.size,
    count: byProp.get(id)!.count,
    last: byProp.get(id)!.last,
    current: id === currentPropertyId,
  }));
  properties.sort((a, b) => b.count - a.count);
  const itemCount = [...byProp.values()].reduce((s, p) => s + p.items.size, 0);
  return {
    total: {
      count: properties.reduce((s, p) => s + p.count, 0),
      propertyCount: properties.length,
      itemCount,
    },
    properties,
  };
}
```

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/app/species/\[id\]/__tests__/actions.test.ts`
Expected: 2 tests pass. If the supabase mock shape doesn't match, adjust the mock `from()` chain until the implementation's calls resolve correctly. (The specific mock in Step 1 is a simplification; rewrite to a proper chainable mock if it proves brittle.)

- [ ] **Step 5: Commit**

```bash
git add src/app/species/
git commit -m "feat(species): scope-query server actions (item/property/org)"
```

---

### Task 21: `SpeciesCitingsBody` with react-query

**Files:**
- Create: `src/components/species/SpeciesCitingsBody.tsx`
- Create: `src/components/species/__tests__/SpeciesCitingsBody.test.tsx`

- [ ] **Step 1: Write the failing test (scope switch + hide "This item" when from absent)**

Create `src/components/species/__tests__/SpeciesCitingsBody.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SpeciesCitingsBody } from '../SpeciesCitingsBody';

vi.mock('@/app/species/[id]/actions', () => ({
  getSpeciesCitingsAtItem: vi.fn().mockResolvedValue({ count: 2, lastObserved: '2026-01-01' }),
  getSpeciesCitingsAtProperty: vi.fn().mockResolvedValue({ total: { count: 5, itemCount: 3 }, items: [] }),
  getSpeciesCitingsAtOrg: vi.fn().mockResolvedValue({ total: { count: 10, propertyCount: 2, itemCount: 5 }, properties: [] }),
}));

const species = {
  external_id: 14886,
  common_name: 'Eastern Bluebird',
  scientific_name: 'Sialia sialis',
  photo_url: 'b.png',
  large_photo_url: null,
  native: true,
  cavity_nester: true,
  iucn_status: 'LC',
  summary: 'A small thrush.',
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SpeciesCitingsBody', () => {
  it('hides "This item" tab when fromUrl is absent', () => {
    wrap(<SpeciesCitingsBody species={species} fromUrl={null} orgId="o1" propertyName="Farm" orgName="Central Audubon" />);
    expect(screen.queryByText(/This item/)).toBeNull();
  });

  it('shows "This item" tab when fromUrl has /p/x/item/y', () => {
    wrap(<SpeciesCitingsBody species={species} fromUrl="/p/farm/item/abc" orgId="o1" propertyName="Farm" orgName="Central Audubon" />);
    expect(screen.getByRole('button', { name: /This item/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Create `src/components/species/SpeciesCitingsBody.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { SpeciesDetail } from '@/lib/species/getSpeciesDetail';
import {
  getSpeciesCitingsAtItem,
  getSpeciesCitingsAtProperty,
  getSpeciesCitingsAtOrg,
} from '@/app/species/[id]/actions';
import { SpeciesTaxonomySection } from './SpeciesTaxonomySection';

type Scope = 'item' | 'property' | 'org';

function parseFrom(fromUrl: string | null): { slug: string | null; itemId: string | null } {
  if (!fromUrl) return { slug: null, itemId: null };
  const m = fromUrl.match(/^\/p\/([^/]+)\/item\/([^/?#]+)/);
  return { slug: m?.[1] ?? null, itemId: m?.[2] ?? null };
}

function fmtShort(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function SpeciesCitingsBody({
  species,
  fromUrl,
  orgId,
  propertyId,
  propertyName,
  orgName,
}: {
  species: SpeciesDetail;
  fromUrl: string | null;
  orgId: string | null;
  propertyId?: string | null;
  propertyName: string;
  orgName: string;
}) {
  const { slug, itemId } = parseFrom(fromUrl);
  const hasItem = itemId !== null;
  const initialScope: Scope = hasItem ? 'item' : propertyId ? 'property' : 'org';
  const [scope, setScope] = useState<Scope>(initialScope);

  const itemQuery = useQuery({
    queryKey: ['species-citings', 'item', species.external_id, itemId],
    queryFn: () => getSpeciesCitingsAtItem(species.external_id, itemId!),
    enabled: scope === 'item' && hasItem,
  });

  const propertyQuery = useQuery({
    queryKey: ['species-citings', 'property', species.external_id, propertyId, itemId],
    queryFn: () => getSpeciesCitingsAtProperty(species.external_id, propertyId!, itemId ?? ''),
    enabled: scope === 'property' && !!propertyId,
  });

  const orgQuery = useQuery({
    queryKey: ['species-citings', 'org', species.external_id, orgId, propertyId],
    queryFn: () => getSpeciesCitingsAtOrg(species.external_id, orgId!, propertyId ?? ''),
    enabled: scope === 'org' && !!orgId,
  });

  const tabs = useMemo(
    () => [
      hasItem ? { id: 'item' as const, label: 'This item' } : null,
      { id: 'property' as const, label: propertyName },
      { id: 'org' as const, label: `All of ${orgName.split(' ')[0]}` },
    ].filter((t): t is { id: Scope; label: string } => t !== null),
    [hasItem, propertyName, orgName],
  );

  return (
    <div className="flex-1 overflow-auto px-[18px] pb-20 pt-4 font-body">
      <SpeciesTaxonomySection
        native={species.native}
        cavityNester={species.cavity_nester}
        iucnStatus={species.iucn_status}
        summary={species.summary}
      />
      <div className="mb-3 flex gap-[2px] rounded-[10px] border border-forest-border-soft bg-sage-light p-[3px]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setScope(t.id)}
            className={[
              'flex-1 whitespace-nowrap overflow-hidden text-ellipsis rounded-[7px] px-1 py-[7px] text-[11.5px]',
              scope === t.id ? 'bg-white font-semibold text-forest-dark shadow-sm' : 'font-medium text-sage',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {scope === 'item' && hasItem && (
        <div className="rounded-xl border border-forest-border-soft bg-parchment px-4 py-[14px]">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.7px] text-sage">Seen on this item</div>
          <div className="font-heading text-[28px] font-medium leading-none text-forest-dark">
            {itemQuery.data?.count ?? 0} <span className="font-body text-[14px] font-normal text-sage">observations</span>
          </div>
          <div className="mt-[6px] text-[12.5px] text-sage">
            Most recent · {itemQuery.data?.lastObserved ? fmtShort(itemQuery.data.lastObserved) : '—'}
          </div>
        </div>
      )}

      {scope === 'property' && propertyQuery.data && (
        <>
          <div className="mb-[10px] flex items-baseline gap-2">
            <div className="font-heading text-[24px] font-medium leading-none text-forest-dark">{propertyQuery.data.total.count}</div>
            <div className="text-[13px] text-sage">observations · {propertyQuery.data.total.itemCount} items at {propertyName}</div>
          </div>
          <div className="flex flex-col gap-[6px]">
            {propertyQuery.data.items.map((i) => (
              <Link
                key={i.item_id}
                href={`/p/${slug}/item/${i.item_id}`}
                className={`flex items-center gap-[10px] rounded-[10px] px-3 py-[10px] ${i.current ? 'border border-forest bg-forest/5' : 'border border-forest-border-soft bg-white'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[6px] text-[13.5px] font-semibold">
                    {i.item_name}
                    {i.current && <span className="rounded-[3px] bg-forest px-[5px] py-[1px] text-[9px] font-bold tracking-[0.3px] text-white">HERE</span>}
                  </div>
                  <div className="mt-[2px] text-[11.5px] text-sage">Last {fmtShort(i.last)}</div>
                </div>
                <div className="text-right">
                  <div className="font-heading text-[18px] font-medium leading-none text-forest-dark">{i.count}</div>
                  <div className="text-[10px] tracking-[0.4px] text-sage">obs</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {scope === 'org' && orgQuery.data && (
        <>
          <div className="mb-3 flex gap-[10px]">
            {[
              { v: orgQuery.data.total.count, l: 'Observations' },
              { v: orgQuery.data.total.propertyCount, l: 'Properties' },
              { v: orgQuery.data.total.itemCount, l: 'Items' },
            ].map((s) => (
              <div key={s.l} className="flex-1 rounded-[10px] border border-forest-border-soft bg-parchment px-3 py-[10px]">
                <div className="font-heading text-[22px] font-medium leading-none text-forest-dark">{s.v}</div>
                <div className="mt-[3px] text-[10.5px] tracking-[0.5px] text-sage">{s.l}</div>
              </div>
            ))}
          </div>
          <div className="mb-[6px] text-[10.5px] font-semibold uppercase tracking-[0.7px] text-sage">By property</div>
          <div className="flex flex-col gap-[6px]">
            {orgQuery.data.properties.map((p) => (
              <Link
                key={p.property_id}
                href={`/p/${slug}`}
                className={`flex items-center gap-[10px] rounded-[10px] px-3 py-[10px] ${p.current ? 'border border-forest bg-forest/5' : 'border border-forest-border-soft bg-white'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[6px] text-[13.5px] font-semibold">
                    {p.property_name}
                    {p.current && <span className="rounded-[3px] bg-forest px-[5px] py-[1px] text-[9px] font-bold tracking-[0.3px] text-white">CURRENT</span>}
                  </div>
                  <div className="mt-[2px] text-[11.5px] text-sage">{p.item_count} items · last {fmtShort(p.last)}</div>
                </div>
                <div className="text-right">
                  <div className="font-heading text-[18px] font-medium leading-none text-forest-dark">{p.count}</div>
                  <div className="text-[10px] tracking-[0.4px] text-sage">obs</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/components/species/__tests__/SpeciesCitingsBody.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/species/SpeciesCitingsBody.tsx \
        src/components/species/__tests__/SpeciesCitingsBody.test.tsx
git commit -m "feat(species): SpeciesCitingsBody with scope toggle"
```

---

### Task 22: `SpeciesDetailView` + wrappers

**Files:**
- Create: `src/components/species/SpeciesDetailView.tsx`
- Create: `src/components/species/SpeciesSheetWrapper.tsx`
- Create: `src/components/species/SpeciesFullPageWrapper.tsx`

- [ ] **Step 1: Implement `SpeciesDetailView.tsx`**

Create `src/components/species/SpeciesDetailView.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getSpeciesDetail, type SpeciesDetail } from '@/lib/species/getSpeciesDetail';
import { SpeciesCitingsBody } from './SpeciesCitingsBody';

export function SpeciesDetailView({
  externalId,
  fromUrl,
  orgId,
  propertyId,
  propertyName,
  orgName,
  onBack,
}: {
  externalId: number;
  fromUrl: string | null;
  orgId: string | null;
  propertyId: string | null;
  propertyName: string;
  orgName: string;
  onBack?: () => void;
}) {
  const [species, setSpecies] = useState<SpeciesDetail | null>(null);
  useEffect(() => { getSpeciesDetail(externalId).then(setSpecies).catch(() => setSpecies(null)); }, [externalId]);

  if (!species) return <div className="p-6 text-sm text-sage">Loading species…</div>;

  return (
    <>
      <div className="relative h-[280px] shrink-0 bg-sage-light">
        <img src={species.large_photo_url ?? species.photo_url ?? ''} alt="" className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-forest-dark/25 via-transparent to-forest-dark/70" />
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="absolute left-[14px] top-[58px] flex h-9 w-9 items-center justify-center rounded-full bg-white/92 backdrop-blur"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-forest-dark"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <div className="absolute inset-x-4 bottom-[14px] text-white">
          <h2 className="font-heading text-[26px] font-medium leading-tight">{species.common_name}</h2>
          <div className="mt-[3px] text-[13px] italic opacity-90">{species.scientific_name}</div>
        </div>
      </div>
      <SpeciesCitingsBody
        species={species}
        fromUrl={fromUrl}
        orgId={orgId}
        propertyId={propertyId}
        propertyName={propertyName}
        orgName={orgName}
      />
    </>
  );
}
```

- [ ] **Step 2: Implement sheet wrapper**

Create `src/components/species/SpeciesSheetWrapper.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import '@/components/item/timeline/timeline.css';

export function SpeciesSheetWrapper({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <div
      className="fm-slide-in fixed inset-0 z-[110] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
    >
      {/* Back button is rendered inside SpeciesDetailView — wire it via context / prop. Pass onBack explicitly to SpeciesDetailView from the page instead of rendering here. */}
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Implement full-page wrapper**

Create `src/components/species/SpeciesFullPageWrapper.tsx`:

```tsx
import type { ReactNode } from 'react';

export function SpeciesFullPageWrapper({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-parchment">{children}</div>;
}
```

- [ ] **Step 4: Type-check + commit**

```bash
npm run type-check
git add src/components/species/SpeciesDetailView.tsx \
        src/components/species/SpeciesSheetWrapper.tsx \
        src/components/species/SpeciesFullPageWrapper.tsx
git commit -m "feat(species): SpeciesDetailView + sheet and full-page wrappers"
```

---

### Task 23: App-root `@modal` parallel slot + defaults

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/default.tsx`
- Create: `src/app/@modal/default.tsx`

- [ ] **Step 1: Update `src/app/layout.tsx`**

Open the file. Change the component signature to accept `modal` and render it after children. Minimal diff:

```tsx
export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* existing providers */}
        {children}
        {modal}
      </body>
    </html>
  );
}
```

Keep any surrounding providers (ThemeProvider, QueryClientProvider, etc.) unchanged.

- [ ] **Step 2: Create `src/app/default.tsx`**

```tsx
export default function Default() {
  return null;
}
```

- [ ] **Step 3: Create `src/app/@modal/default.tsx`**

```tsx
export default function Default() {
  return null;
}
```

- [ ] **Step 4: Smoke-check unrelated routes**

Run `npm run dev` and open:
- `/` (root)
- `/p/<any-slug>` (map)
- `/manage` (if accessible)

Confirm pages render normally. The `@modal` slot is empty on all of them.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/default.tsx src/app/@modal/default.tsx
git commit -m "feat(routing): @modal parallel slot at app root"
```

---

### Task 24: Species route pages (intercepted + full)

**Files:**
- Create: `src/app/species/[id]/page.tsx`
- Create: `src/app/@modal/(.)species/[id]/page.tsx`

- [ ] **Step 1: Full-page route**

Create `src/app/species/[id]/page.tsx`:

```tsx
import { SpeciesDetailView } from '@/components/species/SpeciesDetailView';
import { SpeciesFullPageWrapper } from '@/components/species/SpeciesFullPageWrapper';

export default function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { from?: string };
}) {
  const externalId = Number(params.id);
  const fromUrl = searchParams.from ?? null;
  return (
    <SpeciesFullPageWrapper>
      <SpeciesDetailView
        externalId={externalId}
        fromUrl={fromUrl}
        orgId={null}
        propertyId={null}
        propertyName="Property"
        orgName="Organization"
      />
    </SpeciesFullPageWrapper>
  );
}
```

Note: `orgId` / `propertyId` resolution for the full-page entry is a follow-up — currently the page falls back to the org scope being disabled without proper context. If the user lands on `/species/42` directly, they see taxonomy + summary but no scope data. This is an acceptable v1 behavior (documented in the spec's "Open Questions").

- [ ] **Step 2: Create the client component that wires `router.back()`**

The intercepted route page is a server component, but it needs a client child that can call `router.back()`. Create `src/components/species/ModalContents.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { SpeciesDetailView } from './SpeciesDetailView';

export function ModalContents({ externalId, fromUrl }: { externalId: number; fromUrl: string | null }) {
  const router = useRouter();
  return (
    <SpeciesDetailView
      externalId={externalId}
      fromUrl={fromUrl}
      orgId={null}
      propertyId={null}
      propertyName="Property"
      orgName="Organization"
      onBack={() => router.back()}
    />
  );
}
```

- [ ] **Step 3: Create the intercepted route page (server component)**

Create `src/app/@modal/(.)species/[id]/page.tsx`. This is the full content; we'll refine it in Step 4 once context resolution is in place.

```tsx
import { ModalContents } from '@/components/species/ModalContents';
import { SpeciesSheetWrapper } from '@/components/species/SpeciesSheetWrapper';

export default function ModalPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { from?: string };
}) {
  const externalId = Number(params.id);
  const fromUrl = searchParams.from ?? null;
  return (
    <SpeciesSheetWrapper>
      <ModalContents
        externalId={externalId}
        fromUrl={fromUrl}
        orgId={null}
        propertyId={null}
        propertyName="Property"
        orgName="Organization"
      />
    </SpeciesSheetWrapper>
  );
}
```

- [ ] **Step 4: Resolve real `orgId` / `propertyName` / `orgName` from `fromUrl`**

Add a server helper `src/lib/species/resolveContextFromUrl.ts`:

```ts
import { createClient } from '@/lib/supabase/server';

export type SpeciesContext = {
  orgId: string | null;
  orgName: string;
  propertyId: string | null;
  propertyName: string;
};

export async function resolveContextFromUrl(fromUrl: string | null): Promise<SpeciesContext> {
  if (!fromUrl) return { orgId: null, orgName: 'Organization', propertyId: null, propertyName: 'Property' };
  const m = fromUrl.match(/^\/p\/([^/]+)\/item\/([^/?#]+)/) || fromUrl.match(/^\/p\/([^/]+)/);
  const slug = m?.[1];
  if (!slug) return { orgId: null, orgName: 'Organization', propertyId: null, propertyName: 'Property' };

  const supabase = createClient();
  const { data: property } = await supabase
    .from('properties')
    .select('id, name, org_id, orgs(name)')
    .eq('slug', slug)
    .maybeSingle();

  return {
    orgId: property?.org_id ?? null,
    orgName: (property as any)?.orgs?.name ?? 'Organization',
    propertyId: property?.id ?? null,
    propertyName: property?.name ?? 'Property',
  };
}
```

Use it in both page.tsx files (server components) and pass resolved values down to `ModalContents` / the full-page `SpeciesDetailView`. Update both page files accordingly:

`src/app/species/[id]/page.tsx`:

```tsx
import { resolveContextFromUrl } from '@/lib/species/resolveContextFromUrl';

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: { from?: string } }) {
  const externalId = Number(params.id);
  const fromUrl = searchParams.from ?? null;
  const ctx = await resolveContextFromUrl(fromUrl);
  return (
    <SpeciesFullPageWrapper>
      <SpeciesDetailView
        externalId={externalId}
        fromUrl={fromUrl}
        orgId={ctx.orgId}
        propertyId={ctx.propertyId}
        propertyName={ctx.propertyName}
        orgName={ctx.orgName}
      />
    </SpeciesFullPageWrapper>
  );
}
```

`src/app/@modal/(.)species/[id]/page.tsx`:

```tsx
import { ModalContents } from '@/components/species/ModalContents';
import { SpeciesSheetWrapper } from '@/components/species/SpeciesSheetWrapper';
import { resolveContextFromUrl } from '@/lib/species/resolveContextFromUrl';

export default async function ModalPage({ params, searchParams }: { params: { id: string }; searchParams: { from?: string } }) {
  const externalId = Number(params.id);
  const fromUrl = searchParams.from ?? null;
  const ctx = await resolveContextFromUrl(fromUrl);
  return (
    <SpeciesSheetWrapper>
      <ModalContents
        externalId={externalId}
        fromUrl={fromUrl}
        orgId={ctx.orgId}
        propertyId={ctx.propertyId}
        propertyName={ctx.propertyName}
        orgName={ctx.orgName}
      />
    </SpeciesSheetWrapper>
  );
}
```

Update `ModalContents` to accept these props and forward to `SpeciesDetailView`.

- [ ] **Step 5: Type-check + manual smoke**

Run: `npm run type-check`

Then `npm run dev`. In the app:
1. Open an item.
2. Open an update with a species.
3. Click the species row.
4. Confirm `/species/<id>?from=/p/...` in URL bar, species sheet slides in from the right.
5. Press browser back — sheet closes, item + update detail still visible.
6. Manually navigate to `/species/<id>` — full-page view renders.

- [ ] **Step 6: Commit**

```bash
git add src/app/species/ src/app/@modal/ src/components/species/ModalContents.tsx src/lib/species/resolveContextFromUrl.ts
git commit -m "feat(routing): intercepted + full-page species routes with context resolution"
```

---

### Task 25: Wire species click from UpdateDetailSheet to router

**Files:**
- Modify: `src/components/item/timeline/UpdateDetailSheet.tsx` — swap in-memory `onSpeciesOpen` with `router.push`.

- [ ] **Step 1: Replace `onSpeciesOpen` prop with navigation**

Open `src/components/item/timeline/UpdateDetailSheet.tsx`. At the top, replace the `onSpeciesOpen` prop and call site with a direct `router.push`:

```tsx
import { usePathname, useRouter } from 'next/navigation';

export function UpdateDetailSheet({
  update,
  onClose,
  onDelete,
  canEdit,
  canDelete,
}: {
  update: EnrichedUpdate | null;
  onClose: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  if (!update) return null;
  const router = useRouter();
  const pathname = usePathname();
  // ...
  <SpeciesRow
    key={s.external_id}
    species={{...}}
    onOpen={() => router.push(`/species/${s.external_id}?from=${encodeURIComponent(pathname ?? '/')}`)}
  />
}
```

Remove `onSpeciesOpen` from the prop list. Update the test (`__tests__/UpdateDetailSheet.test.tsx`) by (a) **removing `onSpeciesOpen={...}` from every `render(...)` call** and (b) mocking `next/navigation`:

```tsx
import { vi } from 'vitest';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/p/farm/item/abc',
}));
```

And change the `onSpeciesOpen` assertion to spy on `useRouter().push`:

```tsx
it('species row click pushes to /species/:id?from=...', () => {
  const push = vi.fn();
  (useRouter as any).mockReturnValue({ push });
  // ...
  expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/species\/14886\?from=/));
});
```

Adjust test structure to use `vi.mock` at module scope and `await import` the module inside `it`.

- [ ] **Step 2: Update callers**

`TimelineRail` currently passes `onSpeciesOpen` to `UpdateDetailSheet`. Remove that prop pass-through.

```tsx
<UpdateDetailSheet
  update={open}
  onClose={() => setOpenId(null)}
  canEdit={false}
  canDelete={false}
  onDelete={() => { if (open) onDeleteUpdate(open.id); setOpenId(null); }}
/>
```

Remove the `speciesOpenExternalId` state (no longer used).

- [ ] **Step 3: Run tests + manual smoke**

```bash
npx vitest run src/components/item/timeline/
```

Then `npm run dev` and repeat the end-to-end flow.

- [ ] **Step 4: Commit**

```bash
git add src/components/item/timeline/
git commit -m "feat(timeline): species row click routes to /species/:id with from param"
```

---

## Phase 6 — Public form anon

### Task 26: Extend `submitPublicContribution` with `anonName`

**Files:**
- Modify: `src/app/api/public-contribute/actions.ts`
- Modify: `src/app/api/public-contribute/__tests__/actions.test.ts`

- [ ] **Step 1: Add a failing test**

Open the existing test file. Add a new case:

```ts
it('persists anon_name when provided', async () => {
  // set up supabase mock to capture the insert payload
  const insertSpy = vi.fn().mockResolvedValue({ data: { id: 'new-update' }, error: null });
  // ... configure the mock to return insertSpy for the `from('item_updates').insert(...)` chain
  await submitPublicContribution({ orgId: 'o1', itemId: 'i1', file: new Blob(['x']), description: 'desc', anonName: '  BirdFan  ' } as any);
  expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ anon_name: 'BirdFan' }));
});

it('stores null anon_name when empty or missing', async () => {
  const insertSpy = vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null });
  // ...
  await submitPublicContribution({ orgId: 'o1', itemId: 'i1', file: new Blob(['x']), description: 'desc', anonName: '' } as any);
  expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ anon_name: null }));
});
```

Adjust the existing test harness to expose the insert payload capture. If the current test doesn't stub the insert, follow the module's existing mocking pattern.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Extend the action**

Open `src/app/api/public-contribute/actions.ts`. Add `anonName` to the input type:

```ts
type Input = {
  orgId: string;
  itemId: string;
  file: File | Blob;
  description?: string;
  anonName?: string | null;
};
```

In the function body, normalize and apply:

```ts
const anon_name = (input.anonName ?? '').trim().slice(0, 80) || null;
```

Pass it to the existing `item_updates` insert:

```ts
await supabase.from('item_updates').insert({
  // existing fields...
  anon_name,
});
```

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/app/api/public-contribute/__tests__/actions.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/public-contribute/
git commit -m "feat(public): submitPublicContribution accepts and stores anon_name"
```

---

### Task 27: Add "Name" input to `PublicSubmissionForm`

**Files:**
- Modify: `src/components/map/PublicSubmissionForm.tsx`

- [ ] **Step 1: Read the existing form**

Open `src/components/map/PublicSubmissionForm.tsx`. Identify the form state (useState for description, file, etc.) and the submit handler.

- [ ] **Step 2: Add the Name field**

Add a controlled `name` state alongside the existing `description` state:

```tsx
const [anonName, setAnonName] = useState('');
```

Insert a labeled input before the description field:

```tsx
<label className="label" htmlFor="public-name">
  Name <span className="text-sage">(optional)</span>
</label>
<input
  id="public-name"
  type="text"
  value={anonName}
  onChange={(e) => setAnonName(e.target.value)}
  maxLength={80}
  placeholder="How should we credit you?"
  className="input-field"
/>
```

In the submit handler, pass `anonName: anonName.trim() || null` to `submitPublicContribution(...)`.

- [ ] **Step 3: Write a component smoke test**

Create (or extend) `src/components/map/__tests__/PublicSubmissionForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PublicSubmissionForm } from '../PublicSubmissionForm';

vi.mock('@/app/api/public-contribute/actions', () => ({
  submitPublicContribution: vi.fn().mockResolvedValue({ success: true }),
}));

describe('PublicSubmissionForm', () => {
  it('includes anonName in submission', async () => {
    const mod = await import('@/app/api/public-contribute/actions');
    render(<PublicSubmissionForm orgId="o1" itemId="i1" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'BirdFan' } });
    // fill the other required fields per the form's existing UX...
    // assume a "Submit" button
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(mod.submitPublicContribution).toHaveBeenCalledWith(
        expect.objectContaining({ anonName: 'BirdFan' }),
      );
    });
  });
});
```

Adjust the test to match the form's actual required fields (file input, description).

- [ ] **Step 4: Run tests + manual smoke**

```bash
npx vitest run src/components/map/
```

Then `npm run dev`, open the map, trigger public contribute, fill out the form with a nickname, and confirm the network request carries `anonName`.

- [ ] **Step 5: Commit**

```bash
git add src/components/map/
git commit -m "feat(public): PublicSubmissionForm adds optional Name input"
```

---

## Phase 7 — E2E + wrap-up

### Task 28: Playwright happy-path test

**Files:**
- Create: `e2e/tests/timeline/rail-to-species.spec.ts`

- [ ] **Step 1: Create the test**

Create `e2e/tests/timeline/rail-to-species.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '..', '..', '.auth', 'admin.json') });

test.describe('Item timeline v2 — rail → update → species → back', () => {
  test('navigates rail card → update detail → species sheet → back preserves state', async ({ page }) => {
    // Navigate to a known-seeded item page. Use the smoke-test fixture slug + id.
    await page.goto('/p/test-farm');
    await page.getByRole('button', { name: /item marker/i }).first().click();

    // Rail card
    const firstRailCard = page.locator('[data-testid="rail-line"]').first().locator('..').locator('button').first();
    await firstRailCard.click();

    // Update detail sheet visible
    await expect(page.getByText(/Species observed/i)).toBeVisible();

    // Click the first species row
    await page.getByRole('button').filter({ hasText: /Bluebird|Wren|Sparrow/ }).first().click();

    // Species sheet visible + URL changed
    await expect(page).toHaveURL(/\/species\/\d+/);
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Switch to property scope
    await page.getByRole('button', { name: /Farm|Property|test-farm/ }).click();
    await expect(page.getByText(/observations/i)).toBeVisible();

    // Back closes sheet, update detail still visible
    await page.goBack();
    await expect(page.getByText(/Species observed/i)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npm run test:e2e -- e2e/tests/timeline/rail-to-species.spec.ts
```

Iterate on selectors as needed. If there is no seeded fixture with a species-tagged update, either add one to `e2e/fixtures/` or mark the test `test.skip(...)` with a comment noting the fixture gap.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/timeline/rail-to-species.spec.ts
git commit -m "test(e2e): rail → update → species sheet happy-path"
```

---

### Task 29: Final type-check, build, and spec cross-check

- [ ] **Step 1: Full type-check + build**

```bash
npm run type-check && npm run build
```

Both must pass.

- [ ] **Step 2: Full test suite**

```bash
npx vitest run && npm run test:e2e:smoke
```

Smoke subset must pass. Full E2E (`npm run test:e2e`) is not required to pass in this plan but recommended.

- [ ] **Step 3: Cross-check against spec**

Open `docs/superpowers/specs/2026-04-20-item-timeline-v2-design.md`. Walk through the "Goals" and "File Layout" sections and confirm each bullet maps to a committed task. Expected file list:

- ✅ `supabase/migrations/046_item_timeline_v2.sql`
- ✅ `src/app/default.tsx` + `src/app/@modal/default.tsx` + `src/app/@modal/(.)species/[id]/page.tsx` + `src/app/species/[id]/page.tsx` + `src/app/species/[id]/actions.ts`
- ✅ `src/components/item/ItemHeader.tsx`
- ✅ `src/components/item/timeline/TimelineRail.tsx` + `RailCard.tsx` + `Attribution.tsx` + `timeline.css`
- ✅ `src/components/species/SpeciesDetailView.tsx` + `SpeciesSheetWrapper.tsx` + `SpeciesFullPageWrapper.tsx` + `SpeciesCitingsBody.tsx` + `SpeciesTaxonomySection.tsx` + `SpeciesRow.tsx` + `SpeciesAvatar.tsx` + `Tag.tsx` + `ModalContents.tsx`
- ✅ Modified: `tailwind.config.ts`, `src/app/layout.tsx`, `src/components/layout/blocks/TimelineBlock.tsx`, `src/components/item/DetailPanel.tsx`, `src/components/item/timeline/UpdateDetailSheet.tsx`, `src/components/item/timeline/AllUpdatesSheet.tsx`, `src/components/manage/species-picker/SpeciesPickerDetail.tsx`, `src/app/api/public-contribute/actions.ts`, `src/components/map/PublicSubmissionForm.tsx`, `src/lib/types.ts`, `src/components/map/HomeMapView.tsx`
- ✅ Deleted: `src/components/item/timeline/TimelineOverview.tsx`, `src/components/item/timeline/UpdateCard.tsx`

Fix any gaps.

- [ ] **Step 4: Push branch**

```bash
git push -u origin HEAD
```

- [ ] **Step 5: Open PR**

Use `gh pr create` with a summary referencing the spec file. Include a before/after screenshot pair per the visual-diff playbook at `docs/playbooks/visual-diff-screenshots.md`.

---

## Appendix — Known follow-ups (not blocking)

- Offline caching of `update_entities` so species render in offline mode. Currently the enrichment function returns empty species when the offline store doesn't provide the junction rows.
- `EnrichedUpdateSpecies` does not carry `scientific_name`; `UpdateDetailSheet` currently passes `common_name` as a stand-in. Either add scientific name to the local `entities` table or fetch from iNat on demand (with react-query caching) in the species section.
- Direct visits to `/species/<id>` without a `from=` param show species taxonomy only — no scope data. A future task: when the visiting user has exactly one active org, default `orgId` + `propertyId` to their primary.
- Item-type-configurable 4th stat in `ItemHeader` (e.g. "Broods" for nest boxes).
- Editorial and Season layout variants behind the layout-builder A/B flag.
