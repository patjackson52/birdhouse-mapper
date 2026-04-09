import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  useDraggable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  })),
}));

vi.mock('../../LayoutRendererV2', () => ({
  renderBlockContent: vi.fn((block: { type: string }) => (
    <div data-testid={`block-${block.type}`}>{block.type}</div>
  )),
}));

vi.mock('@/lib/permissions/hooks', () => ({
  usePermissions: () => ({ userBaseRole: 'admin' }),
}));

import EditableLayoutRenderer from '../EditableLayoutRenderer';
import type { TypeLayoutV2 } from '@/lib/layout/types-v2';
import type { ItemWithDetails, CustomField } from '@/lib/types';

const mockLayout: TypeLayoutV2 = {
  version: 2,
  blocks: [
    { id: 'b1', type: 'status_badge', config: {} },
    { id: 'b2', type: 'divider', config: {} },
  ],
  spacing: 'comfortable',
  peekBlockCount: 3,
};

const mockItem = { id: '1', name: 'Test', status: 'active' } as unknown as ItemWithDetails;
const mockFields: CustomField[] = [];

describe('EditableLayoutRenderer', () => {
  it('renders blocks wrapped in editable containers', () => {
    const { container } = render(
      <EditableLayoutRenderer
        layout={mockLayout}
        item={mockItem}
        customFields={mockFields}
        selectedBlockId={null}
        isDragActive={false}
        onSelect={vi.fn()}
        onOpenConfig={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByTestId('block-status_badge')).toBeInTheDocument();
    expect(screen.getByTestId('block-divider')).toBeInTheDocument();
    expect(container.querySelector('[data-block-id="b1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-block-id="b2"]')).toBeInTheDocument();
  });

  it('renders vertical drop zones between blocks when drag is active', () => {
    const { container } = render(
      <EditableLayoutRenderer
        layout={mockLayout}
        item={mockItem}
        customFields={mockFields}
        selectedBlockId={null}
        isDragActive={true}
        onSelect={vi.fn()}
        onOpenConfig={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    // 2 blocks = 3 drop zones (before, between, after)
    const dropZones = container.querySelectorAll('[style*="height: 4px"]');
    expect(dropZones.length).toBe(3);
  });
});
