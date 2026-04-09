import type { ReactNode } from 'react';
import type { LayoutRowV2, FractionalWidth } from '@/lib/layout/types-v2';

interface RowBlockV2Props {
  row: LayoutRowV2;
  children: ReactNode[];
  containerWidth?: number;
}

const ROW_COLLAPSE_BREAKPOINT = 480;

const gapClasses: Record<LayoutRowV2['gap'], string> = {
  tight: 'gap-2',
  normal: 'gap-3',
  loose: 'gap-4',
};

const widthToCSS: Record<FractionalWidth, string> = {
  '1/4': '25%',
  '1/3': '33.333%',
  '1/2': '50%',
  '2/3': '66.667%',
  '3/4': '75%',
  'full': '100%',
};

export default function RowBlockV2({ row, children, containerWidth }: RowBlockV2Props) {
  const isCollapsed = containerWidth !== undefined && containerWidth < ROW_COLLAPSE_BREAKPOINT;

  if (isCollapsed) {
    return (
      <div className={`flex flex-col ${gapClasses[row.gap]}`}>
        {children}
      </div>
    );
  }

  // Use CSS gap for spacing. Children widths must account for gap via calc()
  // to prevent wrapping. Pre-compute each child's share of total gap space.
  const gapPx = { tight: 8, normal: 12, loose: 16 }[row.gap];
  const childCount = children.length;
  const totalGaps = childCount > 1 ? childCount - 1 : 0;
  const gapOffsetPerChild = totalGaps > 0 ? (totalGaps * gapPx) / childCount : 0;

  return (
    <div
      className={gapClasses[row.gap]}
      style={{ display: 'flex' }}
    >
      {children.map((child, i) => {
        const blockWidth = row.children[i]?.width;
        const basis = blockWidth ? widthToCSS[blockWidth] : undefined;
        const flex = basis
          ? `0 0 calc(${basis} - ${gapOffsetPerChild}px)`
          : '1 1 0%';

        return (
          <div key={row.children[i]?.id ?? i} style={{ flex, minWidth: 0 }}>
            {child}
          </div>
        );
      })}
    </div>
  );
}
