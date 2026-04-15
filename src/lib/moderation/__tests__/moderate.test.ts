import { describe, it, expect, vi, beforeEach } from 'vitest';

let fetchResponse: { ok: boolean; json: () => Promise<unknown> };

vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(fetchResponse)));

// Set API key before importing
process.env.OPENAI_API_KEY = 'test-key';

// Must import after stubbing fetch
const { moderateImage, moderateText } = await import('../moderate');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('moderateText', () => {
  it('returns not flagged for clean text', async () => {
    fetchResponse = {
      ok: true,
      json: () => Promise.resolve({
        results: [{
          flagged: false,
          categories: { sexual: false, hate: false, violence: false },
          category_scores: { sexual: 0.001, hate: 0.002, violence: 0.001 },
        }],
      }),
    };

    const result = await moderateText('A beautiful birdhouse in the garden');
    expect(result.flagged).toBe(false);
  });

  it('returns flagged for offensive text', async () => {
    fetchResponse = {
      ok: true,
      json: () => Promise.resolve({
        results: [{
          flagged: true,
          categories: { hate: true, violence: false },
          category_scores: { hate: 0.95, violence: 0.01 },
        }],
      }),
    };

    const result = await moderateText('some offensive text');
    expect(result.flagged).toBe(true);
    expect(result.categories.hate).toBe(true);
  });

  it('throws on API failure', async () => {
    fetchResponse = { ok: false, json: () => Promise.resolve({ error: 'bad' }) };
    await expect(moderateText('test')).rejects.toThrow('Moderation API request failed');
  });
});

describe('moderateImage', () => {
  it('returns not flagged for clean image', async () => {
    fetchResponse = {
      ok: true,
      json: () => Promise.resolve({
        results: [{
          flagged: false,
          categories: { sexual: false, violence: false },
          category_scores: { sexual: 0.001, violence: 0.002 },
        }],
      }),
    };

    const result = await moderateImage('base64encodedimage', 'image/jpeg');
    expect(result.flagged).toBe(false);
  });

  it('returns flagged for NSFW image', async () => {
    fetchResponse = {
      ok: true,
      json: () => Promise.resolve({
        results: [{
          flagged: true,
          categories: { sexual: true },
          category_scores: { sexual: 0.98 },
        }],
      }),
    };

    const result = await moderateImage('base64encodedimage', 'image/jpeg');
    expect(result.flagged).toBe(true);
  });

  it('sends correct payload with image data', async () => {
    fetchResponse = {
      ok: true,
      json: () => Promise.resolve({
        results: [{ flagged: false, categories: {}, category_scores: {} }],
      }),
    };

    await moderateImage('abc123', 'image/png');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/moderations',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('data:image/png;base64,abc123'),
      }),
    );
  });
});
