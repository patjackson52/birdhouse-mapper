import { redirect } from 'next/navigation';

export default async function PropertyAdminIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/admin/properties/${slug}/data`);
}
