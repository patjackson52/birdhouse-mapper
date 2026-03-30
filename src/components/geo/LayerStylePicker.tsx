'use client';

const PRESET_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#f97316', '#ec4899',
];

interface LayerStylePickerProps {
  color: string;
  opacity: number;
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
}

export default function LayerStylePicker({ color, opacity, onColorChange, onOpacityChange }: LayerStylePickerProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Color</label>
        <div className="flex gap-2 mt-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onColorChange(c)}
              className="w-8 h-8 rounded-lg border-2 transition-all min-w-[32px] min-h-[32px]"
              style={{
                backgroundColor: c,
                borderColor: c === color ? '#fff' : 'transparent',
                boxShadow: c === color ? `0 0 0 2px ${c}` : 'none',
              }}
              aria-label={`Select color ${c}`}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="label">Opacity: {Math.round(opacity * 100)}%</label>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.1}
          value={opacity}
          onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
          className="w-full mt-1"
        />
      </div>
    </div>
  );
}
