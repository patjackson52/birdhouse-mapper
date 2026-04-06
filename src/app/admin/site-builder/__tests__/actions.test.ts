import { describe, it, expect, vi, beforeEach } from 'vitest';
import { puckDataSchema } from '@/lib/puck/schemas';

// ---------------------------------------------------------------------------
// Schema-level validation tests (no DB required)
// ---------------------------------------------------------------------------

describe('puckDataSchema validation', () => {
  it('accepts valid puck data with content array', () => {
    const result = puckDataSchema.safeParse({
      content: [{ type: 'Hero', props: { title: 'Hello' } }],
      root: { props: { backgroundColor: '#fff' } },
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty content array', () => {
    const result = puckDataSchema.safeParse({ content: [] });
    expect(result.success).toBe(true);
  });

  it('applies defaults — missing content becomes []', () => {
    const result = puckDataSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toEqual([]);
    }
  });

  it('accepts data with zones', () => {
    const result = puckDataSchema.safeParse({
      content: [],
      zones: {
        'sidebar:zone': [{ type: 'Text', props: { text: 'sidebar' } }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects content item missing type field', () => {
    const result = puckDataSchema.safeParse({
      content: [{ props: { title: 'Missing type' } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects content item with non-string type', () => {
    const result = puckDataSchema.safeParse({
      content: [{ type: 42, props: {} }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects content item missing props field', () => {
    const result = puckDataSchema.safeParse({
      content: [{ type: 'Hero' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-array content', () => {
    const result = puckDataSchema.safeParse({
      content: 'not an array',
    });
    expect(result.success).toBe(false);
  });

  it('accepts complex nested props', () => {
    const result = puckDataSchema.safeParse({
      content: [
        {
          type: 'Gallery',
          props: {
            images: [{ src: 'a.jpg', alt: 'A' }, { src: 'b.jpg', alt: 'B' }],
            columns: 3,
            showCaptions: true,
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Server actions — mocked Supabase
// ---------------------------------------------------------------------------

// Mutable state for mock results
let mockOrgResult: { data: any; error: any } = {
  data: { id: 'org-1', default_property_id: 'prop-1' },
  error: null,
};
let mockPropertyResult: { data: any; error: any } = {
  data: {
    puck_pages: null,
    puck_root: null,
    puck_template: null,
    puck_pages_draft: null,
    puck_root_draft: null,
    puck_page_meta: null,
  },
  error: null,
};
let mockUpdateResult: { error: any } = { error: null };

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
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve(mockUpdateResult)),
      })),
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

describe('getPuckData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrgResult = { data: { id: 'org-1', default_property_id: 'prop-1' }, error: null };
    mockPropertyResult = {
      data: {
        puck_pages: null,
        puck_root: null,
        puck_template: null,
        puck_pages_draft: null,
        puck_root_draft: null,
        puck_page_meta: null,
      },
      error: null,
    };
    mockUpdateResult = { error: null };
  });

  it('returns puck columns from property', async () => {
    const { getPuckData } = await import('../actions');
    const result = await getPuckData();
    expect(result).toMatchObject({
      puckPages: null,
      puckRoot: null,
      puckTemplate: null,
      puckPagesDraft: null,
      puckRootDraft: null,
      puckPageMeta: null,
    });
  });

  it('returns error when no default property', async () => {
    mockOrgResult = { data: { id: 'org-1', default_property_id: null }, error: null };
    const { getPuckData } = await import('../actions');
    const result = await getPuckData();
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('no default property');
  });

  it('returns error when org query fails', async () => {
    mockOrgResult = { data: null, error: { message: 'DB error' } };
    const { getPuckData } = await import('../actions');
    const result = await getPuckData();
    expect(result).toHaveProperty('error');
  });
});

describe('savePuckPageDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrgResult = { data: { id: 'org-1', default_property_id: 'prop-1' }, error: null };
    mockPropertyResult = { data: { puck_pages_draft: null }, error: null };
    mockUpdateResult = { error: null };
  });

  it('saves valid puck data for a page path', async () => {
    const { savePuckPageDraft } = await import('../actions');
    const result = await savePuckPageDraft('/', {
      content: [{ type: 'Hero', props: { title: 'Home' } }],
    });
    expect(result).toEqual({ success: true });
  });

  it('rejects invalid puck data', async () => {
    const { savePuckPageDraft } = await import('../actions');
    const result = await savePuckPageDraft('/', { content: 'not-an-array' });
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Invalid puck data');
  });

  it('rejects content item without type', async () => {
    const { savePuckPageDraft } = await import('../actions');
    const result = await savePuckPageDraft('/', {
      content: [{ props: { title: 'No type' } }],
    });
    expect(result).toHaveProperty('error');
  });

  it('merges new page into existing draft pages', async () => {
    mockPropertyResult = {
      data: { puck_pages_draft: { '/about': { content: [], root: {} } } },
      error: null,
    };
    const { savePuckPageDraft } = await import('../actions');
    const result = await savePuckPageDraft('/contact', { content: [] });
    expect(result).toEqual({ success: true });
  });
});

describe('savePuckRootDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrgResult = { data: { id: 'org-1', default_property_id: 'prop-1' }, error: null };
    mockUpdateResult = { error: null };
  });

  it('saves valid root draft data', async () => {
    const { savePuckRootDraft } = await import('../actions');
    const result = await savePuckRootDraft({
      content: [],
      root: { props: { theme: 'dark' } },
    });
    expect(result).toEqual({ success: true });
  });

  it('rejects invalid root data', async () => {
    const { savePuckRootDraft } = await import('../actions');
    const result = await savePuckRootDraft({ content: 'bad' });
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Invalid puck data');
  });
});

describe('publishPuckPages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrgResult = { data: { id: 'org-1', default_property_id: 'prop-1' }, error: null };
    mockPropertyResult = {
      data: { puck_pages_draft: { '/': { content: [], root: {} } } },
      error: null,
    };
    mockUpdateResult = { error: null };
  });

  it('publishes draft pages and returns success', async () => {
    const { publishPuckPages } = await import('../actions');
    const result = await publishPuckPages();
    expect(result).toEqual({ success: true });
  });

  it('calls invalidateConfig on success', async () => {
    const { invalidateConfig } = await import('@/lib/config/server');
    const { publishPuckPages } = await import('../actions');
    await publishPuckPages();
    expect(invalidateConfig).toHaveBeenCalled();
  });

  it('returns error when update fails', async () => {
    mockUpdateResult = { error: { message: 'update failed' } };
    const { publishPuckPages } = await import('../actions');
    const result = await publishPuckPages();
    expect(result).toHaveProperty('error');
  });
});

describe('publishPuckRoot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrgResult = { data: { id: 'org-1', default_property_id: 'prop-1' }, error: null };
    mockPropertyResult = {
      data: { puck_root_draft: { content: [], root: { props: {} } } },
      error: null,
    };
    mockUpdateResult = { error: null };
  });

  it('publishes root draft and returns success', async () => {
    const { publishPuckRoot } = await import('../actions');
    const result = await publishPuckRoot();
    expect(result).toEqual({ success: true });
  });

  it('calls invalidateConfig on success', async () => {
    const { invalidateConfig } = await import('@/lib/config/server');
    const { publishPuckRoot } = await import('../actions');
    await publishPuckRoot();
    expect(invalidateConfig).toHaveBeenCalled();
  });
});

describe('applyTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrgResult = { data: { id: 'org-1', default_property_id: 'prop-1' }, error: null };
    mockUpdateResult = { error: null };
  });

  it('applies a template and sets all puck columns', async () => {
    const { applyTemplate } = await import('../actions');
    const result = await applyTemplate(
      'template-nature',
      { content: [], root: { props: {} } },
      { '/': { content: [{ type: 'Hero', props: { title: 'Welcome' } }] } }
    );
    expect(result).toEqual({ success: true });
  });

  it('calls invalidateConfig on success', async () => {
    const { invalidateConfig } = await import('@/lib/config/server');
    const { applyTemplate } = await import('../actions');
    await applyTemplate('tmpl-1', { content: [] }, { '/': { content: [] } });
    expect(invalidateConfig).toHaveBeenCalled();
  });

  it('rejects invalid root data', async () => {
    const { applyTemplate } = await import('../actions');
    const result = await applyTemplate(
      'template-bad',
      { content: 'not-array' },
      {}
    );
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Invalid root data');
  });

  it('rejects invalid page data', async () => {
    const { applyTemplate } = await import('../actions');
    const result = await applyTemplate(
      'template-bad',
      { content: [] },
      { '/about': { content: 'not-array' } }
    );
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Invalid page data');
  });
});
