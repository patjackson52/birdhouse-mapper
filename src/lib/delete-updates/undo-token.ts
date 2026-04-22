import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET_ENV = 'UPDATE_UNDO_HMAC_SECRET';

export type UndoTokenPayload = {
  updateId: string;
  actorId: string;
  expiresAtMs: number;
};

export type VerifyResult =
  | ({ ok: true } & UndoTokenPayload)
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

function getSecret(): string {
  const s = process.env[SECRET_ENV];
  if (!s || s.length < 32) {
    throw new Error(`${SECRET_ENV} must be set to at least 32 bytes`);
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signUndoToken(p: UndoTokenPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(p), 'utf8'));
  const sig = b64url(createHmac('sha256', getSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyUndoToken(token: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [body, sig] = parts;
  const expected = createHmac('sha256', getSecret()).update(body).digest();
  const given = b64urlDecode(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }
  let payload: UndoTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!payload || typeof payload.expiresAtMs !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (Date.now() > payload.expiresAtMs) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, ...payload };
}
