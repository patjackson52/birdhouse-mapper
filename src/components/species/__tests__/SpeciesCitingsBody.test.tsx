import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SpeciesCitingsBody } from '../SpeciesCitingsBody';

vi.mock('@/app/species/[id]/actions', () => ({
  getSpeciesCitingsAtItem: vi.fn().mockResolvedValue({ count: 2, lastObserved: '2026-01-01' }),
  getSpeciesCitingsAtProperty: vi.fn().mockResolvedValue({ total: { count: 5, itemCount: 3 }, items: [] }),
  getSpeciesCitingsAtOrg: vi.fn().mockResolvedValue({ total: { count: 10, propertyCount: 2, itemCount: 5 }, properties: [] }),
}));

const species = {
  external_id: 14886,
  common_name: 'Eastern Bluebird',
  scientific_name: 'Sialia sialis',
  photo_url: 'b.png',
  large_photo_url: null,
  native: true,
  cavity_nester: true,
  iucn_status: 'LC',
  summary: 'A small thrush.',
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SpeciesCitingsBody', () => {
  it('hides "This item" tab when fromUrl is absent', () => {
    wrap(<SpeciesCitingsBody species={species} fromUrl={null} orgId="o1" propertyName="Farm" orgName="Central Audubon" />);
    expect(screen.queryByText(/This item/)).toBeNull();
  });

  it('shows "This item" tab when fromUrl has /p/x/item/y', () => {
    wrap(<SpeciesCitingsBody species={species} fromUrl="/p/farm/item/abc" orgId="o1" propertyName="Farm" orgName="Central Audubon" />);
    expect(screen.getByRole('button', { name: /This item/ })).toBeInTheDocument();
  });
});
