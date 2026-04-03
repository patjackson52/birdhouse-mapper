import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StorageUsageBar from '../StorageUsageBar';

describe('StorageUsageBar', () => {
  it('renders usage text', () => {
    render(<StorageUsageBar currentBytes={52428800} maxBytes={104857600} />);
    expect(screen.getByText(/50\.0 MB/)).toBeTruthy();
    expect(screen.getByText(/100\.0 MB/)).toBeTruthy();
  });

  it('shows green color when under 75%', () => {
    const { container } = render(<StorageUsageBar currentBytes={50000000} maxBytes={104857600} />);
    const bar = container.querySelector('[data-testid="usage-fill"]');
    expect(bar?.className).toContain('bg-green');
  });

  it('shows yellow color between 75% and 90%', () => {
    const { container } = render(<StorageUsageBar currentBytes={85000000} maxBytes={104857600} />);
    const bar = container.querySelector('[data-testid="usage-fill"]');
    expect(bar?.className).toContain('bg-yellow');
  });

  it('shows red color above 90%', () => {
    const { container } = render(<StorageUsageBar currentBytes={100000000} maxBytes={104857600} />);
    const bar = container.querySelector('[data-testid="usage-fill"]');
    expect(bar?.className).toContain('bg-red');
  });

  it('shows warning banner at 90%+', () => {
    render(<StorageUsageBar currentBytes={100000000} maxBytes={104857600} />);
    expect(screen.getByText(/Approaching storage limit/)).toBeTruthy();
  });
});
