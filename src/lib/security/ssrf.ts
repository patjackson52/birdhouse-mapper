import { lookup } from 'node:dns/promises';
import net from 'node:net';

/**
 * SSRF guard for server-side fetches of user-supplied URLs.
 *
 * A server action that fetches an arbitrary client URL can be tricked into
 * reaching internal services — the cloud metadata endpoint (169.254.169.254),
 * localhost, or private RFC-1918 ranges. These helpers restrict outbound
 * requests to public http(s) hosts and re-validate every redirect hop.
 */

/** True if the IP is loopback, private, link-local, or otherwise not public. */
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0) return true;                         // "this" network
    if (a === 127) return true;                       // loopback
    if (a === 10) return true;                        // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true;          // private
    if (a === 169 && b === 254) return true;          // link-local + cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true;// CGNAT
    if (a >= 224) return true;                         // multicast / reserved
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower.startsWith('::ffff:')) return isBlockedIp(lower.slice('::ffff:'.length)); // IPv4-mapped
  if (lower === '::1' || lower === '::') return true;  // loopback / unspecified
  if (lower.startsWith('fe80')) return true;           // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
  return false;
}

/** Resolve a hostname to its IP addresses. Injectable for testing. */
export type HostResolver = (host: string) => Promise<Array<{ address: string }>>;

const defaultResolver: HostResolver = (host) => lookup(host, { all: true });

/**
 * Validate a URL is a public http(s) endpoint. Rejects non-http schemes and
 * any host that resolves to a blocked address (checking ALL resolved records,
 * which also blunts basic DNS-rebinding). Returns the parsed URL.
 */
export async function assertSafeUrl(raw: string, resolve: HostResolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }

  const host = url.hostname;
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error('URL points to a disallowed address');
    return url;
  }

  const resolved = await resolve(host);
  if (resolved.length === 0) throw new Error('Host did not resolve');
  for (const { address } of resolved) {
    if (isBlockedIp(address)) throw new Error('URL resolves to a disallowed address');
  }
  return url;
}

/**
 * `fetch` that SSRF-validates the initial URL and every redirect hop. Redirects
 * are followed manually (up to `maxRedirects`) so a public URL cannot bounce
 * the request to an internal address.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit & { maxRedirects?: number } = {}
): Promise<Response> {
  const { maxRedirects = 3, ...rest } = init;
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeUrl(current);
    const res = await fetch(current, { ...rest, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects');
}
