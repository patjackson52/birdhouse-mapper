import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { OfflineDatabase } from '../db';
import { enqueueMutation } from '../mutations';
import { storePhotoBlob } from '../photo-store';
import { processOutboundQueue, syncPropertyData } from '../sync-engine';

// Mocked at module level so the sync engine's import of `moderatePhotoUpload`
// resolves to the vi.fn() we control per-test.
vi.mock('../../moderation/actions', () => ({
  moderatePhotoUpload: vi.fn(),
}));
import { moderatePhotoUpload } from '../../moderation/actions';
const mockedModeratePhotoUpload = vi.mocked(moderatePhotoUpload);

// jsdom's Blob does not implement arrayBuffer(); stub blobToBase64 so tests
// don't depend on that method. The real conversion is exercised end-to-end
// in production browsers and in the moderation server-action tests.
vi.mock('../photo-store', async () => {
  const actual = await vi.importActual<typeof import('../photo-store')>('../photo-store');
  return {
    ...actual,
    blobToBase64: vi.fn().mockResolvedValue('Zm9v'),
  };
});

const mockFrom = vi.fn();
const mockStorage = { from: vi.fn() };
const mockSupabase = {
  from: mockFrom,
  storage: mockStorage,
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
};

describe('Sync Engine — Outbound', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase();
    await db.delete();
    db = new OfflineDatabase();
    vi.clearAllMocks();
  });

  it('should process pending insert mutations via Supabase', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'item-1' }, error: null }) }),
    });
    mockFrom.mockReturnValue({ insert: insertMock });

    await enqueueMutation(db, {
      table: 'items',
      operation: 'insert',
      record_id: 'item-1',
      payload: { id: 'item-1', name: 'Test' },
      org_id: 'o',
      property_id: 'p',
    });

    const result = await processOutboundQueue(db, mockSupabase as any);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);

    const remaining = await db.mutation_queue.toArray();
    expect(remaining).toHaveLength(0);
  });

  it('should process pending update mutations', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: () => Promise.resolve({ error: null }),
    });
    mockFrom.mockReturnValue({ update: updateMock });

    await enqueueMutation(db, {
      table: 'items',
      operation: 'update',
      record_id: 'item-1',
      payload: { name: 'Updated' },
      org_id: 'o',
      property_id: 'p',
    });

    const result = await processOutboundQueue(db, mockSupabase as any);
    expect(result.processed).toBe(1);
    expect(updateMock).toHaveBeenCalledWith({ name: 'Updated' });
  });

  it('should mark mutations as failed on error and increment retry', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'RLS violation' } }) }),
    });
    mockFrom.mockReturnValue({ insert: insertMock });

    await enqueueMutation(db, {
      table: 'items',
      operation: 'insert',
      record_id: 'item-1',
      payload: { id: 'item-1', name: 'Test' },
      org_id: 'o',
      property_id: 'p',
    });

    const result = await processOutboundQueue(db, mockSupabase as any);
    expect(result.failed).toBe(1);

    const mutations = await db.mutation_queue.toArray();
    expect(mutations).toHaveLength(1);
    expect(mutations[0].status).toBe('failed');
    expect(mutations[0].retry_count).toBe(1);
    expect(mutations[0].error).toBe('RLS violation');
  });

  it('should skip mutations that exceed max retries', async () => {
    await db.mutation_queue.put({
      id: 'mut-1',
      table: 'items',
      operation: 'insert',
      record_id: 'item-1',
      payload: { id: 'item-1' },
      org_id: 'o',
      property_id: 'p',
      created_at: Date.now(),
      status: 'failed',
      retry_count: 5,
      error: 'Permanent error',
    });

    const result = await processOutboundQueue(db, mockSupabase as any);
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  describe('photo moderation (issue #269)', () => {
    async function enqueuePhotoMutation() {
      await enqueueMutation(db, {
        table: 'items',
        operation: 'update',
        record_id: 'item-1',
        payload: { name: 'item-1' },
        org_id: 'org-1',
        property_id: 'prop-1',
      });
      const [mutation] = await db.mutation_queue.toArray();
      const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
      await storePhotoBlob(db, {
        mutation_id: mutation.id,
        blob,
        filename: 'photo.jpg',
        item_id: 'item-1',
        update_id: null,
        is_primary: false,
      });
      return mutation;
    }

    function mockUploadAndInsertSucceed() {
      mockStorage.from.mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
      });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'photos') {
          return {
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'photo-1', item_id: 'item-1' }, error: null }),
              }),
            }),
          };
        }
        return {
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      });
    }

    it('approved photo: uploads, inserts, removes mutation and blob', async () => {
      mockedModeratePhotoUpload.mockResolvedValue({ ok: true, flagged: false });
      mockUploadAndInsertSucceed();

      await enqueuePhotoMutation();
      const result = await processOutboundQueue(db, mockSupabase as any);

      expect(result.processed).toBe(1);
      expect(result.rejected).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockedModeratePhotoUpload).toHaveBeenCalledTimes(1);
      expect(await db.mutation_queue.toArray()).toHaveLength(0);
      expect(await db.photo_blobs.toArray()).toHaveLength(0);
    });

    it('flagged photo: drops mutation + blob, no upload, no insert', async () => {
      mockedModeratePhotoUpload.mockResolvedValue({
        ok: true,
        flagged: true,
        reason: 'Image rejected',
      });
      const uploadSpy = vi.fn().mockResolvedValue({ data: {}, error: null });
      mockStorage.from.mockReturnValue({ upload: uploadSpy });
      const insertSpy = vi.fn();
      mockFrom.mockImplementation(() => ({ insert: insertSpy }));

      await enqueuePhotoMutation();
      const result = await processOutboundQueue(db, mockSupabase as any);

      expect(result.rejected).toBe(1);
      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
      expect(uploadSpy).not.toHaveBeenCalled();
      expect(insertSpy).not.toHaveBeenCalled();
      expect(await db.mutation_queue.toArray()).toHaveLength(0);
      expect(await db.photo_blobs.toArray()).toHaveLength(0);
    });

    it('transient moderation error: marks failed, retries, blob preserved', async () => {
      mockedModeratePhotoUpload.mockResolvedValue({ ok: false, error: 'API timeout' });
      const uploadSpy = vi.fn();
      mockStorage.from.mockReturnValue({ upload: uploadSpy });

      await enqueuePhotoMutation();
      const result = await processOutboundQueue(db, mockSupabase as any);

      expect(result.failed).toBe(1);
      expect(result.processed).toBe(0);
      expect(result.rejected).toBe(0);
      expect(uploadSpy).not.toHaveBeenCalled();
      const remaining = await db.mutation_queue.toArray();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].retry_count).toBe(1);
      expect(remaining[0].error).toContain('Photo moderation check failed');
      // Photo blob preserved for retry
      expect(await db.photo_blobs.toArray()).toHaveLength(1);
    });
  });

  it('should process mutations in FIFO order', async () => {
    const callOrder: string[] = [];
    mockFrom.mockImplementation(() => ({
      insert: (payload: any) => {
        callOrder.push(payload.id || payload[0]?.id);
        return { select: () => ({ single: () => Promise.resolve({ data: payload, error: null }) }) };
      },
    }));

    await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'first', payload: { id: 'first' }, org_id: 'o', property_id: 'p' });
    await new Promise((r) => setTimeout(r, 5));
    await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'second', payload: { id: 'second' }, org_id: 'o', property_id: 'p' });

    await processOutboundQueue(db, mockSupabase as any);
    expect(callOrder).toEqual(['first', 'second']);
  });
});

describe('Sync Engine — Inbound (syncPropertyData)', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase();
    await db.delete();
    db = new OfflineDatabase();
    vi.clearAllMocks();
  });

  function makeMockSupabase(responses: Record<string, { data: unknown[] | null; error: unknown }>) {
    return {
      from: (table: string) => {
        const resp = responses[table] ?? { data: [], error: null };
        const chain: Record<string, any> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.gte = () => chain;
        chain.then = (resolve: (v: any) => void) => Promise.resolve(resp).then(resolve);
        chain.catch = (reject: (e: any) => void) => Promise.resolve(resp).catch(reject);
        return chain;
      },
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    } as unknown as Parameters<typeof syncPropertyData>[1];
  }

  it('syncs update_types without timestamp filter (no created_at column)', async () => {
    const queryCalls: { table: string; method: string; args: any[] }[] = [];

    const supabase = {
      from: (table: string) => {
        const chain: Record<string, any> = {};
        chain.select = (...args: any[]) => { queryCalls.push({ table, method: 'select', args }); return chain; };
        chain.eq = (...args: any[]) => { queryCalls.push({ table, method: 'eq', args }); return chain; };
        chain.gte = (...args: any[]) => { queryCalls.push({ table, method: 'gte', args }); return chain; };
        chain.then = (resolve: (v: any) => void) => Promise.resolve({ data: [], error: null }).then(resolve);
        chain.catch = (reject: (e: any) => void) => Promise.resolve({ data: [], error: null }).catch(reject);
        return chain;
      },
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    } as unknown as Parameters<typeof syncPropertyData>[1];

    await syncPropertyData(db, supabase, 'prop-1', 'org-1');

    // update_types should NOT have a .gte() call (no timestamp column)
    const updateTypesGte = queryCalls.filter(c => c.table === 'update_types' && c.method === 'gte');
    expect(updateTypesGte).toHaveLength(0);

    // update_type_fields should NOT have a .gte() call either
    const updateTypeFieldsGte = queryCalls.filter(c => c.table === 'update_type_fields' && c.method === 'gte');
    expect(updateTypeFieldsGte).toHaveLength(0);

    // custom_fields should NOT have a .gte() call either
    const customFieldsGte = queryCalls.filter(c => c.table === 'custom_fields' && c.method === 'gte');
    expect(customFieldsGte).toHaveLength(0);
  });

  it('applies timestamp filter for tables with updated_at (e.g. item_types)', async () => {
    const queryCalls: { table: string; method: string; args: any[] }[] = [];

    const supabase = {
      from: (table: string) => {
        const chain: Record<string, any> = {};
        chain.select = (...args: any[]) => { queryCalls.push({ table, method: 'select', args }); return chain; };
        chain.eq = (...args: any[]) => { queryCalls.push({ table, method: 'eq', args }); return chain; };
        chain.gte = (...args: any[]) => { queryCalls.push({ table, method: 'gte', args }); return chain; };
        chain.then = (resolve: (v: any) => void) => Promise.resolve({ data: [], error: null }).then(resolve);
        chain.catch = (reject: (e: any) => void) => Promise.resolve({ data: [], error: null }).catch(reject);
        return chain;
      },
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    } as unknown as Parameters<typeof syncPropertyData>[1];

    await syncPropertyData(db, supabase, 'prop-1', 'org-1');

    // item_types SHOULD have a .gte('updated_at', ...) call (now has updated_at column)
    const itemTypesGte = queryCalls.filter(c => c.table === 'item_types' && c.method === 'gte');
    expect(itemTypesGte).toHaveLength(1);
    expect(itemTypesGte[0].args[0]).toBe('updated_at');

    // items SHOULD have a .gte('updated_at', ...) call (has updated_at)
    const itemsGte = queryCalls.filter(c => c.table === 'items' && c.method === 'gte');
    expect(itemsGte).toHaveLength(1);
    expect(itemsGte[0].args[0]).toBe('updated_at');
  });

  it('stores synced update_types in IndexedDB', async () => {
    const mockUpdateTypes = [
      { id: 'ut-1', name: 'Maintenance', icon: '🔧', is_global: true, item_type_id: null, sort_order: 0, org_id: 'org-1', min_role_create: null, min_role_edit: null, min_role_delete: null },
      { id: 'ut-2', name: 'Observation', icon: '👀', is_global: true, item_type_id: null, sort_order: 1, org_id: 'org-1', min_role_create: null, min_role_edit: null, min_role_delete: null },
    ];

    const supabase = makeMockSupabase({
      update_types: { data: mockUpdateTypes, error: null },
    });

    await syncPropertyData(db, supabase, 'prop-1', 'org-1');

    const stored = await db.update_types.toArray();
    expect(stored).toHaveLength(2);
    expect(stored.map(t => t.name).sort()).toEqual(['Maintenance', 'Observation']);
    expect(stored[0]._synced_at).toBeTruthy();
  });

  it('records error status when sync fails for a table', async () => {
    const supabase = makeMockSupabase({
      update_types: { data: null, error: { message: 'relation does not exist' } },
    });

    await syncPropertyData(db, supabase, 'prop-1', 'org-1');

    const meta = await db.sync_metadata.get('prop-1:update_types');
    expect(meta?.status).toBe('error');
    expect(meta?.last_synced_at).toBe('');
  });
});
