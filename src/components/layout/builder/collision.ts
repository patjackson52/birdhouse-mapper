import type { ClientRect, CollisionDetection, CollisionDescriptor, DroppableContainer, UniqueIdentifier } from '@dnd-kit/core';

/**
 * Row-aware collision detection. When the pointer is inside a row's bounding box,
 * row-internal drop zones are prioritized. Otherwise falls back to closest top-level zone.
 */
export const rowAwareCollision: CollisionDetection = ({
  active,
  droppableContainers,
  droppableRects,
  pointerCoordinates,
}) => {
  if (!pointerCoordinates || droppableContainers.length === 0) return [];

  const { x, y } = pointerCoordinates;
  const activeData = active?.data?.current as Record<string, unknown> | undefined;
  const isDraggingRow = activeData?.isRow === true;

  // Separate zones into three categories
  const sideZones: DroppableContainer[] = [];
  const rowZones: DroppableContainer[] = [];
  const topLevelZones: DroppableContainer[] = [];

  for (const container of droppableContainers) {
    const data = container.data?.current as Record<string, unknown> | undefined;
    if (!data) continue;
    if (data.zone === 'side') {
      sideZones.push(container);
    } else if (data.zone === 'row') {
      rowZones.push(container);
    } else if (data.zone === 'top-level') {
      topLevelZones.push(container);
    }
  }

  // Highest priority: check if pointer is inside any side zone rect
  if (!isDraggingRow) {
    for (const container of sideZones) {
      const rect = droppableRects.get(container.id);
      if (!rect) continue;

      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return [{ id: container.id, data: { droppableContainer: container, value: 0 } }];
      }
    }
  }

  // If dragging a row, skip row-internal zones entirely (no nested rows)
  if (!isDraggingRow) {
    // Check if pointer is inside any row bounding box
    for (const container of droppableContainers) {
      const data = container.data?.current as Record<string, unknown> | undefined;
      if (data?.zone !== 'row-bounds') continue;

      const rect = droppableRects.get(container.id);
      if (!rect) continue;

      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const rowId = data.rowId as string;
        const candidates = rowZones.filter((z) => {
          const zData = z.data?.current as Record<string, unknown>;
          return zData.rowId === rowId;
        });

        if (candidates.length > 0) {
          return closestByDistance(candidates, droppableRects, pointerCoordinates);
        }
      }
    }
  }

  // Fall back to top-level zones
  return closestByDistance(topLevelZones, droppableRects, pointerCoordinates);
};

function closestByDistance(
  containers: DroppableContainer[],
  rects: Map<UniqueIdentifier, ClientRect>,
  pointer: { x: number; y: number },
): CollisionDescriptor[] {
  const results: CollisionDescriptor[] = [];

  for (const container of containers) {
    const rect = rects.get(container.id);
    if (!rect) continue;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.sqrt((pointer.x - centerX) ** 2 + (pointer.y - centerY) ** 2);

    results.push({ id: container.id, data: { droppableContainer: container, value: distance } });
  }

  results.sort((a, b) => (a.data.value as number) - (b.data.value as number));
  return results;
}
