import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PuckPageRenderer } from '../PuckPageRenderer';

describe('PuckPageRenderer', () => {
  it('renders Puck components from data', () => {
    const data = {
      root: { props: {} },
      content: [
        { type: 'Hero', props: { title: 'Test Site', subtitle: 'Welcome', backgroundImageUrl: '', overlay: 'primary', ctaLabel: '', ctaHref: '' } },
      ],
    };
    render(<PuckPageRenderer data={data} />);
    expect(screen.getByText('Test Site')).toBeDefined();
  });

  it('renders empty state when no content', () => {
    const data = { root: { props: {} }, content: [] };
    const { container } = render(<PuckPageRenderer data={data} />);
    expect(container.firstChild).toBeDefined();
  });
});
