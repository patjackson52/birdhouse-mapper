import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ComponentDrawer from '../ComponentDrawer';

vi.mock('@dnd-kit/core', () => ({
  useDraggable: vi.fn(() => ({
    attributes: { role: 'button', tabIndex: 0 },
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  })),
  useDndMonitor: vi.fn(),
}));

describe('ComponentDrawer', () => {
  const defaultProps = {
    isMobile: false,
    disabledTypes: new Set<string>(),
    onQuickAdd: vi.fn(),
  };

  it('renders vertical sidebar on desktop with all block types except Row', () => {
    render(<ComponentDrawer {...defaultProps} isMobile={false} />);
    expect(screen.getByText('Field')).toBeInTheDocument();
    expect(screen.getByText('Photo')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.queryByText('Row')).not.toBeInTheDocument();
  });

  it('renders FAB on mobile', () => {
    render(<ComponentDrawer {...defaultProps} isMobile={true} />);
    expect(screen.getByLabelText('Add component')).toBeInTheDocument();
  });

  it('expands mobile drawer on FAB tap', () => {
    render(<ComponentDrawer {...defaultProps} isMobile={true} />);
    fireEvent.click(screen.getByLabelText('Add component'));
    expect(screen.getByText('Field')).toBeInTheDocument();
    expect(screen.getByText('Add Component')).toBeInTheDocument();
  });

  it('calls onQuickAdd when chip tapped on mobile', () => {
    const onQuickAdd = vi.fn();
    render(<ComponentDrawer {...defaultProps} isMobile={true} onQuickAdd={onQuickAdd} />);
    fireEvent.click(screen.getByLabelText('Add component'));
    fireEvent.click(screen.getByText('Divider'));
    expect(onQuickAdd).toHaveBeenCalledWith('divider');
  });

  it('disables description chip when in disabledTypes', () => {
    render(<ComponentDrawer {...defaultProps} disabledTypes={new Set(['description'])} />);
    const descChip = screen.getByText('Description').closest('[aria-label]');
    expect(descChip?.className).toContain('opacity-40');
  });
});
