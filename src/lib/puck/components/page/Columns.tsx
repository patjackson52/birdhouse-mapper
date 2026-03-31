import { DropZone } from '@puckeditor/core';
import type { ColumnsProps } from '../../types';

const gridClasses = {
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-3',
  4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
};

export function Columns({ columnCount }: ColumnsProps) {
  return (
    <div className={`mx-auto max-w-6xl grid gap-6 px-4 py-4 ${gridClasses[columnCount]}`}>
      {Array.from({ length: columnCount }, (_, i) => (
        <div key={i} className="min-h-[50px]">
          <DropZone zone={`column-${i}`} />
        </div>
      ))}
    </div>
  );
}
