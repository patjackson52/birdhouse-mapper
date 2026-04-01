import { test, expect } from '@playwright/test';

test.describe('Site Builder Preview', () => {
  test('homepage with ?preview=true does not crash (issue #141)', async ({ page }) => {
    const response = await page.goto('/?preview=true');

    // Must not return a 500 error
    expect(response?.status()).toBeLessThan(500);

    // Must not show the Next.js error page
    await expect(
      page.locator('text=Application error')
    ).not.toBeVisible({ timeout: 5000 });
  });

  test('preview mode shows preview banner or normal content', async ({ page }) => {
    await page.goto('/?preview=true');
    await page.waitForLoadState('networkidle');

    // Page should load — title should not be empty
    const title = await page.title();
    expect(title).not.toBe('');

    // Must not show an error page
    const hasError = await page
      .locator('text=Application error')
      .isVisible()
      .catch(() => false);

    expect(hasError).toBe(false);
  });
});
