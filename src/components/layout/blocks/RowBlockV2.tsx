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

  return (
    <div
      className={`${gapClasses[row.gap]}`}
      style={{ display: 'flex', flexWrap: 'wrap' }}
    >
      {children.map((child, i) => {
        const blockWidth = row.children[i]?.width;
        const flex = blockWidth
          ? `0 0 ${widthToCSS[blockWidth]}`
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
