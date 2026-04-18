import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TimelineOverview from '../TimelineOverview';
import type { TimelineUpdate } from '../timeline-helpers';
import type { TimelineConfig } from '@/lib/layout/types';

vi.mock('@/components/shared/IconPicker', () => ({
  IconRenderer: ({ icon }: { icon: unknown }) => <span>{String(icon)}</span>,
}));

vi.mock('@/components/ui/PhotoViewer', () => ({
  default: () => <div data-testid="photo-viewer" />,
}));

vi.mock('@/lib/photos', () => ({
  getPhotoUrl: (p: string) => `https://cdn.example.com${p}`,
}));

// Cast needed until Task 9 extends TimelineConfig with showPhotos/FieldValues/EntityChips.
const config = {
  showUpdates: true,
  showScheduled: true,
  maxItems: 3,
  showPhotos: true,
  showFieldValues: true,
  showEntityChips: true,
} as TimelineConfig;

const mkUpdate = (id: string, daysAgo: number): TimelineUpdate => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id,
    item_id: 'i1',
    update_type_id: 't1',
    content: `content ${id}`,
    update_date: d.toISOString(),
    created_at: new Date().toISOString(),
    created_by: null,
    org_id: 'o1',
    property_id: 'p1',
    custom_field_values: {},
    update_type: { id: 't1', name: 'Note', icon: '📝' },
  };
};

describe('TimelineOverview', () => {
  it('renders empty state when no updates', () => {
    render(
      <TimelineOverview
        updates={[]}
        updateTypeFields={[]}
        config={config}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    expect(screen.getByText(/No activity yet/i)).toBeInTheDocument();
  });

  it('renders up to maxItems past updates', () => {
    const updates = [1, 2, 3, 4, 5].map((i) => mkUpdate(`u${i}`, i));
    render(
      <TimelineOverview
        updates={updates}
        updateTypeFields={[]}
        config={config}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    expect(screen.getByText('content u1')).toBeInTheDocument();
    expect(screen.getByText('content u2')).toBeInTheDocument();
    expect(screen.getByText('content u3')).toBeInTheDocument();
    expect(screen.queryByText('content u4')).not.toBeInTheDocument();
  });

  it('shows "View all N updates" button when past exceeds maxItems', () => {
    const updates = [1, 2, 3, 4, 5].map((i) => mkUpdate(`u${i}`, i));
    render(
      <TimelineOverview
        updates={updates}
        updateTypeFields={[]}
        config={config}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    expect(screen.getByRole('button', { name: /View all 5 updates/ })).toBeInTheDocument();
  });

  it('hides "View all" button when past <= maxItems', () => {
    const updates = [1, 2].map((i) => mkUpdate(`u${i}`, i));
    render(
      <TimelineOverview
        updates={updates}
        updateTypeFields={[]}
        config={config}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /View all/ })).not.toBeInTheDocument();
  });

  it('opens all-updates sheet when "View all" is clicked', () => {
    const updates = [1, 2, 3, 4, 5].map((i) => mkUpdate(`u${i}`, i));
    render(
      <TimelineOverview
        updates={updates}
        updateTypeFields={[]}
        config={config}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /View all 5 updates/ }));
    expect(screen.getByText(/All updates \(5\)/)).toBeInTheDocument();
  });

  it('opens detail sheet when an update card is tapped', () => {
    const updates = [mkUpdate('u1', 1)];
    render(
      <TimelineOverview
        updates={updates}
        updateTypeFields={[]}
        config={config}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    fireEvent.click(screen.getByText('content u1'));
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
  });

  it('hides scheduled section when showScheduled is false', () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const scheduled: TimelineUpdate = {
      ...mkUpdate('future', -3),
      update_date: d.toISOString(),
      content: 'future content',
    };
    render(
      <TimelineOverview
        updates={[scheduled]}
        updateTypeFields={[]}
        config={{ ...config, showScheduled: false }}
        canEditUpdate={false}
        canDeleteUpdate={false}
      />,
    );
    expect(screen.queryByText(/scheduled/i)).not.toBeInTheDocument();
  });
});
