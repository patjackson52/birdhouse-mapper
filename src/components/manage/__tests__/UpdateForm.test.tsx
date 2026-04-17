import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpdateForm from '@/components/manage/UpdateForm';

// ── Hoisted mock data (available before vi.mock factories run) ────────────────
const { mockItems, mockItemTypes, mockUpdateTypes, mockUpdateTypeFields, mockEntityTypes } = vi.hoisted(() => {
  const mockItems = [
    {
      id: 'item-1',
      name: 'Box Alpha',
      status: 'active',
      item_type_id: 'type-1',
      latitude: 0,
      longitude: 0,
      description: null,
      custom_field_values: {},
      created_at: '',
      updated_at: '',
      created_by: null,
      org_id: 'org-1',
      property_id: 'prop-1',
    },
    {
      id: 'item-2',
      name: 'Box Beta',
      status: 'planned',
      item_type_id: 'type-1',
      latitude: 0,
      longitude: 0,
      description: null,
      custom_field_values: {},
      created_at: '',
      updated_at: '',
      created_by: null,
      org_id: 'org-1',
      property_id: 'prop-1',
    },
  ];

  const mockItemTypes = [
    { id: 'type-1', name: 'Birdbox', icon: { set: 'emoji', name: '🐦' }, color: '#00ff00', sort_order: 1, created_at: '', org_id: 'org-1' },
  ];

  const mockUpdateTypes = [
    { id: 'ut-1', name: 'Inspection', icon: '🔍', is_global: true, item_type_id: null, sort_order: 1, org_id: 'org-1', min_role_create: null, min_role_edit: null, min_role_delete: null },
    { id: 'ut-2', name: 'Schedule Maintenance', icon: '🔧', is_global: true, item_type_id: null, sort_order: 2, org_id: 'org-1', min_role_create: 'org_staff', min_role_edit: null, min_role_delete: null },
  ];

  const mockUpdateTypeFields: never[] = [];

  const mockEntityTypes = [
    {
      id: 'et-species',
      org_id: 'org-1',
      name: 'Species',
      icon: { set: 'emoji', name: '🦅' },
      color: '#5D7F3A',
      link_to: ['updates'],
      api_source: 'inaturalist',
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'et-volunteers',
      org_id: 'org-1',
      name: 'Volunteers',
      icon: { set: 'emoji', name: '🙋' },
      color: '#5D7F3A',
      link_to: ['updates'],
      api_source: null,
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
  ];

  return { mockItems, mockItemTypes, mockUpdateTypes, mockUpdateTypeFields, mockEntityTypes };
});

// ── Navigation mocks ────────────────────────────────────────────────────────
const mockPush = vi.fn();
const mockBack = vi.fn();
let mockSearchParamsGet = vi.fn((_key: string): string | null => null);
let mockParams: Record<string, string> = {};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
  useParams: () => mockParams,
}));

// ── Config mock ──────────────────────────────────────────────────────────────
vi.mock('@/lib/config/client', () => ({
  useConfig: () => ({ propertyId: 'prop-1' }),
  useTheme: () => ({}),
}));

// ── Location provider mock ───────────────────────────────────────────────────
vi.mock('@/lib/location/provider', () => ({
  useUserLocation: () => ({ position: null }),
}));

vi.mock('@/lib/location/utils', () => ({
  getDistanceToItem: () => null,
}));

vi.mock('@/lib/permissions/hooks', () => ({
  usePermissions: () => ({ permissions: { updates: { create: true, view: true, edit_own: true, edit_any: false, delete: false } }, userBaseRole: 'contributor', loading: false }),
}));

// ── Child component stubs ────────────────────────────────────────────────────
vi.mock('@/components/manage/PhotoUploader', () => ({
  default: () => <div data-testid="photo-uploader" />,
}));

vi.mock('@/components/manage/EntitySelect', () => ({
  default: () => <div data-testid="entity-select" />,
}));

vi.mock('@/components/manage/SpeciesPicker', () => ({
  default: (props: { entityTypeId: string }) => (
    <div data-testid={`species-picker-${props.entityTypeId}`} />
  ),
}));

vi.mock('@/components/item/StatusBadge', () => ({
  default: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
}));

// ── Offline store mock ────────────────────────────────────────────────────────
vi.mock('@/lib/offline/provider', () => ({
  useOfflineStore: () => ({
    getItems: vi.fn().mockResolvedValue(mockItems),
    getItemTypes: vi.fn().mockResolvedValue(mockItemTypes),
    getUpdateTypes: vi.fn().mockResolvedValue(mockUpdateTypes),
    getEntityTypes: vi.fn().mockResolvedValue(mockEntityTypes),
    getUpdateTypeFields: vi.fn().mockResolvedValue(mockUpdateTypeFields),
    getCustomFields: vi.fn().mockResolvedValue([]),
    getEntities: vi.fn().mockResolvedValue([]),
    getItem: vi.fn().mockResolvedValue(undefined),
    getItemUpdates: vi.fn().mockResolvedValue([]),
    getPhotos: vi.fn().mockResolvedValue([]),
    insertItem: vi.fn().mockResolvedValue({ item: { id: 'test-id' }, mutationId: 'mut-id' }),
    updateItem: vi.fn().mockResolvedValue({ mutationId: 'mut-id' }),
    deleteItem: vi.fn().mockResolvedValue({ mutationId: 'mut-id' }),
    insertItemUpdate: vi.fn().mockResolvedValue({ update: { id: 'update-id' }, mutationId: 'mut-id' }),
    isOnline: true,
    pendingCount: 0,
    isSyncing: false,
    syncProperty: vi.fn(),
    triggerSync: vi.fn(),
    db: {
      orgs: { toArray: vi.fn().mockResolvedValue([]) },
      properties: {
        toArray: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue({ org_id: 'org-1' }),
      },
    },
  }),
}));

vi.mock('@/lib/offline/mutations', () => ({
  enqueueMutation: vi.fn().mockResolvedValue('mock-mut-id'),
}));

vi.mock('@/lib/offline/photo-store', () => ({
  storePhotoBlob: vi.fn().mockResolvedValue('mock-blob-id'),
}));

// ── Supabase mock (retained in case any transitive deps use it) ───────────────
function makeChain(data: unknown) {
  const resolved = { data, error: null };
  const promise = Promise.resolve(resolved);
  const chain: Record<string, unknown> = {
    then: (onfulfilled: (v: typeof resolved) => unknown, onrejected?: (e: unknown) => unknown) =>
      promise.then(onfulfilled, onrejected),
    catch: (onrejected: (e: unknown) => unknown) => promise.catch(onrejected),
  };
  chain.select = () => chain;
  chain.neq = () => chain;
  chain.order = () => promise;
  chain.contains = () => chain;
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'items') return makeChain(mockItems);
      if (table === 'item_types') return makeChain(mockItemTypes);
      if (table === 'update_types') return makeChain(mockUpdateTypes);
      if (table === 'entity_types') return makeChain([]);
      return makeChain([]);
    },
  }),
}));

// ────────────────────────────────────────────────────────────────────────────

describe('UpdateForm — standalone (no ?item= param)', () => {
  beforeEach(() => {
    mockSearchParamsGet = vi.fn(() => null);
    mockPush.mockReset();
    mockBack.mockReset();
  });

  it('renders the item select dropdown', async () => {
    render(<UpdateForm />);
    expect(await screen.findByLabelText(/item \*/i)).toBeInTheDocument();
  });

  it('does NOT render the locked item context card', async () => {
    render(<UpdateForm />);
    // Wait for data to load
    await screen.findByLabelText(/item \*/i);
    expect(screen.queryByTestId('locked-item-card')).not.toBeInTheDocument();
  });

  it('Cancel calls router.back()', async () => {
    render(<UpdateForm />);
    const cancel = await screen.findByRole('button', { name: /cancel/i });
    await userEvent.click(cancel);
    expect(mockBack).toHaveBeenCalledOnce();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows role-restricted update types as disabled with label', async () => {
    render(<UpdateForm />);
    await screen.findByLabelText(/update type/i);
    const options = screen.getAllByRole('option');
    const scheduleMaint = options.find((o) => o.textContent?.includes('Schedule Maintenance'));
    expect(scheduleMaint).toHaveAttribute('disabled');
    expect(scheduleMaint?.textContent).toContain('Staff');
  });
});

describe('UpdateForm — locked (with ?item=item-1 param)', () => {
  beforeEach(() => {
    mockSearchParamsGet = vi.fn((key: string) => (key === 'item' ? 'item-1' : null));
    mockPush.mockReset();
    mockBack.mockReset();
  });

  it('renders the locked item context card, not the dropdown', async () => {
    render(<UpdateForm />);
    // Context card should appear after items load
    await waitFor(() =>
      expect(screen.getByTestId('locked-item-card')).toBeInTheDocument()
    );
    expect(screen.queryByLabelText(/item \*/i)).not.toBeInTheDocument();
  });

  it('context card shows item name', async () => {
    render(<UpdateForm />);
    await waitFor(() =>
      expect(screen.getByTestId('locked-item-card')).toBeInTheDocument()
    );
    expect(screen.getByText('Box Alpha')).toBeInTheDocument();
  });

  it('context card renders a StatusBadge', async () => {
    render(<UpdateForm />);
    await waitFor(() =>
      expect(screen.getByTestId('locked-item-card')).toBeInTheDocument()
    );
    expect(screen.getByTestId('status-badge')).toBeInTheDocument();
  });

  it('context card shows item type icon', async () => {
    render(<UpdateForm />);
    await waitFor(() =>
      expect(screen.getByTestId('locked-item-card')).toBeInTheDocument()
    );
    expect(screen.getByText('🐦')).toBeInTheDocument();
  });

  it('Cancel navigates to /?item=item-1', async () => {
    render(<UpdateForm />);
    const cancel = await screen.findByRole('button', { name: /cancel/i });
    await userEvent.click(cancel);
    expect(mockPush).toHaveBeenCalledWith('/?item=item-1');
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('UpdateForm — type locked (initialTypeId + lockType props)', () => {
  beforeEach(() => {
    mockSearchParamsGet = vi.fn((key: string) => (key === 'item' ? 'item-1' : null));
    mockPush.mockReset();
    mockBack.mockReset();
  });

  it('pre-selects the given update type', async () => {
    render(<UpdateForm initialTypeId="ut-1" lockType />);
    const select = await screen.findByLabelText(/update type/i) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('ut-1'));
  });

  it('disables the update type select when lockType is true', async () => {
    render(<UpdateForm initialTypeId="ut-1" lockType />);
    const select = await screen.findByLabelText(/update type/i) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('ut-1'));
    expect(select).toBeDisabled();
  });

  it('leaves the update type select enabled when lockType is false', async () => {
    render(<UpdateForm initialTypeId="ut-1" />);
    const select = await screen.findByLabelText(/update type/i) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('ut-1'));
    expect(select).not.toBeDisabled();
  });
});

describe('UpdateForm — entity type rendering', () => {
  beforeEach(() => {
    mockSearchParamsGet = vi.fn(() => null);
    mockPush.mockReset();
    mockBack.mockReset();
  });

  it('renders SpeciesPicker for api_source entity types, EntitySelect otherwise', async () => {
    render(<UpdateForm />);
    await waitFor(() =>
      expect(screen.getByTestId('species-picker-et-species')).toBeInTheDocument()
    );
    expect(screen.getByTestId('entity-select')).toBeInTheDocument();
  });
});

describe('UpdateForm — post-save redirect', () => {
  beforeEach(() => {
    mockSearchParamsGet = vi.fn((key: string) => (key === 'item' ? 'item-1' : null));
    mockPush.mockReset();
    mockBack.mockReset();
    mockParams = {};
  });

  it('redirects to /p/[slug]?item=[itemId] when slug is in route params', async () => {
    mockParams = { slug: 'oak-meadow' };
    render(<UpdateForm initialTypeId="ut-1" lockType />);
    const submit = await screen.findByRole('button', { name: /add update/i });
    await userEvent.click(submit);
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/p/oak-meadow?item=item-1')
    );
  });

  it('falls back to /manage when no slug is in route params (legacy mount)', async () => {
    mockParams = {};
    render(<UpdateForm initialTypeId="ut-1" lockType />);
    const submit = await screen.findByRole('button', { name: /add update/i });
    await userEvent.click(submit);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/manage'));
  });
});
