import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TypeLayoutV2, LayoutNodeV2 } from '@/lib/layout/types-v2';
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

vi.mock('@/components/layout/blocks/RowBlockV2', () => ({
  default: ({ children }: { children: React.ReactNode[] }) => (
    <div data-testid="block-row">{children}</div>
  ),
}));

vi.mock('@/components/layout/blocks/DescriptionBlock', () => ({
  default: ({ description }: { description: string | null }) => (
    <div data-testid="block-description">{description}</div>
  ),
}));

const mockUserBaseRole = vi.fn(() => 'viewer');
vi.mock('@/lib/permissions/hooks', () => ({
  usePermissions: () => ({
    permissions: {},
    userBaseRole: mockUserBaseRole(),
    loading: false,
  }),
}));

import LayoutRendererV2 from '../LayoutRendererV2';

// =====================
// Shared test data helpers
// =====================

function makeBlock(type: string, id = `block-${type}`, permissions?: { requiredRole?: 'viewer' | 'editor' | 'admin' }): LayoutNodeV2 {
  return {
    id,
    type: type as any,
    config: {} as any,
    ...(permissions ? { permissions } : {}),
  };
}

function makeLayout(blocks: LayoutNodeV2[], peekBlockCount = 2): TypeLayoutV2 {
  return {
    version: 2,
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
};

// =====================
// Tests
// =====================

describe('LayoutRendererV2', () => {
  it('renders blocks in order (status_badge, text_label, divider)', () => {
    const layout = makeLayout([
      makeBlock('status_badge', 'b1'),
      makeBlock('text_label', 'b2'),
      makeBlock('divider', 'b3'),
    ]);

    render(
      <LayoutRendererV2
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

  it('renders description block with item.description', () => {
    const layout = makeLayout([
      makeBlock('description', 'desc-1'),
    ]);

    const item: ItemWithDetails = {
      ...baseItem,
      description: 'A lovely birdhouse',
    };

    render(
      <LayoutRendererV2
        layout={layout}
        item={item}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    const block = screen.getByTestId('block-description');
    expect(block).toBeDefined();
    expect(block.textContent).toBe('A lovely birdhouse');
  });

  it('hides description block when hideWhenEmpty and item.description is null', () => {
    const layout = makeLayout([
      {
        id: 'desc-1',
        type: 'description',
        config: { showLabel: false },
        hideWhenEmpty: true,
      },
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.queryByTestId('block-description')).toBeNull();
  });

  it('hides blocks with insufficient permissions (viewer cannot see admin blocks)', () => {
    mockUserBaseRole.mockReturnValue('viewer');

    const layout = makeLayout([
      makeBlock('status_badge', 'b1'),
      makeBlock('divider', 'b2', { requiredRole: 'admin' }),
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-status_badge')).toBeDefined();
    expect(screen.queryByTestId('block-divider')).toBeNull();
  });

  it('shows blocks when user has sufficient role (admin can see editor blocks)', () => {
    mockUserBaseRole.mockReturnValue('org_admin');

    const layout = makeLayout([
      makeBlock('status_badge', 'b1'),
      makeBlock('divider', 'b2', { requiredRole: 'editor' }),
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-status_badge')).toBeDefined();
    expect(screen.getByTestId('block-divider')).toBeDefined();
  });

  it('renders rows with children', () => {
    const layout = makeLayout([
      {
        id: 'row-1',
        type: 'row',
        gap: 'normal',
        children: [
          makeBlock('status_badge', 'b1') as any,
          makeBlock('divider', 'b2') as any,
        ],
      },
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    const row = screen.getByTestId('block-row');
    expect(row).toBeDefined();
    expect(screen.getByTestId('block-status_badge')).toBeDefined();
    expect(screen.getByTestId('block-divider')).toBeDefined();
  });

  it('hides entire row when row has insufficient permissions', () => {
    mockUserBaseRole.mockReturnValue('viewer');

    const layout = makeLayout([
      makeBlock('status_badge', 'b1'),
      {
        id: 'row-1',
        type: 'row',
        gap: 'normal',
        permissions: { requiredRole: 'admin' },
        children: [
          makeBlock('divider', 'b2') as any,
        ],
      },
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-status_badge')).toBeDefined();
    expect(screen.queryByTestId('block-row')).toBeNull();
    expect(screen.queryByTestId('block-divider')).toBeNull();
  });

  it('limits blocks in peek state (3 blocks, peekBlockCount=2 → only 2 rendered)', () => {
    mockUserBaseRole.mockReturnValue('viewer');

    const layout = makeLayout(
      [
        makeBlock('status_badge', 'b1'),
        makeBlock('text_label', 'b2'),
        makeBlock('divider', 'b3'),
      ],
      2 // peekBlockCount
    );

    render(
      <LayoutRendererV2
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

  it('viewer can see viewer-required blocks', () => {
    mockUserBaseRole.mockReturnValue('viewer');

    const layout = makeLayout([
      makeBlock('status_badge', 'b1', { requiredRole: 'viewer' }),
      makeBlock('divider', 'b2'),
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-status_badge')).toBeDefined();
    expect(screen.getByTestId('block-divider')).toBeDefined();
  });

  it('viewer cannot see editor-required blocks', () => {
    mockUserBaseRole.mockReturnValue('viewer');

    const layout = makeLayout([
      makeBlock('status_badge', 'b1', { requiredRole: 'editor' }),
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.queryByTestId('block-status_badge')).toBeNull();
  });

  it('contributor can see editor-required blocks', () => {
    mockUserBaseRole.mockReturnValue('contributor');

    const layout = makeLayout([
      makeBlock('status_badge', 'b1', { requiredRole: 'editor' }),
    ]);

    render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(screen.getByTestId('block-status_badge')).toBeDefined();
  });

  it('applies max-width to top-level block with width set', () => {
    const layout = makeLayout([
      { ...makeBlock('status_badge', 'b1'), width: '1/2' } as LayoutNodeV2,
    ]);

    const { container } = render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    const wrapper = container.querySelector('[data-block-width]');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.getAttribute('data-block-width')).toBe('1/2');
    expect((wrapper as HTMLElement).style.maxWidth).toBe('50%');
  });

  it('applies center alignment to top-level block with align=center', () => {
    const layout = makeLayout([
      { ...makeBlock('status_badge', 'b1'), width: '1/3', align: 'center' } as LayoutNodeV2,
    ]);

    const { container } = render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    const wrapper = container.querySelector('[data-block-width]');
    expect(wrapper).not.toBeNull();
    expect((wrapper as HTMLElement).style.justifyContent).toBe('center');
  });

  it('applies end alignment to top-level block with align=end', () => {
    const layout = makeLayout([
      { ...makeBlock('status_badge', 'b1'), width: '1/4', align: 'end' } as LayoutNodeV2,
    ]);

    const { container } = render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    const wrapper = container.querySelector('[data-block-width]');
    expect((wrapper as HTMLElement).style.justifyContent).toBe('flex-end');
  });

  it('does not apply width wrapper when width is full', () => {
    const layout = makeLayout([
      { ...makeBlock('status_badge', 'b1'), width: 'full' } as LayoutNodeV2,
    ]);

    const { container } = render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(container.querySelector('[data-block-width]')).toBeNull();
  });

  it('does not apply width wrapper to blocks inside rows', () => {
    const layout = makeLayout([
      {
        id: 'row-1',
        type: 'row',
        gap: 'normal',
        children: [
          { ...makeBlock('status_badge', 'b1'), width: '1/2' } as any,
          makeBlock('divider', 'b2') as any,
        ],
      },
    ]);

    const { container } = render(
      <LayoutRendererV2
        layout={layout}
        item={baseItem}
        mode="live"
        context="side-panel"
        customFields={[]}
      />
    );

    expect(container.querySelector('[data-block-width]')).toBeNull();
  });
});
