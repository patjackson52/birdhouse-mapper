# React Query Caching for Admin Pages

**Issue:** [#145](https://github.com/patjackson52/birdhouse-mapper/issues/145)
**Date:** 2026-04-01

## Summary

Add React Query (TanStack Query) as a client-side data caching layer for admin pages and non-offline components. This provides stale-while-revalidate caching so repeated navigation to admin pages shows cached data instantly while revalidating in the background.

## Motivation

The offline capabilities PR (#144) converted 6 core components to use IndexedDB, making those pages load instantly. However, ~15 admin pages and utility components still call Supabase directly on every navigation, causing visible loading spinners on repeat visits. React Query with a 30-second stale time eliminates this latency.

## Approach

**Inline `useQuery` per page** — no shared hooks or abstraction layer. Each page defines its own `useQuery` calls. Query keys follow a convention but are not centralized.

This was chosen over shared custom hooks or a query key factory because most queries are used in exactly one place, making abstraction premature.

## Setup

### Dependencies

- `@tanstack/react-query` (latest stable)

### QueryProvider

New client component at `src/components/QueryProvider.tsx`:
- Wraps `QueryClientProvider` from `@tanstack/react-query`
- Default config: `staleTime: 30_000` (30s), `gcTime: 300_000` (5 min)

Added to `src/app/layout.tsx` alongside existing `OfflineProvider` and `ConfigProvider`.

## Query Key Convention

All admin queries follow: `['admin', '<resource>', ...params]`

Examples:
- `['admin', 'settings']`
- `['admin', 'members']`
- `['admin', 'properties']`
- `['admin', 'property', slug, 'settings']`
- `['admin', 'property', slug, 'data']`
- `['admin', 'property', slug, 'types']`
- `['admin', 'property', slug, 'entities']`
- `['admin', 'property', slug, 'members']`
- `['admin', 'geo-layers']`
- `['admin', 'roles', roleId]`
- `['admin', 'domains']`
- `['manage', 'dashboard']`
- `['entities', entityTypeId]` (for EntitySelect)
- `['location-history', ...params]` (for LocationHistory)

## Conversion Pattern

### Before (current pattern)
```tsx
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  async function load() {
    const result = await getServerAction();
    // or: const { data } = await supabase.from('table').select('*');
    if (result.data) setData(result.data);
    setLoading(false);
  }
  load();
}, []);
```

### After
```tsx
const { data, isLoading } = useQuery({
  queryKey: ['admin', 'resource'],
  queryFn: async () => {
    const result = await getServerAction();
    return result.data;
    // or: const { data } = await supabase.from('table').select('*');
    // return data;
  },
});
```

### Mutations

Existing imperative mutation logic (server action calls for saves/deletes) stays as-is. After a successful mutation, call `queryClient.invalidateQueries({ queryKey: [...] })` to trigger a refetch of affected queries.

## Pages In Scope

### Admin pages
1. `/admin/settings` — org settings (server action fetch)
2. `/admin/members` — member management (server action + supabase)
3. `/admin/properties` — property list (server action + supabase)
4. `/admin/properties/[slug]/settings` — property settings (supabase)
5. `/admin/properties/[slug]/data` — item data management (supabase)
6. `/admin/properties/[slug]/types` — item type definitions
7. `/admin/properties/[slug]/entities` — entity management
8. `/admin/properties/[slug]/members` — property members
9. `/admin/geo-layers` — geo layer management
10. `/admin/roles/[roleId]` — role editor
11. `/admin/domains` — custom domains

### Other pages/components
12. `/manage` — dashboard stats
13. `EntitySelect.tsx` — entity picker in forms
14. `LocationHistory.tsx` — location history display

## Exclusions

- **Navigation.tsx** — uses `onAuthStateChange` subscription, not a fetch-on-mount pattern. Not a fit for `useQuery`.
- **Map page, list page, item forms** — already use IndexedDB offline store via OfflineProvider.
- **Map tiles** — cached by service worker (Cache-First).
- **No prefetching** — stale-while-revalidate handles the main latency issue; prefetching can be added later if needed.
- **No shared hook abstractions** — inline `useQuery` per page to keep it simple.
- **No query key factory** — convention-based keys are sufficient at this scale.
