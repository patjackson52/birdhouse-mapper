'use client';

export type DeletePermission = { kind: 'author' | 'admin' };

export function DeleteConfirmModal({
  open,
  onCancel,
  onConfirm,
  photoCount,
  speciesCount,
  permission,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  photoCount: number;
  speciesCount: number;
  permission: DeletePermission;
}) {
  if (!open) return null;
  const isAdmin = permission.kind === 'admin';
  const hasCollateral = photoCount > 0 || speciesCount > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      className="fixed inset-0 z-[300] flex items-end justify-center bg-[rgba(31,42,31,0.55)] backdrop-blur-[2px] fm-fade"
    >
      <div className="w-full rounded-t-[18px] bg-white px-5 pb-4 pt-5 font-body fm-sheet-up">
        <div className="mx-auto mb-[14px] h-1 w-9 rounded-full bg-forest-border" />
        {isAdmin && (
          <div className="mb-[10px] inline-flex items-center gap-[5px] rounded-full bg-[#FBE9E5] px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.8px] text-[#7A1B0F]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 1l3 6 6 1-4.5 4.5 1 6.5L12 16l-5.5 3 1-6.5L3 8l6-1z" />
            </svg>
            {"ADMIN · DELETE OTHERS' UPDATE"}
          </div>
        )}
        <h2
          id="delete-confirm-title"
          className="m-0 font-heading text-[22px] font-medium leading-tight text-forest-dark"
        >
          Delete this update?
        </h2>
        <p className="my-2 mb-[14px] text-[14px] leading-[1.5] text-sage">
          This cannot be reversed after 8 seconds. The update will be permanently removed from the timeline
          {hasCollateral ? ' along with:' : '.'}
        </p>
        {hasCollateral && (
          <ul className="mb-4 ml-[18px] list-disc text-[13.5px] leading-[1.7] text-forest-dark">
            {photoCount > 0 && (
              <li>
                <span className="font-semibold">{`${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`}</span>
              </li>
            )}
            {speciesCount > 0 && (
              <li>
                <span className="font-semibold">{`${speciesCount} species ${speciesCount === 1 ? 'sighting' : 'sightings'}`}</span>{' '}
                <span className="text-sage">(counts update everywhere this species appears)</span>
              </li>
            )}
          </ul>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[10px] border border-forest-border bg-white px-3 py-[13px] text-[14px] font-medium text-forest-dark"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-[1.2] rounded-[10px] bg-[#B3321F] px-3 py-[13px] text-[14px] font-semibold text-white"
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
