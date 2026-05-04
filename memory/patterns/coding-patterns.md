# Coding Patterns

Recurring patterns used across the codebase. Keep this updated as conventions evolve.

## Server Actions

- All server actions return `{ success: true, data }` or `{ error: string }`.
- Use `"use server"` directive at the top of action files.
- Validate inputs with Zod schemas before processing.
- Always check tenant context before mutating data.

## Client Components

- Mark with `"use client"` only when needed (event handlers, hooks, browser APIs).
- Prefer server components by default.
- Use Tailwind utility classes; project-specific custom classes live in `tailwind.config.ts`.
- Co-locate component-specific types in the same file.

## Testing

- **Framework:** Vitest + React Testing Library.
- Test files live next to source: `Component.test.tsx`.
- Use `describe` / `it` blocks with clear behavior descriptions.
- Mock Supabase client in tests using `vi.mock`.
- E2E tests in `e2e/` directory.

## Dexie / IndexedDB Schema Upgrades

**Rule:** When bumping Dexie's schema version, any tab/SW holding the DB at the old version blocks the upgrade. `db.open()` waits indefinitely — no resolution, no throw. Any code path that awaits the DB (e.g. `offlineStore.db.*`) hangs forever. Spinners that depend on that code path never clear.

**Why (PR #320):** Phase 3 (#316) bumped schema v2 → v3 (added `geo_layer_cache` table). Users with existing IDB at v2 hit the blocked-upgrade path on first load. `HomeMapViewContent.fetchData` awaited `offlineStore.db.*`, triggering implicit `db.open()` that hung. The `try/catch/finally` from #185 was useless — no throw, no resolution, so `setLoading(false)` never fired. Infinite spinner. More common on mobile where SW lifecycle is aggressive.

**How to apply when bumping Dexie schema version:**

1. **Register the `blocked` handler in `src/lib/offline/db.ts`** (already present — do not remove):
   ```ts
   dbInstance.on('blocked', () => {
     console.warn('[offline-db] schema upgrade blocked; reloading');
     window.location.reload();
   });
   ```
   Reload drops our connection; the blocked upgrade can then proceed. On second load the new SW is active.

2. **Add a safety-net timeout in any component that gates UI on DB-ready.** Pattern from `src/components/map/HomeMapView.tsx`:
   ```ts
   useEffect(() => {
     const safetyNet = setTimeout(() => setLoading(false), 8000);
     return () => clearTimeout(safetyNet);
   }, []);
   ```
   Even if `db.open()` never resolves, user sees the UI (empty) instead of an infinite spinner.

3. The two handlers are **independent** — the `blocked` reload is the primary fix; the 8s timeout is a belt-and-suspenders fallback for any other hang source.

**Handler locations:** `src/lib/offline/db.ts` (`getOfflineDb`), `src/components/map/HomeMapView.tsx` (`HomeMapViewContent`).
