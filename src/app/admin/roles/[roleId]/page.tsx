'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import PermissionEditor from '@/components/admin/PermissionEditor';
import { getRoles, updateRole } from '../actions';
import { RolePermissions } from '@/lib/types';

type Role = {
  id: string;
  name: string;
  description: string | null;
  base_role: string;
  permissions: RolePermissions;
  is_system_role: boolean;
  sort_order: number;
};

export default function RoleEditorPage() {
  const router = useRouter();
  const params = useParams();
  const roleId = params.roleId as string;

  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    async function load() {
      const result = await getRoles();
      if (!result.roles) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const found = (result.roles as Role[]).find((r) => r.id === roleId);
      if (!found) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setRole(found);
      setName(found.name);
      setDescription(found.description ?? '');
      setPermissions(found.permissions);
      setLoading(false);
    }

    load();
  }, [roleId]);

  async function handleSave() {
    if (!role || !permissions) return;

    setSaving(true);
    setSaveStatus('idle');
    setSaveMessage('');

    const result = await updateRole(roleId, {
      name: name.trim(),
      description: description.trim() || undefined,
      permissions: permissions as unknown as Record<string, unknown>,
    });

    setSaving(false);

    if (result.error) {
      setSaveStatus('error');
      setSaveMessage(result.error);
    } else {
      setSaveStatus('success');
      setSaveMessage('Role saved successfully.');
      // Refresh role data
      setRole((prev) => prev ? { ...prev, name: name.trim(), description: description.trim() || null, permissions } : prev);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-48 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  if (notFound || !role || !permissions) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <p className="text-sage">Role not found.</p>
        <button
          onClick={() => router.push('/admin/roles')}
          className="btn-secondary text-sm mt-4"
        >
          Back to Roles
        </button>
      </div>
    );
  }

  const isSystemRole = role.is_system_role;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push('/admin/roles')}
            className="text-sm text-sage hover:text-forest-dark transition-colors shrink-0"
          >
            ← Back to Roles
          </button>
        </div>
        {!isSystemRole && (
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="btn-primary text-sm shrink-0"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      {/* Role name */}
      <div className="card mb-4">
        <div className="space-y-4">
          <div>
            <label className="label">Role Name</label>
            {isSystemRole ? (
              <p className="text-forest-dark font-medium">{role.name}</p>
            ) : (
              <input
                type="text"
                className="input-field"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaveStatus('idle');
                }}
                placeholder="Role name"
              />
            )}
          </div>

          <div>
            <label className="label">Description</label>
            {isSystemRole ? (
              <p className="text-sage text-sm">{role.description || <span className="italic opacity-50">No description</span>}</p>
            ) : (
              <input
                type="text"
                className="input-field"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setSaveStatus('idle');
                }}
                placeholder="Optional description"
              />
            )}
          </div>

          <div>
            <label className="label">Base Role</label>
            <div className="flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 capitalize">
                {role.base_role.replace('_', ' ')}
              </span>
              {isSystemRole && (
                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                  System
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save status */}
      {saveStatus !== 'idle' && (
        <div
          className={`rounded px-3 py-2 text-sm mb-4 ${
            saveStatus === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {saveMessage}
        </div>
      )}

      {/* Permission editor */}
      <div className="card">
        <h2 className="font-heading text-base font-semibold text-forest-dark mb-4">
          Permissions
          {isSystemRole && (
            <span className="ml-2 text-xs font-normal text-sage">(read-only for system roles)</span>
          )}
        </h2>
        <PermissionEditor
          permissions={permissions}
          onChange={(updated) => {
            setPermissions(updated);
            setSaveStatus('idle');
          }}
          disabled={isSystemRole}
        />
      </div>

      {/* Bottom save button */}
      {!isSystemRole && (
        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="btn-primary text-sm"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {saveStatus !== 'idle' && (
            <span
              className={`text-sm ${saveStatus === 'success' ? 'text-green-700' : 'text-red-600'}`}
            >
              {saveMessage}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
