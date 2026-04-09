import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import RowBlockV2 from '../RowBlockV2';
import type { LayoutRowV2 } from '@/lib/layout/types-v2';

describe('RowBlockV2', () => {
  const baseRow: LayoutRowV2 = {
    id: 'r1',
    type: 'row',
    children: [
      { id: 'b1', type: 'status_badge', config: {}, width: '1/3' },
      { id: 'b2', type: 'divider', config: {}, width: '2/3' },
    ],
    gap: 'normal',
  };

  it('renders as flex container', () => {
    const { container } = render(
      <RowBlockV2 row={baseRow}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </RowBlockV2>
    );
    const rowEl = container.firstElementChild as HTMLElement;
    expect(rowEl.style.display).toBe('flex');
  });

  it('applies correct flex-basis from child widths accounting for gap', () => {
    const { container } = render(
      <RowBlockV2 row={baseRow}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </RowBlockV2>
    );
    const children = container.firstElementChild!.children;
    // gap=normal → 12px, 2 children, 1 gap → each subtracts (1 * 12 / 2) = 6px
    expect((children[0] as HTMLElement).style.flex).toBe('0 0 calc(33.333% - 6px)');
    expect((children[1] as HTMLElement).style.flex).toBe('0 0 calc(66.667% - 6px)');
  });

  it('applies gap class based on row gap', () => {
    const { container } = render(
      <RowBlockV2 row={{ ...baseRow, gap: 'tight' }}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </RowBlockV2>
    );
    const rowEl = container.firstElementChild as HTMLElement;
    expect(rowEl.className).toContain('gap-2');
  });

  it('uses 1 1 0% flex for children without width', () => {
    const row: LayoutRowV2 = {
      ...baseRow,
      children: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'divider', config: {} },
      ],
    };
    const { container } = render(
      <RowBlockV2 row={row}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </RowBlockV2>
    );
    const children = container.firstElementChild!.children;
    expect((children[0] as HTMLElement).style.flex).toBe('1 1 0%');
  });

  it('collapses to vertical on narrow containers', () => {
    const { container } = render(
      <RowBlockV2 row={baseRow} containerWidth={400}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </RowBlockV2>
    );
    const rowEl = container.firstElementChild as HTMLElement;
    expect(rowEl.className).toContain('flex-col');
  });
});
