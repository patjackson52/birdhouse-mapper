import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ItemHeader } from '../ItemHeader';

const item = {
  id: 'i1', name: 'Meadow Box #7', custom_field_values: {},
  item_type: { name: 'Nest Box' },
} as any;

describe('ItemHeader', () => {
  it('renders name, location, and stats', () => {
    render(
      <ItemHeader
        item={item}
        location="Meadow Loop"
        photoUrl="box.png"
        stats={{ updatesCount: 24, speciesCount: 3, contributorsCount: 5 }}
        onBack={() => {}}
        onShare={() => {}}
      />,
    );
    expect(screen.getByText('Meadow Box #7')).toBeInTheDocument();
    expect(screen.getByText('Meadow Loop')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Updates')).toBeInTheDocument();
    expect(screen.getByText('Species')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
  });
});
