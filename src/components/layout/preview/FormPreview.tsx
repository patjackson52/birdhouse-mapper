'use client';

import type { TypeLayout } from '@/lib/layout/types';
import type { CustomField } from '@/lib/types';

interface Props {
  layout: TypeLayout;
  customFields: CustomField[];
  itemTypeName: string;
}

export default function FormPreview({ itemTypeName }: Props) {
  return (
    <div className="bg-gray-100 rounded-xl p-3">
      <div className="bg-white rounded-xl shadow-lg p-4 text-center text-sage text-sm">
        Form preview for {itemTypeName} — coming in Task 13
      </div>
    </div>
  );
}
