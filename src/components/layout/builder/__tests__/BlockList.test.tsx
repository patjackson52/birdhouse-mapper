import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlockList from '../BlockList';
import type { LayoutNode, LayoutBlock, LayoutRow } from '@/lib/layout/types';
import type { CustomField, EntityType, ItemWithDetails } from '@/lib/types';

// Mock @dnd-kit to avoid JSDOM layout issues
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
  useDroppable: vi.fn().mockReturnValue({ setNodeRef: vi.fn(), isOver: false }),
  useSensor: vi.fn().mockReturnValue({}),
  useSensors: vi.fn().mockReturnValue([]),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
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

const mockItem = {
  id: '1',
  name: 'Test Item',
  status: 'active',
  custom_field_values: {},
  photos: [],
  entities: [],
  updates: [],
  latitude: 0,
  longitude: 0,
} as unknown as ItemWithDetails;

const baseProps = {
  customFields: [] as CustomField[],
  entityTypes: [] as EntityType[],
  peekBlockCount: 3,
  mockItem,
  onDrop: vi.fn(),
  onReorder: vi.fn(),
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

  it('renders drag overlay container', () => {
    render(<BlockList {...baseProps} nodes={[]} />);

    expect(screen.getByTestId('drag-overlay')).toBeTruthy();
  });
});
