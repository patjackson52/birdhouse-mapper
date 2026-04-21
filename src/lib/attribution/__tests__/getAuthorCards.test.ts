import { describe, it, expect, vi } from 'vitest';
import { getAuthorCards } from '../getAuthorCards';

function mockSupabase(rows: any[]) {
  return {
    rpc: vi.fn((name: string, args: any) => {
      expect(name).toBe('get_author_cards');
      expect(args.p_org_id).toBeDefined();
      expect(args.p_user_ids).toBeDefined();
      return Promise.resolve({ data: rows, error: null });
    }),
  } as any;
}

describe('getAuthorCards', () => {
  it('returns empty map for empty input', async () => {
    const supabase = mockSupabase([]);
    const out = await getAuthorCards(supabase, 'org-1', []);
    expect(out.size).toBe(0);
    // RPC should not be called if no user ids.
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('deduplicates user ids before calling RPC', async () => {
    const supabase = mockSupabase([
      { id: 'u1', display_name: 'Alice', avatar_url: null, role: 'contributor', update_count: 1 },
    ]);
    await getAuthorCards(supabase, 'org-1', ['u1', 'u1', 'u1']);
    expect(supabase.rpc).toHaveBeenCalledOnce();
    const args = (supabase.rpc as any).mock.calls[0][1];
    expect(args.p_user_ids).toEqual(['u1']);
  });

  it('maps RPC rows by id', async () => {
    const rows = [
      { id: 'u1', display_name: 'Alice', avatar_url: 'a.png', role: 'org_admin', update_count: 12 },
      { id: 'u2', display_name: 'Bob', avatar_url: null, role: 'public_contributor', update_count: 1 },
    ];
    const out = await getAuthorCards(mockSupabase(rows), 'org-1', ['u1', 'u2']);
    expect(out.get('u1')?.role).toBe('org_admin');
    expect(out.get('u1')?.update_count).toBe(12);
    expect(out.get('u2')?.role).toBe('public_contributor');
    expect(out.get('u2')?.avatar_url).toBeNull();
  });

  it('throws on RPC error', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) } as any;
    await expect(getAuthorCards(supabase, 'org-1', ['u1'])).rejects.toThrow(/boom/);
  });
});
