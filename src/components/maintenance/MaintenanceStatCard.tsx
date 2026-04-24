interface Props {
  label: string;
  value: number;
  tint: 'blue' | 'amber' | 'red' | 'green';
}

const TINT: Record<Props['tint'], { bg: string; fg: string }> = {
  blue:  { bg: 'bg-blue-100',  fg: 'text-blue-800'  },
  amber: { bg: 'bg-amber-100', fg: 'text-amber-800' },
  red:   { bg: 'bg-red-100',   fg: 'text-red-800'   },
  green: { bg: 'bg-green-100', fg: 'text-green-800' },
};

export function MaintenanceStatCard({ label, value, tint }: Props) {
  const t = TINT[tint];
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.bg} ${t.fg} text-lg font-semibold`}>
        {value}
      </div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}
