import type { EntityListConfig } from '@/lib/layout/types';

export interface EntityDisplay {
  id: string;
  name: string;
  entity_type: {
    id: string;
    name: string;
    icon: string;
  };
}

interface EntityListBlockProps {
  config: EntityListConfig;
  entities: EntityDisplay[];
}

export default function EntityListBlock({ config, entities }: EntityListBlockProps) {
  const filtered = config.entityTypeIds.length > 0
    ? entities.filter((e) => config.entityTypeIds.includes(e.entity_type.id))
    : entities;

  if (filtered.length === 0) return null;

  // Group by entity type
  const grouped = new Map<string, { type: EntityDisplay['entity_type']; items: EntityDisplay[] }>();
  for (const entity of filtered) {
    const key = entity.entity_type.id;
    if (!grouped.has(key)) {
      grouped.set(key, { type: entity.entity_type, items: [] });
    }
    grouped.get(key)!.items.push(entity);
  }

  return (
    <div className="space-y-2">
      {Array.from(grouped.values()).map(({ type, items }) => (
        <div key={type.id}>
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">
            {type.icon} {type.name}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {items.map((entity) => (
              <span
                key={entity.id}
                className="inline-flex items-center bg-forest/10 text-forest-dark text-xs px-2 py-0.5 rounded-full"
              >
                {entity.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
