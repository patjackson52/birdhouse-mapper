import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Notification } from '@/lib/notifications/types';

// Notification data controlled per-test
let mockNotifications: Notification[] = [];

const mockSupabaseClient = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: mockNotifications, error: null })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
      in: vi.fn(() => Promise.resolve({ error: null })),
    })),
  })),
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabaseClient,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, onClick, className }: any) => (
    <a href={href} onClick={onClick} className={className}>{children}</a>
  ),
}));

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1',
    org_id: 'org-1',
    user_id: 'user-1',
    type: 'task_reminder',
    title: 'Task due soon',
    body: 'Your task is due tomorrow',
    reference_type: 'task',
    reference_id: 'task-123',
    channel: 'in_app',
    status: 'sent',
    error: null,
    read_at: null,
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function renderBell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BellComponent />
    </QueryClientProvider>
  );
}

let BellComponent: React.ComponentType;

describe('NotificationBell', () => {
  beforeEach(async () => {
    mockNotifications = [];
    vi.clearAllMocks();
    // Re-mock chainable client after clearAllMocks restores spies
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: mockNotifications, error: null })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
        in: vi.fn(() => Promise.resolve({ error: null })),
      })),
    });
    const mod = await import('../NotificationBell');
    BellComponent = mod.default;
  });

  it('renders bell button with title "Notifications"', async () => {
    renderBell();
    const button = await screen.findByTitle('Notifications');
    expect(button).toBeInTheDocument();
  });

  it('shows unread count badge when there are unread notifications', async () => {
    mockNotifications = [
      makeNotification({ id: 'n-1', read_at: null }),
      makeNotification({ id: 'n-2', read_at: null }),
    ];
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: mockNotifications, error: null })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
        in: vi.fn(() => Promise.resolve({ error: null })),
      })),
    });

    renderBell();
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('does NOT show badge when all notifications are read', async () => {
    mockNotifications = [
      makeNotification({ id: 'n-1', read_at: new Date().toISOString() }),
    ];
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: mockNotifications, error: null })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
        in: vi.fn(() => Promise.resolve({ error: null })),
      })),
    });

    renderBell();
    // Wait for query to resolve, then confirm no badge
    await waitFor(() => {
      // The bell button should be visible
      expect(screen.getByTitle('Notifications')).toBeInTheDocument();
    });
    // Badge would show a number; confirm no number badge
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('shows "9+" when unread count exceeds 9', async () => {
    mockNotifications = Array.from({ length: 10 }, (_, i) =>
      makeNotification({ id: `n-${i}`, read_at: null })
    );
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: mockNotifications, error: null })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
        in: vi.fn(() => Promise.resolve({ error: null })),
      })),
    });

    renderBell();
    await waitFor(() => {
      expect(screen.getByText('9+')).toBeInTheDocument();
    });
  });

  it('opens dropdown when bell is clicked', async () => {
    const user = userEvent.setup();
    renderBell();

    const button = await screen.findByTitle('Notifications');
    await user.click(button);

    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('shows "No notifications yet" when list is empty', async () => {
    mockNotifications = [];
    const user = userEvent.setup();
    renderBell();

    const button = await screen.findByTitle('Notifications');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    });
  });

  it('shows "Mark all read" button when there are unread items', async () => {
    mockNotifications = [makeNotification({ id: 'n-1', read_at: null })];
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: mockNotifications, error: null })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
        in: vi.fn(() => Promise.resolve({ error: null })),
      })),
    });

    const user = userEvent.setup();
    renderBell();

    const button = await screen.findByTitle('Notifications');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Mark all read')).toBeInTheDocument();
    });
  });

  it('does NOT show "Mark all read" when all are read', async () => {
    mockNotifications = [
      makeNotification({ id: 'n-1', read_at: new Date().toISOString() }),
    ];
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: mockNotifications, error: null })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
        in: vi.fn(() => Promise.resolve({ error: null })),
      })),
    });

    const user = userEvent.setup();
    renderBell();

    const button = await screen.findByTitle('Notifications');
    await user.click(button);

    await waitFor(() => {
      expect(screen.queryByText('Mark all read')).not.toBeInTheDocument();
    });
  });
});
