import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LayoutEditor from '../LayoutEditor';
import type { TypeLayoutV2 } from '@/lib/layout/types-v2';
import type { ItemType } from '@/lib/types';

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  useDraggable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  })),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  useDndMonitor: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: vi.fn(),
  sortableKeyboardCoordinates: vi.fn(),
}));

vi.mock('@/lib/permissions/hooks', () => ({
  usePermissions: () => ({ userBaseRole: 'admin' }),
}));

const mockLayout: TypeLayoutV2 = {
  version: 2,
  blocks: [
    { id: 'b1', type: 'status_badge', config: {} },
    { id: 'b2', type: 'divider', config: {} },
  ],
  spacing: 'comfortable',
  peekBlockCount: 3,
};

const defaultProps = {
  itemType: { id: 't1', name: 'Bird', icon: '🐦', color: '#4a7c59', sort_order: 0, layout: null, created_at: '', org_id: 'o1' } as ItemType,
  initialLayout: mockLayout,
  customFields: [],
  entityTypes: [],
  onSave: vi.fn(),
  onCancel: vi.fn(),
};

describe('LayoutEditor', () => {
  it('renders with edit/preview toggle', () => {
    render(<LayoutEditor {...defaultProps} />);
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('shows save and cancel buttons', () => {
    render(<LayoutEditor {...defaultProps} />);
    expect(screen.getByText('Save Layout')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onCancel when Cancel clicked', () => {
    const onCancel = vi.fn();
    render(<LayoutEditor {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows Edit, Preview, and Form view toggle buttons', () => {
    render(<LayoutEditor {...defaultProps} />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByText('Form')).toBeInTheDocument();
  });

  it('shows component sidebar in edit mode', () => {
    render(<LayoutEditor {...defaultProps} />);
    // LayoutEditor starts in edit mode (isEditing defaults to true)
    // Component sidebar should be visible with palette items
    expect(screen.getByText('Field')).toBeInTheDocument();
    expect(screen.getByText('Photo')).toBeInTheDocument();
  });

  it('hides component sidebar in preview mode', () => {
    render(<LayoutEditor {...defaultProps} />);
    fireEvent.click(screen.getByText('Preview'));
    // Component sidebar should be hidden
    expect(screen.queryByText('Field')).not.toBeInTheDocument();
  });
});
