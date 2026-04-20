import type { SpeciesResult } from '@/lib/types';

export interface SelectedEntitySeed {
  entityId: string;
  taxonId: number;
  card: SpeciesResult;
}

export interface StagedState {
  staged: Map<number, SpeciesResult>;
  stagedExistingEntityIds: Map<number, string>;
}

export function initStaged(seeds: SelectedEntitySeed[]): StagedState {
  const staged = new Map<number, SpeciesResult>();
  const stagedExistingEntityIds = new Map<number, string>();
  for (const seed of seeds) {
    staged.set(seed.taxonId, seed.card);
    stagedExistingEntityIds.set(seed.taxonId, seed.entityId);
  }
  return { staged, stagedExistingEntityIds };
}

export function toggleStaged(
  state: StagedState,
  taxonId: number,
  card: SpeciesResult
): StagedState {
  const staged = new Map(state.staged);
  if (staged.has(taxonId)) {
    staged.delete(taxonId);
  } else {
    staged.set(taxonId, card);
  }
  return { staged, stagedExistingEntityIds: state.stagedExistingEntityIds };
}

export function isStaged(state: StagedState, taxonId: number): boolean {
  return state.staged.has(taxonId);
}

export interface CommitPlan {
  newTaxa: SpeciesResult[];
  keptEntityIds: string[];
}

export function planCommit(state: StagedState): CommitPlan {
  const newTaxa: SpeciesResult[] = [];
  const keptEntityIds: string[] = [];

  for (const [taxonId, card] of Array.from(state.staged.entries())) {
    const existingEntityId = state.stagedExistingEntityIds.get(taxonId);
    if (existingEntityId !== undefined) {
      keptEntityIds.push(existingEntityId);
    } else {
      newTaxa.push(card);
    }
  }

  return { newTaxa, keptEntityIds };
}
