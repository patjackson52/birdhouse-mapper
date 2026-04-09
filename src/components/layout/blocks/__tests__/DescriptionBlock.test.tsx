import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DescriptionBlock from '../DescriptionBlock';
import type { DescriptionConfig } from '@/lib/layout/types-v2';

describe('DescriptionBlock', () => {
  it('renders description text', () => {
    const config: DescriptionConfig = { showLabel: false };
    render(<DescriptionBlock config={config} description="A lovely birdhouse." />);
    expect(screen.getByText('A lovely birdhouse.')).toBeDefined();
  });

  it('renders label when showLabel is true', () => {
    const config: DescriptionConfig = { showLabel: true };
    render(<DescriptionBlock config={config} description="Test" />);
    expect(screen.getByText('Description')).toBeDefined();
  });

  it('does not render label when showLabel is false', () => {
    const config: DescriptionConfig = { showLabel: false };
    render(<DescriptionBlock config={config} description="Test" />);
    expect(screen.queryByText('Description')).toBeNull();
  });

  it('returns null when description is null', () => {
    const config: DescriptionConfig = { showLabel: true };
    const { container } = render(<DescriptionBlock config={config} description={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when description is empty string', () => {
    const config: DescriptionConfig = { showLabel: true };
    const { container } = render(<DescriptionBlock config={config} description="" />);
    expect(container.innerHTML).toBe('');
  });

  it('applies line-clamp when maxLines is set', () => {
    const config: DescriptionConfig = { showLabel: false, maxLines: 3 };
    render(<DescriptionBlock config={config} description="Long text here" />);
    const el = screen.getByText('Long text here');
    expect(el.style.webkitLineClamp).toBe('3');
  });

  it('does not apply line-clamp when maxLines is not set', () => {
    const config: DescriptionConfig = { showLabel: false };
    render(<DescriptionBlock config={config} description="Text" />);
    const el = screen.getByText('Text');
    expect(el.style.webkitLineClamp).toBe('');
  });
});
