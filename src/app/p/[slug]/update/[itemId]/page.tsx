'use client';

import { useParams } from 'next/navigation';
import UpdateTypePicker from '@/components/manage/UpdateTypePicker';

export default function UpdatePickerPage() {
  const params = useParams();
  const itemId = params.itemId as string;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-2">
        Add Update
      </h1>
      <p className="text-sm text-sage mb-6">What would you like to log?</p>
      <UpdateTypePicker itemId={itemId} />
    </div>
  );
}
