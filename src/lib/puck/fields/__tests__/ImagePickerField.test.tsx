import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImagePickerField } from '../ImagePickerField';

// Mock the config hook
vi.mock('@/lib/config/client', () => ({
  useConfig: () => ({ platformDomain: null }),
}));

// Mock the upload action
vi.mock('@/app/admin/landing/actions', () => ({
  uploadLandingAsset: vi.fn().mockResolvedValue({
    asset: { id: '1', publicUrl: 'https://example.com/img.jpg', fileName: 'img.jpg' },
    error: null,
  }),
}));

// Mock resizeImage
vi.mock('@/lib/utils', () => ({
  resizeImage: vi.fn().mockResolvedValue(new Blob(['test'], { type: 'image/jpeg' })),
}));

describe('ImagePickerField', () => {
  const mockFetchList = vi.fn().mockResolvedValue([]);

  it('renders current image thumbnail when value is set', () => {
    render(
      <ImagePickerField
        value="https://example.com/photo.jpg"
        onChange={vi.fn()}
        fetchAssets={mockFetchList}
      />
    );
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('https://example.com/photo.jpg');
  });

  it('renders placeholder when no value', () => {
    render(
      <ImagePickerField
        value=""
        onChange={vi.fn()}
        fetchAssets={mockFetchList}
      />
    );
    expect(screen.getByText(/choose image/i)).toBeDefined();
  });

  it('opens modal on click', () => {
    render(
      <ImagePickerField
        value=""
        onChange={vi.fn()}
        fetchAssets={mockFetchList}
      />
    );
    fireEvent.click(screen.getByText(/choose image/i));
    expect(screen.getByText(/select image/i)).toBeDefined();
  });

  it('shows clear button when value is set', () => {
    const onChange = vi.fn();
    render(
      <ImagePickerField
        value="https://example.com/photo.jpg"
        onChange={onChange}
        fetchAssets={mockFetchList}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
