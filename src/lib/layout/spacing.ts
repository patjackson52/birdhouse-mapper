import type { SpacingPreset } from './types';

export const SPACING = {
  compact: { blockGap: 8, rowGap: 8, sectionPadding: 12 },
  comfortable: { blockGap: 12, rowGap: 12, sectionPadding: 16 },
  spacious: { blockGap: 16, rowGap: 16, sectionPadding: 20 },
} as const satisfies Record<SpacingPreset, { blockGap: number; rowGap: number; sectionPadding: number }>;

/** Width below which rows collapse to vertical stacking */
export const ROW_COLLAPSE_BREAKPOINT = 480;
