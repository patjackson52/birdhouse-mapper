'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/admin/EmptyState';
import { getRoles, createRole, deleteRole, getRoleUsageCount } from './actions';
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

type UsageCount = {
  orgMemberCount: number;
  propertyMemberCount: number;
  total: number;
};

// Roles that can be used as base for new roles
const CLONABLE_BASE_ROLES = ['owner', 'admin', 'manager', 'member', 'viewer', 'volunteer', 'public'];

function countPermissions(permissions: RolePermissions): { enabled: number; total: number } {
  let enabled = 0;
  let total = 0;
  for (const category of Object.values(permissions)) {
    for (const value of Object.values(category as Record<string, boolean>)) {
      total++;
      if (value) enabled++;
    }
  }
  return { enabled, total };
}

function BaseRoleBadge({ baseRole }: { baseRole: string }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 capitalize">
      {baseRole.replace('_', ' ')}
    </span>
  );
}

export default function RolesPage() {
  const router = useRouter();

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [selectedBaseRoleId, setSelectedBaseRoleId] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete state
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const [usageCounts, setUsageCounts] = useState<Record<string, UsageCount>>({});
  const [usageLoading, setUsageLoading] = useState<Record<string, boolean>>({});
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function loadRoles() {
    const result = await getRoles();
    if (result.roles) {
      setRoles(result.roles as Role[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadRoles();
  }, []);

  function handleCancelCreate() {
    setShowCreateForm(false);
    setCreateStep(1);
    setSelectedBaseRoleId('');
    setNewRoleName('');
    setCreateError(null);
  }

  async function handleStartDelete(role: Role) {
    setDeletingRoleId(role.id);
    setDeleteError(null);

    if (!usageCounts[role.id]) {
      setUsageLoading((prev) => ({ ...prev, [role.id]: true }));
      const counts = await getRoleUsageCount(role.id);
      if ('total' in counts) {
        setUsageCounts((prev) => ({ ...prev, [role.id]: counts as UsageCount }));
      }
      setUsageLoading((prev) => ({ ...prev, [role.id]: false }));
    }
  }

  async function handleConfirmDelete(roleId: string) {
    const result = await deleteRole(roleId);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    setDeletingRoleId(null);
    setDeleteError(null);
    await loadRoles();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBaseRoleId || !newRoleName.trim()) return;

    setCreateError(null);
    setCreateLoading(true);

    const baseRole = roles.find((r) => r.id === selectedBaseRoleId);
    if (!baseRole) {
      setCreateError('Selected base role not found.');
      setCreateLoading(false);
      return;
    }

    const result = await createRole(newRoleName.trim(), selectedBaseRoleId, baseRole.permissions as unknown as Record<string, unknown>);

    setCreateLoading(false);

    if ('error' in result && result.error) {
      setCreateError(result.error);
      return;
    }

    if ('id' in result && result.id) {
      router.push(`/admin/roles/${result.id}`);
    }
  }

  const systemRoles = roles.filter((r) => r.is_system_role);
  const customRoles = roles.filter((r) => !r.is_system_role);

  // Roles available to clone (system roles that are clonable)
  const clonableRoles = roles.filter(
    (r) => r.is_system_role && CLONABLE_BASE_ROLES.includes(r.base_role),
  );

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-48 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">Roles</h1>
        <button
          onClick={() => setShowCreateForm((v) => !v)}
          className="btn-primary text-sm"
        >
          {showCreateForm ? 'Cancel' : 'Create Role'}
        </button>
      </div>

      {/* Inline create form */}
      {showCreateForm && (
        <div className="card mb-6 border border-sage-light bg-sage-light/30">
          <h2 className="font-heading text-base font-semibold text-forest-dark mb-4">
            New Role
          </h2>
          <form onSubmit={handleCreate} className="space-y-4">
            {createStep === 1 && (
              <div>
                <label className="label">Base Role</label>
                <select
                  className="input-field"
                  value={selectedBaseRoleId}
                  onChange={(e) => setSelectedBaseRoleId(e.target.value)}
                  required
                >
                  <option value="">Select a base role to clone from…</option>
                  {clonableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.base_role})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-sage mt-1">
                  The new role will start with the same permissions as the base role.
                </p>
                <div className="flex gap-3 mt-4">
                  <button
                    type="button"
                    className="btn-primary text-sm"
                    disabled={!selectedBaseRoleId}
                    onClick={() => setCreateStep(2)}
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    onClick={handleCancelCreate}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {createStep === 2 && (
              <div>
                <div className="mb-3 text-sm text-sage">
                  Cloning from:{' '}
                  <span className="font-medium text-forest-dark">
                    {roles.find((r) => r.id === selectedBaseRoleId)?.name}
                  </span>
                  <button
                    type="button"
                    className="ml-2 text-xs text-forest underline"
                    onClick={() => setCreateStep(1)}
                  >
                    Change
                  </button>
                </div>
                <label className="label">Role Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Senior Volunteer"
                  required
                  autoFocus
                />
                {createError && (
                  <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 mt-2">
                    {createError}
                  </p>
                )}
                <div className="flex gap-3 mt-4">
                  <button
                    type="submit"
                    className="btn-primary text-sm"
                    disabled={createLoading || !newRoleName.trim()}
                  >
                    {createLoading ? 'Creating…' : 'Create & Edit Permissions'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    onClick={handleCancelCreate}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {/* System Roles */}
      <section className="mb-8">
        <h2 className="font-heading text-sm font-semibold text-sage uppercase tracking-wide mb-3">
          System Roles
        </h2>
        <div className="space-y-2">
          {systemRoles.map((role) => {
            const { enabled, total } = countPermissions(role.permissions);
            return (
              <div key={role.id} className="card flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-forest-dark text-sm">{role.name}</span>
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                      System
                    </span>
                    <BaseRoleBadge baseRole={role.base_role} />
                  </div>
                  {role.description && (
                    <p className="text-xs text-sage mt-1">{role.description}</p>
                  )}
                  <p className="text-xs text-sage mt-1">
                    {enabled}/{total} permissions enabled
                  </p>
                </div>
                <div className="text-xs text-sage italic whitespace-nowrap">Read-only</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Custom Roles */}
      <section>
        <h2 className="font-heading text-sm font-semibold text-sage uppercase tracking-wide mb-3">
          Custom Roles
        </h2>

        {customRoles.length === 0 ? (
          <EmptyState
            title="No custom roles"
            description="Create a custom role to give members tailored permissions."
            actionLabel="Create Role"
            onAction={() => setShowCreateForm(true)}
          />
        ) : (
          <div className="space-y-2">
            {customRoles.map((role) => {
              const { enabled, total } = countPermissions(role.permissions);
              const isDeleting = deletingRoleId === role.id;
              const usage = usageCounts[role.id];
              const isUsageLoading = usageLoading[role.id];

              return (
                <div key={role.id} className="card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-forest-dark text-sm">{role.name}</span>
                        <BaseRoleBadge baseRole={role.base_role} />
                      </div>
                      {role.description && (
                        <p className="text-xs text-sage mt-1">{role.description}</p>
                      )}
                      <p className="text-xs text-sage mt-1">
                        {enabled}/{total} permissions enabled
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => router.push(`/admin/roles/${role.id}`)}
                        className="text-xs text-forest hover:text-forest-dark transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleStartDelete(role)}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Delete confirmation panel */}
                  {isDeleting && (
                    <div className="mt-3 pt-3 border-t border-sage-light">
                      {isUsageLoading ? (
                        <p className="text-xs text-sage">Checking usage…</p>
                      ) : usage && usage.total > 0 ? (
                        <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">
                          Used by {usage.total} member{usage.total !== 1 ? 's' : ''} — reassign before deleting.
                        </p>
                      ) : (
                        <div className="flex items-center gap-3">
                          <p className="text-xs text-red-600">Delete &ldquo;{role.name}&rdquo;? This cannot be undone.</p>
                          <button
                            onClick={() => handleConfirmDelete(role.id)}
                            className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition-colors"
                          >
                            Confirm Delete
                          </button>
                          <button
                            onClick={() => {
                              setDeletingRoleId(null);
                              setDeleteError(null);
                            }}
                            className="text-xs text-sage hover:text-forest-dark transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      {deleteError && (
                        <p className="text-xs text-red-600 mt-2">{deleteError}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
