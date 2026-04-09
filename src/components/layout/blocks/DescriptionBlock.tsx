import type { DescriptionConfig } from '@/lib/layout/types-v2';

interface Props {
  config: DescriptionConfig;
  description: string | null;
}

export default function DescriptionBlock({ config, description }: Props) {
  if (!description) return null;

  return (
    <div>
      {config.showLabel && (
        <span className="text-xs font-medium text-sage uppercase tracking-wide">
          Description
        </span>
      )}
      <p
        className="text-sm text-forest-dark/80 leading-relaxed mt-0.5"
        style={config.maxLines ? {
          display: '-webkit-box',
          WebkitLineClamp: String(config.maxLines),
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        } : undefined}
      >
        {description}
      </p>
    </div>
  );
}
