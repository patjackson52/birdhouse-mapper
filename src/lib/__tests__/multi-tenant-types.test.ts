import { describe, it, expect } from 'vitest';
import type {
  BaseRole,
  OrgMembershipStatus,
  SubscriptionTier,
  SubscriptionStatus,
  Org,
  Role,
  RolePermissions,
  OrgMembership,
  Database,
} from '../types';

describe('Multi-tenant types', () => {
  describe('BaseRole', () => {
    it('accepts all valid base_role values', () => {
      const roles: BaseRole[] = [
        'platform_admin',
        'org_admin',
        'org_staff',
        'contributor',
        'viewer',
        'public',
        'public_contributor',
      ];
      expect(roles).toHaveLength(7);
    });

    it('rejects invalid values at compile time', () => {
      // @ts-expect-error - 'superadmin' is not a valid BaseRole
      const _bad: BaseRole = 'superadmin';
    });
  });

  describe('OrgMembershipStatus', () => {
    it('accepts all valid status values', () => {
      const statuses: OrgMembershipStatus[] = [
        'invited',
        'active',
        'suspended',
        'revoked',
        'banned',
      ];
      expect(statuses).toHaveLength(5);
    });

    it('rejects invalid values at compile time', () => {
      // @ts-expect-error - 'inactive' is not a valid OrgMembershipStatus
      const _bad: OrgMembershipStatus = 'inactive';
    });
  });

  describe('SubscriptionTier', () => {
    it('accepts all valid tier values', () => {
      const tiers: SubscriptionTier[] = ['free', 'community', 'pro', 'municipal'];
      expect(tiers).toHaveLength(4);
    });

    it('rejects invalid values at compile time', () => {
      // @ts-expect-error - 'enterprise' is not a valid SubscriptionTier
      const _bad: SubscriptionTier = 'enterprise';
    });
  });

  describe('SubscriptionStatus', () => {
    it('accepts all valid status values', () => {
      const statuses: SubscriptionStatus[] = ['trialing', 'active', 'past_due', 'cancelled'];
      expect(statuses).toHaveLength(4);
    });

    it('rejects invalid values at compile time', () => {
      // @ts-expect-error - 'expired' is not a valid SubscriptionStatus
      const _bad: SubscriptionStatus = 'expired';
    });
  });

  describe('Org', () => {
    it('has required fields', () => {
      const org: Org = {
        id: 'test-id',
        name: 'Test Org',
        slug: 'test-org',
        is_active: true,
        subscription_tier: 'free',
        subscription_status: 'trialing',
        primary_custom_domain_id: null,
        logo_url: null,
        favicon_url: null,
        theme: null,
        tagline: null,
        setup_complete: false,
        default_property_id: null,
        map_display_config: null,
        communications_enabled: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        allow_public_contributions: false,
        moderation_mode: 'auto_approve',
      };
      expect(org.slug).toBe('test-org');
      expect(org.primary_custom_domain_id).toBeNull();
    });
  });

  describe('RolePermissions', () => {
    it('has all permission categories', () => {
      const perms: RolePermissions = {
        org: {
          manage_settings: false,
          manage_members: false,
          manage_billing: false,
          manage_roles: false,
          view_audit_log: false,
        },
        properties: { create: false, manage_all: false, view_all: true },
        items: {
          view: true,
          create: false,
          edit_any: false,
          edit_assigned: false,
          delete: false,
        },
        updates: {
          view: true,
          create: false,
          edit_own: false,
          edit_any: false,
          delete: false,
          approve_public_submissions: false,
        },
        tasks: {
          view_assigned: false,
          view_all: false,
          create: false,
          assign: false,
          complete: false,
        },
        attachments: { upload: false, delete_own: false, delete_any: false },
        reports: { view: false, export: false },
        modules: {
          tasks: false,
          volunteers: false,
          public_forms: false,
          qr_codes: false,
          reports: false,
        },
        ai_context: { view: false, download: false, upload: false, manage: false },
      };
      expect(Object.keys(perms)).toEqual([
        'org',
        'properties',
        'items',
        'updates',
        'tasks',
        'attachments',
        'reports',
        'modules',
        'ai_context',
      ]);
    });
  });

  describe('Role', () => {
    it('has required fields including permissions', () => {
      const role: Role = {
        id: 'test-id',
        org_id: 'org-id',
        name: 'Admin',
        description: 'Full access',
        base_role: 'org_admin',
        color: '#ff0000',
        icon: 'shield',
        permissions: {
          org: {
            manage_settings: true,
            manage_members: true,
            manage_billing: true,
            manage_roles: true,
            view_audit_log: true,
          },
          properties: { create: true, manage_all: true, view_all: true },
          items: {
            view: true,
            create: true,
            edit_any: true,
            edit_assigned: true,
            delete: true,
          },
          updates: {
            view: true,
            create: true,
            edit_own: true,
            edit_any: true,
            delete: true,
            approve_public_submissions: true,
          },
          tasks: {
            view_assigned: true,
            view_all: true,
            create: true,
            assign: true,
            complete: true,
          },
          attachments: { upload: true, delete_own: true, delete_any: true },
          reports: { view: true, export: true },
          modules: {
            tasks: true,
            volunteers: true,
            public_forms: true,
            qr_codes: true,
            reports: true,
          },
          ai_context: { view: true, download: true, upload: true, manage: true },
        },
        is_default_new_member_role: false,
        is_public_role: false,
        is_system_role: true,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      expect(role.base_role).toBe('org_admin');
    });
  });

  describe('OrgMembership', () => {
    it('allows nullable user_id for pending invites', () => {
      const membership: OrgMembership = {
        id: 'test-id',
        org_id: 'org-id',
        user_id: null,
        role_id: 'role-id',
        status: 'invited',
        invited_email: 'new@example.com',
        invited_by: 'admin-id',
        invitation_token: 'abc123',
        invitation_expires_at: '2026-02-01T00:00:00Z',
        accepted_at: null,
        is_primary_org: false,
        default_property_id: null,
        notification_prefs: {},
        joined_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      expect(membership.user_id).toBeNull();
      expect(membership.status).toBe('invited');
    });
  });

  describe('Database interface', () => {
    it('includes orgs table', () => {
      type OrgsRow = Database['public']['Tables']['orgs']['Row'];
      const _check: OrgsRow extends Org ? true : never = true;
      expect(_check).toBe(true);
    });

    it('includes roles table', () => {
      type RolesRow = Database['public']['Tables']['roles']['Row'];
      const _check: RolesRow extends Role ? true : never = true;
      expect(_check).toBe(true);
    });

    it('includes org_memberships table', () => {
      type OmRow = Database['public']['Tables']['org_memberships']['Row'];
      const _check: OmRow extends OrgMembership ? true : never = true;
      expect(_check).toBe(true);
    });

    it('does not include profiles (view dropped in Phase 3)', () => {
      // @ts-expect-error - profiles should be removed from Database
      type _Dead = Database['public']['Tables']['profiles'];
    });
  });
});
