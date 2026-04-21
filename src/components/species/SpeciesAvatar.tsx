export function SpeciesAvatar({
  photoUrl,
  commonName,
  size = 28,
}: {
  photoUrl: string | null;
  commonName: string;
  size?: number;
}) {
  return (
    <img
      src={photoUrl ?? ''}
      alt={commonName}
      title={commonName}
      style={{ width: size, height: size }}
      className="rounded-full border-2 border-white bg-sage-light object-cover"
    />
  );
}
