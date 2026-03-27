import { test, expect } from '@playwright/test';
import path from 'path';
import { cleanupTestItem } from '../../fixtures/seed';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');
const TEST_ITEM_NAME = `E2E Test Item ${Date.now()}`;

test.describe('Item CRUD @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test.afterAll(async () => {
    await cleanupTestItem('E2E Test Item');
  });

  test('add item form loads and accepts input', async ({ page }) => {
    await page.goto('/manage/add');

    // Verify form elements are present
    await expect(page.locator('#name')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#description')).toBeVisible();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Fill the form
    await page.locator('#name').fill(TEST_ITEM_NAME);
    await page.locator('#description').fill('Created by E2E test');

    // Verify values were accepted
    await expect(page.locator('#name')).toHaveValue(TEST_ITEM_NAME);
  });
});
