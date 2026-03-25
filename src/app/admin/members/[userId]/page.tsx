'use client';

import { useEffect, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getMemberDetail, updateMemberRole, removeMember } from '../actions';
import { addPropertyOverride, removePropertyOverride } from './actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrgRole = {
  id: string;
  name: string;
  base_role: string;
};

type PropertyRow = {
  property_id: string;
  name: string;
  slug: string;
  membership: {
    id: string;
    grant_type: string;
    role_name: string;
    role_base_role: string;
  } | null;
};

type MemberDetail = {
  membership_id: string;
  user_id: string;
  display_name: string;
  email: string;
  status: string;
  joined_at: string | null;
  role: OrgRole | null;
  properties: PropertyRow[];
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [isPending, startTransition] = useTransition();

  const [member, setMember] = useState<MemberDetail | null>(null);
  const [availableRoles, setAvailableRoles] = useState<OrgRole[]>([]);
  const [isLastAdmin, setIsLastAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Per-property "add override" dropdown state: propertyId → selected roleId
  const [pendingOverride, setPendingOverride] = useState<Record<string, string>>({});
  // Which property rows are showing the override selector
  const [showOverrideFor, setShowOverrideFor] = useState<Record<string, boolean>>({});

  const [actionError, setActionError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  async function loadData() {
    setLoading(true);
    setPageError(null);

    const [detailResult, rolesResult] = await Promise.all([
      getMemberDetail(userId),
      createClient()
        .from('roles')
        .select('id, name, base_role')
        .neq('base_role', 'platform_admin')
        .order('sort_order', { ascending: true }),
    ]);

    if (detailResult.error || !detailResult.data) {
      setPageError(detailResult.error ?? 'Failed to load member');
      setLoading(false);
      return;
    }

    const roles = (rolesResult.data ?? []) as OrgRole[];
    setAvailableRoles(roles);
    setMember(detailResult.data as MemberDetail);

    // Determine last-admin status
    if (detailResult.data.role?.base_role === 'org_admin') {
      const { count } = await createClient()
        .from('org_memberships')
        .select('id, roles!inner( base_role )', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('roles.base_role', 'org_admin');
      setIsLastAdmin((count ?? 0) <= 1);
    } else {
      setIsLastAdmin(false);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleRoleChange(newRoleId: string) {
    if (!member) return;
    if (!confirm('Change this member\'s org role?')) return;

    setActionError(null);
    startTransition(async () => {
      const result = await updateMemberRole(member.membership_id, newRoleId);
      if (result.error) {
        setActionError(result.error);
      } else {
        await loadData();
      }
    });
  }

  function handleRemoveMember() {
    if (!member) return;
    if (
      !confirm(
        `Remove ${member.display_name || member.email} from the organization? This cannot be undone.`,
      )
    )
      return;

    setActionError(null);
    startTransition(async () => {
      const result = await removeMember(member.membership_id);
      if (result.error) {
        setActionError(result.error);
      } else {
        router.push('/admin/members');
      }
    });
  }

  function handleAddOverride(propertyId: string) {
    const roleId = pendingOverride[propertyId];
    if (!roleId || !member) return;
    if (!confirm('Add property-level role override?')) return;

    setActionError(null);
    startTransition(async () => {
      const result = await addPropertyOverride(member.user_id, propertyId, roleId);
      if (result.error) {
        setActionError(result.error);
      } else {
        setShowOverrideFor((prev) => ({ ...prev, [propertyId]: false }));
        setPendingOverride((prev) => {
          const next = { ...prev };
          delete next[propertyId];
          return next;
        });
        await loadData();
      }
    });
  }

  function handleRemoveOverride(membershipId: string) {
    if (!confirm('Remove property-level override? The member will revert to their org role.')) return;

    setActionError(null);
    startTransition(async () => {
      const result = await removePropertyOverride(membershipId);
      if (result.error) {
        setActionError(result.error);
      } else {
        await loadData();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-sage-light rounded w-36" />
          <div className="h-10 bg-sage-light rounded w-64" />
          <div className="h-48 bg-sage-light rounded" />
          <div className="h-64 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  if (pageError || !member) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link href="/admin/members" className="text-sm text-sage hover:text-forest-dark mb-4 inline-block">
          ← Back to Members
        </Link>
        <p className="text-red-600 mt-4">{pageError ?? 'Member not found.'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Back link */}
      <Link href="/admin/members" className="text-sm text-sage hover:text-forest-dark inline-block">
        ← Back to Members
      </Link>

      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">
          {member.display_name || '(no display name)'}
        </h1>
        <p className="text-sage mt-0.5">{member.email}</p>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Org Role section */}
      <div className="card space-y-4">
        <h2 className="font-heading text-base font-semibold text-forest-dark">Org Role</h2>

        {isLastAdmin && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            This is the sole org admin. To change their role, first promote another member to org admin.
          </p>
        )}

        <div>
          <label className="label">Role</label>
          <select
            className="input-field"
            value={member.role?.id ?? ''}
            onChange={(e) => handleRoleChange(e.target.value)}
            disabled={isPending}
          >
            {availableRoles.map((role) => {
              const isAdminRole = role.base_role === 'org_admin';
              const disabled = isLastAdmin && !isAdminRole;
              return (
                <option key={role.id} value={role.id} disabled={disabled}>
                  {role.name}{disabled ? ' (sole admin — cannot downgrade)' : ''}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Per-property access table */}
      <div className="card overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-sage-light">
          <h2 className="font-heading text-base font-semibold text-forest-dark">Property Access</h2>
          <p className="text-xs text-sage mt-0.5">
            Overrides grant a different role for a specific property. Without an override the member uses their org role.
          </p>
        </div>

        {member.properties.length === 0 ? (
          <p className="px-4 py-6 text-sm text-sage italic">No properties in this organization.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Property</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Effective Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Override</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {member.properties.map((prop) => {
                const hasOverride = prop.membership !== null;
                const overrideName = prop.membership?.role_name ?? null;
                const inheritedName = member.role?.name ?? 'Org Role';
                const isShowingSelector = showOverrideFor[prop.property_id] ?? false;
                const pendingRoleId = pendingOverride[prop.property_id] ?? availableRoles[0]?.id ?? '';

                return (
                  <tr key={prop.property_id} className="align-top">
                    <td className="px-4 py-3 text-sm font-medium text-forest-dark">
                      {prop.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-sage">
                      {hasOverride ? overrideName : (
                        <span className="text-sage/70 italic">{inheritedName} (org)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {hasOverride ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-forest/10 text-forest-dark text-xs font-medium">
                          {overrideName}
                        </span>
                      ) : (
                        <span className="text-sage/50 italic text-xs">none</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {/* Remove override */}
                        {hasOverride && (
                          <button
                            onClick={() => handleRemoveOverride(prop.membership!.id)}
                            disabled={isPending}
                            className="text-xs text-red-600 hover:text-red-800 transition-colors disabled:opacity-50"
                          >
                            Remove Override
                          </button>
                        )}

                        {/* Add / change override */}
                        {isShowingSelector ? (
                          <div className="flex items-center gap-1">
                            <select
                              className="input-field text-xs py-1 px-2"
                              value={pendingRoleId}
                              onChange={(e) =>
                                setPendingOverride((prev) => ({
                                  ...prev,
                                  [prop.property_id]: e.target.value,
                                }))
                              }
                            >
                              {availableRoles.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleAddOverride(prop.property_id)}
                              disabled={isPending || !pendingRoleId}
                              className="btn-primary text-xs py-1 px-2"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setShowOverrideFor((prev) => ({ ...prev, [prop.property_id]: false }));
                              }}
                              className="btn-secondary text-xs py-1 px-2"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              // Pre-select current override role if exists, otherwise first role
                              const defaultRoleId =
                                availableRoles.find(
                                  (r) => r.name === prop.membership?.role_name,
                                )?.id ?? availableRoles[0]?.id ?? '';
                              setPendingOverride((prev) => ({
                                ...prev,
                                [prop.property_id]: defaultRoleId,
                              }));
                              setShowOverrideFor((prev) => ({ ...prev, [prop.property_id]: true }));
                            }}
                            className="text-xs text-sage hover:text-forest-dark transition-colors"
                          >
                            {hasOverride ? 'Change Override' : 'Add Override'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Remove from org */}
      <div className="card border border-red-100 bg-red-50/30 space-y-3">
        <h2 className="font-heading text-base font-semibold text-red-800">Danger Zone</h2>
        <p className="text-sm text-red-700">
          Removing this member will revoke all their access to this organization and its properties.
        </p>
        <button
          onClick={handleRemoveMember}
          disabled={isPending}
          className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          Remove from Organization
        </button>
      </div>
    </div>
  );
}
