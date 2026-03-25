'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Item, ItemUpdate, UpdateType, Role } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/item/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatShortDate } from '@/lib/utils';

type UserWithMembership = {
  id: string;
  display_name: string | null;
  email: string | null;
  is_temporary: boolean;
  created_at: string;
  role_name: string;
  role_id: string;
  membership_id: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserWithMembership[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [updates, setUpdates] = useState<(ItemUpdate & { item_name?: string; update_type_name?: string })[]>([]);
  const [updateTypes, setUpdateTypes] = useState<UpdateType[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'items' | 'updates'>('items');

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const [membershipRes, roleRes, itemRes, updateRes, typeRes] = await Promise.all([
        supabase.from('org_memberships')
          .select('id, role_id, users!inner(id, display_name, email, is_temporary, created_at), roles!inner(id, name)')
          .eq('status', 'active')
          .order('created_at', { ascending: true }),
        supabase.from('roles').select('*').order('sort_order', { ascending: true }),
        supabase.from('items').select('*').order('name', { ascending: true }),
        supabase.from('item_updates').select('*').order('update_date', { ascending: false }),
        supabase.from('update_types').select('*').order('sort_order', { ascending: true }),
      ]);

      if (membershipRes.data) {
        setUsers(membershipRes.data.map((m: any) => ({
          id: m.users.id,
          display_name: m.users.display_name,
          email: m.users.email,
          is_temporary: m.users.is_temporary,
          created_at: m.users.created_at,
          role_name: m.roles.name,
          role_id: m.role_id,
          membership_id: m.id,
        })));
      }
      if (roleRes.data) setAvailableRoles(roleRes.data);
      if (itemRes.data) setItems(itemRes.data);
      if (typeRes.data) setUpdateTypes(typeRes.data);
      if (updateRes.data) {
        const typeMap = new Map((typeRes.data || []).map((t) => [t.id, t]));
        const enriched = updateRes.data.map((u) => ({
          ...u,
          item_name: itemRes.data?.find((b) => b.id === u.item_id)?.name,
          update_type_name: typeMap.get(u.update_type_id)?.name,
        }));
        setUpdates(enriched);
      }

      setLoading(false);
    }

    fetchData();
  }, []);

  async function handleDeleteItem(id: string) {
    if (!confirm('Delete this item and all its updates? This cannot be undone.')) return;

    const supabase = createClient();
    const { error } = await supabase.from('items').delete().eq('id', id);

    if (!error) {
      setItems((prev) => prev.filter((b) => b.id !== id));
      setUpdates((prev) => prev.filter((u) => u.item_id !== id));
    }
  }

  async function handleDeleteUpdate(id: string) {
    if (!confirm('Delete this update?')) return;

    const supabase = createClient();
    const { error } = await supabase.from('item_updates').delete().eq('id', id);

    if (!error) {
      setUpdates((prev) => prev.filter((u) => u.id !== id));
    }
  }

  async function handleRoleChange(membershipId: string, newRoleId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('org_memberships')
      .update({ role_id: newRoleId })
      .eq('id', membershipId);

    if (!error) {
      const roleName = availableRoles.find(r => r.id === newRoleId)?.name ?? '';
      setUsers((prev) =>
        prev.map((u) => u.membership_id === membershipId
          ? { ...u, role_id: newRoleId, role_name: roleName }
          : u)
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
        {(['items', 'updates', 'users'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-forest text-forest-dark'
                : 'border-transparent text-sage hover:text-forest-dark'
            }`}
          >
            {tab === 'items'
              ? `Items (${items.length})`
              : tab === 'updates'
              ? `Updates (${updates.length})`
              : `Users (${users.length})`}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="card bg-sage-light">
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
                <tr className="border-b border-sage-light bg-sage-light">
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
              <tbody className="divide-y divide-sage-light">
                {users.map((u) => (
                  <tr key={u.membership_id}>
                    <td className="px-4 py-3 text-sm text-forest-dark">
                      {u.display_name || u.email || 'Unnamed User'}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role_id}
                        onChange={(e) => handleRoleChange(u.membership_id, e.target.value)}
                        className="input-field w-auto text-sm py-1"
                      >
                        {availableRoles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-sage">
                      {formatShortDate(u.created_at)}
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

      {/* Items tab */}
      {activeTab === 'items' && (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-sage-light cursor-pointer"
                  onClick={() => router.push(`/manage/edit/${item.id}`)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-forest-dark hover:underline hover:decoration-forest">
                    {item.name}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteItem(item.id);
                      }}
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
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                  Item
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
            <tbody className="divide-y divide-sage-light">
              {updates.map((u) => (
                <tr key={u.id} className="hover:bg-sage-light">
                  <td className="px-4 py-3 text-sm text-forest-dark">
                    {u.item_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-sage">
                    {u.update_type_name || '—'}
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
