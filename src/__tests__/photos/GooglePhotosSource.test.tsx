import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GooglePhotosSource from '@/components/photos/GooglePhotosSource';

// Mock the picker
vi.mock('@/lib/google/picker', () => ({
  openGooglePhotosPicker: vi.fn(),
}));

// Mock resizeImage
vi.mock('@/lib/utils', () => ({
  resizeImage: vi.fn((file: File) => Promise.resolve(new Blob(['resized'], { type: 'image/jpeg' }))),
}));

describe('GooglePhotosSource', () => {
  const defaultProps = {
    maxFiles: 5,
    onFilesSelected: vi.fn(),
  };

  it('renders the Browse button in idle state', () => {
    render(<GooglePhotosSource {...defaultProps} />);
    expect(screen.getByText('Browse Google Photos')).toBeInTheDocument();
  });

  it('shows max files hint', () => {
    render(<GooglePhotosSource {...defaultProps} maxFiles={3} />);
    expect(screen.getByText(/up to 3 photos/i)).toBeInTheDocument();
  });

  it('shows authenticating state when Browse is clicked', async () => {
    const { openGooglePhotosPicker } = await import('@/lib/google/picker');
    (openGooglePhotosPicker as any).mockImplementation(() => new Promise(() => {})); // never resolves

    render(<GooglePhotosSource {...defaultProps} />);
    fireEvent.click(screen.getByText('Browse Google Photos'));
    expect(screen.getByText('Connecting to Google Photos...')).toBeInTheDocument();
  });

  it('returns to idle if picker is cancelled (empty result)', async () => {
    const { openGooglePhotosPicker } = await import('@/lib/google/picker');
    (openGooglePhotosPicker as any).mockResolvedValue([]);

    render(<GooglePhotosSource {...defaultProps} />);
    fireEvent.click(screen.getByText('Browse Google Photos'));

    await waitFor(() => {
      expect(screen.getByText('Browse Google Photos')).toBeInTheDocument();
    });
  });

  it('shows error message when picker fails', async () => {
    const { openGooglePhotosPicker } = await import('@/lib/google/picker');
    (openGooglePhotosPicker as any).mockRejectedValue(new Error('Auth failed'));

    render(<GooglePhotosSource {...defaultProps} />);
    fireEvent.click(screen.getByText('Browse Google Photos'));

    await waitFor(() => {
      expect(screen.getByText(/Couldn't connect to Google Photos/)).toBeInTheDocument();
    });

    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });
});
