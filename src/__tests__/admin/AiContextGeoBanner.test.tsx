import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// Isolated banner component for testability — mirrors the markup in ai-context/page.tsx
function GeoBanner({ totalGeoCount, items }: { totalGeoCount: number; items: Array<{ name: string; geo_count: number }> }) {
  if (totalGeoCount <= 0) return null;
  return (
    <div data-testid="geo-banner" className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 flex items-center gap-3">
      <span className="text-xl">🗺️</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-purple-900">
          {totalGeoCount} geo feature{totalGeoCount !== 1 ? 's' : ''} detected in uploaded files
        </p>
        <p className="text-xs text-purple-700 truncate">
          {items.filter(i => i.geo_count > 0).map(i => `${i.name} (${i.geo_count})`).join(' · ')}
        </p>
      </div>
      <a href="/admin/geo-layers">View in Geo Layers →</a>
    </div>
  );
}

describe('GeoBanner', () => {
  it('renders nothing when totalGeoCount is 0', () => {
    const { container } = render(<GeoBanner totalGeoCount={0} items={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders banner with feature count and link', () => {
    const items = [
      { name: 'trails.kml', geo_count: 5 },
      { name: 'readme.txt', geo_count: 0 },
      { name: 'boundary.geojson', geo_count: 1 },
    ];
    render(<GeoBanner totalGeoCount={6} items={items} />);

    expect(screen.getByTestId('geo-banner')).toBeTruthy();
    expect(screen.getByText('6 geo features detected in uploaded files')).toBeTruthy();
    expect(screen.getByText('trails.kml (5) · boundary.geojson (1)')).toBeTruthy();
    expect(screen.getByText('View in Geo Layers →').closest('a')?.getAttribute('href')).toBe('/admin/geo-layers');
  });

  it('uses singular "feature" for count of 1', () => {
    render(<GeoBanner totalGeoCount={1} items={[{ name: 'test.kml', geo_count: 1 }]} />);
    expect(screen.getByText('1 geo feature detected in uploaded files')).toBeTruthy();
  });
});
