import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SpeciesAvatar } from '../SpeciesAvatar';

describe('SpeciesAvatar', () => {
  it('renders an image with the common name as alt/title', () => {
    render(<SpeciesAvatar photoUrl="bird.png" commonName="Eastern Bluebird" />);
    const img = screen.getByAltText('Eastern Bluebird') as HTMLImageElement;
    expect(img.src).toContain('bird.png');
    expect(img.title).toBe('Eastern Bluebird');
  });

  it('respects size prop', () => {
    render(<SpeciesAvatar photoUrl="x.png" commonName="X" size={20} />);
    const img = screen.getByAltText('X') as HTMLImageElement;
    expect(img.style.width).toBe('20px');
    expect(img.style.height).toBe('20px');
  });
});
