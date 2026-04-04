import type { ReactNode } from 'react';
import type { LayoutRow } from '@/lib/layout/types';

interface RowBlockProps {
  row: LayoutRow;
  children: ReactNode[];
  containerWidth?: number;
}

export const ROW_COLLAPSE_BREAKPOINT = 480;

const gapClasses: Record<LayoutRow['gap'], string> = {
  tight: 'gap-2',
  normal: 'gap-3',
  loose: 'gap-4',
};

function getGridTemplateColumns(distribution: LayoutRow['distribution'], count: number): string {
  if (distribution === 'equal') {
    return `repeat(${count}, 1fr)`;
  }
  if (distribution === 'auto') {
    return `repeat(${count}, auto)`;
  }
  // number[] — fractional widths
  return (distribution as number[]).map((n) => `${n}fr`).join(' ');
}

export default function RowBlock({ row, children, containerWidth }: RowBlockProps) {
  const isCollapsed = containerWidth !== undefined && containerWidth < ROW_COLLAPSE_BREAKPOINT;

  if (isCollapsed) {
    return (
      <div className={`flex flex-col ${gapClasses[row.gap]}`}>
        {children}
      </div>
    );
  }

  const gridTemplateColumns = getGridTemplateColumns(row.distribution, children.length);

  return (
    <div
      className={`grid ${gapClasses[row.gap]}`}
      style={{ gridTemplateColumns }}
    >
      {children}
    </div>
  );
}
