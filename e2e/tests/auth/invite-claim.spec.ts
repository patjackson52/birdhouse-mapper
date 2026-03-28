import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';
import { createTestClient } from '../../fixtures/seed';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Invite Claim Flow', () => {
  let inviteToken: string | null = null;

  test.afterAll(async () => {
    const client = createTestClient();
    await client
      .from('invites')
      .delete()
      .like('display_name', 'E2E Claim Test%');
    // Clean up temp users created by this test
    await client
      .from('users')
      .delete()
      .like('display_name', 'E2E Claim Test%');
  });

  test('admin creates invite, anonymous user claims it', async ({ browser }) => {
    // Step 1: Admin creates an invite
    const adminContext = await browser.newContext({
      storageState: ADMIN_AUTH,
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(
      `/admin/properties/${TEST_DATA.property.slug}/invites`
    );
    await expect(
      adminPage.locator('button', { hasText: '+ Create Invite' })
    ).toBeVisible({ timeout: 15000 });

    await adminPage.locator('button', { hasText: '+ Create Invite' }).click();
    await adminPage.locator('#invite-name').fill('E2E Claim Test');
    await adminPage
      .locator('button[type="submit"]', { hasText: 'Generate Invite' })
      .click();

    // Wait for QR/share view
    await expect(
      adminPage.locator('h2', { hasText: 'Invite Ready' })
    ).toBeVisible({ timeout: 10000 });

    // Extract the invite URL from the readonly input
    const urlInput = adminPage.locator('input[readonly]');
    const inviteUrl = await urlInput.inputValue();
    expect(inviteUrl).toContain('/invite/');

    // Extract token from URL
    const urlMatch = inviteUrl.match(/\/invite\/(.+)$/);
    expect(urlMatch).toBeTruthy();
    inviteToken = urlMatch![1];

    await adminContext.close();

    // Step 2: Anonymous user claims the invite (fresh context, no auth)
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/invite/${inviteToken}`);

    // Should see the welcome page with the display name
    await expect(
      anonPage.locator('h1', { hasText: 'Welcome, E2E Claim Test!' })
    ).toBeVisible({ timeout: 15000 });

    // Click "Get Started" to claim
    await anonPage
      .locator('button', { hasText: 'Get Started' })
      .click();

    // Should redirect to /manage after successful claim (no error)
    await anonPage.waitForURL(/\/manage/, { timeout: 15000 });

    // No error banner should be visible
    await expect(anonPage.locator('.bg-red-50')).not.toBeVisible();

    await anonContext.close();
  });
});
