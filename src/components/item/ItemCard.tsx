import type { Item, ItemType, CustomField } from '@/lib/types';
import StatusBadge from './StatusBadge';
import { formatShortDate } from '@/lib/utils';

interface ItemCardProps {
  item: Item;
  itemType?: ItemType;
  customFields?: CustomField[];
}

export default function ItemCard({ item, itemType, customFields }: ItemCardProps) {
  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {itemType && <span className="text-lg">{itemType.icon}</span>}
          <h3 className="font-heading font-semibold text-forest-dark text-lg">
            {item.name}
          </h3>
        </div>
        <StatusBadge status={item.status} />
      </div>
      {/* Render custom field values */}
      {customFields && customFields.length > 0 && (
        <div className="space-y-0.5 mb-2">
          {customFields
            .filter((f) => item.custom_field_values[f.id] != null)
            .slice(0, 2)
            .map((field) => (
              <p key={field.id} className="text-sm text-forest">
                {field.name}: {String(item.custom_field_values[field.id])}
              </p>
            ))}
        </div>
      )}
      {item.description && (
        <p className="text-sm text-sage line-clamp-2 mb-3">
          {item.description}
        </p>
      )}
      <div className="flex items-center justify-between text-xs text-sage">
        {itemType && <span>{itemType.name}</span>}
        <span>
          {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
        </span>
      </div>
    </div>
  );
}
