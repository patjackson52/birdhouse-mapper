'use client';

import UpdateForm from '@/components/manage/UpdateForm';

export default function AddUpdatePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">
        Add Update
      </h1>
      <p className="text-sm text-sage mb-6">
        Record an observation, maintenance visit, or sighting. You can
        include photos taken in the field.
      </p>
      <div className="card">
        <UpdateForm />
      </div>
    </div>
  );
}
