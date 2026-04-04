'use client';

import type { TypeLayout } from '@/lib/layout/types';
import type { ItemWithDetails, CustomField } from '@/lib/types';
import LayoutRenderer from '../LayoutRenderer';

interface Props {
  layout: TypeLayout;
  mockItem: ItemWithDetails;
  customFields: CustomField[];
  itemTypeIcon: string;
}

export default function DetailPreview({ layout, mockItem, customFields, itemTypeIcon }: Props) {
  return (
    <div className="bg-gray-100 rounded-xl p-3">
      {/* Simulated bottom sheet */}
      <div className="bg-white rounded-t-2xl shadow-lg">
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Peek boundary indicator */}
        <div className="px-4 pb-4 max-h-[70vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">{itemTypeIcon}</span>
            <h2 className="font-heading font-semibold text-forest-dark text-xl">
              {mockItem.name}
            </h2>
          </div>

          {/* Layout content */}
          <LayoutRenderer
            layout={layout}
            item={mockItem}
            mode="preview"
            context="preview"
            customFields={customFields}
          />
        </div>
      </div>
    </div>
  );
}
