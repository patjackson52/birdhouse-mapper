import { test, expect } from '@playwright/test';
import path from 'path';

// Admin auth storage state follows the convention used by e2e/tests/updates/add-update-flow.spec.ts:
// path = e2e/.auth/admin.json (relative to the repo) → resolved from this test file as
// ../../.auth/admin.json.
const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Item timeline v2 — rail → update → species → back', () => {
  test.use({ storageState: ADMIN_AUTH });

  // This test requires seeded data that is NOT part of the default e2e fixtures today:
  //   * A property (slug may vary) visible to the admin user
  //   * At least one item on that property that has a timeline rail with a RailCard
  //   * At least one update whose detail includes species observations backed by iNaturalist
  //     (i.e. an iNaturalist-taxon-linked species entity with a valid species row)
  //
  // To enable this test:
  //   1. Seed the above via the e2e global-setup or a dedicated seed script.
  //   2. Export RUN_TIMELINE_E2E=1 before running Playwright.
  //
  // Leaving it skip-gated keeps the file in-tree as a happy-path contract without
  // breaking CI while the fixture work lands.
  test.skip(
    !process.env.RUN_TIMELINE_E2E,
    'Requires seeded timeline fixture data — set RUN_TIMELINE_E2E=1 to run.',
  );

  test('navigates rail card → update detail → species sheet → back preserves state', async ({ page }) => {
    // Entry point — property page. Adapt slug to match seeded fixture if different.
    await page.goto('/p/test-farm');
    await page.waitForLoadState('networkidle');

    // Open the first item's detail via a map marker click (same pattern as add-update-flow.spec.ts).
    const marker = page.locator('.leaflet-marker-icon').first();
    await marker.click({ force: true });

    // The item detail view should render a TimelineRail with RailCards.
    const firstRailCard = page.locator('[data-testid="rail-card"]').first();
    await expect(firstRailCard).toBeVisible({ timeout: 10000 });
    await firstRailCard.click();

    // Update detail sheet should show the "Species observed" section.
    await expect(page.getByText(/Species observed/i)).toBeVisible({ timeout: 10000 });

    // Click the first species row — SpeciesRow renders the common name as a button.
    const firstSpeciesRow = page.locator('[data-testid="species-row"]').first();
    await expect(firstSpeciesRow).toBeVisible();
    await firstSpeciesRow.click();

    // URL should update to /species/<id> (intercepted parallel route) and the dialog should open.
    await expect(page).toHaveURL(/\/species\/\d+/);
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Switch scope to property — SpeciesDetailView exposes scope tabs.
    const propertyScopeTab = page.getByRole('tab', { name: /property|farm/i }).first();
    await propertyScopeTab.click();
    await expect(page.getByText(/observations/i)).toBeVisible();

    // Back navigation should close the species sheet but keep the update detail sheet visible.
    await page.goBack();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(page.getByText(/Species observed/i)).toBeVisible();
  });
});
