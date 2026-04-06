import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LandingRedirect({ params }: Props) {
  const { slug } = await params;
  redirect(`/admin/properties/${slug}/site-builder/pages`);
}
