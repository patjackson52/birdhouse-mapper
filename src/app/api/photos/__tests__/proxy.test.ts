import { describe, it, expect } from 'vitest';

describe('photos proxy route', () => {
  it('rejects requests without url parameter', async () => {
    const { POST } = await import('../proxy/route');
    const request = new Request('http://localhost/api/photos/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'test' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('url');
  });

  it('rejects requests without token parameter', async () => {
    const { POST } = await import('../proxy/route');
    const request = new Request('http://localhost/api/photos/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://lh3.googleusercontent.com/test' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('token');
  });

  it('rejects non-Google URLs', async () => {
    const { POST } = await import('../proxy/route');
    const request = new Request('http://localhost/api/photos/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://evil.com/hack.jpg', token: 'test' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Google');
  });
});
