import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthActions } from '../AuthActions';

let authChangeCallback: ((event: string, session: { user?: { email: string } } | null) => void) | null = null;
const mockGetUser = vi.fn();
const mockUnsubscribe = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      onAuthStateChange: (_event: string, cb: typeof authChangeCallback) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ count: 0, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('AuthActions', () => {
  beforeEach(() => {
    authChangeCallback = null;
    mockGetUser.mockReset();
    mockUnsubscribe.mockReset();
  });

  it('renders nothing when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { container } = render(<AuthActions />);
    await act(() => Promise.resolve());
    expect(container.innerHTML).toBe('');
  });

  it('renders admin link and avatar when authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: 'admin@test.com' } } });
    render(<AuthActions />);
    await act(() => Promise.resolve());
    expect(screen.getByLabelText('Admin settings')).toBeDefined();
    expect(screen.getByLabelText('User menu')).toBeDefined();
  });

  it('admin link points to /org', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: 'admin@test.com' } } });
    render(<AuthActions />);
    await act(() => Promise.resolve());
    const link = screen.getByLabelText('Admin settings');
    expect(link.getAttribute('href')).toBe('/org');
  });

  it('applies linkColor to admin icon', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: 'admin@test.com' } } });
    render(<AuthActions linkColor="#ff0000" />);
    await act(() => Promise.resolve());
    const link = screen.getByLabelText('Admin settings');
    expect(link.style.color).toBe('rgb(255, 0, 0)');
  });

  it('unsubscribes on unmount', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { unmount } = render(<AuthActions />);
    await act(() => Promise.resolve());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
