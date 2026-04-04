import { describe, it, expect } from 'vitest';
import { isLayoutRow, isLayoutBlock } from '../types';
import type { LayoutBlock, LayoutRow } from '../types';

describe('layout type guards', () => {
  const block: LayoutBlock = {
    id: 'b1',
    type: 'status_badge',
    config: {},
  };

  const row: LayoutRow = {
    id: 'r1',
    type: 'row',
    children: [block],
    gap: 'normal',
    distribution: 'equal',
  };

  it('isLayoutRow returns true for rows', () => {
    expect(isLayoutRow(row)).toBe(true);
  });

  it('isLayoutRow returns false for blocks', () => {
    expect(isLayoutRow(block)).toBe(false);
  });

  it('isLayoutBlock returns true for blocks', () => {
    expect(isLayoutBlock(block)).toBe(true);
  });

  it('isLayoutBlock returns false for rows', () => {
    expect(isLayoutBlock(row)).toBe(false);
  });
});
