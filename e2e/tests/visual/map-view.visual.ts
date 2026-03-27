import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Map View Visual @visual', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('map page matches baseline', async ({ page }) => {
    await page.goto('/map');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.fonts.ready);

    await expect(page).toHaveScreenshot('map-view.png', {
      mask: [page.locator('.leaflet-tile-pane')],
      maxDiffPixelRatio: 0.01,
      timeout: 15000,
    });
  });
});
