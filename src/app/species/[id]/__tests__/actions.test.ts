import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable query builder mock. The real supabase-js builder returns a thenable
// so `await supabase.from('x').select().eq().eq()` works. Our mock simulates that.
function makeMockClient() {
  const state = { table: '', rows: [] as any[] };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    then: (resolve: any) => resolve({ data: state.rows, error: null }),
  };
  return {
    _setRows(table: string, rows: any[]) { state.rows = rows; state.table = table; },
    from(_table: string) { return chain; },
  } as any;
}

vi.mock('@/lib/supabase/server', () => {
  const client = makeMockClient();
  return {
    __client: client,
    createClient: () => client,
  };
});

beforeEach(async () => {
  const mod: any = await import('@/lib/supabase/server');
  mod.__client._setRows('', []);
});

async function seed(rows: any[]) {
  const mod: any = await import('@/lib/supabase/server');
  mod.__client._setRows('species_sightings_v', rows);
}

describe('getSpeciesCitingsAtItem', () => {
  it('counts rows and picks max observed_on', async () => {
    await seed([
      { observed_on: '2026-01-10' },
      { observed_on: '2026-04-01' },
      { observed_on: '2026-02-05' },
    ]);
    const { getSpeciesCitingsAtItem } = await import('../actions');
    const out = await getSpeciesCitingsAtItem(14886, 'item-1');
    expect(out.count).toBe(3);
    expect(out.lastObserved).toBe('2026-04-01');
  });

  it('returns zero count when no rows', async () => {
    await seed([]);
    const { getSpeciesCitingsAtItem } = await import('../actions');
    const out = await getSpeciesCitingsAtItem(14886, 'item-1');
    expect(out.count).toBe(0);
    expect(out.lastObserved).toBeNull();
  });
});
