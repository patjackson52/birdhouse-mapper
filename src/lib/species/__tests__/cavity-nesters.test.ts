import { describe, it, expect } from 'vitest';
import { CAVITY_NESTER_TAXON_IDS, isCavityNester } from '../cavity-nesters';

describe('cavity-nesters', () => {
  it('exposes a non-empty Set of iNat taxon ids', () => {
    expect(CAVITY_NESTER_TAXON_IDS.size).toBeGreaterThan(0);
    Array.from(CAVITY_NESTER_TAXON_IDS).forEach((id) => {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
    });
  });

  it('isCavityNester returns true for ids in the set', () => {
    const [first] = Array.from(CAVITY_NESTER_TAXON_IDS);
    expect(isCavityNester(first)).toBe(true);
  });

  it('isCavityNester returns false for ids not in the set', () => {
    expect(isCavityNester(-1)).toBe(false);
    expect(isCavityNester(0)).toBe(false);
  });
});
