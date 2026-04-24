import { test, expect } from '@playwright/test';

test.describe('Public Maintenance Viewer', () => {
  test('404 on unknown project id', async ({ page }) => {
    // Next.js 14 streams the response with HTTP 200 before notFound() fires
    // in the server component, so assert the rendered not-found UI instead.
    await page.goto('/p/default/maintenance/00000000-0000-0000-0000-000000000000');
    await expect(page.getByRole('heading', { name: 'This page could not be found.' }))
      .toBeVisible({ timeout: 10000 });
  });

  // Note: populated-viewer assertion is covered by the extended admin smoke
  // (e2e/tests/admin/maintenance.spec.ts) which creates a real project and
  // then navigates anonymously to its public URL.
});
