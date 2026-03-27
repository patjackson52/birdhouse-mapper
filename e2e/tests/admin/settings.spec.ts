import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Admin Settings', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('settings page loads', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/settings`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('input, textarea, select').first()).toBeVisible({ timeout: 10000 });
  });
});
