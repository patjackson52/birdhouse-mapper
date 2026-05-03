import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PerfOverlay } from '../PerfOverlay';
import { mark, _resetForTest } from '@/lib/perf/marks';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}));

import { useSearchParams } from 'next/navigation';

describe('PerfOverlay', () => {
  beforeEach(() => {
    _resetForTest();
    performance.clearMarks();
    performance.clearMeasures();
    localStorage.clear();
  });

  it('renders nothing when ?perf=1 is absent and localStorage flag is unset', () => {
    (useSearchParams as any).mockReturnValue(new URLSearchParams(''));
    const { container } = render(<PerfOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the marks table when ?perf=1 is present', () => {
    (useSearchParams as any).mockReturnValue(new URLSearchParams('perf=1'));
    mark('ttrc:hydrate-start');
    render(<PerfOverlay />);
    expect(screen.getByTestId('perf-overlay')).toBeInTheDocument();
    expect(screen.getByText(/ttrc:hydrate-start/)).toBeInTheDocument();
  });

  it('renders when localStorage.perfOverlay is "1"', () => {
    (useSearchParams as any).mockReturnValue(new URLSearchParams(''));
    localStorage.setItem('perfOverlay', '1');
    render(<PerfOverlay />);
    expect(screen.getByTestId('perf-overlay')).toBeInTheDocument();
  });

  it('shows cold tag when no service worker controller is present', () => {
    (useSearchParams as any).mockReturnValue(new URLSearchParams('perf=1'));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: null },
    });
    render(<PerfOverlay />);
    expect(screen.getByText(/cold/i)).toBeInTheDocument();
  });
});
