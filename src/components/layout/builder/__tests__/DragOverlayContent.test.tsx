import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DragOverlayContent from '../DragOverlayContent';
import type { LayoutBlock, LayoutRow, TypeLayout } from '@/lib/layout/types';
import type { CustomField, ItemWithDetails } from '@/lib/types';

// Mock LayoutRenderer to avoid rendering real blocks
vi.mock('@/components/layout/LayoutRenderer', () => ({
  default: ({ layout }: { layout: TypeLayout }) => (
    <div data-testid="layout-renderer">{layout.blocks.length} blocks</div>
  ),
}));

const mockFields: CustomField[] = [];

const mockItem = {
  id: '1',
  name: 'Test',
  status: 'active',
  custom_field_values: {},
  photos: [],
  entities: [],
  updates: [],
} as unknown as ItemWithDetails;

describe('DragOverlayContent', () => {
  it('renders a block with opacity 0.7', () => {
    const block: LayoutBlock = { id: 'b1', type: 'status_badge', config: {} };

    const { container } = render(
      <DragOverlayContent
        node={block}
        customFields={mockFields}
        mockItem={mockItem}
      />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('0.7');
    expect(screen.getByTestId('layout-renderer')).toBeTruthy();
  });

  it('renders a row with all its children', () => {
    const row: LayoutRow = {
      id: 'r1',
      type: 'row',
      children: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'divider', config: {} },
      ],
      gap: 'normal',
      distribution: 'equal',
    };

    render(
      <DragOverlayContent
        node={row}
        customFields={mockFields}
        mockItem={mockItem}
      />
    );

    expect(screen.getByText('1 blocks')).toBeTruthy();
  });
});
