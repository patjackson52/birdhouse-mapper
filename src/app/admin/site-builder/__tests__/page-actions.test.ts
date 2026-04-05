import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mutable mock state
// ---------------------------------------------------------------------------

let mockOrgResult: { data: any; error: any } = {
  data: { id: 'org-1', default_property_id: 'prop-1' },
  error: null,
};
let mockPropertyResult: { data: any; error: any } = {
  data: {
    puck_pages: {},
    puck_pages_draft: {},
    puck_page_meta: {},
  },
  error: null,
};
let mockUpdateResult: { error: any } = { error: null };
let lastUpdatePayload: any = null;

function makeSingle(result: { data: any; error: any }) {
  return { single: vi.fn(() => Promise.resolve(result)) };
}

const mockFrom = vi.fn((table: string) => {
  if (table === 'orgs') {
    return {
      select: vi.fn(() => ({
        limit: vi.fn(() => makeSingle(mockOrgResult)),
      })),
    };
  }
  if (table === 'properties') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => makeSingle(mockPropertyResult)),
      })),
      update: vi.fn((payload: any) => {
        lastUpdatePayload = payload;
        return {
          eq: vi.fn(() => Promise.resolve(mockUpdateResult)),
        };
      }),
    };
  }
  return {};
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: mockFrom }),
}));

vi.mock('@/lib/config/server', () => ({
  invalidateConfig: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMocks(overrides?: {
  puck_pages?: Record<string, unknown>;
  puck_pages_draft?: Record<string, unknown>;
  puck_page_meta?: Record<string, unknown>;
}) {
  vi.clearAllMocks();
  lastUpdatePayload = null;
  mockOrgResult = {
    data: { id: 'org-1', default_property_id: 'prop-1' },
    error: null,
  };
  mockPropertyResult = {
    data: {
      puck_pages: overrides?.puck_pages ?? {},
      puck_pages_draft: overrides?.puck_pages_draft ?? {},
      puck_page_meta: overrides?.puck_page_meta ?? {},
    },
    error: null,
  };
  mockUpdateResult = { error: null };
}

// ---------------------------------------------------------------------------
// createPage
// ---------------------------------------------------------------------------

describe('createPage', () => {
  beforeEach(() => resetMocks());

  it('creates a new page with correct path and meta', async () => {
    const { createPage } = await import('../actions');
    const result = await createPage('About Us', 'about-us', false);
    expect(result).toEqual({ success: true });
    expect(lastUpdatePayload).toBeTruthy();
    expect(lastUpdatePayload.puck_pages['/about-us']).toEqual({
      root: { props: {} },
      content: [],
    });
    expect(lastUpdatePayload.puck_pages_draft['/about-us']).toEqual({
      root: { props: {} },
      content: [],
    });
    expect(lastUpdatePayload.puck_page_meta['/about-us']).toMatchObject({
      title: 'About Us',
      slug: 'about-us',
    });
    expect(lastUpdatePayload.puck_page_meta['/about-us'].createdAt).toBeDefined();
  });

  it('rejects a reserved slug', async () => {
    const { createPage } = await import('../actions');
    const result = await createPage('Map Page', 'map', false);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('reserved');
  });

  it('rejects a duplicate slug', async () => {
    resetMocks({
      puck_page_meta: {
        '/existing': { title: 'Existing', slug: 'existing', createdAt: '2024-01-01' },
      },
    });
    const { createPage } = await import('../actions');
    const result = await createPage('Existing Page', 'existing', false);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('already exists');
  });

  it('moves old landing page to /home when creating a new landing page', async () => {
    resetMocks({
      puck_pages: { '/': { content: [{ type: 'Hero', props: {} }] } },
      puck_pages_draft: { '/': { content: [{ type: 'Hero', props: {} }] } },
      puck_page_meta: { '/': { title: 'Old Home', slug: '', createdAt: '2024-01-01' } },
    });
    const { createPage } = await import('../actions');
    const result = await createPage('New Landing', 'new-landing', true);
    expect(result).toEqual({ success: true });
    // Old content moved to /home
    expect(lastUpdatePayload.puck_pages['/home']).toEqual({
      content: [{ type: 'Hero', props: {} }],
    });
    expect(lastUpdatePayload.puck_page_meta['/home']).toMatchObject({
      title: 'Home',
      slug: 'home',
    });
    // New page placed at /
    expect(lastUpdatePayload.puck_pages['/']).toEqual({
      root: { props: {} },
      content: [],
    });
    expect(lastUpdatePayload.puck_page_meta['/']).toMatchObject({
      title: 'New Landing',
      slug: 'new-landing',
    });
  });

  it('creates landing page at / when no existing landing content', async () => {
    const { createPage } = await import('../actions');
    const result = await createPage('Home', 'home', true);
    expect(result).toEqual({ success: true });
    expect(lastUpdatePayload.puck_pages['/']).toEqual({
      root: { props: {} },
      content: [],
    });
    expect(lastUpdatePayload.puck_page_meta['/']).toMatchObject({
      title: 'Home',
      slug: 'home',
    });
  });

  it('returns error when property lookup fails', async () => {
    mockOrgResult = { data: null, error: { message: 'DB error' } };
    const { createPage } = await import('../actions');
    const result = await createPage('Test', 'test', false);
    expect(result).toHaveProperty('error');
  });

  it('returns error when DB update fails', async () => {
    mockUpdateResult = { error: { message: 'update failed' } };
    const { createPage } = await import('../actions');
    const result = await createPage('Test', 'test', false);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toBe('update failed');
  });

  it('calls invalidateConfig on success', async () => {
    const { invalidateConfig } = await import('@/lib/config/server');
    const { createPage } = await import('../actions');
    await createPage('Contact', 'contact', false);
    expect(invalidateConfig).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deletePage
// ---------------------------------------------------------------------------

describe('deletePage', () => {
  beforeEach(() =>
    resetMocks({
      puck_pages: {
        '/': { content: [] },
        '/about': { content: [{ type: 'Text', props: {} }] },
      },
      puck_pages_draft: {
        '/': { content: [] },
        '/about': { content: [{ type: 'Text', props: {} }] },
      },
      puck_page_meta: {
        '/': { title: 'Home', slug: '', createdAt: '2024-01-01' },
        '/about': { title: 'About', slug: 'about', createdAt: '2024-01-01' },
      },
    })
  );

  it('deletes a non-root page', async () => {
    const { deletePage } = await import('../actions');
    const result = await deletePage('/about');
    expect(result).toEqual({ success: true });
    expect(lastUpdatePayload.puck_pages['/about']).toBeUndefined();
    expect(lastUpdatePayload.puck_pages_draft['/about']).toBeUndefined();
    expect(lastUpdatePayload.puck_page_meta['/about']).toBeUndefined();
    // Root page still exists
    expect(lastUpdatePayload.puck_pages['/']).toBeDefined();
  });

  it('rejects deleting the root page', async () => {
    const { deletePage } = await import('../actions');
    const result = await deletePage('/');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('landing page');
  });

  it('calls invalidateConfig on success', async () => {
    const { invalidateConfig } = await import('@/lib/config/server');
    const { deletePage } = await import('../actions');
    await deletePage('/about');
    expect(invalidateConfig).toHaveBeenCalled();
  });

  it('returns error when DB update fails', async () => {
    mockUpdateResult = { error: { message: 'delete failed' } };
    const { deletePage } = await import('../actions');
    const result = await deletePage('/about');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toBe('delete failed');
  });
});

// ---------------------------------------------------------------------------
// setLandingPage
// ---------------------------------------------------------------------------

describe('setLandingPage', () => {
  beforeEach(() =>
    resetMocks({
      puck_pages: {
        '/': { content: [{ type: 'OldHero', props: {} }] },
        '/new-home': { content: [{ type: 'NewHero', props: {} }] },
      },
      puck_pages_draft: {
        '/': { content: [{ type: 'OldHero', props: {} }] },
        '/new-home': { content: [{ type: 'NewHero', props: {} }] },
      },
      puck_page_meta: {
        '/': { title: 'Old Home', slug: '', createdAt: '2024-01-01' },
        '/new-home': { title: 'New Home', slug: 'new-home', createdAt: '2024-02-01' },
      },
    })
  );

  it('swaps content between target path and /', async () => {
    const { setLandingPage } = await import('../actions');
    const result = await setLandingPage('/new-home');
    expect(result).toEqual({ success: true });
    // New home content now at /
    expect(lastUpdatePayload.puck_pages['/']).toEqual({
      content: [{ type: 'NewHero', props: {} }],
    });
    // Old landing content now at /new-home
    expect(lastUpdatePayload.puck_pages['/new-home']).toEqual({
      content: [{ type: 'OldHero', props: {} }],
    });
  });

  it('swaps meta accordingly', async () => {
    const { setLandingPage } = await import('../actions');
    await setLandingPage('/new-home');
    expect(lastUpdatePayload.puck_page_meta['/']).toMatchObject({
      title: 'New Home',
    });
    expect(lastUpdatePayload.puck_page_meta['/new-home']).toMatchObject({
      title: 'Old Home',
    });
  });

  it('rejects setting / as landing page', async () => {
    const { setLandingPage } = await import('../actions');
    const result = await setLandingPage('/');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('already the landing page');
  });

  it('calls invalidateConfig on success', async () => {
    const { invalidateConfig } = await import('@/lib/config/server');
    const { setLandingPage } = await import('../actions');
    await setLandingPage('/new-home');
    expect(invalidateConfig).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updatePageMeta
// ---------------------------------------------------------------------------

describe('updatePageMeta', () => {
  beforeEach(() =>
    resetMocks({
      puck_pages: {
        '/about': { content: [{ type: 'Text', props: {} }] },
      },
      puck_pages_draft: {
        '/about': { content: [{ type: 'Text', props: {} }] },
      },
      puck_page_meta: {
        '/about': { title: 'About', slug: 'about', createdAt: '2024-01-01' },
      },
    })
  );

  it('updates title without changing path', async () => {
    const { updatePageMeta } = await import('../actions');
    const result = await updatePageMeta('/about', { title: 'About Us' });
    expect(result).toEqual({ success: true });
    expect(lastUpdatePayload.puck_page_meta['/about']).toMatchObject({
      title: 'About Us',
      slug: 'about',
    });
    // Content stays at same path
    expect(lastUpdatePayload.puck_pages['/about']).toBeDefined();
  });

  it('updates slug and moves content to new path', async () => {
    const { updatePageMeta } = await import('../actions');
    const result = await updatePageMeta('/about', { slug: 'about-us' });
    expect(result).toEqual({ success: true });
    // Content moved to new path
    expect(lastUpdatePayload.puck_pages['/about-us']).toEqual({
      content: [{ type: 'Text', props: {} }],
    });
    expect(lastUpdatePayload.puck_pages_draft['/about-us']).toEqual({
      content: [{ type: 'Text', props: {} }],
    });
    // Old path removed
    expect(lastUpdatePayload.puck_pages['/about']).toBeUndefined();
    expect(lastUpdatePayload.puck_pages_draft['/about']).toBeUndefined();
    // Meta updated
    expect(lastUpdatePayload.puck_page_meta['/about-us']).toMatchObject({
      title: 'About',
      slug: 'about-us',
    });
    expect(lastUpdatePayload.puck_page_meta['/about']).toBeUndefined();
  });

  it('rejects changing to a reserved slug', async () => {
    const { updatePageMeta } = await import('../actions');
    const result = await updatePageMeta('/about', { slug: 'admin' });
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('reserved');
  });

  it('returns error when page not found', async () => {
    const { updatePageMeta } = await import('../actions');
    const result = await updatePageMeta('/nonexistent', { title: 'Nope' });
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('not found');
  });

  it('no-ops when slug is same as current', async () => {
    const { updatePageMeta } = await import('../actions');
    const result = await updatePageMeta('/about', { slug: 'about' });
    expect(result).toEqual({ success: true });
    // Content stays at same path
    expect(lastUpdatePayload.puck_pages['/about']).toBeDefined();
  });

  it('calls invalidateConfig on success', async () => {
    const { invalidateConfig } = await import('@/lib/config/server');
    const { updatePageMeta } = await import('../actions');
    await updatePageMeta('/about', { title: 'Updated' });
    expect(invalidateConfig).toHaveBeenCalled();
  });

  it('returns error when DB update fails', async () => {
    mockUpdateResult = { error: { message: 'update failed' } };
    const { updatePageMeta } = await import('../actions');
    const result = await updatePageMeta('/about', { title: 'Fail' });
    expect(result).toHaveProperty('error');
  });
});
