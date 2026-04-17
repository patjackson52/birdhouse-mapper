import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import ItemForm from '@/components/manage/ItemForm';

// ── Hoisted mock data (available before vi.mock factories run) ────────────────
const { mockItemTypes, mockEntityTypes } = vi.hoisted(() => {
  const mockItemTypes = [
    { id: 'type-1', name: 'Birdbox', icon: { set: 'emoji', name: '🐦' }, color: '#00ff00', sort_order: 1, created_at: '', org_id: 'org-1' },
  ];

  const mockEntityTypes = [
    {
      id: 'et-species',
      org_id: 'org-1',
      name: 'Species',
      icon: { set: 'emoji', name: '🦅' },
      color: '#5D7F3A',
      link_to: ['items'],
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
      link_to: ['items'],
      api_source: null,
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
  ];

  return { mockItemTypes, mockEntityTypes };
});

// ── Navigation mocks ────────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// ── Config mock ──────────────────────────────────────────────────────────────
vi.mock('@/lib/config/client', () => ({
  useConfig: () => ({ propertyId: 'prop-1' }),
  useTheme: () => ({}),
}));

// ── Permissions mock ─────────────────────────────────────────────────────────
vi.mock('@/lib/permissions/hooks', () => ({
  usePermissions: () => ({ permissions: {}, userBaseRole: 'contributor', loading: false }),
}));

// ── Child component stubs ────────────────────────────────────────────────────
vi.mock('@/components/manage/PhotoUploader', () => ({
  default: () => <div data-testid="photo-uploader" />,
}));

vi.mock('@/components/manage/SpeciesPicker', () => ({
  default: (props: { entityTypeId: string; lat?: number; lng?: number }) => (
    <div
      data-testid={`species-picker-${props.entityTypeId}`}
      data-lat={props.lat ?? ''}
      data-lng={props.lng ?? ''}
    />
  ),
}));

vi.mock('@/components/manage/EntitySelect', () => ({
  default: () => <div data-testid="entity-select" />,
}));

vi.mock('@/components/manage/LocationPicker', () => ({
  default: ({ onChange }: { onChange: (lat: number, lng: number) => void }) => (
    <button
      type="button"
      onClick={() => onChange(44.1, -73.9)}
      data-testid="location-picker"
    >
      pick
    </button>
  ),
}));

// ── Next dynamic mock ────────────────────────────────────────────────────────
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: React.ComponentType<unknown> }>) => {
    const Component = (props: Record<string, unknown>) => {
      const [Loaded, setLoaded] = React.useState<React.ComponentType<unknown> | null>(null);
      React.useEffect(() => {
        loader().then((m: { default: React.ComponentType<unknown> }) => setLoaded(() => m.default));
      }, []);
      return Loaded ? React.createElement(Loaded, props) : null;
    };
    return Component;
  },
}));

// ── Offline store mock ────────────────────────────────────────────────────────
vi.mock('@/lib/offline/provider', () => ({
  useOfflineStore: () => ({
    getItemTypes: vi.fn().mockResolvedValue(mockItemTypes),
    getEntityTypes: vi.fn().mockResolvedValue(mockEntityTypes),
    getCustomFields: vi.fn().mockResolvedValue([]),
    insertItem: vi.fn().mockResolvedValue({ item: { id: 'test-id' }, mutationId: 'mut-id' }),
    db: {
      properties: {
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

// ────────────────────────────────────────────────────────────────────────────

describe('ItemForm — entity type conditional rendering', () => {
  it('renders SpeciesPicker for api_source entity types and EntitySelect otherwise', async () => {
    render(<ItemForm />);

    // Wait for entity types to load
    await waitFor(() =>
      expect(screen.getByTestId('species-picker-et-species')).toBeInTheDocument()
    );

    // SpeciesPicker should render for inaturalist entity type
    expect(screen.getByTestId('species-picker-et-species')).toBeInTheDocument();

    // EntitySelect should render for non-api_source entity type
    expect(screen.getByTestId('entity-select')).toBeInTheDocument();
  });

  it('forwards latitude and longitude from LocationPicker to SpeciesPicker', async () => {
    const user = userEvent.setup();
    render(<ItemForm />);

    // Wait for the form to load
    await waitFor(() =>
      expect(screen.getByTestId('location-picker')).toBeInTheDocument()
    );

    // Click location picker to set coordinates
    await user.click(screen.getByTestId('location-picker'));

    // Wait for SpeciesPicker to receive the coordinates
    await waitFor(() => {
      const picker = screen.getByTestId('species-picker-et-species');
      expect(picker.getAttribute('data-lat')).toBe('44.1');
      expect(picker.getAttribute('data-lng')).toBe('-73.9');
    });
  });
});
