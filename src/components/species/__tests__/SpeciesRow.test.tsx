import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SpeciesRow } from '../SpeciesRow';

const species = {
  external_id: 14886,
  common_name: 'Eastern Bluebird',
  scientific_name: 'Sialia sialis',
  photo_url: 'b.png',
  native: true,
  cavity_nester: true,
};

describe('SpeciesRow', () => {
  it('renders common name, scientific name, and tags', () => {
    render(<SpeciesRow species={species} onOpen={() => {}} />);
    expect(screen.getByText('Eastern Bluebird')).toBeInTheDocument();
    expect(screen.getByText('Sialia sialis')).toBeInTheDocument();
    expect(screen.getByText('Native')).toBeInTheDocument();
    expect(screen.getByText('Cavity')).toBeInTheDocument();
  });

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn();
    render(<SpeciesRow species={species} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows Introduced tag when native=false', () => {
    render(<SpeciesRow species={{ ...species, native: false, cavity_nester: false }} onOpen={() => {}} />);
    expect(screen.getByText('Introduced')).toBeInTheDocument();
    expect(screen.queryByText('Cavity')).toBeNull();
  });
});
