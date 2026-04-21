import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock child components
vi.mock('@/components/item/StatusBadge', () => ({
  default: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
}));

vi.mock('@/components/item/timeline/TimelineRail', () => ({
  TimelineRail: ({ updates, maxItems }: { updates: unknown[]; maxItems?: number }) => {
    const visible = maxItems != null ? updates.slice(0, maxItems) : updates;
    if (visible.length === 0) {
      return <p>No activity yet</p>;
    }
    return (
      <div data-testid="update-timeline">
        {visible.map((u: any) => (
          <div key={u.id} data-testid="timeline-item">{u.content}</div>
        ))}
      </div>
    );
  },
}));

vi.mock('@/components/ui/PhotoViewer', () => ({
  default: ({ photos }: { photos: unknown[] }) => (
    <div data-testid="photo-viewer">{photos.length} photos</div>
  ),
}));

import StatusBadgeBlock from '../StatusBadgeBlock';
import FieldDisplayBlock from '../FieldDisplayBlock';
import TextLabelBlock from '../TextLabelBlock';
import DividerBlock from '../DividerBlock';
import EntityListBlock from '../EntityListBlock';
import TimelineBlock from '../TimelineBlock';
import type { CustomField } from '@/lib/types';
import type { FieldDisplayConfig, TextLabelConfig, EntityListConfig, TimelineConfig } from '@/lib/layout/types';

// =====================
// StatusBadgeBlock
// =====================
describe('StatusBadgeBlock', () => {
  it('renders the StatusBadge with given status', () => {
    render(<StatusBadgeBlock status="active" />);
    const badge = screen.getByTestId('status-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe('active');
  });

  it('passes damaged status through', () => {
    render(<StatusBadgeBlock status="damaged" />);
    expect(screen.getByTestId('status-badge').textContent).toBe('damaged');
  });
});

// =====================
// FieldDisplayBlock
// =====================
describe('FieldDisplayBlock', () => {
  const field: CustomField = {
    id: 'field-1',
    item_type_id: 'type-1',
    name: 'Species',
    field_type: 'text',
    options: null,
    required: false,
    sort_order: 0,
    org_id: 'org-1',
  };

  const baseConfig: FieldDisplayConfig = {
    fieldId: 'field-1',
    size: 'normal',
    showLabel: true,
  };

  it('renders label and value', () => {
    render(<FieldDisplayBlock config={baseConfig} field={field} value="Oak" />);
    expect(screen.getByText('Species')).toBeDefined();
    expect(screen.getByText('Oak')).toBeDefined();
  });

  it('hides label when showLabel is false', () => {
    const config = { ...baseConfig, showLabel: false };
    render(<FieldDisplayBlock config={config} field={field} value="Oak" />);
    expect(screen.queryByText('Species')).toBeNull();
    expect(screen.getByText('Oak')).toBeDefined();
  });

  it('shows dash for null value', () => {
    render(<FieldDisplayBlock config={baseConfig} field={field} value={null} />);
    expect(screen.getByText('—')).toBeDefined();
  });

  it('shows dash for undefined value', () => {
    render(<FieldDisplayBlock config={baseConfig} field={field} value={undefined} />);
    expect(screen.getByText('—')).toBeDefined();
  });

  it('returns null when field is undefined', () => {
    const { container } = render(
      <FieldDisplayBlock config={baseConfig} field={undefined} value="Oak" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('applies large size class', () => {
    const config = { ...baseConfig, size: 'large' as const, showLabel: false };
    const { container } = render(<FieldDisplayBlock config={config} field={field} value="Oak" />);
    const p = container.querySelector('p');
    expect(p?.className).toContain('text-xl');
    expect(p?.className).toContain('font-semibold');
  });

  it('formats date fields using formatDate', () => {
    const dateField: CustomField = { ...field, field_type: 'date' };
    render(<FieldDisplayBlock config={baseConfig} field={dateField} value="2024-03-15" />);
    // formatDate uses toLocaleDateString — just check the raw ISO string is not shown
    expect(screen.queryByText('2024-03-15')).toBeNull();
    // formatted date should include the year 2024 and the word March
    expect(screen.getByText(/March.*2024/)).toBeDefined();
  });
});

// =====================
// TextLabelBlock
// =====================
describe('TextLabelBlock', () => {
  it('renders heading with correct class', () => {
    const config: TextLabelConfig = { text: 'Hello World', style: 'heading' };
    const { container } = render(<TextLabelBlock config={config} />);
    const p = container.querySelector('p');
    expect(p?.textContent).toBe('Hello World');
    expect(p?.className).toContain('text-lg');
    expect(p?.className).toContain('font-semibold');
  });

  it('renders caption with correct class', () => {
    const config: TextLabelConfig = { text: 'A note', style: 'caption' };
    const { container } = render(<TextLabelBlock config={config} />);
    const p = container.querySelector('p');
    expect(p?.className).toContain('text-xs');
    expect(p?.className).toContain('text-sage');
  });

  it('renders subheading style', () => {
    const config: TextLabelConfig = { text: 'Sub', style: 'subheading' };
    const { container } = render(<TextLabelBlock config={config} />);
    const p = container.querySelector('p');
    expect(p?.className).toContain('font-medium');
  });

  it('renders body style', () => {
    const config: TextLabelConfig = { text: 'Body text', style: 'body' };
    const { container } = render(<TextLabelBlock config={config} />);
    const p = container.querySelector('p');
    expect(p?.className).toContain('leading-relaxed');
  });
});

// =====================
// DividerBlock
// =====================
describe('DividerBlock', () => {
  it('renders an hr element', () => {
    const { container } = render(<DividerBlock />);
    const hr = container.querySelector('hr');
    expect(hr).toBeDefined();
    expect(hr?.className).toContain('border-sage-light');
  });
});

// =====================
// EntityListBlock
// =====================
describe('EntityListBlock', () => {
  const trees = [
    { id: 'e1', name: 'White Oak', entity_type: { id: 'et1', name: 'Tree', icon: { set: 'emoji' as const, name: '🌳' } } },
    { id: 'e2', name: 'Red Maple', entity_type: { id: 'et1', name: 'Tree', icon: { set: 'emoji' as const, name: '🌳' } } },
  ];

  const birds = [
    { id: 'e3', name: 'Robin', entity_type: { id: 'et2', name: 'Bird', icon: { set: 'emoji' as const, name: '🐦' } } },
  ];

  const allEntities = [...trees, ...birds];

  it('renders grouped entities with type label', () => {
    const config: EntityListConfig = { entityTypeIds: [] };
    render(<EntityListBlock config={config} entities={allEntities} />);
    expect(screen.getByText('White Oak')).toBeDefined();
    expect(screen.getByText('Red Maple')).toBeDefined();
    expect(screen.getByText('Robin')).toBeDefined();
    // type labels
    expect(screen.getByText(/Tree/)).toBeDefined();
    expect(screen.getByText(/Bird/)).toBeDefined();
  });

  it('filters by entityTypeIds', () => {
    const config: EntityListConfig = { entityTypeIds: ['et1'] };
    render(<EntityListBlock config={config} entities={allEntities} />);
    expect(screen.getByText('White Oak')).toBeDefined();
    expect(screen.getByText('Red Maple')).toBeDefined();
    expect(screen.queryByText('Robin')).toBeNull();
  });

  it('returns null when no entities match filter', () => {
    const config: EntityListConfig = { entityTypeIds: ['nonexistent'] };
    const { container } = render(<EntityListBlock config={config} entities={allEntities} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null for empty entities array with no filter', () => {
    const config: EntityListConfig = { entityTypeIds: [] };
    const { container } = render(<EntityListBlock config={config} entities={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

// =====================
// TimelineBlock
// =====================
describe('TimelineBlock', () => {
  const makeUpdate = (id: string, content: string) => ({
    id,
    item_id: 'item-1',
    update_type_id: 'ut-1',
    content,
    update_date: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    created_by: null,
    anon_name: null,
    org_id: 'org-1',
    property_id: 'prop-1',
    custom_field_values: {},
  });

  const updates = [
    makeUpdate('u1', 'First update'),
    makeUpdate('u2', 'Second update'),
    makeUpdate('u3', 'Third update'),
  ];

  const baseConfig: TimelineConfig = {
    showUpdates: true,
    showScheduled: false,
    maxItems: 10,
    showPhotos: true,
    showFieldValues: true,
    showEntityChips: true,
  };

  const baseProps = {
    updateTypeFields: [] as import('@/lib/types').UpdateTypeField[],
    canEditUpdate: false,
    canDeleteUpdate: false,
  };

  it('renders the TimelineRail with updates', () => {
    render(<TimelineBlock config={baseConfig} updates={updates} {...baseProps} />);
    expect(screen.getByTestId('update-timeline')).toBeDefined();
    expect(screen.getAllByTestId('timeline-item')).toHaveLength(3);
  });

  it('shows empty message when no updates', () => {
    render(<TimelineBlock config={baseConfig} updates={[]} {...baseProps} />);
    expect(screen.getByText('No activity yet')).toBeDefined();
    expect(screen.queryByTestId('update-timeline')).toBeNull();
  });

  it('returns null when showUpdates is false', () => {
    const config = { ...baseConfig, showUpdates: false };
    const { container } = render(<TimelineBlock config={config} updates={updates} {...baseProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('limits updates to maxItems', () => {
    const config = { ...baseConfig, maxItems: 2 };
    render(<TimelineBlock config={config} updates={updates} {...baseProps} />);
    expect(screen.getAllByTestId('timeline-item')).toHaveLength(2);
  });
});
