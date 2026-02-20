'use client';

import { useEffect, useState } from 'react';
import type { Birdhouse, BirdhouseUpdate, Profile } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/birdhouse/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatShortDate, updateTypeLabels } from '@/lib/utils';

export default function AdminPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [birdhouses, setBirdhouses] = useState<Birdhouse[]>([]);
  const [updates, setUpdates] = useState<(BirdhouseUpdate & { birdhouse_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'birdhouses' | 'updates'>('birdhouses');

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'admin'>('editor');
  const [inviteMessage, setInviteMessage] = useState('');

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const [profileRes, birdhouseRes, updateRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: true }),
        supabase.from('birdhouses').select('*').order('name', { ascending: true }),
        supabase.from('birdhouse_updates').select('*').order('update_date', { ascending: false }),
      ]);

      if (profileRes.data) setProfiles(profileRes.data);
      if (birdhouseRes.data) setBirdhouses(birdhouseRes.data);
      if (updateRes.data) {
        const enriched = updateRes.data.map((u) => ({
          ...u,
          birdhouse_name: birdhouseRes.data?.find((b) => b.id === u.birdhouse_id)?.name,
        }));
        setUpdates(enriched);
      }

      setLoading(false);
    }

    fetchData();
  }, []);

  async function handleDeleteBirdhouse(id: string) {
    if (!confirm('Delete this birdhouse and all its updates? This cannot be undone.')) return;

    const supabase = createClient();
    const { error } = await supabase.from('birdhouses').delete().eq('id', id);

    if (!error) {
      setBirdhouses((prev) => prev.filter((b) => b.id !== id));
      setUpdates((prev) => prev.filter((u) => u.birdhouse_id !== id));
    }
  }

  async function handleDeleteUpdate(id: string) {
    if (!confirm('Delete this update?')) return;

    const supabase = createClient();
    const { error } = await supabase.from('birdhouse_updates').delete().eq('id', id);

    if (!error) {
      setUpdates((prev) => prev.filter((u) => u.id !== id));
    }
  }

  async function handleRoleChange(profileId: string, newRole: 'admin' | 'editor') {
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profileId);

    if (!error) {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, role: newRole } : p))
      );
    }
  }

  if (loading) {
    return <LoadingSpinner className="py-12" />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">
        Admin Dashboard
      </h1>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-sage-light">
        {(['birdhouses', 'updates', 'users'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-forest text-forest-dark'
                : 'border-transparent text-sage hover:text-forest-dark'
            }`}
          >
            {tab === 'birdhouses'
              ? `Birdhouses (${birdhouses.length})`
              : tab === 'updates'
              ? `Updates (${updates.length})`
              : `Users (${profiles.length})`}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Invite form note */}
          <div className="card bg-sage-light/30">
            <h3 className="text-sm font-medium text-forest-dark mb-2">
              Invite a User
            </h3>
            <p className="text-xs text-sage mb-3">
              To add a new user, create their account in the Supabase Dashboard
              under Authentication &gt; Users. Their profile will be auto-created
              with the &quot;editor&quot; role. You can change roles below.
            </p>
          </div>

          <div className="card overflow-hidden p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-sage-light bg-sage-light/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                    Joined
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sage-light/50">
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-sm text-forest-dark">
                      {p.display_name || 'Unnamed User'}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={p.role}
                        onChange={(e) =>
                          handleRoleChange(p.id, e.target.value as 'admin' | 'editor')
                        }
                        className="input-field w-auto text-sm py-1"
                      >
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-sage">
                      {formatShortDate(p.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-sage">—</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Birdhouses tab */}
      {activeTab === 'birdhouses' && (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">
                  Species
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light/50">
              {birdhouses.map((bh) => (
                <tr key={bh.id} className="hover:bg-sage-light/20">
                  <td className="px-4 py-3 text-sm font-medium text-forest-dark">
                    {bh.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-sage hidden sm:table-cell">
                    {bh.species_target || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={bh.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDeleteBirdhouse(bh.id)}
                      className="text-xs text-red-600 hover:text-red-800 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Updates tab */}
      {activeTab === 'updates' && (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                  Birdhouse
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                  Type
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">
                  Date
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden md:table-cell">
                  Content
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light/50">
              {updates.map((u) => (
                <tr key={u.id} className="hover:bg-sage-light/20">
                  <td className="px-4 py-3 text-sm text-forest-dark">
                    {u.birdhouse_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-sage">
                    {updateTypeLabels[u.update_type]}
                  </td>
                  <td className="px-4 py-3 text-sm text-sage hidden sm:table-cell">
                    {formatShortDate(u.update_date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-sage hidden md:table-cell max-w-xs truncate">
                    {u.content || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDeleteUpdate(u.id)}
                      className="text-xs text-red-600 hover:text-red-800 transition-colors"
                    >
                      Delete
                    </button>
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
