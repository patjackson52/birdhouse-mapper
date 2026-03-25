import { describe, it, expect } from 'vitest';
import { hasPermission, type ResolvedAccess } from '../resolve';
import type { Role, RolePermissions } from '../../types';

// Helper to create a minimal Role for testing
function makeRole(overrides: Partial<RolePermissions> = {}): Role {
  const defaultPerms: RolePermissions = {
    org: { manage_settings: false, manage_members: false, manage_billing: false, manage_roles: false, view_audit_log: false },
    properties: { create: false, manage_all: false, view_all: true },
    items: { view: true, create: false, edit_any: false, edit_assigned: false, delete: false },
    updates: { view: true, create: false, edit_own: false, edit_any: false, delete: false, approve_public_submissions: false },
    tasks: { view_assigned: false, view_all: false, create: false, assign: false, complete: false },
    attachments: { upload: false, delete_own: false, delete_any: false },
    reports: { view: false, export: false },
    modules: { tasks: false, volunteers: false, public_forms: false, qr_codes: false, reports: false },
  };
  return {
    id: 'role-1', org_id: 'org-1', name: 'Test', description: null,
    base_role: 'viewer', color: null, icon: null,
    permissions: { ...defaultPerms, ...overrides },
    is_default_new_member_role: false, is_public_role: false, is_system_role: false,
    sort_order: 0, created_at: '', updated_at: '',
  };
}

describe('hasPermission', () => {
  it('returns true for platform_admin regardless of permissions', () => {
    const access: ResolvedAccess = {
      role: makeRole(),
      permissions: makeRole().permissions,
      source: 'platform_admin',
    };
    expect(hasPermission(access, 'items', 'delete')).toBe(true);
  });

  it('returns true for org_admin regardless of permissions', () => {
    const access: ResolvedAccess = {
      role: makeRole(),
      permissions: makeRole().permissions,
      source: 'org_admin',
    };
    expect(hasPermission(access, 'items', 'delete')).toBe(true);
  });

  it('checks permission JSONB for org_membership source', () => {
    const role = makeRole({ items: { view: true, create: true, edit_any: false, edit_assigned: false, delete: false } });
    const access: ResolvedAccess = {
      role,
      permissions: role.permissions,
      source: 'org_membership',
    };
    expect(hasPermission(access, 'items', 'create')).toBe(true);
    expect(hasPermission(access, 'items', 'delete')).toBe(false);
  });

  it('checks permission JSONB for temporary_grant source', () => {
    const role = makeRole({ items: { view: true, create: true, edit_any: false, edit_assigned: false, delete: false } });
    const access: ResolvedAccess = {
      role,
      permissions: role.permissions,
      source: 'temporary_grant',
    };
    expect(hasPermission(access, 'items', 'create')).toBe(true);
    expect(hasPermission(access, 'items', 'delete')).toBe(false);
  });

  it('returns false for unknown category/action', () => {
    const role = makeRole();
    const access: ResolvedAccess = {
      role,
      permissions: role.permissions,
      source: 'org_membership',
    };
    expect(hasPermission(access, 'nonexistent' as any, 'anything')).toBe(false);
  });
});
