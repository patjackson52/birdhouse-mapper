import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Attribution } from '../Attribution';
import type { AuthorCard } from '@/lib/types';

const member: AuthorCard = {
  id: 'u1',
  display_name: 'Alice Jones',
  avatar_url: 'a.png',
  role: 'contributor',
  update_count: 7,
};

const anon: AuthorCard = {
  id: 'u2',
  display_name: null,
  avatar_url: null,
  role: 'public_contributor',
  update_count: 1,
};

describe('Attribution', () => {
  it('renders member variant with name and role', () => {
    render(<Attribution update={{ anon_name: null, createdByProfile: member }} />);
    expect(screen.getByText('Alice Jones')).toBeInTheDocument();
    expect(screen.getByText(/contributor/)).toBeInTheDocument();
    expect(screen.getByText(/7 updates/)).toBeInTheDocument();
  });

  it('renders strict anon variant (no name)', () => {
    render(<Attribution update={{ anon_name: null, createdByProfile: anon }} />);
    expect(screen.getByText('Anonymous contributor')).toBeInTheDocument();
    expect(screen.getByText('ANON')).toBeInTheDocument();
    expect(screen.getByText(/submitted via public form/)).toBeInTheDocument();
  });

  it('renders named anon variant', () => {
    render(<Attribution update={{ anon_name: 'BirdFan42', createdByProfile: anon }} />);
    expect(screen.getByText('BirdFan42')).toBeInTheDocument();
    expect(screen.getByText('ANON')).toBeInTheDocument();
  });

  it('compact mode renders single inline name', () => {
    render(<Attribution update={{ anon_name: null, createdByProfile: member }} compact />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText(/updates/)).toBeNull();
  });

  it('returns null-like when no createdByProfile and no anon_name (treated as strict anon with "?" avatar)', () => {
    // With no createdByProfile and no anon_name, the component treats it as strict anon (role==='public_contributor' branch).
    // The anon branch activates when createdByProfile is null OR role is public_contributor.
    render(<Attribution update={{ anon_name: null, createdByProfile: null }} />);
    expect(screen.getByText('Anonymous contributor')).toBeInTheDocument();
  });
});
