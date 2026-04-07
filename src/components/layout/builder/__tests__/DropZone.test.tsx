import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DropZone from '../DropZone';

// Mock useDroppable from @dnd-kit/core
vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn().mockReturnValue({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
}));

describe('DropZone', () => {
  it('renders with collapsed height when not hovered', () => {
    const { container } = render(
      <DropZone id="drop-0" data={{ zone: 'top-level', index: 0 }} direction="vertical" />
    );
    const zone = container.firstChild as HTMLElement;
    expect(zone).toBeTruthy();
    expect(zone.style.height).toBe('8px');
  });

  it('renders with expanded height when isOver is true', async () => {
    const { useDroppable } = await import('@dnd-kit/core');
    (useDroppable as ReturnType<typeof vi.fn>).mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: true,
    });

    const { container } = render(
      <DropZone id="drop-1" data={{ zone: 'top-level', index: 1 }} direction="vertical" />
    );
    const zone = container.firstChild as HTMLElement;
    expect(zone.style.height).toBe('80px');
  });

  it('uses width for horizontal direction', async () => {
    const { useDroppable } = await import('@dnd-kit/core');
    (useDroppable as ReturnType<typeof vi.fn>).mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: true,
    });

    const { container } = render(
      <DropZone id="drop-row-0" data={{ zone: 'row', rowId: 'r1', index: 0 }} direction="horizontal" />
    );
    const zone = container.firstChild as HTMLElement;
    expect(zone.style.width).toBe('80px');
  });
});
