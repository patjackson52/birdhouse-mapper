import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TypeLayout, LayoutNode } from '@/lib/layout/types';
import type { ItemWithDetails, CustomField } from '@/lib/types';

// Mock all block components
vi.mock('@/components/layout/BlockErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/layout/blocks/StatusBadgeBlock', () => ({
  default: () => <div data-testid="block-status_badge" />,
}));

vi.mock('@/components/layout/blocks/FieldDisplayBlock', () => ({
  default: ({ field }: { field?: { name: string } }) => (
    <div data-testid="block-field_display">{field?.name}</div>
  ),
}));

vi.mock('@/components/layout/blocks/PhotoGalleryBlock', () => ({
  default: () => <div data-testid="block-photo_gallery" />,
}));

vi.mock('@/components/layout/blocks/TextLabelBlock', () => ({
  default: () => <div data-testid="block-text_label" />,
}));

vi.mock('@/components/layout/blocks/DividerBlock', () => ({
  default: () => <div data-testid="block-divider" />,
}));

vi.mock('@/components/layout/blocks/ActionButtonsBlock', () => ({
  default: (props: { canEdit: boolean; canAddUpdate: boolean; isAuthenticated: boolean }) => (
    <div
      data-testid="block-action_buttons"
      data-can-edit={String(props.canEdit)}
      data-can-add-update={String(props.canAddUpdate)}
      data-is-authenticated={String(props.isAuthenticated)}
    />
  ),
}));

vi.mock('@/components/layout/blocks/MapSnippetBlock', () => ({
  default: () => <div data-testid="block-map_snippet" />,
}));

vi.mock('@/components/layout/blocks/EntityListBlock', () => ({
  default: () => <div data-testid="block-entity_list" />,
}));

vi.mock('@/components/layout/blocks/TimelineBlock', () => ({
  default: () => <div data-testid="block-timeline" />,
}));

vi.mock('@/components/layout/blocks/RowBlock', () => ({
  default: ({ children }: { children: React.ReactNode[] }) => (
    <div data-testid="block-row">{children}</div>
  ),
}));

import LayoutRenderer from '../LayoutRenderer';

// =====================
// Shared test data helpers
// =====================

function makeBlock(type: string, id = `block-${type}`): LayoutNode {
  return {
    id,
    type: type as any,
    config: {} as any,
  };
}

function makeLayout(blocks: LayoutNode[], peekBlockCount = 2): TypeLayout {
  return {
    version: 1,
    blocks,
    spacing: 'comfortable',
    peekBlockCount,
  };
}

const baseItem: ItemWithDetails = {
  id: 'item-1',
  name: 'Test Item',
  description: null,
  latitude: 40.0,
  longitude: -75.0,
  item_type_id: 'type-1',
  custom_field_values: {},
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  created_by: null,
  org_id: 'org-1',
  property_id: 'prop-1',
  item_type: {
    id: 'type-1',
    name: 'Birdhouse',
    icon: { set: 'emoji' as const, name: '🏠' },
    color: '#green',
    sort_order: 0,
    layout: null,
    created_at: '2024-01-01T00:00:00Z',
    org_id: 'org-1',
  },
  updates: [],
  photos: [],
  custom_fields: [],
  entities: [],
  stats: { updatesCount: 0, speciesCount: 0, contributorsCount: 0 },
};

const baseCustomFields: CustomField[] = [
  {
    id: 'field-1',
    item_type_id: 'type-1',
    name: 'Species',
    field_type: 'text',
    options: null,
    required: false,
    sort_order: 0,
    org_id: 'org-1',
  },
];

// =====================
// Tests
// =====================

describe('LayoutRenderer', () => {
  it('renders blocks in order (3 blocks → 3 elements)', () => {
    const layout = makeLayout([
      makeBlock('status_badge', 'b1'),
      makeBlock('text_label', 'b2'),
      makeBlock('divider', 'b3'),
    ]);

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-status_badge')).toBeDefined();
    expect(screen.getByTestId('block-text_label')).toBeDefined();
    expect(screen.getByTestId('block-divider')).toBeDefined();
  });

  it('renders field_display and passes field data via customFields', () => {
    const layout = makeLayout([
      {
        id: 'fd-1',
        type: 'field_display',
        config: { fieldId: 'field-1', size: 'normal', showLabel: true },
      },
    ]);

    const item: ItemWithDetails = {
      ...baseItem,
      custom_field_values: { 'field-1': 'Oak' },
    };

    render(
      <LayoutRenderer
        layout={layout}
        item={item}
        mode="live"
        context="side-panel"
        customFields={baseCustomFields}
      />
    );

    const block = screen.getByTestId('block-field_display');
    expect(block).toBeDefined();
    // The mock renders field.name — "Species" — inside the block
    expect(block.textContent).toBe('Species');
  });

  it('renders rows with children', () => {
    const layout = makeLayout([
      {
        id: 'row-1',
        type: 'row',
        gap: 'normal',
        distribution: 'equal',
        children: [
          makeBlock('status_badge', 'b1') as any,
          makeBlock('divider', 'b2') as any,
        ],
      },
    ]);

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    const row = screen.getByTestId('block-row');
    expect(row).toBeDefined();
    // Children should be inside the row
    expect(screen.getByTestId('block-status_badge')).toBeDefined();
    expect(screen.getByTestId('block-divider')).toBeDefined();
  });

  it('limits blocks in peek state (3 blocks, peekBlockCount=2 → only 2 rendered)', () => {
    const layout = makeLayout(
      [
        makeBlock('status_badge', 'b1'),
        makeBlock('text_label', 'b2'),
        makeBlock('divider', 'b3'),
      ],
      2 // peekBlockCount
    );

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="live"
        context="bottom-sheet"
        sheetState="peek"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-status_badge')).toBeDefined();
    expect(screen.getByTestId('block-text_label')).toBeDefined();
    expect(screen.queryByTestId('block-divider')).toBeNull();
  });

  it('renders all blocks in full state', () => {
    const layout = makeLayout(
      [
        makeBlock('status_badge', 'b1'),
        makeBlock('text_label', 'b2'),
        makeBlock('divider', 'b3'),
      ],
      1 // peekBlockCount — would limit to 1 if peek
    );

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="live"
        context="bottom-sheet"
        sheetState="full"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-status_badge')).toBeDefined();
    expect(screen.getByTestId('block-text_label')).toBeDefined();
    expect(screen.getByTestId('block-divider')).toBeDefined();
  });

  it('skips blocks with unknown type gracefully', () => {
    const layout = makeLayout([
      makeBlock('status_badge', 'b1'),
      makeBlock('unknown_type_xyz', 'b2'),
      makeBlock('divider', 'b3'),
    ]);

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-status_badge')).toBeDefined();
    expect(screen.getByTestId('block-divider')).toBeDefined();
    // unknown block renders nothing — no error thrown
  });

  it('passes permission props to action_buttons block', () => {
    const layout = makeLayout([makeBlock('action_buttons', 'ab1')]);

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
        canEdit={true}
        canAddUpdate={false}
        isAuthenticated={true}
      />
    );

    expect(screen.getByTestId('block-action_buttons')).toBeDefined();
  });

  it('defaults permission props to false when not provided', () => {
    const layout = makeLayout([makeBlock('action_buttons', 'ab1')]);

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-action_buttons')).toBeDefined();
  });

  it('threads canEdit=true to action_buttons block', () => {
    const layout = makeLayout([makeBlock('action_buttons', 'ab1')]);

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
        canEdit={true}
        canAddUpdate={false}
        isAuthenticated={true}
      />
    );

    const block = screen.getByTestId('block-action_buttons');
    expect(block.getAttribute('data-can-edit')).toBe('true');
    expect(block.getAttribute('data-can-add-update')).toBe('false');
    expect(block.getAttribute('data-is-authenticated')).toBe('true');
  });

  it('defaults all permission props to false', () => {
    const layout = makeLayout([makeBlock('action_buttons', 'ab1')]);

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    const block = screen.getByTestId('block-action_buttons');
    expect(block.getAttribute('data-can-edit')).toBe('false');
    expect(block.getAttribute('data-can-add-update')).toBe('false');
    expect(block.getAttribute('data-is-authenticated')).toBe('false');
  });

  it('wraps blocks in clickable containers in edit mode', () => {
    const onBlockSelect = vi.fn();
    const layout = makeLayout([
      makeBlock('status_badge', 'b1'),
      makeBlock('text_label', 'b2'),
    ]);

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="edit"
        context="preview"
        customFields={[]}
        onBlockSelect={onBlockSelect}
      />
    );

    const wrappers = screen.getAllByTestId(/^edit-block-/);
    expect(wrappers).toHaveLength(2);
    expect(wrappers[0].dataset.testid).toBe('edit-block-b1');
    expect(wrappers[1].dataset.testid).toBe('edit-block-b2');
  });

  it('calls onBlockSelect when a block is clicked in edit mode', async () => {
    const user = userEvent.setup();
    const onBlockSelect = vi.fn();
    const layout = makeLayout([makeBlock('status_badge', 'b1')]);

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="edit"
        context="preview"
        customFields={[]}
        onBlockSelect={onBlockSelect}
      />
    );

    await user.click(screen.getByTestId('edit-block-b1'));
    expect(onBlockSelect).toHaveBeenCalledWith('b1');
  });

  it('calls onBlockSelect(null) when clicking the already-selected block', async () => {
    const user = userEvent.setup();
    const onBlockSelect = vi.fn();
    const layout = makeLayout([makeBlock('status_badge', 'b1')]);

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="edit"
        context="preview"
        customFields={[]}
        selectedBlockId="b1"
        onBlockSelect={onBlockSelect}
      />
    );

    await user.click(screen.getByTestId('edit-block-b1'));
    expect(onBlockSelect).toHaveBeenCalledWith(null);
  });

  it('applies highlight ring to the selected block', () => {
    const layout = makeLayout([
      makeBlock('status_badge', 'b1'),
      makeBlock('text_label', 'b2'),
    ]);

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="edit"
        context="preview"
        customFields={[]}
        selectedBlockId="b1"
        onBlockSelect={vi.fn()}
      />
    );

    const selected = screen.getByTestId('edit-block-b1');
    expect(selected.className).toContain('ring-2');

    const unselected = screen.getByTestId('edit-block-b2');
    expect(unselected.className).not.toContain('ring-2');
  });

  it('does not wrap blocks in clickable containers in preview mode', () => {
    const layout = makeLayout([makeBlock('status_badge', 'b1')]);

    render(
      <LayoutRenderer
        layout={layout}
        item={baseItem}
        mode="preview"
        context="preview"
        customFields={[]}
      />
    );

    expect(screen.queryByTestId('edit-block-b1')).toBeNull();
  });
});
