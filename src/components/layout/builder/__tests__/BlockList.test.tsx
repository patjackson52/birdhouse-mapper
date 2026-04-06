import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlockList from '../BlockList';
import type { LayoutNode, LayoutRow } from '@/lib/layout/types';
import type { CustomField, EntityType } from '@/lib/types';

// Mock @dnd-kit to avoid JSDOM layout issues
vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn().mockReturnValue({ setNodeRef: vi.fn(), isOver: false }),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
  useSortable: vi.fn().mockReturnValue({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

const baseProps = {
  customFields: [] as CustomField[],
  entityTypes: [] as EntityType[],
  peekBlockCount: 3,
  activeType: null as 'block' | 'row' | null,
  onConfigChange: vi.fn(),
  onDeleteBlock: vi.fn(),
  onCreateField: vi.fn(),
  onPeekCountChange: vi.fn(),
  onRowChange: vi.fn(),
  onRemoveFromRow: vi.fn(),
};

describe('BlockList', () => {
  it('renders blocks and drop zones', () => {
    const nodes: LayoutNode[] = [
      { id: 'b1', type: 'status_badge', config: {} },
      { id: 'b2', type: 'divider', config: {} },
    ];

    render(<BlockList {...baseProps} nodes={nodes} />);

    expect(screen.getByText('Status Badge')).toBeTruthy();
    expect(screen.getByText('Divider')).toBeTruthy();
  });

  it('renders rows with RowEditor', () => {
    const nodes: LayoutNode[] = [
      {
        id: 'r1',
        type: 'row',
        children: [
          { id: 'b1', type: 'status_badge', config: {} },
          { id: 'b2', type: 'divider', config: {} },
        ],
        gap: 'normal',
        distribution: 'equal',
      } as LayoutRow,
    ];

    render(<BlockList {...baseProps} nodes={nodes} />);

    expect(screen.getByText(/Row \(2 columns/)).toBeTruthy();
  });
});
