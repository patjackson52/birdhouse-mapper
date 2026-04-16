'use client';

import type { IconValue } from '@/lib/types';
import { IconPicker } from '@/components/shared/IconPicker';

interface IconPickerFieldProps {
  value: IconValue | undefined;
  onChange: (value: IconValue | undefined) => void;
}

export function IconPickerField({ value, onChange }: IconPickerFieldProps) {
  return <IconPicker value={value} onChange={onChange} />;
}
