import { describe, it, expect } from 'vitest';
import { layoutBlockV2Schema } from '../schemas-v2';

describe('schemas-v2 align validation', () => {
  const validBlock = {
    id: 'b1',
    type: 'status_badge',
    config: {},
  };

  it('accepts block without align', () => {
    const result = layoutBlockV2Schema.safeParse(validBlock);
    expect(result.success).toBe(true);
  });

  it('accepts block with valid align values', () => {
    for (const align of ['start', 'center', 'end']) {
      const result = layoutBlockV2Schema.safeParse({ ...validBlock, align });
      expect(result.success).toBe(true);
    }
  });

  it('rejects block with invalid align value', () => {
    const result = layoutBlockV2Schema.safeParse({ ...validBlock, align: 'middle' });
    expect(result.success).toBe(false);
  });
});
