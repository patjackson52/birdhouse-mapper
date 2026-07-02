import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controls the org's setup_complete flag returned by the guard query.
let mockSetupComplete = false;
// Records every mutation the service client performs, so we can assert that a
// blocked action performs NONE.
let calls: Array<{ table?: string; op: string; payload?: unknown; email?: string }> = [];

vi.mock('@/lib/config/server', () => ({ invalidateConfig: () => {} }));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'orgs') {
        return {
          // guard query + setupSaveConfig's org lookup both use select().limit().single()
          select: () => ({
            limit: () => ({
              single: () =>
                Promise.resolve({
                  data: { setup_complete: mockSetupComplete, id: 'org-1', default_property_id: 'prop-1' },
                  error: null,
                }),
            }),
          }),
          update: (payload: unknown) => {
            calls.push({ table: 'orgs', op: 'update', payload });
            return {
              eq: () => Promise.resolve({ error: null }),
              limit: () => Promise.resolve({ error: null }),
            };
          },
        };
      }
      if (table === 'item_types') {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
          insert: (payload: unknown) => {
            calls.push({ table: 'item_types', op: 'insert', payload });
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'it-1' }, error: null }) }) };
          },
          delete: () => ({
            eq: () => {
              calls.push({ table: 'item_types', op: 'delete' });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === 'custom_fields') {
        return {
          insert: (payload: unknown) => {
            calls.push({ table: 'custom_fields', op: 'insert', payload });
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === 'users') {
        return {
          select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          upsert: (payload: unknown) => {
            calls.push({ table: 'users', op: 'upsert', payload });
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
    auth: {
      admin: {
        listUsers: () => Promise.resolve({ data: { users: [] } }),
        createUser: (opts: { email: string }) => {
          calls.push({ op: 'createUser', email: opts.email });
          return Promise.resolve({ data: { user: { id: 'new-user-1' } }, error: null });
        },
      },
    },
  }),
}));

import {
  setupCreateAdmin,
  setupComplete,
  setupSaveConfig,
  setupCreateItemType,
  setupCreateCustomField,
  setupClearItemTypes,
} from '../actions';

beforeEach(() => {
  calls = [];
  mockSetupComplete = false;
  vi.clearAllMocks();
});

describe('setup actions — blocked once setup_complete is true', () => {
  beforeEach(() => {
    mockSetupComplete = true;
  });

  it('setupCreateAdmin refuses and creates NO user/admin', async () => {
    const result = await setupCreateAdmin('attacker@evil.com', 'pw', 'Attacker');
    expect(result).toEqual({ error: 'Setup already complete' });
    expect(calls.find((c) => c.op === 'createUser')).toBeUndefined();
    expect(calls.find((c) => c.op === 'upsert')).toBeUndefined();
  });

  it('setupComplete refuses and does not touch orgs', async () => {
    const result = await setupComplete();
    expect(result).toEqual({ error: 'Setup already complete' });
    expect(calls.find((c) => c.table === 'orgs' && c.op === 'update')).toBeUndefined();
  });

  it('setupSaveConfig refuses and writes nothing', async () => {
    const result = await setupSaveConfig([{ key: 'site_name', value: 'Hacked' }]);
    expect(result).toEqual({ error: 'Setup already complete' });
    expect(calls.length).toBe(0);
  });

  it('setupCreateItemType refuses', async () => {
    const result = await setupCreateItemType('x', '📍', '#000', 0);
    expect(result).toEqual({ error: 'Setup already complete' });
    expect(calls.length).toBe(0);
  });

  it('setupCreateCustomField refuses', async () => {
    const result = await setupCreateCustomField('it-1', 'f', 'text', null, false, 0);
    expect(result).toEqual({ error: 'Setup already complete' });
    expect(calls.length).toBe(0);
  });

  it('setupClearItemTypes refuses and deletes nothing', async () => {
    const result = await setupClearItemTypes();
    expect(result).toBeUndefined();
    expect(calls.find((c) => c.op === 'delete')).toBeUndefined();
  });
});

describe('setup actions — allowed during first-run (setup_complete false)', () => {
  it('setupComplete proceeds and marks the org complete', async () => {
    const result = await setupComplete();
    expect(result).toEqual({ success: true });
    expect(calls).toContainEqual({ table: 'orgs', op: 'update', payload: { setup_complete: true } });
  });

  it('setupCreateAdmin proceeds and provisions the first admin', async () => {
    const result = await setupCreateAdmin('founder@org.com', 'pw', 'Founder');
    expect(result).toEqual({ success: true });
    expect(calls.find((c) => c.op === 'createUser')?.email).toBe('founder@org.com');
    expect(calls.find((c) => c.op === 'upsert')?.payload).toMatchObject({ role: 'admin' });
  });
});
