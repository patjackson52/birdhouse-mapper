import { describe, it, expect } from 'vitest';
import {
  initStaged,
  toggleStaged,
  planCommit,
  type StagedState,
  type SelectedEntitySeed,
} from '../staged-selection';
import type { SpeciesResult } from '@/lib/types';

function sp(id: number, extras: Partial<SpeciesResult> = {}): SpeciesResult {
  return {
    id,
    name: `Sp ${id}`,
    common_name: `Common ${id}`,
    photo_url: null,
    photo_square_url: null,
    rank: 'species',
    observations_count: 0,
    wikipedia_url: null,
    ...extras,
  };
}

describe('staged-selection', () => {
  it('initStaged with no selections returns empty maps', () => {
    const state = initStaged([]);
    expect(state.staged.size).toBe(0);
    expect(state.stagedExistingEntityIds.size).toBe(0);
  });

  it('initStaged seeds both maps from existing entities', () => {
    const seeds: SelectedEntitySeed[] = [
      { entityId: 'e1', taxonId: 12727, card: sp(12727) },
      { entityId: 'e2', taxonId: 18472, card: sp(18472) },
    ];
    const state = initStaged(seeds);
    expect(state.staged.size).toBe(2);
    expect(state.stagedExistingEntityIds.get(12727)).toBe('e1');
    expect(state.stagedExistingEntityIds.get(18472)).toBe('e2');
    expect(state.staged.get(12727)).toMatchObject({ id: 12727 });
  });

  it('toggleStaged adds a new taxon', () => {
    const state: StagedState = initStaged([]);
    const next = toggleStaged(state, 12727, sp(12727));
    expect(next.staged.has(12727)).toBe(true);
  });

  it('toggleStaged removes a taxon that is currently in staged', () => {
    const state = toggleStaged(initStaged([]), 12727, sp(12727));
    const next = toggleStaged(state, 12727, sp(12727));
    expect(next.staged.has(12727)).toBe(false);
  });

  it('toggleStaged does not drop stagedExistingEntityIds when removing an existing taxon', () => {
    const seed: SelectedEntitySeed = { entityId: 'e1', taxonId: 12727, card: sp(12727) };
    let state = initStaged([seed]);
    state = toggleStaged(state, 12727, sp(12727)); // now removed from staged
    expect(state.staged.has(12727)).toBe(false);
    expect(state.stagedExistingEntityIds.get(12727)).toBe('e1'); // still recorded
  });

  it('planCommit separates new taxa from kept entity ids', () => {
    const seeds: SelectedEntitySeed[] = [
      { entityId: 'e1', taxonId: 12727, card: sp(12727) },
      { entityId: 'e2', taxonId: 18472, card: sp(18472) },
    ];
    let state = initStaged(seeds);
    state = toggleStaged(state, 18472, sp(18472)); // remove existing
    state = toggleStaged(state, 14836, sp(14836)); // add new

    const plan = planCommit(state);
    expect(plan.keptEntityIds).toEqual(['e1']);
    expect(plan.newTaxa).toHaveLength(1);
    expect(plan.newTaxa[0].id).toBe(14836);
  });

  it('planCommit with no changes returns only kept entity ids', () => {
    const seeds: SelectedEntitySeed[] = [
      { entityId: 'e1', taxonId: 12727, card: sp(12727) },
    ];
    const state = initStaged(seeds);
    const plan = planCommit(state);
    expect(plan.keptEntityIds).toEqual(['e1']);
    expect(plan.newTaxa).toEqual([]);
  });
});
