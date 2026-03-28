'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createInvite, getInvites, getInviteRoles, convertAccount, revokeAccess } from './actions';
import { formatShortDate } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

type InviteRow = {
  id: string;
  display_name: string | null;
  convertible: boolean;
  session_expires_at: string;
  expires_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
  claimed_display_name: string | null;
  roles: { name: string } | null;
};

type InviteRole = {
  id: string;
  name: string;
  base_role: string;
  permissions: Record<string, Record<string, boolean>>;
};

/** Map permission keys to human-readable labels */
const CAPABILITY_LABELS: Record<string, string> = {
  'items.view': 'View items on the map',
  'items.create': 'Create new items',
  'items.edit_any': 'Edit any item',
  'items.edit_assigned': 'Edit items they created',
  'updates.create': 'Add observations',
  'updates.edit_own': 'Edit own observations',
  'attachments.upload': 'Upload photos',
};

function getRoleCapabilities(permissions: Record<string, Record<string, boolean>>): string[] {
  const caps: string[] = [];
  for (const [category, actions] of Object.entries(permissions)) {
    for (const [action, enabled] of Object.entries(actions)) {
      const key = `${category}.${action}`;
      if (enabled && CAPABILITY_LABELS[key]) {
        caps.push(CAPABILITY_LABELS[key]);
      }
    }
  }
  return caps;
}

type View = 'list' | 'create' | 'share' | 'convert';

function getInviteStatus(invite: InviteRow): 'active' | 'pending' | 'expired' {
  const now = new Date();
  if (invite.claimed_by) {
    return new Date(invite.session_expires_at) > now ? 'active' : 'expired';
  }
  return new Date(invite.expires_at) > now ? 'pending' : 'expired';
}

const statusStyles = {
  active: 'bg-green-500/10 text-green-700',
  pending: 'bg-amber-500/10 text-amber-700',
  expired: 'bg-red-500/10 text-red-700',
};

export default function AdminInvitesPage() {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');

  const [availableRoles, setAvailableRoles] = useState<InviteRole[]>([]);
  const [createName, setCreateName] = useState('');
  const [createRoleId, setCreateRoleId] = useState('');
  const [createExpiry, setCreateExpiry] = useState('23:59');
  const [createConvertible, setCreateConvertible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [shareToken, setShareToken] = useState('');
  const [shareExpiresAt, setShareExpiresAt] = useState('');

  const [convertUserId, setConvertUserId] = useState('');
  const [convertName, setConvertName] = useState('');
  const [convertEmail, setConvertEmail] = useState('');
  const [convertPassword, setConvertPassword] = useState('');
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState('');

  async function loadInvites() {
    const [inviteResult, rolesResult] = await Promise.all([
      getInvites(),
      getInviteRoles(),
    ]);
    if (inviteResult.invites) setInvites(inviteResult.invites);
    if (rolesResult.roles) {
      setAvailableRoles(rolesResult.roles);
      // Default to contributor role
      const contributor = rolesResult.roles.find((r) => r.base_role === 'contributor');
      if (contributor && !createRoleId) setCreateRoleId(contributor.id);
    }
    setLoading(false);
  }

  useEffect(() => { loadInvites(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);

    const expiryTime = new Date();
    const [hours, mins] = createExpiry.split(':').map(Number);
    expiryTime.setHours(hours, mins, 0, 0);

    if (expiryTime <= new Date()) {
      setCreateError('Session expiry must be in the future');
      setCreating(false);
      return;
    }

    const result = await createInvite({
      displayName: createName.trim() || null,
      sessionExpiresAt: expiryTime.toISOString(),
      convertible: createConvertible,
      roleId: createRoleId,
    });

    setCreating(false);

    if (result.error) {
      setCreateError(result.error);
      return;
    }

    setShareToken(result.token!);
    setShareExpiresAt(result.expiresAt!);
    setView('share');
    loadInvites();
  }

  async function handleConvert(e: React.FormEvent) {
    e.preventDefault();
    setConvertError('');
    setConverting(true);

    const result = await convertAccount({
      userId: convertUserId,
      email: convertEmail,
      password: convertPassword,
    });

    setConverting(false);

    if (result.error) {
      setConvertError(result.error);
      return;
    }

    setView('list');
    loadInvites();
  }

  async function handleRevoke(userId: string) {
    const result = await revokeAccess(userId);
    if (!result.error) loadInvites();
  }

  function openConvert(userId: string, displayName: string) {
    setConvertUserId(userId);
    setConvertName(displayName);
    setConvertEmail('');
    setConvertPassword('');
    setConvertError('');
    setView('convert');
  }

  const inviteUrl = shareToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${shareToken}`
    : '';

  if (loading) return <LoadingSpinner className="py-12" />;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">
          Invites
        </h1>
        {view === 'list' && (
          <button
            onClick={() => {
              setCreateName('');
              const contributor = availableRoles.find((r) => r.base_role === 'contributor');
              if (contributor) setCreateRoleId(contributor.id);
              setCreateExpiry('23:59');
              setCreateConvertible(false);
              setCreateError('');
              setView('create');
            }}
            className="btn-primary text-sm"
          >
            + Create Invite
          </button>
        )}
        {view !== 'list' && (
          <button
            onClick={() => setView('list')}
            className="text-sm text-sage hover:text-forest-dark transition-colors"
          >
            Back to list
          </button>
        )}
      </div>

      {view === 'create' && (
        <div className="card max-w-md">
          <h2 className="font-heading text-lg font-semibold text-forest-dark mb-4">
            Create New Invite
          </h2>
          {createError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">
              {createError}
            </div>
          )}
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="invite-name" className="label">
                Display Name (optional)
              </label>
              <input
                id="invite-name"
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="input-field"
                placeholder="e.g. Sarah M."
              />
              <p className="text-xs text-sage mt-1">
                Leave blank to let the user enter their name
              </p>
            </div>
            <div>
              <label htmlFor="invite-role" className="label">
                Access Level
              </label>
              <select
                id="invite-role"
                value={createRoleId}
                onChange={(e) => setCreateRoleId(e.target.value)}
                className="input-field"
              >
                {availableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              {createRoleId && (() => {
                const selectedRole = availableRoles.find((r) => r.id === createRoleId);
                const caps = selectedRole ? getRoleCapabilities(selectedRole.permissions) : [];
                return caps.length > 0 ? (
                  <div className="mt-2 rounded-lg bg-forest/5 border border-forest/10 px-3 py-2">
                    <div className="text-xs font-medium text-forest-dark mb-1">This role allows:</div>
                    <ul className="space-y-0.5">
                      {caps.map((cap) => (
                        <li key={cap} className="text-xs text-forest-dark/70 flex items-start gap-1.5">
                          <span className="text-forest mt-px">✓</span>
                          {cap}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null;
              })()}
            </div>
            <div>
              <label htmlFor="invite-expiry" className="label">
                Session Expires
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="invite-expiry"
                  type="time"
                  value={createExpiry}
                  onChange={(e) => setCreateExpiry(e.target.value)}
                  className="input-field"
                />
                <span className="text-sm text-sage">today</span>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createConvertible}
                onChange={(e) => setCreateConvertible(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm text-forest-dark">
                Allow conversion to permanent account
              </span>
            </label>
            <button
              type="submit"
              disabled={creating}
              className="btn-primary w-full"
            >
              {creating ? 'Generating...' : 'Generate Invite'}
            </button>
          </form>
        </div>
      )}

      {view === 'share' && shareToken && (
        <div className="card max-w-md text-center">
          <h2 className="font-heading text-lg font-semibold text-forest-dark mb-4">
            Invite Ready
          </h2>
          <div className="bg-white inline-block p-4 rounded-lg mb-4">
            <QRCodeSVG value={inviteUrl} size={200} />
          </div>
          <p className="text-xs text-sage mb-2">or copy link</p>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={inviteUrl}
              readOnly
              className="input-field text-xs flex-1"
            />
            <button
              onClick={() => navigator.clipboard.writeText(inviteUrl)}
              className="btn-primary text-sm px-3"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-sage">
            Link expires at{' '}
            {new Date(shareExpiresAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
      )}

      {view === 'convert' && (
        <div className="card max-w-md">
          <h2 className="font-heading text-lg font-semibold text-forest-dark mb-4">
            Convert to Permanent Account
          </h2>
          <p className="text-sm text-sage mb-4">
            Converting <strong>{convertName}</strong> to a permanent editor account.
          </p>
          {convertError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">
              {convertError}
            </div>
          )}
          <form onSubmit={handleConvert} className="space-y-4">
            <div>
              <label htmlFor="convert-email" className="label">Email</label>
              <input
                id="convert-email"
                type="email"
                value={convertEmail}
                onChange={(e) => setConvertEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label htmlFor="convert-password" className="label">Password</label>
              <input
                id="convert-password"
                type="password"
                value={convertPassword}
                onChange={(e) => setConvertPassword(e.target.value)}
                className="input-field"
                minLength={6}
                required
              />
            </div>
            <button
              type="submit"
              disabled={converting}
              className="btn-primary w-full"
            >
              {converting ? 'Converting...' : 'Convert Account'}
            </button>
          </form>
        </div>
      )}

      {view === 'list' && (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">Created</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {invites.map((invite) => {
                const status = getInviteStatus(invite);
                return (
                  <tr key={invite.id}>
                    <td className="px-4 py-3 text-sm text-forest-dark">
                      {invite.claimed_display_name || invite.display_name || '(unnamed)'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyles[status]}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-sage hidden sm:table-cell">
                      {invite.roles?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-sage hidden sm:table-cell">
                      {formatShortDate(invite.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {status === 'active' && invite.convertible && invite.claimed_by && (
                        <button
                          onClick={() =>
                            openConvert(
                              invite.claimed_by!,
                              invite.claimed_display_name || invite.display_name || 'Guest'
                            )
                          }
                          className="text-xs text-forest hover:text-forest-dark transition-colors"
                        >
                          Convert
                        </button>
                      )}
                      {status === 'active' && invite.claimed_by && (
                        <button
                          onClick={() => handleRevoke(invite.claimed_by!)}
                          className="text-xs text-red-600 hover:text-red-800 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                      {status !== 'active' && (
                        <span className="text-xs text-sage">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {invites.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-sage">
                    No invites yet. Click &quot;+ Create Invite&quot; to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
