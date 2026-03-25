import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminPage from '@/app/admin/page';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock Supabase client
const mockSelect = vi.fn();
const mockOrder = vi.fn();
const mockFrom = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();

const mockItems = [
  {
    id: 'item-1',
    name: 'Test Birdbox',
    status: 'active',
    latitude: 47.6,
    longitude: -122.3,
    item_type_id: 'type-1',
    custom_field_values: {},
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    created_by: 'user-1',
    description: null,
  },
  {
    id: 'item-2',
    name: 'Another Box',
    status: 'planned',
    latitude: 47.7,
    longitude: -122.4,
    item_type_id: 'type-1',
    custom_field_values: {},
    created_at: '2026-01-02',
    updated_at: '2026-01-02',
    created_by: 'user-1',
    description: null,
  },
];

const mockMemberships = [
  {
    id: 'membership-1',
    role_id: 'role-1',
    users: { id: 'user-1', display_name: 'Test User', email: 'test@example.com', is_temporary: false, created_at: '2026-01-01' },
    roles: { id: 'role-1', name: 'Admin' },
  },
];

const mockRoles = [
  { id: 'role-1', name: 'Admin', org_id: 'org-1', description: null, base_role: 'org_admin', color: null, icon: null, permissions: {}, is_default_new_member_role: false, is_public_role: false, sort_order: 1, created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'role-2', name: 'Editor', org_id: 'org-1', description: null, base_role: 'editor', color: null, icon: null, permissions: {}, is_default_new_member_role: true, is_public_role: false, sort_order: 2, created_at: '2026-01-01', updated_at: '2026-01-01' },
];

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'org_memberships') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ data: mockMemberships, error: null }),
            }),
          }),
        };
      }
      if (table === 'roles') {
        return {
          select: () => ({
            order: () => ({ data: mockRoles, error: null }),
          }),
        };
      }
      if (table === 'items') {
        return {
          select: () => ({
            order: () => ({ data: mockItems, error: null }),
          }),
          delete: () => ({
            eq: () => ({ error: null }),
          }),
        };
      }
      if (table === 'item_updates') {
        return {
          select: () => ({
            order: () => ({ data: [], error: null }),
          }),
          delete: () => ({
            eq: () => ({ error: null }),
          }),
        };
      }
      if (table === 'update_types') {
        return {
          select: () => ({
            order: () => ({ data: [], error: null }),
          }),
        };
      }
      return { select: () => ({ order: () => ({ data: [], error: null }) }) };
    },
  }),
}));

describe('AdminPage', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders item rows and navigates to edit on click', async () => {
    render(<AdminPage />);

    // Wait for items to load
    await waitFor(() => {
      expect(screen.getByText('Test Birdbox')).toBeInTheDocument();
    });

    expect(screen.getByText('Another Box')).toBeInTheDocument();

    // Click the first item row
    const row = screen.getByText('Test Birdbox').closest('tr')!;
    fireEvent.click(row);

    expect(mockPush).toHaveBeenCalledWith('/manage/edit/item-1');
  });

  it('does not navigate when delete button is clicked', async () => {
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Birdbox')).toBeInTheDocument();
    });

    // Mock window.confirm to return false (cancel deletion)
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    // router.push should NOT have been called
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('item rows have cursor-pointer class', async () => {
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Birdbox')).toBeInTheDocument();
    });

    const row = screen.getByText('Test Birdbox').closest('tr')!;
    expect(row).toHaveClass('cursor-pointer');
  });
});
