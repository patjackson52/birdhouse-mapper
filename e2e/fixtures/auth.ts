import { test as base } from '@playwright/test';
import path from 'path';

const AUTH_DIR = path.join(__dirname, '..', '.auth');

/**
 * Extended test fixtures with pre-authenticated browser contexts.
 * Usage:
 *   import { test } from '../fixtures/auth';
 *   test('admin can ...', async ({ adminPage }) => { ... });
 */
export const test = base.extend<{
  adminPage: ReturnType<typeof base.extend>['prototype']['page'];
  editorPage: ReturnType<typeof base.extend>['prototype']['page'];
}>({
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'admin.json'),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  editorPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'editor.json'),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';
