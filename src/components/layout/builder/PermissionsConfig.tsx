'use client';

import { useState } from 'react';
import type { BlockPermissions } from '@/lib/layout/types-v2';

interface Props {
  value: BlockPermissions | undefined;
  onChange: (permissions: BlockPermissions | undefined) => void;
}

const ROLE_OPTIONS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: 'Everyone' },
  { value: 'editor', label: 'Editors & Admins' },
  { value: 'admin', label: 'Admins only' },
];

export default function PermissionsConfig({ value, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const currentRole = value?.requiredRole;

  return (
    <div className="border-t border-sage-light/50 pt-2 mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs font-medium text-sage flex items-center gap-1 w-full"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
        Visibility{currentRole ? ` (${currentRole === 'editor' ? 'Editors & Admins' : 'Admins only'})` : ''}
      </button>
      {expanded && (
        <div className="mt-2">
          <select
            value={currentRole ?? ''}
            onChange={(e) => {
              const role = e.target.value || undefined;
              onChange(role ? { requiredRole: role as 'viewer' | 'editor' | 'admin' } : undefined);
            }}
            className="input-field text-sm"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ''}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
