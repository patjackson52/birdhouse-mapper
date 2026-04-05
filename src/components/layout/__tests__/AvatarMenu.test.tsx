// src/components/layout/__tests__/AvatarMenu.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AvatarMenu } from '../AvatarMenu';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signOut: vi.fn().mockResolvedValue({}) },
  }),
}));

describe('AvatarMenu', () => {
  it('renders avatar button', () => {
    render(<AvatarMenu userEmail="test@example.com" />);
    const button = screen.getByLabelText('User menu');
    expect(button).toBeDefined();
  });

  it('shows menu items when clicked', () => {
    render(<AvatarMenu userEmail="test@example.com" />);
    fireEvent.click(screen.getByLabelText('User menu'));
    expect(screen.getByText('Profile')).toBeDefined();
    expect(screen.getByText('Sign Out')).toBeDefined();
  });

  it('shows user initial in avatar', () => {
    render(<AvatarMenu userEmail="test@example.com" />);
    expect(screen.getByText('T')).toBeDefined();
  });
});
