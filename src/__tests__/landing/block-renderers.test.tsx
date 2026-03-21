import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingRenderer } from '@/components/landing/LandingRenderer';
import type { LandingBlock } from '@/lib/config/landing-types';

describe('LandingRenderer', () => {
  it('renders nothing for empty blocks array', () => {
    const { container } = render(<LandingRenderer blocks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a spacer block', () => {
    const blocks: LandingBlock[] = [{ id: '1', type: 'spacer', size: 'medium' }];
    const { container } = render(<LandingRenderer blocks={blocks} />);
    expect(container.querySelector('[data-block-type="spacer"]')).toBeTruthy();
  });

  it('renders a button block with link', () => {
    const blocks: LandingBlock[] = [{ id: '1', type: 'button', label: 'Go to Map', href: '/map', style: 'primary', size: 'large' }];
    render(<LandingRenderer blocks={blocks} />);
    const link = screen.getByRole('link', { name: 'Go to Map' });
    expect(link).toHaveAttribute('href', '/map');
  });

  it('renders an image block with alt text', () => {
    const blocks: LandingBlock[] = [{ id: '1', type: 'image', url: '/test.jpg', alt: 'Test image', width: 'medium' }];
    render(<LandingRenderer blocks={blocks} />);
    expect(screen.getByAltText('Test image')).toBeTruthy();
  });

  it('renders a links block with multiple items', () => {
    const blocks: LandingBlock[] = [{
      id: '1', type: 'links',
      items: [
        { label: 'Example', url: 'https://example.com' },
        { label: 'Test', url: 'https://test.com', description: 'A test site' },
      ],
      layout: 'stacked',
    }];
    render(<LandingRenderer blocks={blocks} />);
    expect(screen.getByText('Example')).toBeTruthy();
    expect(screen.getByText('Test')).toBeTruthy();
    expect(screen.getByText('A test site')).toBeTruthy();
  });

  it('renders image block without broken img when url is empty', () => {
    const blocks: LandingBlock[] = [{ id: '1', type: 'image', url: '', alt: 'Missing', width: 'medium' }];
    const { container } = render(<LandingRenderer blocks={blocks} />);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('HeroBlock', () => {
  it('renders title and subtitle', () => {
    const blocks: LandingBlock[] = [{ id: '1', type: 'hero', title: 'Welcome', subtitle: 'To our site' }];
    render(<LandingRenderer blocks={blocks} />);
    expect(screen.getByText('Welcome')).toBeTruthy();
    expect(screen.getByText('To our site')).toBeTruthy();
  });
});

describe('TextBlock', () => {
  it('renders markdown content', () => {
    const blocks: LandingBlock[] = [{ id: '1', type: 'text', content: 'Hello **world**' }];
    render(<LandingRenderer blocks={blocks} />);
    expect(screen.getByText('world')).toBeTruthy();
  });
});

describe('GalleryBlock', () => {
  it('renders multiple images', () => {
    const blocks: LandingBlock[] = [{
      id: '1', type: 'gallery',
      images: [{ url: '/a.jpg', alt: 'Image A' }, { url: '/b.jpg', alt: 'Image B' }],
      columns: 2,
    }];
    render(<LandingRenderer blocks={blocks} />);
    expect(screen.getByAltText('Image A')).toBeTruthy();
    expect(screen.getByAltText('Image B')).toBeTruthy();
  });

  it('skips images with empty URLs in gallery', () => {
    const blocks: LandingBlock[] = [{
      id: '1', type: 'gallery',
      images: [{ url: '', alt: 'Missing' }, { url: '/b.jpg', alt: 'Image B' }],
    }];
    render(<LandingRenderer blocks={blocks} />);
    expect(screen.queryByAltText('Missing')).toBeNull();
    expect(screen.getByAltText('Image B')).toBeTruthy();
  });
});
