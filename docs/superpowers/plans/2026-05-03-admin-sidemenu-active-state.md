# Admin Sidebar Active-State Styling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the visible active-item indicator (warm tan background + 4px golden left border + bold dark text) in the admin sidebar by replacing the broken `border-l-3` Tailwind class and the near-invisible `bg-sage-light/50` wash on `AdminSidebar.tsx:59`.

**Architecture:** Single-component fix. `AdminSidebar` already computes `isActive` correctly via `usePathname`; only the className string needs to change. A new Vitest case asserts the active-state utility classes are applied so a typo like `border-l-3` (which Tailwind silently drops) cannot regress unnoticed.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-03-admin-sidemenu-active-state-design.md`

---

## File Structure

- **Modify** `src/components/admin/AdminSidebar.tsx` — replace the active-state class string on the `<Link>` element.
- **Modify** `src/__tests__/admin/AdminSidebar.test.tsx` — add a regression test that asserts the active item carries `bg-golden/10`, `border-l-4`, `border-golden`, and `font-semibold`, and that an inactive item does not.

---

### Task 1: Add the active-state regression test (failing)

**Files:**
- Modify: `src/__tests__/admin/AdminSidebar.test.tsx`

The existing test mocks `usePathname` to return `'/admin'`. With items `Dashboard` (`/admin`) and `Properties` (`/admin/properties`), `Dashboard` is the active item. We assert the *intended* class set, which currently passes only partially because `border-l-3` is a no-op utility.

- [ ] **Step 1: Add the new test case**

Open `src/__tests__/admin/AdminSidebar.test.tsx` and append a new `it` block inside the existing `describe('AdminSidebar', ...)`. The full file should read:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
}));

describe('AdminSidebar', () => {
  it('renders section headers as non-clickable labels', () => {
    const items = [
      { label: 'Dashboard', href: '/admin' },
      { type: 'section' as const, label: 'Data' },
      { label: 'AI Context', href: '/admin/ai-context' },
      { label: 'Geo Layers', href: '/admin/geo-layers' },
    ];

    render(<AdminSidebar title="Test Org" items={items} />);

    // Section header renders as text, not a link
    const sectionHeader = screen.getByText('Data');
    expect(sectionHeader.tagName).not.toBe('A');
    expect(sectionHeader.closest('a')).toBeNull();

    // Nav items render as links
    expect(screen.getByText('AI Context').closest('a')).toBeTruthy();
    expect(screen.getByText('Geo Layers').closest('a')).toBeTruthy();
  });

  it('applies the visible active-state utilities to the link matching pathname', () => {
    const items = [
      { label: 'Dashboard', href: '/admin' },
      { label: 'Properties', href: '/admin/properties' },
    ];

    render(<AdminSidebar title="Test Org" items={items} />);

    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toBeTruthy();
    expect(dashboardLink!.className).toContain('bg-golden/10');
    expect(dashboardLink!.className).toContain('border-l-4');
    expect(dashboardLink!.className).toContain('border-golden');
    expect(dashboardLink!.className).toContain('font-semibold');

    const propertiesLink = screen.getByText('Properties').closest('a');
    expect(propertiesLink).toBeTruthy();
    expect(propertiesLink!.className).not.toContain('bg-golden/10');
    expect(propertiesLink!.className).not.toContain('border-l-4');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm run test -- src/__tests__/admin/AdminSidebar.test.tsx --run`

Expected: the new `it('applies the visible active-state utilities ...')` case FAILS with messages similar to:

```
expect(dashboardLink!.className).toContain('bg-golden/10')
  Expected substring: "bg-golden/10"
  Received string:    "...bg-sage-light/50 text-forest-dark font-semibold border-l-3 border-golden..."
```

(The first test, `renders section headers as non-clickable labels`, still passes.)

---

### Task 2: Fix the active-state classes (make the test pass)

**Files:**
- Modify: `src/components/admin/AdminSidebar.tsx:57-61`

- [ ] **Step 1: Replace the active-state className**

Open `src/components/admin/AdminSidebar.tsx`. Find the `<Link>` className expression (around line 57-61):

```tsx
            className={`flex items-center justify-between px-4 py-2 text-sm ${
              isActive
                ? 'bg-sage-light/50 text-forest-dark font-semibold border-l-3 border-golden'
                : 'text-gray-600 hover:bg-sage-light/30'
            }`}
```

Replace the active-branch string. The full block becomes:

```tsx
            className={`flex items-center justify-between px-4 py-2 text-sm ${
              isActive
                ? 'bg-golden/10 text-forest-dark font-semibold border-l-4 border-golden'
                : 'text-gray-600 hover:bg-sage-light/30'
            }`}
```

The inactive branch is unchanged.

- [ ] **Step 2: Run the test to confirm it passes**

Run: `npm run test -- src/__tests__/admin/AdminSidebar.test.tsx --run`

Expected: both `it` cases PASS (`Test Files  1 passed`, `Tests  2 passed`).

- [ ] **Step 3: Type-check**

Run: `npm run type-check`

Expected: clean, no output.

- [ ] **Step 4: Commit both files together**

The test and the fix are one logical change — the test fails without the fix and passes with it. One commit:

```bash
git add src/__tests__/admin/AdminSidebar.test.tsx src/components/admin/AdminSidebar.tsx
git commit -m "fix(admin): visible active-state for sidebar (#323)"
```

---

### Task 3: Visual verification + screenshots

No code changes — verification only, produces the artifacts the PR description needs.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

Expected: server starts on localhost.

- [ ] **Step 2: Navigate to admin and confirm the visible indicator**

In a browser, log in as an org admin and visit `/admin`. The current page's sidebar item (e.g. Dashboard) must show:
- A 4px solid golden left border on the link.
- A subtle warm tan background tint distinct from the parchment surround.
- Dark forest text in semibold weight.

Click into another sidebar item (e.g. Properties). The previously-active item returns to the inactive style; the newly-active item shows the same indicator treatment.

- [ ] **Step 3: Capture before/after screenshots**

Per `docs/playbooks/visual-diff-screenshots.md`, capture:
- A "before" reference from the current `main` branch (or the issue's "currently looks like this" attachment).
- An "after" from this branch with at least one active item visible.

Save them where the playbook directs and reference them in the PR description.

No commit for this task.

---

## Self-Review

Spec coverage:
- Spec § Decision (3 class changes) → Task 2 ✓
- Spec § Test (new active-state test) → Task 1 ✓
- Spec § Out of scope (mobile, section headers, hover, custom border-3 config) → no tasks created ✓
- Spec § Verification (type-check, tests, manual + visual diff) → Tasks 1–3 ✓

No placeholders. Class strings consistent across spec, plan, test, and source change (`bg-golden/10`, `border-l-4`, `border-golden`, `text-forest-dark`, `font-semibold`).
