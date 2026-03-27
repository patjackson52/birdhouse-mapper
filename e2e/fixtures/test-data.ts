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
  itemTypes: ['Bird Box', 'Trail Marker'],
  entityType: {
    name: 'Species',
    icon: '🐦',
  },
  entities: ['Black-capped Chickadee', 'Violet-green Swallow', 'Tree Swallow'],
} as const;
