import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Must import after mocking fetch
import { addDomainToVercel, removeDomainFromVercel, checkDomainOnVercel } from '../vercel';

describe('Vercel API client', () => {
  beforeEach(() => {
    process.env.VERCEL_API_TOKEN = 'test-token';
    process.env.VERCEL_PROJECT_ID = 'test-project';
    mockFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.VERCEL_API_TOKEN;
    delete process.env.VERCEL_PROJECT_ID;
  });

  describe('addDomainToVercel', () => {
    it('calls Vercel API with correct URL and body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          name: 'app.example.com',
          verified: false,
          verification: [{ type: 'TXT', domain: '_vercel.app.example.com', value: 'verify=abc', reason: 'pending' }],
          misconfigured: false,
        }),
      });

      const result = await addDomainToVercel('app.example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vercel.com/v10/projects/test-project/domains',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'app.example.com' }),
        })
      );
      expect(result.name).toBe('app.example.com');
      expect(result.verified).toBe(false);
      expect(result.verification).toHaveLength(1);
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: { message: 'Domain already exists' } }),
      });

      await expect(addDomainToVercel('app.example.com')).rejects.toThrow('Domain already exists');
    });
  });

  describe('removeDomainFromVercel', () => {
    it('calls DELETE on the domain URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await removeDomainFromVercel('app.example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vercel.com/v10/projects/test-project/domains/app.example.com',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('silently succeeds on 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(removeDomainFromVercel('app.example.com')).resolves.toBeUndefined();
    });

    it('throws on other errors', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(removeDomainFromVercel('app.example.com')).rejects.toThrow('500');
    });
  });

  describe('checkDomainOnVercel', () => {
    it('returns domain info when found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          name: 'app.example.com',
          verified: true,
          misconfigured: false,
        }),
      });

      const result = await checkDomainOnVercel('app.example.com');

      expect(result?.verified).toBe(true);
    });

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await checkDomainOnVercel('app.example.com');
      expect(result).toBeNull();
    });
  });
});
