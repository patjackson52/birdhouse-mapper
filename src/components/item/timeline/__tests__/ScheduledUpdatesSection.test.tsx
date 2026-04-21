import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScheduledUpdatesSection from '../ScheduledUpdatesSection';
import type { TimelineUpdate } from '../timeline-helpers';

vi.mock('@/components/shared/IconPicker', () => ({
  IconRenderer: ({ icon }: { icon: unknown }) => <span>{String(icon)}</span>,
}));

vi.mock('@/lib/photos', () => ({
  getPhotoUrl: (p: string) => `https://cdn.example.com${p}`,
}));

const mkUpdate = (id: string, futureDays: number): TimelineUpdate => {
  const d = new Date();
  d.setDate(d.getDate() + futureDays);
  return {
    id,
    item_id: 'i1',
    update_type_id: 't1',
    content: `scheduled ${id}`,
    update_date: d.toISOString(),
    created_at: new Date().toISOString(),
    created_by: null,
    anon_name: null,
    org_id: 'o1',
    property_id: 'p1',
    custom_field_values: {},
    update_type: { id: 't1', name: 'Inspection', icon: '🔎' },
  };
};

describe('ScheduledUpdatesSection', () => {
  it('renders nothing when updates is empty', () => {
    const { container } = render(
      <ScheduledUpdatesSection updates={[]} updateTypeFields={[]} onUpdateTap={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('expands by default when 2 or fewer updates', () => {
    render(
      <ScheduledUpdatesSection
        updates={[mkUpdate('a', 1), mkUpdate('b', 2)]}
        updateTypeFields={[]}
        onUpdateTap={() => {}}
      />,
    );
    expect(screen.getByText('scheduled a')).toBeInTheDocument();
    expect(screen.getByText('scheduled b')).toBeInTheDocument();
  });

  it('collapses by default when more than 2 updates', () => {
    render(
      <ScheduledUpdatesSection
        updates={[mkUpdate('a', 1), mkUpdate('b', 2), mkUpdate('c', 3)]}
        updateTypeFields={[]}
        onUpdateTap={() => {}}
      />,
    );
    expect(screen.queryByText('scheduled a')).not.toBeInTheDocument();
    expect(screen.getByText(/3 scheduled/)).toBeInTheDocument();
  });

  it('expands on header click', () => {
    render(
      <ScheduledUpdatesSection
        updates={[mkUpdate('a', 1), mkUpdate('b', 2), mkUpdate('c', 3)]}
        updateTypeFields={[]}
        onUpdateTap={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /scheduled/i }));
    expect(screen.getByText('scheduled a')).toBeInTheDocument();
  });

  it('calls onUpdateTap with the tapped update', () => {
    const onUpdateTap = vi.fn();
    const u = mkUpdate('a', 1);
    render(
      <ScheduledUpdatesSection updates={[u]} updateTypeFields={[]} onUpdateTap={onUpdateTap} />,
    );
    fireEvent.click(screen.getByText('scheduled a'));
    expect(onUpdateTap).toHaveBeenCalledWith(u);
  });
});
