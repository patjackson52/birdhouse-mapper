import { describe, it, expect } from 'vitest';
import { rowAwareCollision } from '../collision';
import type { DroppableContainer, CollisionDescriptor } from '@dnd-kit/core';

function makeRect(x: number, y: number, w: number, h: number): DOMRect {
  return { x, y, width: w, height: h, top: y, left: x, bottom: y + h, right: x + w, toJSON: () => ({}) } as DOMRect;
}

function makeContainer(id: string, rect: DOMRect, data?: Record<string, unknown>): DroppableContainer {
  return {
    id,
    rect: { current: rect },
    data: { current: data ?? {} },
    disabled: false,
    node: { current: null },
  } as unknown as DroppableContainer;
}

describe('rowAwareCollision', () => {
  it('returns closest top-level drop zone by vertical distance', () => {
    const containers = [
      makeContainer('drop-top-0', makeRect(0, 0, 400, 20), { zone: 'top-level', index: 0 }),
      makeContainer('drop-top-1', makeRect(0, 120, 400, 20), { zone: 'top-level', index: 1 }),
      makeContainer('drop-top-2', makeRect(0, 240, 400, 20), { zone: 'top-level', index: 2 }),
    ];

    const result = rowAwareCollision({
      active: { id: 'drag-1', rect: { current: { initial: makeRect(0, 115, 400, 60), translated: makeRect(0, 115, 400, 60) } }, data: { current: {} } },
      collisionRect: makeRect(0, 115, 400, 60),
      droppableRects: new Map(containers.map((c) => [c.id, c.rect.current!])),
      droppableContainers: containers,
      pointerCoordinates: { x: 200, y: 130 },
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('drop-top-1');
  });

  it('returns empty array when no containers exist', () => {
    const result = rowAwareCollision({
      active: { id: 'drag-1', rect: { current: { initial: makeRect(0, 0, 400, 60), translated: makeRect(0, 0, 400, 60) } }, data: { current: {} } },
      collisionRect: makeRect(0, 0, 400, 60),
      droppableRects: new Map(),
      droppableContainers: [],
      pointerCoordinates: { x: 200, y: 30 },
    });

    expect(result).toEqual([]);
  });

  it('prioritizes row-internal zones when pointer is inside row bounds', () => {
    const containers = [
      makeContainer('drop-top-0', makeRect(0, 0, 400, 20), { zone: 'top-level', index: 0 }),
      makeContainer('drop-top-1', makeRect(0, 200, 400, 20), { zone: 'top-level', index: 1 }),
      makeContainer('row-bounds-r1', makeRect(0, 50, 400, 100), { zone: 'row-bounds', rowId: 'r1' }),
      makeContainer('drop-row-r1-0', makeRect(0, 60, 20, 80), { zone: 'row', rowId: 'r1', index: 0 }),
      makeContainer('drop-row-r1-1', makeRect(190, 60, 20, 80), { zone: 'row', rowId: 'r1', index: 1 }),
      makeContainer('drop-row-r1-2', makeRect(380, 60, 20, 80), { zone: 'row', rowId: 'r1', index: 2 }),
    ];

    const result = rowAwareCollision({
      active: { id: 'drag-1', rect: { current: { initial: makeRect(0, 80, 100, 60), translated: makeRect(0, 80, 100, 60) } }, data: { current: {} } },
      collisionRect: makeRect(0, 80, 100, 60),
      droppableRects: new Map(containers.map((c) => [c.id, c.rect.current!])),
      droppableContainers: containers,
      pointerCoordinates: { x: 200, y: 100 },
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('drop-row-r1-1');
  });

  it('ignores row-internal zones for rows being dragged (no nested rows)', () => {
    const containers = [
      makeContainer('drop-top-0', makeRect(0, 0, 400, 20), { zone: 'top-level', index: 0 }),
      makeContainer('row-bounds-r1', makeRect(0, 50, 400, 100), { zone: 'row-bounds', rowId: 'r1' }),
      makeContainer('drop-row-r1-0', makeRect(0, 60, 20, 80), { zone: 'row', rowId: 'r1', index: 0 }),
    ];

    const result = rowAwareCollision({
      active: { id: 'drag-row', rect: { current: { initial: makeRect(0, 80, 400, 60), translated: makeRect(0, 80, 400, 60) } }, data: { current: { isRow: true } } },
      collisionRect: makeRect(0, 80, 400, 60),
      droppableRects: new Map(containers.map((c) => [c.id, c.rect.current!])),
      droppableContainers: containers,
      pointerCoordinates: { x: 200, y: 100 },
    });

    expect(result.length).toBeGreaterThan(0);
  });
});
