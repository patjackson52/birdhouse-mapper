'use client';

import BirdhouseForm from '@/components/manage/BirdhouseForm';

export default function AddBirdhousePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">
        Add New Birdhouse
      </h1>
      <div className="card">
        <BirdhouseForm />
      </div>
    </div>
  );
}
