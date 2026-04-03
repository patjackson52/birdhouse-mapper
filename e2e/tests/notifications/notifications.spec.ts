import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';
import { createTestClient } from '../../fixtures/seed';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

const E2E_NOTIFICATION_TITLE = 'E2E Test Notification';

test.describe('Notifications', () => {
  test.use({ storageState: ADMIN_AUTH });

  test.afterAll(async () => {
    const supabase = createTestClient();
    await supabase
      .from('notifications')
      .delete()
      .eq('title', E2E_NOTIFICATION_TITLE);
  });

  // ---------------------------------------------------------------------------
  // Test 1: Notification bell visibility
  // ---------------------------------------------------------------------------
  test('notification bell appears in header and opens dropdown', async ({ page }) => {
    await page.goto('/manage');
    await page.waitForLoadState('networkidle');

    // Bell button should be visible in the header
    const bell = page.locator('[title="Notifications"]');
    await expect(bell).toBeVisible({ timeout: 10000 });

    // Clicking it should open the dropdown with the heading
    await bell.click();
    await expect(page.locator('h3', { hasText: 'Notifications' })).toBeVisible({ timeout: 5000 });

    // With no notifications, the empty state message should appear
    await expect(page.locator('text=No notifications yet')).toBeVisible({ timeout: 5000 });
  });

  // ---------------------------------------------------------------------------
  // Test 2: Notification preferences page
  // ---------------------------------------------------------------------------
  test('notification preferences page loads with toggle grid', async ({ page }) => {
    await page.goto('/admin/notifications');
    await page.waitForLoadState('networkidle');

    // Page heading
    await expect(
      page.locator('h1', { hasText: 'Notification Preferences' })
    ).toBeVisible({ timeout: 10000 });

    // Column labels: In-App, Email, SMS
    await expect(page.locator('th', { hasText: 'In-App' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('th', { hasText: 'Email' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'SMS' })).toBeVisible();

    // Notification type rows
    await expect(page.locator('text=Task reminders')).toBeVisible();
    await expect(page.locator('text=Task assigned to me')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Test 3: Notification appears after insertion
  // ---------------------------------------------------------------------------
  test('notification inserted via service client appears in dropdown', async ({ page }) => {
    const supabase = createTestClient();

    // Look up the admin user by email via the Auth admin API
    const listResult = await supabase.auth.admin.listUsers();
    const users = listResult.data?.users ?? [];
    const adminUser = users.find((u) => u.email === TEST_DATA.admin.email);
    if (!adminUser) throw new Error(`Admin user not found: ${TEST_DATA.admin.email}`);

    // Look up the test org
    const { data: org } = await supabase
      .from('orgs')
      .select('id')
      .eq('name', TEST_DATA.org.name)
      .single();
    if (!org) throw new Error(`Org not found: ${TEST_DATA.org.name}`);

    // Insert a test notification directly (service role bypasses RLS insert restriction)
    const { error } = await supabase.from('notifications').insert({
      org_id: org.id,
      user_id: adminUser.id,
      type: 'task_reminder',
      title: E2E_NOTIFICATION_TITLE,
      body: 'This is an E2E test notification body',
      reference_type: 'task',
      reference_id: '00000000-0000-0000-0000-000000000001',
      channel: 'in_app',
      status: 'sent',
    });
    if (error) throw new Error(`Failed to insert test notification: ${error.message}`);

    // Reload page so the notification query picks it up
    await page.goto('/manage');
    await page.waitForLoadState('networkidle');

    // Open the bell dropdown
    const bell = page.locator('[title="Notifications"]');
    await expect(bell).toBeVisible({ timeout: 10000 });
    await bell.click();

    // The inserted notification title should appear in the dropdown
    await expect(
      page.locator(`text=${E2E_NOTIFICATION_TITLE}`)
    ).toBeVisible({ timeout: 5000 });
  });
});
