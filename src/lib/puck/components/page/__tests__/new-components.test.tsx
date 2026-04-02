import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../Card';
import { Testimonial } from '../Testimonial';
import { Embed } from '../Embed';

// Card
describe('Card', () => {
  it('renders title and text', () => {
    render(<Card title="Bird House" text="A great place for birds." imageUrl="" linkHref="" linkLabel="" />);
    expect(screen.getByText('Bird House')).toBeDefined();
    expect(screen.getByText('A great place for birds.')).toBeDefined();
  });

  it('renders link when linkHref and linkLabel are provided', () => {
    render(<Card title="Card" text="" imageUrl="" linkHref="/details" linkLabel="Learn more" />);
    const link = screen.getByRole('link', { name: /Learn more/ });
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/details');
  });

  it('does not render link when linkHref is missing', () => {
    render(<Card title="Card" text="" imageUrl="" linkHref="" linkLabel="Learn more" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('does not render link when linkLabel is missing', () => {
    render(<Card title="Card" text="" imageUrl="" linkHref="/details" linkLabel="" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders image when imageUrl is provided', () => {
    render(<Card title="Card" text="" imageUrl="/photo.jpg" linkHref="" linkLabel="" />);
    const img = screen.getByRole('img', { name: 'Card' });
    expect(img.getAttribute('src')).toBe('/photo.jpg');
  });

  it('applies prose-sm class by default (no textSize prop)', () => {
    const { container } = render(<Card title="Card" text="<p>Body</p>" imageUrl="" linkHref="" linkLabel="" />);
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toContain('prose-sm');
  });

  it('applies prose-lg class when textSize is large', () => {
    const { container } = render(<Card title="Card" text="<p>Body</p>" imageUrl="" linkHref="" linkLabel="" textSize="large" />);
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toContain('prose-lg');
  });
});

// Testimonial
describe('Testimonial', () => {
  it('renders quote and attribution', () => {
    render(<Testimonial quote="Birds are amazing." attribution="Jane Doe" photoUrl="" style="default" />);
    expect(screen.getByText(/Birds are amazing\./)).toBeDefined();
    expect(screen.getByText('Jane Doe')).toBeDefined();
  });

  it('renders photo when photoUrl is provided', () => {
    render(<Testimonial quote="Great quote" attribution="John Smith" photoUrl="/avatar.jpg" style="default" />);
    const img = screen.getByRole('img', { name: 'John Smith' });
    expect(img.getAttribute('src')).toBe('/avatar.jpg');
  });

  it('does not render photo when photoUrl is empty', () => {
    render(<Testimonial quote="Great quote" attribution="John Smith" photoUrl="" style="default" />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('applies accent border class for accent style', () => {
    const { container } = render(<Testimonial quote="Q" attribution="A" photoUrl="" style="accent" />);
    const blockquote = container.querySelector('blockquote') as HTMLElement;
    expect(blockquote.className).toContain('border-[var(--color-accent)]');
  });

  it('applies primary border class for default style', () => {
    const { container } = render(<Testimonial quote="Q" attribution="A" photoUrl="" style="default" />);
    const blockquote = container.querySelector('blockquote') as HTMLElement;
    expect(blockquote.className).toContain('border-[var(--color-primary)]');
  });
});

// Embed
describe('Embed', () => {
  it('renders iframe for an allowed YouTube URL', () => {
    render(<Embed url="https://www.youtube.com/embed/abc123" height={400} title="My Video" />);
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeDefined();
    expect(iframe!.getAttribute('src')).toBe('https://www.youtube.com/embed/abc123');
    expect(iframe!.getAttribute('title')).toBe('My Video');
  });

  it('renders iframe for an allowed Vimeo URL', () => {
    render(<Embed url="https://player.vimeo.com/video/12345" height={300} title="Vimeo" />);
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeDefined();
  });

  it('renders warning for a disallowed URL', () => {
    render(<Embed url="https://evil.com/embed" height={400} title="Bad Embed" />);
    expect(screen.queryByTitle('Bad Embed')).toBeNull();
    expect(screen.getByText(/Embed URL not allowed/)).toBeDefined();
  });

  it('renders warning for an empty URL', () => {
    render(<Embed url="" height={400} title="Empty" />);
    expect(screen.getByText(/Embed URL not allowed/)).toBeDefined();
  });
});
