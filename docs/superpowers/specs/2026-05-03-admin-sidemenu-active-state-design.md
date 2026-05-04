# Admin Sidebar Active-State Styling

**Issue:** [#323](https://github.com/patjackson52/birdhouse-mapper/issues/323)
**Date:** 2026-05-03

## Problem

The active/selected item in the admin sidebar (`AdminSidebar`) is not visually distinguishable from inactive items. The current and target designs from the issue:

- **Target:** active item has a warm tan background tint, a 4px golden left border, dark forest text in semibold.
- **Current:** active item has only `text-forest-dark font-semibold` rendered. The intended left border and background are missing or invisible.

## Root cause

`src/components/admin/AdminSidebar.tsx:59` declares the active item's classes:

```tsx
isActive
  ? 'bg-sage-light/50 text-forest-dark font-semibold border-l-3 border-golden'
  : 'text-gray-600 hover:bg-sage-light/30'
```

Two defects in those classes:

1. **`border-l-3` is not a Tailwind utility.** The default border-width scale is 0/2/4/8 — `border-l-3` does not generate any CSS, and Tailwind's JIT silently drops it. The intended 3px golden left border has never rendered.

2. **`bg-sage-light/50` is nearly invisible on parchment.** `--color-surface-light` resolves to `#EEF2EA` (very pale green-gray); at 50% opacity over the parchment background `#FDFBF7` the wash is indistinguishable from the surrounding sidebar.

## Decision

Replace the active-state class string in `AdminSidebar.tsx:59` with utilities that resolve to real CSS:

```tsx
isActive
  ? 'bg-golden/10 text-forest-dark font-semibold border-l-4 border-golden'
  : 'text-gray-600 hover:bg-sage-light/30'
```

Three changes:

| Was | Now | Why |
|---|---|---|
| `bg-sage-light/50` | `bg-golden/10` | Warm tan tint matches the target screenshot; reuses the existing accent color (`--color-accent` = `#D4A853`). |
| `border-l-3` | `border-l-4` | Built-in Tailwind utility — actually renders. 4px is closest to the target's visible left bar. |
| `text-forest-dark font-semibold` | unchanged | Already correct. |

The inactive state (`text-gray-600 hover:bg-sage-light/30`) is unchanged.

## Test

`src/__tests__/admin/AdminSidebar.test.tsx` currently only asserts structural behavior (sections vs links). Add a test that asserts the active item has each of the three intended utility classes — this would have caught the original `border-l-3` typo and prevents regression on the visibility classes:

```tsx
it('applies active-state utilities to the link matching pathname', () => {
  const items = [
    { label: 'Dashboard', href: '/admin' },
    { label: 'Properties', href: '/admin/properties' },
  ];
  render(<AdminSidebar title="Test Org" items={items} />);
  const dashboardLink = screen.getByText('Dashboard').closest('a')!;
  expect(dashboardLink.className).toContain('bg-golden/10');
  expect(dashboardLink.className).toContain('border-l-4');
  expect(dashboardLink.className).toContain('border-golden');
  expect(dashboardLink.className).toContain('font-semibold');

  const propertiesLink = screen.getByText('Properties').closest('a')!;
  expect(propertiesLink.className).not.toContain('bg-golden/10');
  expect(propertiesLink.className).not.toContain('border-l-4');
});
```

The existing `usePathname` mock at the top of the file (`/admin`) makes `Dashboard` the active item.

## Out of scope

- Mobile drawer styling — `AdminSidebar` is the same component used inside the mobile sheet; the same active-state classes apply automatically. No separate change needed.
- Section header styling, badges, hover state on inactive items — already match the target.
- Defining a custom `borderWidth: { 3: '3px' }` in `tailwind.config.ts` to preserve the original intent — rejected; built-in `border-l-4` is the simplest path and visually matches the target.

## Verification

- `npm run type-check` clean.
- `npm run test -- src/__tests__/admin/AdminSidebar.test.tsx --run` — new active-state assertions pass; existing structural test still passes.
- `npm run dev` → log in → visit `/admin` → confirm active item shows golden left border and warm tan background.
- Capture before/after screenshots per `docs/playbooks/visual-diff-screenshots.md` for the PR.

## Files touched

- `src/components/admin/AdminSidebar.tsx` — single className change (lines 57-61).
- `src/__tests__/admin/AdminSidebar.test.tsx` — add active-state test.

Estimated diff: ~20 lines net (mostly the new test).
