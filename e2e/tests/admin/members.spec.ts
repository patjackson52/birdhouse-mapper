import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Admin Members @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('property-scoped members page loads', async ({ page }) => {
    await page.goto(`/p/${TEST_DATA.property.slug}/admin/members`);
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible({ timeout: 10000 });
  });

  test('org-level /admin/members renders without PostgREST embed error', async ({ page }) => {
    await page.goto('/admin/members');

    // Heading present.
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible({ timeout: 10000 });

    // At least one member row rendered. The query failure (issue #305) leaves
    // the table empty because the page swallows the error and shows EmptyState
    // — so the row visibility check is the regression signal.
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });
  });
});
