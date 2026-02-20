import type { BirdSpecies } from '@/lib/types';

interface BirdCardProps {
  bird: BirdSpecies;
}

const likelihoodColors: Record<string, string> = {
  'Very Likely': 'bg-forest/10 text-forest',
  'Likely': 'bg-forest/5 text-forest/80',
  'Moderate': 'bg-golden/10 text-golden',
  'Unlikely': 'bg-gray-100 text-gray-500',
};

export default function BirdCard({ bird }: BirdCardProps) {
  return (
    <div className="card hover:shadow-md transition-shadow">
      {/* Photo placeholder */}
      <div className="aspect-[4/3] bg-sage-light rounded-lg mb-3 flex items-center justify-center overflow-hidden">
        {bird.image_url ? (
          <img
            src={bird.image_url}
            alt={bird.common_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-4xl">🐦</span>
        )}
      </div>

      <h3 className="font-heading font-semibold text-forest-dark text-lg">
        {bird.common_name}
      </h3>
      {bird.scientific_name && (
        <p className="text-sm italic text-sage mb-2">{bird.scientific_name}</p>
      )}

      {bird.description && (
        <p className="text-sm text-forest-dark/80 leading-relaxed mb-3 line-clamp-3">
          {bird.description}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {bird.habitat && (
          <span className="inline-flex items-center rounded-full bg-sage-light px-2.5 py-0.5 text-xs text-sage">
            {bird.habitat.split('.')[0]}
          </span>
        )}
        {bird.likelihood && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              likelihoodColors[bird.likelihood] || 'bg-gray-100 text-gray-500'
            }`}
          >
            {bird.likelihood}
          </span>
        )}
      </div>
    </div>
  );
}
