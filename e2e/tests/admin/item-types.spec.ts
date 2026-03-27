import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Item Types Admin', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('types page loads and shows item types', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/types`);
    await expect(page.locator(`text=${TEST_DATA.itemTypes[0]}`)).toBeVisible({ timeout: 10000 });
  });
});
