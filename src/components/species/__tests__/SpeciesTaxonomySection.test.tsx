import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SpeciesTaxonomySection } from '../SpeciesTaxonomySection';

describe('SpeciesTaxonomySection', () => {
  it('renders tags and summary', () => {
    render(
      <SpeciesTaxonomySection
        native
        cavityNester
        iucnStatus="LC"
        summary="Small thrush found across eastern North America."
      />,
    );
    expect(screen.getByText('Native')).toBeInTheDocument();
    expect(screen.getByText('Cavity nester')).toBeInTheDocument();
    expect(screen.getByText('IUCN LC')).toBeInTheDocument();
    expect(screen.getByText(/Small thrush/)).toBeInTheDocument();
  });

  it('omits cavity tag when not a cavity nester', () => {
    render(<SpeciesTaxonomySection native={false} cavityNester={false} iucnStatus="LC" summary="x" />);
    expect(screen.getByText('Introduced')).toBeInTheDocument();
    expect(screen.queryByText('Cavity nester')).toBeNull();
  });
});
