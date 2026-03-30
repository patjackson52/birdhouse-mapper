import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DeviceSource from '@/components/photos/DeviceSource';

vi.mock('react-dropzone', () => ({
  useDropzone: ({ onDrop, disabled }: any) => ({
    getRootProps: () => ({ 'data-testid': 'dropzone' }),
    getInputProps: () => ({ 'data-testid': 'file-input' }),
    isDragActive: false,
  }),
}));

describe('DeviceSource', () => {
  const defaultProps = {
    accept: 'image/*',
    maxFiles: 5,
    multiple: true,
    onFilesSelected: vi.fn(),
  };

  it('renders the dropzone with instruction text', () => {
    render(<DeviceSource {...defaultProps} />);
    expect(screen.getByText('Drop files here or tap to browse')).toBeInTheDocument();
  });

  it('shows file count limit for multiple files', () => {
    render(<DeviceSource {...defaultProps} maxFiles={3} />);
    expect(screen.getByText('Up to 3 files')).toBeInTheDocument();
  });

  it('shows single file text when multiple is false', () => {
    render(<DeviceSource {...defaultProps} multiple={false} />);
    expect(screen.getByText('1 file')).toBeInTheDocument();
  });
});
