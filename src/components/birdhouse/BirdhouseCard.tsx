import Link from 'next/link';
import type { Birdhouse } from '@/lib/types';
import StatusBadge from './StatusBadge';
import { formatShortDate } from '@/lib/utils';

interface BirdhouseCardProps {
  birdhouse: Birdhouse;
}

export default function BirdhouseCard({ birdhouse }: BirdhouseCardProps) {
  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-heading font-semibold text-forest-dark text-lg">
          {birdhouse.name}
        </h3>
        <StatusBadge status={birdhouse.status} />
      </div>
      {birdhouse.species_target && (
        <p className="text-sm text-forest mb-1">
          Target: {birdhouse.species_target}
        </p>
      )}
      {birdhouse.description && (
        <p className="text-sm text-sage line-clamp-2 mb-3">
          {birdhouse.description}
        </p>
      )}
      <div className="flex items-center justify-between text-xs text-sage">
        {birdhouse.installed_date ? (
          <span>Installed {formatShortDate(birdhouse.installed_date)}</span>
        ) : (
          <span>Not yet installed</span>
        )}
        <span>
          {birdhouse.latitude.toFixed(4)}, {birdhouse.longitude.toFixed(4)}
        </span>
      </div>
    </div>
  );
}
