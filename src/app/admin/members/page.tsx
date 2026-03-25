'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { EmptyState } from '@/components/admin/EmptyState';
import { getOrgMembers, inviteMember } from './actions';

type Member = {
  membership_id: string;
  user_id: string;
  display_name: string;
  email: string;
  role_name: string;
  role_base_role: string;
  joined_at: string | null;
  property_count: number;
};

type Role = {
  id: string;
  name: string;
  base_role: string;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function MembersPage() {
  const router = useRouter();

  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Invite form state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  async function loadData() {
    const supabase = createClient();

    const [membersResult, rolesResult] = await Promise.all([
      getOrgMembers(),
      supabase.from('roles').select('id, name, base_role').order('name', { ascending: true }),
    ]);

    if (membersResult.members) {
      setMembers(membersResult.members as Member[]);
    }

    if (rolesResult.data) {
      setRoles(rolesResult.data);
      if (rolesResult.data.length > 0 && !inviteRoleId) {
        setInviteRoleId(rolesResult.data[0].id);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteRoleId) return;

    setInviteError(null);
    setInviteLoading(true);
    setInviteSuccess(false);

    const result = await inviteMember(inviteEmail, inviteRoleId);

    setInviteLoading(false);

    if ('error' in result && result.error) {
      setInviteError(result.error);
      return;
    }

    setInviteSuccess(true);
    setInviteEmail('');
    await loadData();
  }

  function handleCancelInvite() {
    setShowInviteForm(false);
    setInviteEmail('');
    setInviteError(null);
    setInviteSuccess(false);
  }

  const filteredMembers = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.display_name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    );
  });

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
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold text-forest-dark">Members</h1>
          <span className="text-sm text-sage">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </span>
        </div>
        <button
          onClick={() => setShowInviteForm((v) => !v)}
          className="btn-primary text-sm"
        >
          {showInviteForm ? 'Cancel' : 'Invite Member'}
        </button>
      </div>

      {/* Inline invite form */}
      {showInviteForm && (
        <div className="card mb-6 border border-sage-light bg-sage-light/30">
          <h2 className="font-heading text-base font-semibold text-forest-dark mb-4">
            Invite Member
          </h2>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                className="input-field"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
                required
              />
            </div>
            <div>
              <label className="label">Role</label>
              <select
                className="input-field"
                value={inviteRoleId}
                onChange={(e) => setInviteRoleId(e.target.value)}
                required
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            {inviteError && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{inviteError}</p>
            )}
            {inviteSuccess && (
              <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">
                Invitation sent successfully.
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                className="btn-primary text-sm"
                disabled={inviteLoading || !inviteEmail.trim() || !inviteRoleId}
              >
                {inviteLoading ? 'Sending…' : 'Send Invite'}
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={handleCancelInvite}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          className="input-field max-w-sm"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Members table */}
      {filteredMembers.length === 0 ? (
        <EmptyState
          title={search ? 'No matching members' : 'No members yet'}
          description={
            search
              ? 'Try a different search term.'
              : 'Invite your first member to get started.'
          }
          actionLabel={!search ? 'Invite Member' : undefined}
          onAction={!search ? () => setShowInviteForm(true) : undefined}
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
                  Org Role
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase hidden md:table-cell">
                  Properties
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden lg:table-cell">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {filteredMembers.map((member) => (
                <tr
                  key={member.membership_id}
                  className="hover:bg-sage-light cursor-pointer transition-colors"
                  onClick={() => router.push(`/admin/members/${member.user_id}`)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-forest-dark">
                    {member.display_name || <span className="italic text-sage">No name</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-sage hidden sm:table-cell">
                    {member.email}
                  </td>
                  <td className="px-4 py-3">
                    {member.role_name ? (
                      <StatusBadge status={member.role_base_role || member.role_name} />
                    ) : (
                      <span className="text-sm text-sage italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-sage text-right hidden md:table-cell">
                    {member.property_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-sage hidden lg:table-cell">
                    {formatDate(member.joined_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
