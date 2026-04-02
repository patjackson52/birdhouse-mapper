import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero } from '../Hero';
import { RichText } from '../RichText';
import { ImageBlock } from '../ImageBlock';
import { ButtonGroup } from '../ButtonGroup';
import { LinkList } from '../LinkList';
import { Stats } from '../Stats';
import { Gallery } from '../Gallery';
import { Spacer } from '../Spacer';

// Hero
describe('Hero', () => {
  it('renders title and subtitle', () => {
    render(<Hero title="Welcome" subtitle="We map birds" backgroundImageUrl="" overlay="none" ctaLabel="" ctaHref="" />);
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeDefined();
    expect(screen.getByText('We map birds')).toBeDefined();
  });

  it('renders CTA button when label and href provided', () => {
    render(<Hero title="Hello" subtitle="" backgroundImageUrl="" overlay="none" ctaLabel="Get Started" ctaHref="/signup" />);
    const link = screen.getByRole('link', { name: 'Get Started' });
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/signup');
  });

  it('does not render CTA when label is empty', () => {
    render(<Hero title="Hello" subtitle="" backgroundImageUrl="" overlay="none" ctaLabel="" ctaHref="/signup" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('does not render CTA when href is empty', () => {
    render(<Hero title="Hello" subtitle="" backgroundImageUrl="" overlay="none" ctaLabel="Click me" ctaHref="" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders CTA with LinkValue object', () => {
    render(<Hero title="Hello" subtitle="" backgroundImageUrl="" overlay="none" ctaLabel="Go" ctaHref={{ href: '/signup', target: '_blank', color: '#ff0000' }} />);
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link.getAttribute('href')).toBe('/signup');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('renders optional icon without crashing', () => {
    render(<Hero title="Hello" subtitle="" backgroundImageUrl="" overlay="none" ctaLabel="" ctaHref="" icon={{ set: 'lucide', name: 'Bird' }} />);
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeDefined();
  });

  it('applies large title classes by default (no textSize prop)', () => {
    render(<Hero title="Welcome" subtitle="" backgroundImageUrl="" overlay="none" ctaLabel="" ctaHref="" />);
    const h1 = screen.getByRole('heading', { name: 'Welcome' });
    expect(h1.className).toContain('text-4xl');
  });

  it('applies small title classes when textSize is small', () => {
    render(<Hero title="Welcome" subtitle="" backgroundImageUrl="" overlay="none" ctaLabel="" ctaHref="" textSize="small" />);
    const h1 = screen.getByRole('heading', { name: 'Welcome' });
    expect(h1.className).toContain('text-2xl');
  });

  it('applies xl subtitle classes when textSize is xl', () => {
    render(<Hero title="Welcome" subtitle="Hello world" backgroundImageUrl="" overlay="none" ctaLabel="" ctaHref="" textSize="xl" />);
    const subtitle = screen.getByText('Hello world');
    expect(subtitle.className).toContain('text-2xl');
  });
});

// RichText
describe('RichText', () => {
  it('renders markdown content', () => {
    render(<RichText content="**Bold text**" alignment="left" columns={1} />);
    expect(screen.getByText('Bold text')).toBeDefined();
  });

  it('applies center alignment class', () => {
    const { container } = render(<RichText content="Hello" alignment="center" columns={1} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('text-center');
  });

  it('applies left alignment class', () => {
    const { container } = render(<RichText content="Hello" alignment="left" columns={1} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('text-left');
  });

  it('applies prose-lg class by default (no textSize prop)', () => {
    const { container } = render(<RichText content="Hello" alignment="left" columns={1} />);
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toContain('prose-lg');
  });

  it('applies prose-sm class when textSize is small', () => {
    const { container } = render(<RichText content="Hello" alignment="left" columns={1} textSize="small" />);
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toContain('prose-sm');
  });

  it('applies prose-xl class when textSize is xl', () => {
    const { container } = render(<RichText content="Hello" alignment="left" columns={1} textSize="xl" />);
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toContain('prose-xl');
  });
});

// ImageBlock
describe('ImageBlock', () => {
  it('renders image with alt text', () => {
    render(<ImageBlock url="/bird.jpg" alt="A bird" caption="" width="medium" linkHref="" />);
    const img = screen.getByRole('img', { name: 'A bird' });
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('/bird.jpg');
  });

  it('renders caption when provided', () => {
    render(<ImageBlock url="/bird.jpg" alt="Bird" caption="A nice bird" width="medium" linkHref="" />);
    expect(screen.getByText('A nice bird')).toBeDefined();
  });

  it('does not render caption when empty', () => {
    const { container } = render(<ImageBlock url="/bird.jpg" alt="Bird" caption="" width="medium" linkHref="" />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('wraps in link when linkHref provided', () => {
    render(<ImageBlock url="/bird.jpg" alt="Bird" caption="" width="medium" linkHref="https://example.com" />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('https://example.com');
  });

  it('wraps in link with LinkValue object', () => {
    render(<ImageBlock url="/bird.jpg" alt="Bird" caption="" width="medium" linkHref={{ href: 'https://example.com', target: '_blank' }} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});

// ButtonGroup
describe('ButtonGroup', () => {
  it('renders multiple buttons', () => {
    render(
      <ButtonGroup buttons={[
        { label: 'Primary', href: '/one', style: 'primary', size: 'default' },
        { label: 'Outline', href: '/two', style: 'outline', size: 'default' },
      ]} />
    );
    expect(screen.getByRole('link', { name: 'Primary' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Outline' })).toBeDefined();
  });

  it('renders nothing when buttons array is empty', () => {
    const { container } = render(<ButtonGroup buttons={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders external link with target blank', () => {
    render(<ButtonGroup buttons={[{ label: 'External', href: 'https://example.com', style: 'primary', size: 'default' }]} />);
    const link = screen.getByRole('link', { name: 'External' });
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('handles LinkValue objects in buttons', () => {
    render(<ButtonGroup buttons={[{ label: 'Go', href: { href: '/page' }, style: 'primary', size: 'default' }]} />);
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link.getAttribute('href')).toBe('/page');
  });
});

// LinkList
describe('LinkList', () => {
  it('renders links with descriptions', () => {
    render(
      <LinkList
        items={[
          { label: 'Link One', url: '/one', description: 'First link' },
          { label: 'Link Two', url: '/two', description: 'Second link' },
        ]}
        layout="stacked"
      />
    );
    expect(screen.getByText('Link One')).toBeDefined();
    expect(screen.getByText('First link')).toBeDefined();
    expect(screen.getByText('Link Two')).toBeDefined();
    expect(screen.getByText('Second link')).toBeDefined();
  });

  it('renders nothing when items is empty', () => {
    const { container } = render(<LinkList items={[]} layout="stacked" />);
    expect(container.firstChild).toBeNull();
  });

  it('applies inline layout class', () => {
    const { container } = render(
      <LinkList items={[{ label: 'A', url: '/a', description: '' }]} layout="inline" />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('flex-wrap');
  });

  it('handles LinkValue objects in items', () => {
    render(
      <LinkList
        items={[{ label: 'Link', url: { href: 'https://example.com', target: '_blank', color: '#ff0000' }, description: '' }]}
        layout="stacked"
      />
    );
    const link = screen.getByRole('link', { name: 'Link' });
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('applies text-lg class to link labels when textSize is large', () => {
    const { container } = render(
      <LinkList items={[{ label: 'Link', url: '/a', description: '' }]} layout="stacked" textSize="large" />
    );
    const label = container.querySelector('span.font-medium') as HTMLElement;
    expect(label.className).toContain('text-lg');
  });

  it('applies text-sm class to link labels when textSize is small', () => {
    const { container } = render(
      <LinkList items={[{ label: 'Link', url: '/a', description: '' }]} layout="stacked" textSize="small" />
    );
    const label = container.querySelector('span.font-medium') as HTMLElement;
    expect(label.className).toContain('text-sm');
  });
});

// Stats
describe('Stats', () => {
  it('renders stat values and labels', () => {
    render(
      <Stats
        source="manual"
        items={[
          { value: '42', label: 'Species' },
          { value: '1,200', label: 'Observations' },
        ]}
      />
    );
    expect(screen.getByText('42')).toBeDefined();
    expect(screen.getByText('Species')).toBeDefined();
    expect(screen.getByText('1,200')).toBeDefined();
    expect(screen.getByText('Observations')).toBeDefined();
  });

  it('renders nothing when items is empty', () => {
    const { container } = render(<Stats source="manual" items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('applies text-3xl to stat values by default (no textSize prop)', () => {
    const { container } = render(
      <Stats source="manual" items={[{ value: '42', label: 'Species' }]} />
    );
    const valueEl = container.querySelector('.text-3xl') as HTMLElement;
    expect(valueEl).not.toBeNull();
    expect(valueEl.textContent).toBe('42');
  });

  it('applies text-xl to stat values when textSize is small', () => {
    const { container } = render(
      <Stats source="manual" items={[{ value: '42', label: 'Species' }]} textSize="small" />
    );
    const valueEl = container.querySelector('.text-xl') as HTMLElement;
    expect(valueEl).not.toBeNull();
    expect(valueEl.textContent).toBe('42');
  });

  it('applies text-4xl to stat values when textSize is xl', () => {
    const { container } = render(
      <Stats source="manual" items={[{ value: '42', label: 'Species' }]} textSize="xl" />
    );
    const valueEl = container.querySelector('.text-4xl') as HTMLElement;
    expect(valueEl).not.toBeNull();
    expect(valueEl.textContent).toBe('42');
  });
});

// Gallery
describe('Gallery', () => {
  it('renders images in a grid', () => {
    render(
      <Gallery
        columns={3}
        images={[
          { url: '/img1.jpg', alt: 'Image 1', caption: '' },
          { url: '/img2.jpg', alt: 'Image 2', caption: 'Caption 2' },
        ]}
      />
    );
    expect(screen.getByRole('img', { name: 'Image 1' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'Image 2' })).toBeDefined();
    expect(screen.getByText('Caption 2')).toBeDefined();
  });

  it('renders nothing when images is empty', () => {
    const { container } = render(<Gallery columns={3} images={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

// Spacer
describe('Spacer', () => {
  it('renders with small size class', () => {
    const { container } = render(<Spacer size="small" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-4');
  });

  it('renders with medium size class', () => {
    const { container } = render(<Spacer size="medium" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-8');
  });

  it('renders with large size class', () => {
    const { container } = render(<Spacer size="large" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-16');
  });

  it('has aria-hidden true', () => {
    const { container } = render(<Spacer size="medium" />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });
});
