import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Admin Dashboard Visual @visual', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('admin property page matches baseline', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}`);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.fonts.ready);

    await expect(page).toHaveScreenshot('admin-dashboard.png', {
      mask: [
        page.locator('time'),
        page.locator('[data-timestamp]'),
      ],
      maxDiffPixelRatio: 0.01,
    });
  });
});
