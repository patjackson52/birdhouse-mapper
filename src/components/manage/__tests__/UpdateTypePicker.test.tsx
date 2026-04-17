import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import UpdateTypePicker from '@/components/manage/UpdateTypePicker';

const { mockItem, mockItemTypes, mockUpdateTypes } = vi.hoisted(() => {
  const mockItem = {
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
  };
  const mockItemTypes = [
    { id: 'type-1', name: 'Birdbox', icon: { set: 'emoji', name: '🐦' }, color: '#00ff00', sort_order: 1, created_at: '', org_id: 'org-1' },
  ];
  const mockUpdateTypes = [
    { id: 'ut-1', name: 'Observation', icon: '👀', is_global: true,  item_type_id: null,     sort_order: 1, org_id: 'org-1', min_role_create: null,       min_role_edit: null, min_role_delete: null },
    { id: 'ut-2', name: 'Maintenance', icon: '🔧', is_global: true,  item_type_id: null,     sort_order: 2, org_id: 'org-1', min_role_create: null,       min_role_edit: null, min_role_delete: null },
    { id: 'ut-3', name: 'Admin Only',  icon: '🔒', is_global: true,  item_type_id: null,     sort_order: 3, org_id: 'org-1', min_role_create: 'org_admin', min_role_edit: null, min_role_delete: null },
    { id: 'ut-4', name: 'Other Type',  icon: '❓', is_global: false, item_type_id: 'type-X', sort_order: 4, org_id: 'org-1', min_role_create: null,       min_role_edit: null, min_role_delete: null },
  ];
  return { mockItem, mockItemTypes, mockUpdateTypes };
});

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useParams: () => ({ slug: 'oak-meadow' }),
}));

vi.mock('@/lib/config/client', () => ({
  useConfig: () => ({ propertyId: 'prop-1' }),
}));

let mockUpdateTypesReturn = mockUpdateTypes;
vi.mock('@/lib/offline/provider', () => ({
  useOfflineStore: () => ({
    getItem: vi.fn().mockResolvedValue(mockItem),
    getItemTypes: vi.fn().mockResolvedValue(mockItemTypes),
    getUpdateTypes: vi.fn(async () => mockUpdateTypesReturn),
    db: {
      properties: { get: vi.fn().mockResolvedValue({ org_id: 'org-1' }) },
    },
  }),
}));

vi.mock('@/lib/permissions/hooks', () => ({
  usePermissions: () => ({ userBaseRole: 'contributor', loading: false }),
}));

describe('UpdateTypePicker', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockUpdateTypesReturn = mockUpdateTypes;
  });

  it('renders a card for each eligible update type', async () => {
    render(<UpdateTypePicker itemId="item-1" />);
    await waitFor(() => expect(screen.getByText('Observation')).toBeInTheDocument());
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    // Role-restricted one is hidden for a contributor
    expect(screen.queryByText('Admin Only')).not.toBeInTheDocument();
    // Wrong item_type_id is filtered out
    expect(screen.queryByText('Other Type')).not.toBeInTheDocument();
  });

  it('each card links to /p/[slug]/update/[itemId]/[typeId]', async () => {
    render(<UpdateTypePicker itemId="item-1" />);
    const observation = await screen.findByText('Observation');
    const link = observation.closest('a');
    expect(link?.getAttribute('href')).toBe('/p/oak-meadow/update/item-1/ut-1');
  });

  it('auto-redirects when exactly one update type is eligible', async () => {
    mockUpdateTypesReturn = [mockUpdateTypes[0]]; // only "Observation"
    render(<UpdateTypePicker itemId="item-1" />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/p/oak-meadow/update/item-1/ut-1')
    );
  });

  it('renders empty state when no update types are eligible', async () => {
    mockUpdateTypesReturn = [mockUpdateTypes[3]]; // only "Other Type", wrong item_type_id
    render(<UpdateTypePicker itemId="item-1" />);
    await waitFor(() =>
      expect(screen.getByText(/no update types configured/i)).toBeInTheDocument()
    );
  });
});
