import { chromium, type FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { TEST_DATA } from './test-data';

// Load .env.test.local if it exists (for local Docker setup)
const envPath = path.join(__dirname, '..', '..', '.env.test.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && !process.env[key]) {
      process.env[key] = rest.join('=');
    }
  }
}

const AUTH_DIR = path.join(__dirname, '..', '.auth');

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';

  // Ensure .auth directory exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch();

  // Log in as admin via the actual login form (sets cookies properly)
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`${baseURL}/login`);
  await adminPage.locator('#email').fill(TEST_DATA.admin.email);
  await adminPage.locator('#password').fill(TEST_DATA.admin.password);
  await adminPage.locator('button[type="submit"]').click();
  await adminPage.waitForURL(/\/(map|manage|admin)/, { timeout: 15000 });
  await adminContext.storageState({ path: path.join(AUTH_DIR, 'admin.json') });
  await adminContext.close();

  // Log in as editor via the actual login form
  const editorContext = await browser.newContext();
  const editorPage = await editorContext.newPage();
  await editorPage.goto(`${baseURL}/login`);
  await editorPage.locator('#email').fill(TEST_DATA.editor.email);
  await editorPage.locator('#password').fill(TEST_DATA.editor.password);
  await editorPage.locator('button[type="submit"]').click();
  await editorPage.waitForURL(/\/(map|manage|admin)/, { timeout: 15000 });
  await editorContext.storageState({ path: path.join(AUTH_DIR, 'editor.json') });
  await editorContext.close();

  await browser.close();
}

export default globalSetup;
