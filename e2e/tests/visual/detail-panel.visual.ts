import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Detail Panel Visual @visual', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('detail panel matches baseline', async ({ page }) => {
    await page.goto('/map');
    await page.waitForLoadState('networkidle');

    // Click first marker to open detail panel
    const marker = page.locator('.leaflet-marker-icon').first();
    await marker.click();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.fonts.ready);

    // Wait for panel to appear
    await expect(page.locator('h1.font-heading')).toBeVisible({ timeout: 10000 });

    await expect(page).toHaveScreenshot('detail-panel.png', {
      mask: [
        page.locator('.leaflet-tile-pane'),
        page.locator('img[src*="item-photos"]'),
      ],
      maxDiffPixelRatio: 0.01,
    });
  });
});
