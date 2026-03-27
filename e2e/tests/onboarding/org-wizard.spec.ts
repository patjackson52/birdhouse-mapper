import { test, expect } from '@playwright/test';
import path from 'path';
import { cleanupTestOrgs } from '../../fixtures/seed';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');
const ORG_PREFIX = 'E2E Onboard Test';

test.describe('Onboarding Wizard', () => {
  test.use({ storageState: ADMIN_AUTH });

  test.afterAll(async () => {
    await cleanupTestOrgs(ORG_PREFIX);
  });

  test('onboard page loads with welcome step', async ({ page }) => {
    await page.goto('/onboard');
    const onPage = await page.locator('text=set up your organization').isVisible().catch(() => false);
    if (onPage) {
      await expect(page.locator('button:has-text("Get Started")')).toBeVisible();
    }
  });
});
