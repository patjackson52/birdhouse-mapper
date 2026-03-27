import { test, expect } from '@playwright/test';

test.describe('Landing Page Visual @visual', () => {
  test('landing page matches baseline', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.fonts.ready);

    await expect(page).toHaveScreenshot('landing-page.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});
