import { describe, it, expect, vi } from 'vitest';
import { track } from '../track';

describe('track', () => {
  it('logs event name and properties in dev', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    track('update.delete.initiated', { update_id: 'u-1', role: 'author', is_own: true, is_anon_update: false });
    expect(spy).toHaveBeenCalledWith('[telemetry]', 'update.delete.initiated', expect.objectContaining({ update_id: 'u-1' }));
    spy.mockRestore();
  });
});
