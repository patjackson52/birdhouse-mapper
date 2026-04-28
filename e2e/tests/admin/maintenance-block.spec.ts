import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Upcoming Maintenance block — chip + render', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('the Upcoming Maintenance chip appears in the layout editor sidebar', async ({ page }) => {
    // This is the regression guard for the PR #283 wiring bug: the chip was added
    // to the dead BlockPaletteV2.tsx instead of the live ComponentDrawer.tsx, so
    // it never appeared in the actual editor admins use.
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/types`);

    // Expand the first item type's "layout" tab. Item types render as collapsible
    // cards; the Bird Box seeded type is first.
    const firstTypeRow = page.locator('text=' + TEST_DATA.itemTypes[0]).first();
    await firstTypeRow.click();
    // After expanding, the layout tab is the default.
    await expect(page.getByLabel(/Drag to add Upcoming Maintenance/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test.fixme(
    'staff clicking an upcoming row navigates to the admin maintenance detail page',
    async () => {
      // Deferred. Requires a seeded property+item pair where the item already has
      // a planned/in_progress maintenance project linked. The existing
      // e2e/tests/admin/maintenance.spec.ts creates+links a project at runtime in
      // a serial flow and then deletes it; building on top of that without
      // breaking its serial contract requires either:
      //   (a) extracting its setup into a reusable fixture/helper, or
      //   (b) adding a dedicated seed step in e2e/fixtures/global-setup.ts
      //       that creates a long-lived "Spring nestbox inspection" project
      //       linked to a known item.
      // Unit tests in src/components/layout/blocks/__tests__/UpcomingMaintenanceBlock.test.tsx
      // already exhaustively cover URL building for both staff and anonymous
      // viewers, so this E2E case is a safety net rather than a primary check.
    },
  );

  test.fixme(
    'anonymous viewer clicking an upcoming row navigates to the public maintenance viewer',
    async () => {
      // Deferred for the same reason as the staff case above.
    },
  );
});
