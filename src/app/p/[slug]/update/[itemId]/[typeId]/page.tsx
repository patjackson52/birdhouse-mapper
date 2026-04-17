'use client';

import { useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import UpdateForm from '@/components/manage/UpdateForm';

function UpdateFormInner() {
  const params = useParams();
  const slug = params.slug as string;
  const itemId = params.itemId as string;
  const typeId = params.typeId as string;
  const router = useRouter();
  const searchParams = useSearchParams();

  // UpdateForm reads ?item= from searchParams to lock the item.
  // If the query is missing, canonicalize the URL so the form locks correctly.
  useEffect(() => {
    if (searchParams.get('item') !== itemId) {
      router.replace(`/p/${slug}/update/${itemId}/${typeId}?item=${itemId}`);
    }
  }, [slug, itemId, typeId, searchParams, router]);

  return <UpdateForm initialTypeId={typeId} lockType />;
}

export default function UpdateFormPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">
        Add Update
      </h1>
      <div className="card">
        <Suspense fallback={<div className="py-8 text-center text-sm text-sage">Loading…</div>}>
          <UpdateFormInner />
        </Suspense>
      </div>
    </div>
  );
}
