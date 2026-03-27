import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Item Detail Panel @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('clicking a marker opens the detail panel', async ({ page }) => {
    await page.goto('/map');
    await page.waitForLoadState('networkidle');

    const marker = page.locator('.leaflet-marker-icon').first();
    await marker.click({ force: true });

    const panel = page.locator('h2.font-heading');
    await expect(panel).toBeVisible({ timeout: 10000 });
  });

  test('detail panel shows Edit Item link for authenticated users', async ({ page }) => {
    await page.goto('/map');
    await page.waitForLoadState('networkidle');

    const marker = page.locator('.leaflet-marker-icon').first();
    await marker.click({ force: true });

    await expect(page.locator('a:has-text("Edit Item")')).toBeVisible({ timeout: 10000 });
  });
});
