import { test, expect } from '@playwright/test';
import path from 'path';
import { createTestClient, cleanupTestItem } from '../../fixtures/seed';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');
const TEST_ITEM_NAME = `E2E Photo Test ${Date.now()}`;

test.describe('Item Photos in Detail Panel', () => {
  test.use({ storageState: ADMIN_AUTH });

  let testItemId: string | null = null;

  test.afterAll(async () => {
    if (testItemId) {
      const client = createTestClient();
      const { data: photos } = await client
        .from('photos')
        .select('id, storage_path')
        .eq('item_id', testItemId);

      if (photos && photos.length > 0) {
        await client.from('photos').delete().eq('item_id', testItemId);
        const paths = photos.map((p) => p.storage_path).filter(Boolean);
        if (paths.length > 0) {
          await client.storage.from('vault-public').remove(paths);
        }
      }
    }
    await cleanupTestItem('E2E Photo Test');
  });

  test('detail panel shows photo for an item with a photo', async ({ page }) => {
    // Step 1: Create a test item with a photo via Supabase service client
    const client = createTestClient();

    const { data: property } = await client
      .from('properties')
      .select('id, org_id')
      .limit(1)
      .single();
    expect(property).toBeTruthy();

    const { data: itemType } = await client
      .from('item_types')
      .select('id')
      .eq('org_id', property!.org_id)
      .limit(1)
      .single();
    expect(itemType).toBeTruthy();

    const { data: item, error: itemError } = await client
      .from('items')
      .insert({
        name: TEST_ITEM_NAME,
        description: 'Test item with photo for E2E',
        latitude: 44.97,
        longitude: -93.27,
        item_type_id: itemType!.id,
        custom_field_values: {},
        status: 'active',
        org_id: property!.org_id,
        property_id: property!.id,
      })
      .select()
      .single();
    expect(itemError).toBeNull();
    expect(item).toBeTruthy();
    testItemId = item!.id;

    // Upload a 1x1 red PNG as a test photo
    const redPixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    );
    const storagePath = `${item!.id}/test-photo.png`;

    const { error: uploadError } = await client.storage
      .from('vault-public')
      .upload(storagePath, redPixelPng, { contentType: 'image/png' });
    expect(uploadError).toBeNull();

    const { error: photoError } = await client.from('photos').insert({
      item_id: item!.id,
      storage_path: storagePath,
      is_primary: true,
      org_id: property!.org_id,
      property_id: property!.id,
    });
    expect(photoError).toBeNull();

    // Step 2: Navigate to the map with deep-link to the test item
    // The map supports ?item=<id> to auto-open the detail panel
    await page.goto(`/map?item=${item!.id}`);
    await page.waitForLoadState('networkidle');

    // Wait for the detail panel to open via deep-link
    const panelTitle = page.locator('h2.font-heading');
    await expect(panelTitle).toBeVisible({ timeout: 30000 });
    await expect(panelTitle).toContainText('E2E Photo Test');

    // Step 3: Verify the photo is displayed
    const photoContainer = page.locator('.aspect-video');
    await expect(photoContainer).toBeVisible({ timeout: 10000 });

    const photoImg = photoContainer.locator('img');
    await expect(photoImg).toBeVisible({ timeout: 10000 });

    // Verify the img src contains the storage URL pattern
    const src = await photoImg.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).toContain('vault-public');

    // Verify the image loaded successfully (no error state)
    const photoUnavailable = page.locator('text=Photo unavailable');
    await expect(photoUnavailable).not.toBeVisible();
  });
});
