import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SideDropZone from '../SideDropZone';
import * as dndCore from '@dnd-kit/core';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn(() => ({
    setNodeRef: vi.fn(),
    isOver: false,
  })),
}));

const mockUseDroppable = vi.mocked(dndCore.useDroppable);

describe('SideDropZone', () => {
  it('renders with correct side data', () => {
    render(
      <SideDropZone
        id="side-left-block1"
        side="left"
        parentBlockId="block1"
        parentBlockIndex={0}
        isInRow={false}
        disabled={false}
      />
    );
    expect(mockUseDroppable).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'side-left-block1',
        data: {
          zone: 'side',
          side: 'left',
          blockId: 'block1',
          blockIndex: 0,
          isInRow: false,
        },
        disabled: false,
      })
    );
  });

  it('has 20px width and absolute position', () => {
    const { container } = render(
      <SideDropZone
        id="side-right-block1"
        side="right"
        parentBlockId="block1"
        parentBlockIndex={0}
        isInRow={false}
        disabled={false}
      />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('20px');
    expect(el.style.position).toBe('absolute');
  });

  it('is positioned on the correct side', () => {
    const { container: leftContainer } = render(
      <SideDropZone id="side-left-b1" side="left" parentBlockId="b1" parentBlockIndex={0} isInRow={false} disabled={false} />
    );
    expect((leftContainer.firstChild as HTMLElement).style.left).toBe('0px');

    const { container: rightContainer } = render(
      <SideDropZone id="side-right-b1" side="right" parentBlockId="b1" parentBlockIndex={0} isInRow={false} disabled={false} />
    );
    expect((rightContainer.firstChild as HTMLElement).style.right).toBe('0px');
  });

  it('shows highlight when hovered', () => {
    mockUseDroppable.mockReturnValueOnce({ setNodeRef: vi.fn(), isOver: true } as unknown as ReturnType<typeof dndCore.useDroppable>);
    const { container } = render(
      <SideDropZone id="side-left-b1" side="left" parentBlockId="b1" parentBlockIndex={0} isInRow={false} disabled={false} />
    );
    expect((container.firstChild as HTMLElement).className).toContain('bg-forest/10');
  });
});
