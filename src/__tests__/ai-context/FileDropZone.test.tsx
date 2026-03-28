import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileDropZone from '@/components/ai-context/FileDropZone';

// Mock react-dropzone
vi.mock('react-dropzone', () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
  }),
}));

// Mock parsers
vi.mock('@/lib/ai-context/parsers', () => ({
  getSupportedExtensions: () => ['geojson', 'csv', 'kml'],
}));

function renderUrlTab(onUrlSubmit?: (urls: string[]) => void) {
  render(
    <FileDropZone
      onFilesSelected={vi.fn()}
      onUrlSubmit={onUrlSubmit}
    />
  );
  fireEvent.click(screen.getByText('URL'));
}

describe('FileDropZone URL tab', () => {
  it('shows URL input and Add URL button on URL tab', () => {
    renderUrlTab();
    expect(screen.getByPlaceholderText(/https:\/\/example\.com/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add url/i })).toBeInTheDocument();
  });

  it('appends a valid URL to the list when Add URL is clicked', async () => {
    renderUrlTab(vi.fn());
    const input = screen.getByPlaceholderText(/https:\/\/example\.com/);
    await userEvent.type(input, 'https://example.com/data.geojson');
    fireEvent.click(screen.getByRole('button', { name: /add url/i }));
    expect(screen.getByText('https://example.com/data.geojson')).toBeInTheDocument();
  });

  it('clears the input after adding a URL', async () => {
    renderUrlTab(vi.fn());
    const input = screen.getByPlaceholderText(/https:\/\/example\.com/);
    await userEvent.type(input, 'https://example.com/data.geojson');
    fireEvent.click(screen.getByRole('button', { name: /add url/i }));
    expect(input).toHaveValue('');
  });

  it('calls onUrlSubmit with full URL array after adding a URL', async () => {
    const onUrlSubmit = vi.fn();
    renderUrlTab(onUrlSubmit);
    const input = screen.getByPlaceholderText(/https:\/\/example\.com/);
    await userEvent.type(input, 'https://example.com/data.geojson');
    fireEvent.click(screen.getByRole('button', { name: /add url/i }));
    expect(onUrlSubmit).toHaveBeenCalledWith(['https://example.com/data.geojson']);
  });

  it('accumulates multiple URLs and calls onUrlSubmit with all of them', async () => {
    const onUrlSubmit = vi.fn();
    renderUrlTab(onUrlSubmit);
    const input = screen.getByPlaceholderText(/https:\/\/example\.com/);

    await userEvent.type(input, 'https://example.com/one.geojson');
    fireEvent.click(screen.getByRole('button', { name: /add url/i }));
    await userEvent.type(input, 'https://example.com/two.csv');
    fireEvent.click(screen.getByRole('button', { name: /add url/i }));

    expect(screen.getByText('https://example.com/one.geojson')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/two.csv')).toBeInTheDocument();
    expect(onUrlSubmit).toHaveBeenLastCalledWith([
      'https://example.com/one.geojson',
      'https://example.com/two.csv',
    ]);
  });

  it('removes a URL from the list when X button is clicked', async () => {
    const onUrlSubmit = vi.fn();
    renderUrlTab(onUrlSubmit);
    const input = screen.getByPlaceholderText(/https:\/\/example\.com/);
    await userEvent.type(input, 'https://example.com/data.geojson');
    fireEvent.click(screen.getByRole('button', { name: /add url/i }));

    fireEvent.click(screen.getByRole('button', { name: /remove.*example/i }));

    expect(screen.queryByText('https://example.com/data.geojson')).not.toBeInTheDocument();
    expect(onUrlSubmit).toHaveBeenLastCalledWith([]);
  });

  it('does not add an empty or whitespace-only URL', async () => {
    const onUrlSubmit = vi.fn();
    renderUrlTab(onUrlSubmit);
    fireEvent.click(screen.getByRole('button', { name: /add url/i }));
    expect(onUrlSubmit).not.toHaveBeenCalled();
  });

  it('shows a count label when URLs are added', async () => {
    renderUrlTab(vi.fn());
    const input = screen.getByPlaceholderText(/https:\/\/example\.com/);
    await userEvent.type(input, 'https://example.com/data.geojson');
    fireEvent.click(screen.getByRole('button', { name: /add url/i }));
    expect(screen.getByText(/1 url/i)).toBeInTheDocument();
  });
});
