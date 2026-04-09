import type { TypeLayout, LayoutNode, LayoutBlock, LayoutRow } from './types';
import { isLayoutRow } from './types';
import type { TypeLayoutV2, LayoutNodeV2, LayoutBlockV2, LayoutRowV2, FractionalWidth } from './types-v2';

const FRACTION_VALUES: [FractionalWidth, number][] = [
  ['1/4', 0.25],
  ['1/3', 0.333],
  ['1/2', 0.5],
  ['2/3', 0.667],
  ['3/4', 0.75],
  ['full', 1],
];

const EQUAL_WIDTH_MAP: Record<number, FractionalWidth> = {
  2: '1/2',
  3: '1/3',
  4: '1/4',
};

function snapToFraction(percentage: number): FractionalWidth {
  let closest: FractionalWidth = 'full';
  let minDiff = Infinity;
  for (const [fraction, value] of FRACTION_VALUES) {
    const diff = Math.abs(percentage - value);
    if (diff < minDiff) {
      minDiff = diff;
      closest = fraction;
    }
  }
  return closest;
}

function migrateBlock(block: LayoutBlock, width?: FractionalWidth): LayoutBlockV2 {
  const result: LayoutBlockV2 = {
    id: block.id,
    type: block.type as LayoutBlockV2['type'],
    config: block.config as LayoutBlockV2['config'],
  };
  if (width !== undefined) {
    result.width = width;
  }
  if ('hideWhenEmpty' in block && block.hideWhenEmpty) {
    result.hideWhenEmpty = true;
  }
  return result;
}

function migrateRow(row: LayoutRow): LayoutRowV2 {
  let childWidths: (FractionalWidth | undefined)[];

  if (row.distribution === 'equal') {
    const w = EQUAL_WIDTH_MAP[row.children.length];
    childWidths = row.children.map(() => w);
  } else if (row.distribution === 'auto') {
    childWidths = row.children.map(() => undefined);
  } else {
    const nums = row.distribution as number[];
    const total = nums.reduce((a, b) => a + b, 0);
    childWidths = nums.map((n) => snapToFraction(n / total));
  }

  return {
    id: row.id,
    type: 'row',
    children: row.children.map((child, i) => migrateBlock(child, childWidths[i])),
    gap: row.gap,
  };
}

export function migrateV1toV2(layout: TypeLayout): TypeLayoutV2 {
  const blocks: LayoutNodeV2[] = layout.blocks.map((node) => {
    if (isLayoutRow(node)) {
      return migrateRow(node);
    }
    return migrateBlock(node as LayoutBlock);
  });

  return {
    version: 2,
    blocks,
    spacing: layout.spacing,
    peekBlockCount: layout.peekBlockCount,
  };
}
