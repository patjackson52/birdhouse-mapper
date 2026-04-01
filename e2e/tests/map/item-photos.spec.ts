import { test, expect } from '@playwright/test';
import path from 'path';
import { createTestClient, cleanupTestItem } from '../../fixtures/seed';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');
const TEST_ITEM_NAME = `E2E Photo Test ${Date.now()}`;

test.describe('Item Photos in Detail Panel', () => {
  test.use({ storageState: ADMIN_AUTH });

  let testItemId: string | null = null;

  test.afterAll(async () => {
    // Clean up: remove photo records, storage objects, and the test item
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
          await client.storage.from('item-photos').remove(paths);
        }
      }
    }
    await cleanupTestItem('E2E Photo Test');
  });

  test('detail panel shows photo for an item with a photo', async ({ page }) => {
    // Step 1: Create a test item with a photo via Supabase service client
    const client = createTestClient();

    // Get the default property and an item type
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

    // Create the item
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
      .from('item-photos')
      .upload(storagePath, redPixelPng, { contentType: 'image/png' });
    expect(uploadError).toBeNull();

    // Create the photo record
    const { error: photoError } = await client.from('photos').insert({
      item_id: item!.id,
      storage_path: storagePath,
      is_primary: true,
      org_id: property!.org_id,
      property_id: property!.id,
    });
    expect(photoError).toBeNull();

    // Step 2: Navigate to the map and find our item
    await page.goto('/map');
    await page.waitForLoadState('networkidle');

    // Wait for markers to appear
    const markers = page.locator('.leaflet-marker-icon');
    await expect(markers.first()).toBeVisible({ timeout: 15000 });

    // Click markers until we find our test item
    const markerCount = await markers.count();
    let found = false;

    for (let i = 0; i < markerCount; i++) {
      await markers.nth(i).click({ force: true });

      // Check if the detail panel shows our item
      const panelTitle = page.locator('h2.font-heading');
      await expect(panelTitle).toBeVisible({ timeout: 5000 });

      const titleText = await panelTitle.textContent();
      if (titleText?.includes('E2E Photo Test')) {
        found = true;
        break;
      }

      // Close panel and try next marker
      const closeButton = page.locator('[aria-label="Close"]').or(page.locator('button:has-text("×")')).first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
        await page.waitForTimeout(300);
      }
    }

    expect(found).toBe(true);

    // Step 3: Verify the photo is displayed
    // The PhotoViewer renders an img inside a div.aspect-video container
    const photoContainer = page.locator('.aspect-video');
    await expect(photoContainer).toBeVisible({ timeout: 10000 });

    const photoImg = photoContainer.locator('img');
    await expect(photoImg).toBeVisible({ timeout: 10000 });

    // Verify the img src contains the Supabase storage URL
    const src = await photoImg.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).toContain('supabase');
    expect(src).toContain('item-photos');

    // Verify the image loaded successfully (no error state)
    const photoUnavailable = page.locator('text=Photo unavailable');
    await expect(photoUnavailable).not.toBeVisible();
  });
});
