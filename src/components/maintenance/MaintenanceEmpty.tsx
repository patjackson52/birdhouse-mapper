import Link from 'next/link';

interface Props {
  newProjectHref: string;
}

export function MaintenanceEmpty({ newProjectHref }: Props) {
  return (
    <div className="text-center py-12 px-5 text-gray-600">
      <div className="w-14 h-14 rounded-2xl bg-sage-light mx-auto mb-3 flex items-center justify-center text-forest text-2xl" aria-hidden>
        📋
      </div>
      <div className="text-forest-dark font-semibold text-[15px] mb-1">
        No maintenance projects yet
      </div>
      <div className="text-[13px] mb-4 max-w-sm mx-auto">
        Plan seasonal work, repairs, and group efforts across your map items.
      </div>
      <Link href={newProjectHref} className="btn-primary inline-flex">
        + New project
      </Link>
    </div>
  );
}
