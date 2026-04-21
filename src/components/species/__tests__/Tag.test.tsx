import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Tag } from '../Tag';

describe('Tag', () => {
  it('renders native style with label', () => {
    render(<Tag kind="native">Native</Tag>);
    const el = screen.getByText('Native');
    expect(el).toBeInTheDocument();
    expect(el.closest('span')).toHaveClass('text-forest-dark');
  });

  it('renders intro style', () => {
    render(<Tag kind="intro">Introduced</Tag>);
    expect(screen.getByText('Introduced')).toBeInTheDocument();
  });

  it('renders cavity style', () => {
    render(<Tag kind="cavity">Cavity</Tag>);
    expect(screen.getByText('Cavity')).toBeInTheDocument();
  });
});
