import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockAuth: any;
let mockOwnedTopics: Array<{ id: string }> = [];
const ops: string[] = [];

function makeSupabase() {
  return {
    from: (table: string) => {
      if (table === 'communication_topics') {
        return {
          insert: () => { ops.push('topics:insert'); return { select: () => ({ single: () => Promise.resolve({ data: { id: 'topic-1', name: 'T' }, error: null }) }) }; },
          update: () => ({ eq: () => ({ eq: () => { ops.push('topics:update'); return Promise.resolve({ error: null }); } }) }),
          select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: mockOwnedTopics }) }) }),
        };
      }
      if (table === 'properties') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'prop-1' } }) }) }) }) };
      }
      return {};
    },
  };
}

vi.mock('@/lib/auth/require-org', () => ({
  isAuthFailure: (r: any) => 'error' in r,
  requireOrgAdmin: () => Promise.resolve(mockAuth),
}));
// createClient is only used by the user-scoped actions, not exercised here.
vi.mock('@/lib/supabase/server', () => ({ createClient: () => makeSupabase() }));

import { createTopic, updateTopic, sendNotification } from '../actions';

beforeEach(() => {
  ops.length = 0;
  mockOwnedTopics = [];
  mockAuth = { supabase: makeSupabase(), user: { id: 'u-1' }, tenant: { orgId: 'org-1' }, orgId: 'org-1' };
});

const notif = { org_id: 'org-1', topic_ids: ['topic-1'], title: 'Hi', body: 'Body', channels: ['in_app'] as ('in_app')[] };

describe('communications — admin required', () => {
  beforeEach(() => { mockAuth = { error: 'Admin access required' }; });

  it('createTopic refuses non-admins', async () => {
    expect(await createTopic({ org_id: 'org-1', name: 'T' })).toEqual({ error: 'Admin access required' });
    expect(ops).toHaveLength(0);
  });
  it('updateTopic refuses non-admins', async () => {
    expect(await updateTopic('topic-1', { name: 'X' })).toEqual({ error: 'Admin access required' });
    expect(ops).toHaveLength(0);
  });
  it('sendNotification refuses non-admins', async () => {
    expect(await sendNotification(notif)).toEqual({ error: 'Admin access required' });
  });
});

describe('communications — org scoping', () => {
  it('createTopic rejects another org', async () => {
    expect(await createTopic({ org_id: 'org-2', name: 'T' })).toEqual({ error: 'Cannot create a topic for another org' });
    expect(ops).not.toContain('topics:insert');
  });

  it('sendNotification rejects another org', async () => {
    expect(await sendNotification({ ...notif, org_id: 'org-2' })).toEqual({ error: 'Cannot send notifications for another org' });
  });

  it('sendNotification rejects topics not owned by the org', async () => {
    mockOwnedTopics = []; // ownership query returns none of the requested topics
    expect(await sendNotification(notif)).toEqual({ error: 'One or more topics do not belong to this org' });
  });

  it('createTopic succeeds for the caller own org', async () => {
    const r = await createTopic({ org_id: 'org-1', name: 'Announcements' });
    expect('success' in r && r.success).toBe(true);
    expect(ops).toContain('topics:insert');
  });

  it('updateTopic succeeds for an admin (org-scoped)', async () => {
    expect(await updateTopic('topic-1', { name: 'X' })).toEqual({ success: true });
    expect(ops).toContain('topics:update');
  });
});
