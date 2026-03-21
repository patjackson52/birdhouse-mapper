'use client';

interface HomepageToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export default function HomepageToggle({ enabled, onChange }: HomepageToggleProps) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`flex-1 text-sm py-2 px-4 font-medium transition-colors ${
          enabled
            ? 'bg-blue-600 text-white'
            : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
        }`}
      >
        Landing Page
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`flex-1 text-sm py-2 px-4 font-medium transition-colors ${
          !enabled
            ? 'bg-blue-600 text-white'
            : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
        }`}
      >
        Map
      </button>
    </div>
  );
}
