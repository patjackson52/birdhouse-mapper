'use client';

import { useState } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';

export const COLOR_PRESETS = [
  { label: 'Primary', value: 'var(--color-primary)' },
  { label: 'Primary Dark', value: 'var(--color-primary-dark)' },
  { label: 'Accent', value: 'var(--color-accent)' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Gray', value: '#6b7280' },
  { label: 'Black', value: '#000000' },
];

interface ColorPickerFieldProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  label: string;
}

export function ColorPickerField({ value, onChange, label }: ColorPickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const displayColor = value || '#000000';
  const isHex = displayColor.startsWith('#');

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="color-swatch"
          className="h-8 w-8 rounded border border-gray-300 cursor-pointer"
          style={{ backgroundColor: displayColor }}
          onClick={() => setIsOpen(!isOpen)}
          aria-label={`${label} color swatch`}
        />
        <span className="text-xs text-gray-600">{value || 'Default'}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-xs text-gray-400 hover:text-gray-600"
            aria-label="Clear color"
          >
            Clear
          </button>
        )}
      </div>

      {isOpen && (
        <div className="space-y-2">
          {isHex && (
            <HexColorPicker color={displayColor} onChange={onChange} />
          )}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">#</span>
            <HexColorInput
              color={isHex ? displayColor : ''}
              onChange={onChange}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
              placeholder="hex"
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {COLOR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            className="h-6 w-6 rounded border border-gray-200 hover:ring-2 hover:ring-blue-300"
            style={{ backgroundColor: preset.value }}
            aria-label={`preset ${preset.label}`}
            title={preset.label}
          />
        ))}
      </div>
    </div>
  );
}
