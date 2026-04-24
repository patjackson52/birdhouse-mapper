import { test, expect } from '@playwright/test';

test.describe('Public Maintenance Viewer', () => {
  test('404 on unknown project id', async ({ page }) => {
    const response = await page.goto('/p/default/maintenance/00000000-0000-0000-0000-000000000000');
    expect(response?.status()).toBe(404);
  });

  // Note: populated-viewer assertion is covered by the extended admin smoke
  // (e2e/tests/admin/maintenance.spec.ts) which creates a real project and
  // then navigates anonymously to its public URL.
});
