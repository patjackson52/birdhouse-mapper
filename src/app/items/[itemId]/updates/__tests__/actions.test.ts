import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdate = vi.fn();
const mockSingle = vi.fn();
const mockInsert = vi.fn();
const mockFrom = vi.fn((table: string) => {
  if (table === 'item_updates') {
    return {
      update: mockUpdate,
      select: () => ({ eq: () => ({ single: mockSingle }) }),
    };
  }
  if (table === 'audit_log') return { insert: mockInsert };
  throw new Error('unexpected table: ' + table);
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.UPDATE_UNDO_HMAC_SECRET = 'test-secret-key-32-bytes-minimum-aaaa';
});

import { softDeleteUpdate } from '../actions';

describe('softDeleteUpdate', () => {
  it('returns an undo token and expiresAt on success', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })   // can_user_delete_update
      .mockResolvedValueOnce({ data: false, error: null }); // is_anon_update
    vi.mocked(createClient).mockReturnValueOnce({
      from: mockFrom,
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
      rpc,
    } as any);
    mockSingle.mockResolvedValueOnce({
      data: { id: 'u-1', created_by: 'user-1', org_id: 'org-1', property_id: 'p-1' },
      error: null,
    });
    mockUpdate.mockReturnValue({
      eq: async () => ({ error: null }),
    });
    mockInsert.mockResolvedValue({ error: null });

    const result = await softDeleteUpdate('u-1');
    expect('undoToken' in result).toBe(true);
    if ('undoToken' in result) {
      expect(typeof result.undoToken).toBe('string');
      expect(result.expiresAtMs).toBeGreaterThan(Date.now());
    }
  });

  it('returns { error } when unauthenticated', async () => {
    // re-mock auth
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockReturnValueOnce({
      from: mockFrom,
      auth: { getUser: async () => ({ data: { user: null } }) },
      rpc: vi.fn(),
    } as any);
    const result = await softDeleteUpdate('u-1');
    expect('error' in result).toBe(true);
  });
});

import { undoDeleteUpdate } from '../actions';
import { signUndoToken } from '@/lib/delete-updates/undo-token';

describe('undoDeleteUpdate', () => {
  it('clears deleted_at when token is valid and actor matches', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'u-1', created_by: 'user-1', org_id: 'org-1', deleted_at: new Date().toISOString() },
      error: null,
    });
    mockUpdate.mockReturnValue({
      eq: async () => ({ error: null }),
    });
    mockInsert.mockResolvedValue({ error: null });

    const token = signUndoToken({
      updateId: 'u-1',
      actorId: 'user-1',
      expiresAtMs: Date.now() + 10_000,
    });
    const result = await undoDeleteUpdate({ updateId: 'u-1', undoToken: token });
    expect('success' in result && result.success).toBe(true);
  });

  it('rejects an expired token with status: gone', async () => {
    const token = signUndoToken({
      updateId: 'u-1',
      actorId: 'user-1',
      expiresAtMs: Date.now() - 1,
    });
    const result = await undoDeleteUpdate({ updateId: 'u-1', undoToken: token });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toBe('gone');
  });

  it('rejects a mismatched actor with forbidden', async () => {
    const token = signUndoToken({
      updateId: 'u-1',
      actorId: 'someone-else',
      expiresAtMs: Date.now() + 10_000,
    });
    const result = await undoDeleteUpdate({ updateId: 'u-1', undoToken: token });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toBe('forbidden');
  });

  it('rejects a mismatched updateId', async () => {
    const token = signUndoToken({
      updateId: 'different',
      actorId: 'user-1',
      expiresAtMs: Date.now() + 10_000,
    });
    const result = await undoDeleteUpdate({ updateId: 'u-1', undoToken: token });
    expect('error' in result).toBe(true);
  });
});
