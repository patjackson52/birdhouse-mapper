import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GooglePhotosSource from '@/components/photos/GooglePhotosSource';

// Mock resizeImage
vi.mock('@/lib/utils', () => ({
  resizeImage: vi.fn((file: File) => Promise.resolve(new Blob(['resized'], { type: 'image/jpeg' }))),
}));

// Mock picker module
vi.mock('@/lib/google/picker', () => ({
  isGooglePhotosConfigured: () => true,
  getGooglePhotosPickerUrl: (maxFiles: number) => `/google-photos-picker?maxFiles=${maxFiles}`,
}));

describe('GooglePhotosSource', () => {
  const defaultProps = {
    maxFiles: 5,
    onFilesSelected: vi.fn(),
  };

  let mockPopup: { closed: boolean; close: () => void };

  beforeEach(() => {
    mockPopup = { closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(mockPopup as any);
    defaultProps.onFilesSelected.mockClear();
  });

  it('renders the Browse button in idle state', () => {
    render(<GooglePhotosSource {...defaultProps} />);
    expect(screen.getByText('Browse Google Photos')).toBeInTheDocument();
  });

  it('shows max files hint', () => {
    render(<GooglePhotosSource {...defaultProps} maxFiles={3} />);
    expect(screen.getByText(/up to 3 photos/i)).toBeInTheDocument();
  });

  it('opens a popup and shows authenticating state when Browse is clicked', () => {
    render(<GooglePhotosSource {...defaultProps} />);
    fireEvent.click(screen.getByText('Browse Google Photos'));

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('/google-photos-picker?maxFiles=5'),
      'google-photos-picker',
      expect.any(String)
    );
    expect(screen.getByText('Connecting to Google Photos...')).toBeInTheDocument();
  });

  it('shows error when popup is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);

    render(<GooglePhotosSource {...defaultProps} />);
    fireEvent.click(screen.getByText('Browse Google Photos'));

    expect(screen.getByText(/Popup was blocked/)).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('returns to idle when popup is closed without selection', async () => {
    render(<GooglePhotosSource {...defaultProps} />);
    fireEvent.click(screen.getByText('Browse Google Photos'));

    // Simulate popup closing
    mockPopup.closed = true;

    await waitFor(() => {
      expect(screen.getByText('Browse Google Photos')).toBeInTheDocument();
    });
  });
});
