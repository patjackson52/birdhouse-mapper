import { ModalContents } from '@/components/species/ModalContents';
import { SpeciesSheetWrapper } from '@/components/species/SpeciesSheetWrapper';
import { resolveContextFromUrl } from '@/lib/species/resolveContextFromUrl';

export default async function ModalPage({
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
    <SpeciesSheetWrapper>
      <ModalContents
        externalId={externalId}
        fromUrl={fromUrl}
        orgId={ctx.orgId}
        propertyId={ctx.propertyId}
        propertyName={ctx.propertyName}
        orgName={ctx.orgName}
      />
    </SpeciesSheetWrapper>
  );
}
