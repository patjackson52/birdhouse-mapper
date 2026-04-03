import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Notification } from '@/lib/notifications/types';

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
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    ...overrides,
  };
}

describe('NotificationItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders notification title and body', async () => {
    const { default: NotificationItem } = await import('../NotificationItem');
    const notification = makeNotification();
    render(<NotificationItem notification={notification} onMarkRead={vi.fn()} />);

    expect(screen.getByText('Task due soon')).toBeInTheDocument();
    expect(screen.getByText('Your task is due tomorrow')).toBeInTheDocument();
  });

  it('shows unread indicator dot when read_at is null', async () => {
    const { default: NotificationItem } = await import('../NotificationItem');
    const notification = makeNotification({ read_at: null });
    const { container } = render(
      <NotificationItem notification={notification} onMarkRead={vi.fn()} />
    );

    // The unread dot is a span with bg-meadow
    const dot = container.querySelector('span.bg-meadow');
    expect(dot).toBeInTheDocument();
  });

  it('does NOT show unread indicator when read_at is set', async () => {
    const { default: NotificationItem } = await import('../NotificationItem');
    const notification = makeNotification({ read_at: new Date().toISOString() });
    const { container } = render(
      <NotificationItem notification={notification} onMarkRead={vi.fn()} />
    );

    const dot = container.querySelector('span.bg-meadow');
    expect(dot).not.toBeInTheDocument();
  });

  it('links to correct href for task reference_type', async () => {
    const { default: NotificationItem } = await import('../NotificationItem');
    const notification = makeNotification({ reference_type: 'task', reference_id: 'task-123' });
    render(<NotificationItem notification={notification} onMarkRead={vi.fn()} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/manage?task=task-123');
  });

  it('links to correct href for item reference_type', async () => {
    const { default: NotificationItem } = await import('../NotificationItem');
    const notification = makeNotification({ reference_type: 'item', reference_id: 'item-456' });
    render(<NotificationItem notification={notification} onMarkRead={vi.fn()} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/manage/edit?id=item-456');
  });

  it('falls back to /manage for unknown reference_type', async () => {
    const { default: NotificationItem } = await import('../NotificationItem');
    const notification = makeNotification({ reference_type: 'unknown', reference_id: 'xyz' });
    render(<NotificationItem notification={notification} onMarkRead={vi.fn()} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/manage');
  });

  it('calls onMarkRead when clicking an unread notification', async () => {
    const { default: NotificationItem } = await import('../NotificationItem');
    const onMarkRead = vi.fn();
    const notification = makeNotification({ id: 'notif-1', read_at: null });
    render(<NotificationItem notification={notification} onMarkRead={onMarkRead} />);

    fireEvent.click(screen.getByRole('link'));
    expect(onMarkRead).toHaveBeenCalledWith('notif-1');
  });

  it('does NOT call onMarkRead when clicking a read notification', async () => {
    const { default: NotificationItem } = await import('../NotificationItem');
    const onMarkRead = vi.fn();
    const notification = makeNotification({ read_at: new Date().toISOString() });
    render(<NotificationItem notification={notification} onMarkRead={onMarkRead} />);

    fireEvent.click(screen.getByRole('link'));
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it('shows relative time for a known timestamp', async () => {
    const { default: NotificationItem } = await import('../NotificationItem');
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const notification = makeNotification({ created_at: fiveMinutesAgo });
    render(<NotificationItem notification={notification} onMarkRead={vi.fn()} />);

    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });
});
