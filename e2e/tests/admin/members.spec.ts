import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Admin Members', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('members page loads', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/members`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Admin').first()).toBeVisible({ timeout: 10000 });
  });
});
