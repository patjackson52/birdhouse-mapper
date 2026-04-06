import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlockPalette from '../BlockPalette';

// Mock @dnd-kit/core
const mockUseDraggable = vi.fn().mockReturnValue({
  attributes: { role: 'button', tabIndex: 0 },
  listeners: {},
  setNodeRef: vi.fn(),
  isDragging: false,
});

vi.mock('@dnd-kit/core', () => ({
  useDraggable: (...args: unknown[]) => mockUseDraggable(...args),
}));

describe('BlockPalette', () => {
  beforeEach(() => {
    mockUseDraggable.mockClear();
    mockUseDraggable.mockReturnValue({
      attributes: { role: 'button', tabIndex: 0 },
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: false,
    });
  });

  it('renders all block type chips', () => {
    render(<BlockPalette />);

    expect(screen.getByText('Field')).toBeTruthy();
    expect(screen.getByText('Photo')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Row')).toBeTruthy();
    expect(screen.getByText('Timeline')).toBeTruthy();
  });

  it('passes block type data to useDraggable', () => {
    render(<BlockPalette />);

    // useDraggable should be called once per palette item (10 items)
    expect(mockUseDraggable).toHaveBeenCalledTimes(10);

    // Check one call has the right structure
    const firstCall = mockUseDraggable.mock.calls[0][0];
    expect(firstCall.id).toMatch(/^palette-/);
    expect(firstCall.data).toHaveProperty('type');
  });

  it('dims chip when isDragging is true', () => {
    mockUseDraggable.mockReturnValue({
      attributes: { role: 'button', tabIndex: 0 },
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: true,
    });

    const { container } = render(<BlockPalette />);
    const chips = container.querySelectorAll('[role="button"]');
    expect(chips.length).toBeGreaterThan(0);
  });

  it('chips have aria-label for accessibility', () => {
    mockUseDraggable.mockReturnValue({
      attributes: { role: 'button', tabIndex: 0, 'aria-label': 'Drag to add Field' },
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: false,
    });

    render(<BlockPalette />);
    const chips = screen.getAllByRole('button');
    expect(chips.length).toBe(10);
  });
});
