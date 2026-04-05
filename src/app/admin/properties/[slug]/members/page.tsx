'use client';

import { useState, useTransition } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { EmptyState } from '@/components/admin/EmptyState';
import {
  getPropertyMembers,
  addPropertyOverrideForProperty as addPropertyOverride,
  removePropertyOverrideForProperty as removePropertyOverride,
  type PropertyMember,
} from './actions';

type Role = {
  id: string;
  name: string;
  base_role: string;
};

type Property = {
  id: string;
  name: string;
  slug: string;
};

export default function PropertyMembersPage() {
  const params = useParams();
  const slug = params.slug as string;
  const pathname = usePathname();
  const propertyBase = pathname.includes('/p/') ? `/p/${slug}/admin` : `/admin/properties/${slug}`;

  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const [actionError, setActionError] = useState<string | null>(null);

  // Per-member "add override" dropdown state: userId → selected roleId
  const [pendingOverride, setPendingOverride] = useState<Record<string, string>>({});
  // Which member rows are showing the override selector
  const [showOverrideFor, setShowOverrideFor] = useState<Record<string, boolean>>({});

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'property', slug, 'members'],
    queryFn: async () => {
      const [membersResult, rolesResult] = await Promise.all([
        getPropertyMembers(slug),
        createClient()
          .from('roles')
          .select('id, name, base_role')
          .neq('base_role', 'platform_admin')
          .order('sort_order', { ascending: true }),
      ]);

      if (membersResult.error || !membersResult.property) {
        return {
          error: membersResult.error ?? 'Property not found',
          property: null,
          members: [] as PropertyMember[],
          availableRoles: [] as Role[],
        };
      }

      return {
        error: null,
        property: membersResult.property,
        members: membersResult.members ?? [],
        availableRoles: (rolesResult.data ?? []) as Role[],
      };
    },
  });

  const loading = isLoading;
  const property = data?.property ?? null;
  const members = data?.members ?? [];
  const availableRoles = data?.availableRoles ?? [];
  const pageError = data?.error ?? null;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleAddOverride(userId: string) {
    const roleId = pendingOverride[userId];
    if (!roleId || !property) return;
    if (!confirm('Add property-level role override for this member?')) return;

    setActionError(null);
    startTransition(async () => {
      const result = await addPropertyOverride(userId, property.id, roleId);
      if (result.error) {
        setActionError(result.error);
      } else {
        setShowOverrideFor((prev) => ({ ...prev, [userId]: false }));
        setPendingOverride((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
        await queryClient.invalidateQueries({ queryKey: ['admin', 'property', slug, 'members'] });
      }
    });
  }

  function handleRemoveOverride(propertyMembershipId: string) {
    if (!confirm('Remove property-level override? The member will revert to their org role.')) return;

    setActionError(null);
    startTransition(async () => {
      const result = await removePropertyOverride(propertyMembershipId);
      if (result.error) {
        setActionError(result.error);
      } else {
        await queryClient.invalidateQueries({ queryKey: ['admin', 'property', slug, 'members'] });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-sage-light rounded w-36" />
          <div className="h-10 bg-sage-light rounded w-64" />
          <div className="h-64 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  if (pageError || !property) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link
          href={propertyBase}
          className="text-sm text-sage hover:text-forest-dark mb-4 inline-block"
        >
          ← Back to Property
        </Link>
        <p className="text-red-600 mt-4">{pageError ?? 'Property not found.'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold text-forest-dark">
            Members — {property.name}
          </h1>
          <span className="text-sm text-sage">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </span>
        </div>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Members table / empty state */}
      {members.length === 0 ? (
        <EmptyState
          title="No members"
          description="No active org members found. Invite members from the Members page."
        />
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">
                  Email
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                  Effective Role
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden md:table-cell">
                  Source
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {members.map((member) => {
                const isShowingSelector = showOverrideFor[member.user_id] ?? false;
                const pendingRoleId =
                  pendingOverride[member.user_id] ?? availableRoles[0]?.id ?? '';

                return (
                  <tr key={member.user_id} className="align-top">
                    <td className="px-4 py-3 text-sm font-medium text-forest-dark">
                      <Link
                        href={`/admin/members/${member.user_id}`}
                        className="hover:underline"
                      >
                        {member.display_name || (
                          <span className="italic text-sage">No name</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-sage hidden sm:table-cell">
                      {member.email}
                    </td>
                    <td className="px-4 py-3">
                      {member.effective_role_name ? (
                        <StatusBadge
                          status={member.effective_role_base_role || member.effective_role_name}
                        />
                      ) : (
                        <span className="text-sm text-sage italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {member.has_override ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-forest/10 text-forest-dark text-xs font-medium">
                          Override
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-sage-light text-sage text-xs font-medium">
                          Org
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {/* Remove override button */}
                        {member.has_override && member.property_membership_id && (
                          <button
                            onClick={() =>
                              handleRemoveOverride(member.property_membership_id!)
                            }
                            disabled={isPending}
                            className="text-xs text-red-600 hover:text-red-800 transition-colors disabled:opacity-50"
                          >
                            Remove Override
                          </button>
                        )}

                        {/* Add / change override selector */}
                        {isShowingSelector ? (
                          <div className="flex items-center gap-1">
                            <select
                              className="input-field text-xs py-1 px-2"
                              value={pendingRoleId}
                              onChange={(e) =>
                                setPendingOverride((prev) => ({
                                  ...prev,
                                  [member.user_id]: e.target.value,
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
                              onClick={() => handleAddOverride(member.user_id)}
                              disabled={isPending || !pendingRoleId}
                              className="btn-primary text-xs py-1 px-2"
                            >
                              Save
                            </button>
                            <button
                              onClick={() =>
                                setShowOverrideFor((prev) => ({
                                  ...prev,
                                  [member.user_id]: false,
                                }))
                              }
                              className="btn-secondary text-xs py-1 px-2"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              // Pre-select the current override role if one exists
                              const defaultRoleId =
                                availableRoles.find(
                                  (r) => r.id === member.override_role_id,
                                )?.id ?? availableRoles[0]?.id ?? '';
                              setPendingOverride((prev) => ({
                                ...prev,
                                [member.user_id]: defaultRoleId,
                              }));
                              setShowOverrideFor((prev) => ({
                                ...prev,
                                [member.user_id]: true,
                              }));
                            }}
                            className="text-xs text-sage hover:text-forest-dark transition-colors"
                          >
                            {member.has_override ? 'Change Override' : 'Add Override'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
