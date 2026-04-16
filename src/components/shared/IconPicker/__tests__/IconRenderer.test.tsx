import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { IconRenderer, iconToHtml } from '../IconRenderer';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  icons: {
    Bird: (props: any) => <svg data-testid="lucide-bird" {...props} />,
    MapPin: (props: any) => <svg data-testid="lucide-map-pin" {...props} />,
  },
}));

// Mock heroicons
vi.mock('@heroicons/react/24/outline', () => ({
  BirdIcon: (props: any) => <svg data-testid="hero-bird-outline" {...props} />,
}));

vi.mock('@heroicons/react/24/solid', () => ({
  BirdIcon: (props: any) => <svg data-testid="hero-bird-solid" {...props} />,
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

  it('renders an emoji icon as a span', () => {
    const { container } = render(
      <IconRenderer icon={{ set: 'emoji', name: '🐦' }} size={20} />
    );
    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe('🐦');
    expect(span?.style.fontSize).toBe('20px');
  });

  it('passes className prop', async () => {
    const { container } = render(
      <IconRenderer icon={{ set: 'lucide', name: 'Bird' }} className="text-red-500" />
    );
    await waitFor(() => {
      const svg = container.querySelector('[data-testid="lucide-bird"]');
      expect(svg?.getAttribute('class')).toContain('text-red-500');
    });
  });
});

describe('iconToHtml', () => {
  it('returns emoji character for emoji icons', async () => {
    const html = await iconToHtml({ set: 'emoji', name: '🐦' }, 14);
    expect(html).toBe('🐦');
  });

  it('returns SVG string for lucide icons', async () => {
    const html = await iconToHtml({ set: 'lucide', name: 'Bird' }, 14);
    expect(html).toContain('<svg');
  });
});
