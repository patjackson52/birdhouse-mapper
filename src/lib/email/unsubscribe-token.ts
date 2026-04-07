import { createHmac } from 'crypto';

const SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'fallback-secret';

interface UnsubscribePayload {
  userId: string;
  topicId: string;
}

export function sign(payload: UnsubscribePayload): string {
  const data = JSON.stringify(payload);
  const encoded = Buffer.from(data).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verify(token: string): UnsubscribePayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, sig] = parts;
  const expectedSig = createHmac('sha256', SECRET).update(encoded).digest('base64url');

  if (sig !== expectedSig) return null;

  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (!data.userId || !data.topicId) return null;
    return data as UnsubscribePayload;
  } catch {
    return null;
  }
}
