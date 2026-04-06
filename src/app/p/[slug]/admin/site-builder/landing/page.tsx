import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LandingRedirect({ params }: Props) {
  const { slug } = await params;
  redirect(`/p/${slug}/admin/site-builder/pages`);
}
