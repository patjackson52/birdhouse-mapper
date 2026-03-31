import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { IconRenderer } from '../IconRenderer';

// Mock lucide-react with a simple component
vi.mock('lucide-react', () => ({
  icons: {
    Bird: (props: any) => <svg data-testid="lucide-bird" {...props} />,
    MapPin: (props: any) => <svg data-testid="lucide-map-pin" {...props} />,
  },
}));

// Mock heroicons
vi.mock('@heroicons/react/24/outline', () => ({
  BirdIcon: (props: any) => <svg data-testid="hero-bird-outline" {...props} />,
  MapPinIcon: (props: any) => <svg data-testid="hero-map-pin-outline" {...props} />,
}));

vi.mock('@heroicons/react/24/solid', () => ({
  BirdIcon: (props: any) => <svg data-testid="hero-bird-solid" {...props} />,
  MapPinIcon: (props: any) => <svg data-testid="hero-map-pin-solid" {...props} />,
}));

describe('IconRenderer', () => {
  it('renders nothing when icon is undefined', () => {
    const { container } = render(<IconRenderer icon={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a lucide icon', async () => {
    const { container } = render(
      <IconRenderer icon={{ set: 'lucide', name: 'Bird' }} />
    );
    await waitFor(() => {
      expect(container.querySelector('[data-testid="lucide-bird"]')).not.toBeNull();
    });
  });

  it('passes className and size props', async () => {
    const { container } = render(
      <IconRenderer icon={{ set: 'lucide', name: 'Bird' }} className="text-red-500" size={24} />
    );
    await waitFor(() => {
      const svg = container.querySelector('[data-testid="lucide-bird"]');
      expect(svg?.getAttribute('class')).toContain('text-red-500');
    });
  });
});
