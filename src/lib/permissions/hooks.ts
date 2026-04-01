'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface UserPermissions {
  items: { view: boolean; create: boolean; edit_any: boolean; edit_assigned: boolean; delete: boolean };
  updates: { view: boolean; create: boolean; edit_own: boolean; edit_any: boolean; delete: boolean };
  attachments: { upload: boolean; delete_own: boolean; delete_any: boolean };
  isAdmin: boolean;
}

const EMPTY_PERMISSIONS: UserPermissions = {
  items: { view: false, create: false, edit_any: false, edit_assigned: false, delete: false },
  updates: { view: false, create: false, edit_own: false, edit_any: false, delete: false },
  attachments: { upload: false, delete_own: false, delete_any: false },
  isAdmin: false,
};

const ADMIN_PERMISSIONS: UserPermissions = {
  items: { view: true, create: true, edit_any: true, edit_assigned: true, delete: true },
  updates: { view: true, create: true, edit_own: true, edit_any: true, delete: true },
  attachments: { upload: true, delete_own: true, delete_any: true },
  isAdmin: true,
};

const PERMISSIONS_CACHE_KEY = 'cached_user_permissions';

/** Cache resolved permissions in localStorage */
function cachePermissions(permissions: UserPermissions): void {
  try {
    localStorage.setItem(PERMISSIONS_CACHE_KEY, JSON.stringify(permissions));
  } catch {
    // Caching is best-effort
  }
}

/** Read cached permissions from localStorage */
function getCachedPermissions(): UserPermissions | null {
  try {
    const raw = localStorage.getItem(PERMISSIONS_CACHE_KEY);
    if (raw) {
      return JSON.parse(raw) as UserPermissions;
    }
  } catch {
    // Cache miss
  }
  return null;
}

/**
 * Fetches the current user's effective permissions for the current org.
 * Returns empty permissions if not authenticated.
 * Falls back to cached permissions from IndexedDB when offline.
 */
export function usePermissions(): { permissions: UserPermissions; loading: boolean } {
  const [permissions, setPermissions] = useState<UserPermissions>(EMPTY_PERMISSIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPermissions() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // Check platform admin
        const { data: profile } = await supabase
          .from('users')
          .select('is_platform_admin')
          .eq('id', user.id)
          .single();

        if (profile?.is_platform_admin) {
          setPermissions(ADMIN_PERMISSIONS);
          cachePermissions(ADMIN_PERMISSIONS);
          setLoading(false);
          return;
        }

        // Get the user's role via org_membership → role → permissions
        const { data: membership } = await supabase
          .from('org_memberships')
          .select('roles ( base_role, permissions )')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .limit(1)
          .single();

        if (!membership) {
          setLoading(false);
          return;
        }

        const role = (membership as any).roles as { base_role: string; permissions: Record<string, any> } | null;
        if (!role) {
          setLoading(false);
          return;
        }

        if (role.base_role === 'org_admin') {
          setPermissions(ADMIN_PERMISSIONS);
          cachePermissions(ADMIN_PERMISSIONS);
          setLoading(false);
          return;
        }

        const p = role.permissions;
        const resolved: UserPermissions = {
          items: {
            view: p?.items?.view ?? false,
            create: p?.items?.create ?? false,
            edit_any: p?.items?.edit_any ?? false,
            edit_assigned: p?.items?.edit_assigned ?? false,
            delete: p?.items?.delete ?? false,
          },
          updates: {
            view: p?.updates?.view ?? false,
            create: p?.updates?.create ?? false,
            edit_own: p?.updates?.edit_own ?? false,
            edit_any: p?.updates?.edit_any ?? false,
            delete: p?.updates?.delete ?? false,
          },
          attachments: {
            upload: p?.attachments?.upload ?? false,
            delete_own: p?.attachments?.delete_own ?? false,
            delete_any: p?.attachments?.delete_any ?? false,
          },
          isAdmin: false,
        };
        setPermissions(resolved);
        cachePermissions(resolved);
        setLoading(false);
      } catch {
        // Offline or network error — fall back to cached permissions
        const cached = getCachedPermissions();
        if (cached) {
          setPermissions(cached);
        }
        setLoading(false);
      }
    }

    fetchPermissions();
  }, []);

  return { permissions, loading };
}
