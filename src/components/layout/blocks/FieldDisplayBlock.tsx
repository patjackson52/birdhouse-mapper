import type { CustomField } from '@/lib/types';
import type { FieldDisplayConfig } from '@/lib/layout/types';
import { formatDate } from '@/lib/utils';

interface FieldDisplayBlockProps {
  config: FieldDisplayConfig;
  field: CustomField | undefined;
  value: unknown;
}

const sizeClasses: Record<FieldDisplayConfig['size'], string> = {
  compact: 'text-sm',
  normal: 'text-sm',
  large: 'text-xl font-semibold leading-tight',
};

function formatValue(field: CustomField, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (field.field_type === 'date') {
    return formatDate(String(value));
  }
  return String(value);
}

export default function FieldDisplayBlock({ config, field, value }: FieldDisplayBlockProps) {
  if (!field) return null;

  const displayValue = (value === null || value === undefined)
    ? '—'
    : formatValue(field, value);

  return (
    <div>
      {config.showLabel && (
        <p className="text-xs font-medium text-sage uppercase tracking-wide mb-0.5">
          {field.name}
        </p>
      )}
      <p className={sizeClasses[config.size]}>{displayValue}</p>
    </div>
  );
}
