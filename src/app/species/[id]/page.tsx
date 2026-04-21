import { SpeciesDetailView } from '@/components/species/SpeciesDetailView';
import { SpeciesFullPageWrapper } from '@/components/species/SpeciesFullPageWrapper';
import { resolveContextFromUrl } from '@/lib/species/resolveContextFromUrl';

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { from?: string };
}) {
  const externalId = Number(params.id);
  const fromUrl = searchParams.from ?? null;
  const ctx = await resolveContextFromUrl(fromUrl);
  return (
    <SpeciesFullPageWrapper>
      <SpeciesDetailView
        externalId={externalId}
        fromUrl={fromUrl}
        orgId={ctx.orgId}
        propertyId={ctx.propertyId}
        propertyName={ctx.propertyName}
        orgName={ctx.orgName}
      />
    </SpeciesFullPageWrapper>
  );
}
