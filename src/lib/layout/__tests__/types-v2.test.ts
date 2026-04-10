import { describe, it, expect } from 'vitest';
import type { LayoutBlockV2, BlockAlign } from '../types-v2';

describe('types-v2 BlockAlign', () => {
  it('accepts align property on LayoutBlockV2', () => {
    const block: LayoutBlockV2 = {
      id: 'test-1',
      type: 'status_badge',
      config: {},
      width: '1/2',
      align: 'center',
    };
    expect(block.align).toBe('center');
  });

  it('allows align to be undefined', () => {
    const block: LayoutBlockV2 = {
      id: 'test-2',
      type: 'status_badge',
      config: {},
    };
    expect(block.align).toBeUndefined();
  });
});
