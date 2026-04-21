import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSpeciesDetail } from '../getSpeciesDetail';

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('getSpeciesDetail', () => {
  it('maps iNat taxa response to SpeciesDetail shape', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          id: 14886,
          preferred_common_name: 'Eastern Bluebird',
          name: 'Sialia sialis',
          default_photo: { medium_url: 'b.png', original_url: 'big.png' },
          conservation_status: { iucn: 'LC' },
          wikipedia_summary: 'A small thrush.',
        }],
      }),
    });
    const out = await getSpeciesDetail(14886);
    expect(out.external_id).toBe(14886);
    expect(out.common_name).toBe('Eastern Bluebird');
    expect(out.scientific_name).toBe('Sialia sialis');
    expect(out.photo_url).toBe('b.png');
    expect(out.iucn_status).toBe('LC');
    expect(out.summary).toBe('A small thrush.');
  });

  it('returns null fields when data missing', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: 1, name: 'X' }] }),
    });
    const out = await getSpeciesDetail(1);
    expect(out.common_name).toBe('X');
    expect(out.iucn_status).toBeNull();
  });
});
