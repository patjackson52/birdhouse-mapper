import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EditableBlock from '../EditableBlock';

const mockUseDraggable = vi.fn(() => ({
  attributes: { role: 'button', tabIndex: 0 },
  listeners: {},
  setNodeRef: vi.fn(),
  isDragging: false,
}));

vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  useDraggable: () => mockUseDraggable(),
}));

describe('EditableBlock', () => {
  const defaultProps = {
    blockId: 'block-1',
    blockIndex: 0,
    isInRow: false,
    isSelected: false,
    isDragDisabled: false,
    rowChildCount: 0,
    onSelect: vi.fn(),
    onOpenConfig: vi.fn(),
    onDelete: vi.fn(),
    children: <div data-testid="block-content">Content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDraggable.mockReturnValue({
      attributes: { role: 'button', tabIndex: 0 },
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: false,
    });
  });

  it('renders children', () => {
    render(<EditableBlock {...defaultProps} />);
    expect(screen.getByTestId('block-content')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(<EditableBlock {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('block-content').closest('[data-block-id]')!);
    expect(onSelect).toHaveBeenCalledWith('block-1');
  });

  it('shows selected border when isSelected', () => {
    const { container } = render(<EditableBlock {...defaultProps} isSelected={true} />);
    const wrapper = container.querySelector('[data-block-id]');
    expect(wrapper?.className).toContain('border-forest');
  });

  it('shows hover border when not selected', () => {
    const { container } = render(<EditableBlock {...defaultProps} />);
    const wrapper = container.querySelector('[data-block-id]');
    expect(wrapper?.className).toContain('hover:border-sage/40');
  });

  it('reduces opacity when dragging', () => {
    mockUseDraggable.mockReturnValueOnce({
      attributes: { role: 'button', tabIndex: 0 },
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: true,
    });
    const { container } = render(<EditableBlock {...defaultProps} />);
    const wrapper = container.querySelector('[data-block-id]');
    expect(wrapper?.className).toContain('opacity-25');
  });

  it('shows BlockToolbar when selected', () => {
    render(<EditableBlock {...defaultProps} isSelected={true} />);
    expect(screen.getByLabelText('Configure block')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete block')).toBeInTheDocument();
  });

  it('does not show BlockToolbar when not selected', () => {
    render(<EditableBlock {...defaultProps} isSelected={false} />);
    expect(screen.queryByLabelText('Configure block')).not.toBeInTheDocument();
  });

  it('includes side drop zones', () => {
    const { container } = render(<EditableBlock {...defaultProps} />);
    const sideZones = container.querySelectorAll('[style*="position: absolute"]');
    expect(sideZones.length).toBe(2);
  });
});
