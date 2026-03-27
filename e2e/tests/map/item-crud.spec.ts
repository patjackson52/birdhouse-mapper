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

  test('creates a new item via the add form', async ({ page }) => {
    await page.goto('/manage/add');

    await page.locator('#name').fill(TEST_ITEM_NAME);
    await page.locator('#description').fill('Created by E2E test');

    const mapContainer = page.locator('.leaflet-container');
    await mapContainer.click({ position: { x: 200, y: 200 } });

    await page.locator('button[type="submit"]').click();

    await page.waitForURL('**/manage', { timeout: 15000 });
  });
});
