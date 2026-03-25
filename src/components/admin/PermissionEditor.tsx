'use client';

import { useState } from 'react';
import { RolePermissions } from '@/lib/types';

interface PermissionEditorProps {
  permissions: RolePermissions;
  onChange: (permissions: RolePermissions) => void;
  basePermissions?: RolePermissions;
  disabled?: boolean;
}

type CategoryKey = keyof RolePermissions;

interface CategoryConfig {
  label: string;
  key: CategoryKey;
  permissions: string[];
}

const CATEGORIES: CategoryConfig[] = [
  {
    label: 'Organization',
    key: 'org',
    permissions: ['manage_settings', 'manage_members', 'manage_billing', 'manage_roles', 'view_audit_log'],
  },
  {
    label: 'Properties',
    key: 'properties',
    permissions: ['create', 'manage_all', 'view_all'],
  },
  {
    label: 'Items',
    key: 'items',
    permissions: ['view', 'create', 'edit_any', 'edit_assigned', 'delete'],
  },
  {
    label: 'Updates',
    key: 'updates',
    permissions: ['view', 'create', 'edit_own', 'edit_any', 'delete', 'approve_public_submissions'],
  },
  {
    label: 'Tasks',
    key: 'tasks',
    permissions: ['view_assigned', 'view_all', 'create', 'assign', 'complete'],
  },
  {
    label: 'Attachments',
    key: 'attachments',
    permissions: ['upload', 'delete_own', 'delete_any'],
  },
  {
    label: 'Reports',
    key: 'reports',
    permissions: ['view', 'export'],
  },
  {
    label: 'Modules',
    key: 'modules',
    permissions: ['tasks', 'volunteers', 'public_forms', 'qr_codes', 'reports'],
  },
];

function humanize(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getCategoryPermissions(permissions: RolePermissions, key: CategoryKey): Record<string, boolean> {
  return permissions[key] as Record<string, boolean>;
}

export default function PermissionEditor({
  permissions,
  onChange,
  basePermissions,
  disabled = false,
}: PermissionEditorProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<CategoryKey>>(new Set());

  function toggleCategory(key: CategoryKey) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleToggle(categoryKey: CategoryKey, permKey: string, value: boolean) {
    if (disabled) return;
    const updatedCategory = {
      ...getCategoryPermissions(permissions, categoryKey),
      [permKey]: value,
    };
    onChange({
      ...permissions,
      [categoryKey]: updatedCategory,
    });
  }

  return (
    <div className="space-y-2">
      {CATEGORIES.map((category) => {
        const isExpanded = expandedCategories.has(category.key);
        const categoryPerms = getCategoryPermissions(permissions, category.key);
        const baseCategoryPerms = basePermissions
          ? getCategoryPermissions(basePermissions, category.key)
          : null;

        const enabledCount = Object.values(categoryPerms).filter(Boolean).length;
        const totalCount = category.permissions.length;

        return (
          <div key={category.key} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCategory(category.key)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800 text-sm">{category.label}</span>
                <span className="text-xs text-gray-500">
                  {enabledCount}/{totalCount} enabled
                </span>
              </div>
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <div className="divide-y divide-gray-100">
                {category.permissions.map((permKey) => {
                  const value = categoryPerms[permKey] ?? false;
                  const baseValue = baseCategoryPerms ? baseCategoryPerms[permKey] : undefined;
                  const matchesBase = baseValue !== undefined && value === baseValue;

                  return (
                    <div
                      key={permKey}
                      className="flex items-center justify-between px-4 py-2.5 bg-white"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">{humanize(permKey)}</span>
                        {matchesBase && (
                          <span className="text-xs text-gray-400 italic">
                            (from base)
                          </span>
                        )}
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={value}
                          disabled={disabled}
                          onChange={(e) => handleToggle(category.key, permKey, e.target.checked)}
                        />
                        <div
                          className={`w-9 h-5 rounded-full peer after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full ${
                            disabled
                              ? 'bg-gray-200 cursor-not-allowed peer-checked:bg-forest/50'
                              : 'bg-gray-200 peer-checked:bg-forest cursor-pointer'
                          }`}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
