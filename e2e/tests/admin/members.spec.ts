import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Admin Members @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('property-scoped members page loads', async ({ page }) => {
    await page.goto(`/p/${TEST_DATA.property.slug}/admin/members`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Members').first()).toBeVisible({ timeout: 10000 });
  });

  test('org-level /admin/members renders without PostgREST embed error', async ({ page }) => {
    await page.goto('/admin/members');
    await page.waitForLoadState('networkidle');

    // Heading present
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible({ timeout: 10000 });

    // No PostgREST ambiguity error visible anywhere on the page
    await expect(
      page.locator('text=/Could not embed|more than one relationship was found/i'),
    ).toHaveCount(0);

    // At least one member row rendered (the seeded admin user is itself a member)
    await expect(page.locator('table tbody tr')).not.toHaveCount(0);
  });
});
