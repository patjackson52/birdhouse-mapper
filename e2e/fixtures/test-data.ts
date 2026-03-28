import path from 'path';
import fs from 'fs';

// Load .env.test.local BEFORE reading process.env so passwords are available.
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

/**
 * Constants matching the seed data in the test Supabase project.
 * These values are seeded once during project setup and never change.
 */
export const TEST_DATA = {
  org: {
    name: 'Test Org',
    slug: 'test-org',
  },
  property: {
    name: 'Test Property',
    slug: 'default',
  },
  admin: {
    email: process.env.TEST_USER_ADMIN_EMAIL || 'admin@test.fieldmapper.org',
    password: process.env.TEST_USER_ADMIN_PASSWORD || 'test-admin-password',
  },
  editor: {
    email: process.env.TEST_USER_EDITOR_EMAIL || 'editor@test.fieldmapper.org',
    password: process.env.TEST_USER_EDITOR_PASSWORD || 'test-editor-password',
  },
  onboard: {
    email: process.env.TEST_USER_ONBOARD_EMAIL || 'onboard@test.fieldmapper.org',
    password: process.env.TEST_USER_ONBOARD_PASSWORD || 'test-onboard-password-123',
  },
  itemTypes: ['Bird Box', 'Trail Marker'],
  entityType: {
    name: 'Species',
    icon: '🐦',
  },
  entities: ['Black-capped Chickadee', 'Violet-green Swallow', 'Tree Swallow'],
} as const;
