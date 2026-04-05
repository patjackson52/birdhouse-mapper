import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Site Builder Pages', () => {
  test.use({ storageState: ADMIN_AUTH });

  const pagesUrl = `/admin/properties/${TEST_DATA.property.slug}/site-builder/pages`;

  test('pages list loads', async ({ page }) => {
    await page.goto(pagesUrl);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=All Pages')).toBeVisible({ timeout: 10000 });
  });

  test('new page modal opens and has auto-slug', async ({ page }) => {
    await page.goto(pagesUrl);
    await page.waitForLoadState('networkidle');

    await page.click('text=+ New Page');
    await expect(page.locator('text=New Page').first()).toBeVisible();

    // Fill title and verify slug auto-generates
    const titleInput = page.locator('input[placeholder*="Events"]');
    await titleInput.fill('Test Page');

    // The slug input should have auto-populated
    const slugInput = page.locator('input[placeholder="events"]');
    await expect(slugInput).toHaveValue('test-page');
  });

  test('visiting non-existent public page returns 404', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist-xyz');
    expect(response?.status()).toBe(404);
  });
});
