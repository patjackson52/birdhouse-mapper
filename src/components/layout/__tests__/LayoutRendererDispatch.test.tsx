import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/layout/LayoutRenderer', () => ({
  default: () => <div data-testid="v1-renderer" />,
}));

vi.mock('@/components/layout/LayoutRendererV2', () => ({
  default: () => <div data-testid="v2-renderer" />,
}));

import LayoutRendererDispatch from '../LayoutRendererDispatch';

const baseProps = {
  item: {
    id: 'item-1', name: 'Test', description: null, latitude: 0, longitude: 0,
    item_type_id: 't1', custom_field_values: {}, status: 'active' as const,
    created_at: '', updated_at: '', created_by: null, org_id: 'o1', property_id: 'p1',
    item_type: { id: 't1', name: 'T', icon: '', color: '', sort_order: 0, layout: null, created_at: '', org_id: 'o1' },
    updates: [], photos: [], custom_fields: [], entities: [],
  },
  mode: 'live' as const,
  context: 'side-panel' as const,
  customFields: [],
};

describe('LayoutRendererDispatch', () => {
  it('renders v1 renderer for version 1 layouts', () => {
    const layout = { version: 1 as const, blocks: [], spacing: 'comfortable' as const, peekBlockCount: 2 };
    render(<LayoutRendererDispatch layout={layout} {...baseProps} />);
    expect(screen.getByTestId('v1-renderer')).toBeDefined();
    expect(screen.queryByTestId('v2-renderer')).toBeNull();
  });

  it('renders v2 renderer for version 2 layouts', () => {
    const layout = { version: 2 as const, blocks: [], spacing: 'comfortable' as const, peekBlockCount: 2 };
    render(<LayoutRendererDispatch layout={layout} {...baseProps} />);
    expect(screen.getByTestId('v2-renderer')).toBeDefined();
    expect(screen.queryByTestId('v1-renderer')).toBeNull();
  });

  it('defaults to v1 renderer when version is missing', () => {
    const layout = { blocks: [], spacing: 'comfortable' as const, peekBlockCount: 2 } as any;
    render(<LayoutRendererDispatch layout={layout} {...baseProps} />);
    expect(screen.getByTestId('v1-renderer')).toBeDefined();
  });
});
