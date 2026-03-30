import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PhotoSourcePicker from '@/components/photos/PhotoSourcePicker';

// Mock child components to isolate PhotoSourcePicker logic
vi.mock('@/components/photos/DeviceSource', () => ({
  default: (props: any) => <div data-testid="device-source">DeviceSource</div>,
}));
vi.mock('@/components/photos/GooglePhotosSource', () => ({
  default: (props: any) => <div data-testid="google-source">GooglePhotosSource</div>,
}));

// Mock the config check
let mockGoogleConfigured = false;
vi.mock('@/lib/google/picker', () => ({
  isGooglePhotosConfigured: () => mockGoogleConfigured,
}));

describe('PhotoSourcePicker', () => {
  const defaultProps = {
    accept: 'image/*',
    onFilesSelected: vi.fn(),
  };

  beforeEach(() => {
    mockGoogleConfigured = false;
  });

  it('renders only DeviceSource when Google is not configured', () => {
    mockGoogleConfigured = false;
    render(<PhotoSourcePicker {...defaultProps} />);
    expect(screen.getByTestId('device-source')).toBeInTheDocument();
    expect(screen.queryByText('Google Photos')).not.toBeInTheDocument();
  });

  it('renders tab bar with Device and Google Photos when Google is configured', () => {
    mockGoogleConfigured = true;
    render(<PhotoSourcePicker {...defaultProps} />);
    expect(screen.getByText('Device')).toBeInTheDocument();
    expect(screen.getByText('Google Photos')).toBeInTheDocument();
  });

  it('shows DeviceSource by default when Google is configured', () => {
    mockGoogleConfigured = true;
    render(<PhotoSourcePicker {...defaultProps} />);
    expect(screen.getByTestId('device-source')).toBeInTheDocument();
    expect(screen.queryByTestId('google-source')).not.toBeInTheDocument();
  });

  it('switches to GooglePhotosSource when Google Photos tab is clicked', () => {
    mockGoogleConfigured = true;
    render(<PhotoSourcePicker {...defaultProps} />);
    fireEvent.click(screen.getByText('Google Photos'));
    expect(screen.getByTestId('google-source')).toBeInTheDocument();
    expect(screen.queryByTestId('device-source')).not.toBeInTheDocument();
  });

  it('switches back to DeviceSource when Device tab is clicked', () => {
    mockGoogleConfigured = true;
    render(<PhotoSourcePicker {...defaultProps} />);
    fireEvent.click(screen.getByText('Google Photos'));
    fireEvent.click(screen.getByText('Device'));
    expect(screen.getByTestId('device-source')).toBeInTheDocument();
    expect(screen.queryByTestId('google-source')).not.toBeInTheDocument();
  });
});
