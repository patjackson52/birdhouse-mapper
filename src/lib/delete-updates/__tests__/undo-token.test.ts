import { describe, it, expect, beforeAll } from 'vitest';
import { signUndoToken, verifyUndoToken } from '../undo-token';

beforeAll(() => {
  process.env.UPDATE_UNDO_HMAC_SECRET = 'test-secret-key-32-bytes-minimum-aaaa';
});

describe('undo-token', () => {
  it('signs and verifies a valid token', () => {
    const token = signUndoToken({
      updateId: '00000000-0000-0000-0000-000000000001',
      actorId: '00000000-0000-0000-0000-000000000002',
      expiresAtMs: Date.now() + 10_000,
    });
    const payload = verifyUndoToken(token);
    expect(payload.ok).toBe(true);
    if (payload.ok) {
      expect(payload.updateId).toBe('00000000-0000-0000-0000-000000000001');
      expect(payload.actorId).toBe('00000000-0000-0000-0000-000000000002');
    }
  });

  it('rejects an expired token', () => {
    const token = signUndoToken({
      updateId: 'u1',
      actorId: 'a1',
      expiresAtMs: Date.now() - 1,
    });
    const result = verifyUndoToken(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  it('rejects a tampered token', () => {
    const token = signUndoToken({
      updateId: 'u1',
      actorId: 'a1',
      expiresAtMs: Date.now() + 10_000,
    });
    const tampered = token.slice(0, -4) + 'xxxx';
    const result = verifyUndoToken(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });
});
