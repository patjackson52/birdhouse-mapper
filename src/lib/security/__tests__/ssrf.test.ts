import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isBlockedIp, assertSafeUrl, safeFetch } from '../ssrf';

// Deterministic injectable resolvers (no real DNS).
const resolvesTo = (address: string) => async () => [{ address }];

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('isBlockedIp', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '::1', 'fe80::1', 'fc00::1', 'fd12::34', '::ffff:127.0.0.1',
  ])('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '::ffff:8.8.8.8'])(
    'allows public %s',
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    }
  );
});

describe('assertSafeUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafeUrl('ftp://example.com')).rejects.toThrow(/http/i);
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow(/http/i);
  });

  it('rejects a malformed URL', async () => {
    await expect(assertSafeUrl('not a url')).rejects.toThrow(/invalid url/i);
  });

  it('rejects IP-literal internal targets (metadata, loopback, private)', async () => {
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/disallowed/i);
    await expect(assertSafeUrl('http://127.0.0.1:8080/')).rejects.toThrow(/disallowed/i);
    await expect(assertSafeUrl('http://10.0.0.5/')).rejects.toThrow(/disallowed/i);
  });

  it('rejects a hostname that resolves to a private address (rebinding)', async () => {
    await expect(assertSafeUrl('https://evil.example.com', resolvesTo('10.0.0.5'))).rejects.toThrow(/disallowed/i);
  });

  it('allows a public hostname', async () => {
    await expect(assertSafeUrl('https://example.com/page', resolvesTo('93.184.216.34'))).resolves.toBeInstanceOf(URL);
  });
});

describe('safeFetch', () => {
  it('fetches a public URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
    const res = await safeFetch('https://example.com');
    expect(res.status).toBe(200);
  });

  it('blocks a redirect that points at an internal address', async () => {
    // First hop 302 → cloud metadata; safeFetch must re-validate and refuse.
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })
    ));
    await expect(safeFetch('https://example.com', { maxRedirects: 2 })).rejects.toThrow(/disallowed/i);
  });
});
