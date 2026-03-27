import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Map View @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('map page loads with Leaflet container', async ({ page }) => {
    await page.goto('/map');
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15000 });
  });

  test('map displays item markers', async ({ page }) => {
    await page.goto('/map');
    await page.waitForLoadState('networkidle');
    const markers = page.locator('.leaflet-marker-icon');
    await expect(markers.first()).toBeVisible({ timeout: 15000 });
  });
});
