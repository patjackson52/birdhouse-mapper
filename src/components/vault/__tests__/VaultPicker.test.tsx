import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/vault/actions', () => ({
  getVaultItems: vi.fn(() => Promise.resolve({ items: [], error: null })),
  uploadToVault: vi.fn(() => Promise.resolve({ success: true, item: { id: '1' } })),
}));

vi.mock('@/lib/vault/helpers', () => ({
  getVaultUrl: vi.fn(() => 'https://example.com/photo.jpg'),
}));

import VaultPicker from '../VaultPicker';

describe('VaultPicker', () => {
  it('renders with Browse and Upload tabs', () => {
    render(
      <VaultPicker orgId="org-1" onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText('Browse Vault')).toBeTruthy();
    expect(screen.getByText('Upload New')).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <VaultPicker orgId="org-1" onSelect={vi.fn()} onClose={onClose} />
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('switches between tabs', () => {
    render(
      <VaultPicker orgId="org-1" onSelect={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Upload New'));
    expect(screen.getByText(/Drop files here/)).toBeTruthy();
  });

  it('passes categoryFilter to browse tab', () => {
    render(
      <VaultPicker
        orgId="org-1"
        categoryFilter={['photo']}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    // The browse tab should show the "All" pill and the "Photos" pill for the filtered category
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Photos')).toBeTruthy();
    // Other category pills should not be rendered since only 'photo' is in the filter
    expect(screen.queryByText('Documents')).toBeNull();
    expect(screen.queryByText('Branding')).toBeNull();
    expect(screen.queryByText('Geospatial')).toBeNull();
  });

  it('upload tab renders dropzone text', () => {
    render(
      <VaultPicker orgId="org-1" onSelect={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Upload New'));
    expect(screen.getByText(/Drop files here/)).toBeTruthy();
  });
});
