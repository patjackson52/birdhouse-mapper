'use client';

import { useRouter } from 'next/navigation';
import { SpeciesDetailView } from './SpeciesDetailView';

export function ModalContents({
  externalId,
  fromUrl,
  orgId,
  propertyId,
  propertyName,
  orgName,
}: {
  externalId: number;
  fromUrl: string | null;
  orgId: string | null;
  propertyId: string | null;
  propertyName: string;
  orgName: string;
}) {
  const router = useRouter();
  return (
    <SpeciesDetailView
      externalId={externalId}
      fromUrl={fromUrl}
      orgId={orgId}
      propertyId={propertyId}
      propertyName={propertyName}
      orgName={orgName}
      onBack={() => router.back()}
    />
  );
}
