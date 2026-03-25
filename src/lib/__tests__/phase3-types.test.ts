import { describe, it, expect } from 'vitest';
import type {
  PropertyAccessConfig,
  TemporaryAccessGrant,
  TemporaryAccessGrantStatus,
  AnonymousAccessToken,
  Database,
} from '../types';

describe('Phase 3 types', () => {
  describe('PropertyAccessConfig', () => {
    it('has required fields', () => {
      const pac: PropertyAccessConfig = {
        id: 'test', org_id: 'org-1', property_id: 'prop-1',
        anon_access_enabled: true, anon_can_view_map: true,
        anon_can_view_items: true, anon_can_view_item_details: false,
        anon_can_submit_forms: false, anon_visible_field_keys: null,
        password_protected: false, password_hash: null,
        allow_embed: false, embed_allowed_origins: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      };
      expect(pac.anon_access_enabled).toBe(true);
    });
  });

  describe('TemporaryAccessGrant', () => {
    it('has required fields with nullable property_id for org-wide grants', () => {
      const tag: TemporaryAccessGrant = {
        id: 'test', org_id: 'org-1', property_id: null,
        user_id: 'user-1', granted_email: null, invite_token: null,
        role_id: 'role-1', valid_from: '2026-01-01T00:00:00Z',
        valid_until: '2026-01-02T00:00:00Z', is_single_use: false,
        item_ids: null, status: 'active', revoked_at: null,
        revoked_by: null, revoke_reason: null, first_used_at: null,
        granted_by: 'admin-1', note: 'Volunteer workday',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      };
      expect(tag.property_id).toBeNull();
      expect(tag.status).toBe('active');
    });

    it('rejects invalid status at compile time', () => {
      // @ts-expect-error - 'pending' is not valid
      const _bad: TemporaryAccessGrantStatus = 'pending';
    });
  });

  describe('AnonymousAccessToken', () => {
    it('has required fields', () => {
      const aat: AnonymousAccessToken = {
        id: 'test', org_id: 'org-1', property_id: 'prop-1',
        token: 'abc123', can_view_map: true, can_view_items: true,
        can_submit_forms: false, expires_at: null, use_count: 0,
        last_used_at: null, is_active: true, label: 'Public map embed',
        allowed_domain_id: null,
        created_by: 'user-1', created_at: '2026-01-01T00:00:00Z',
      };
      expect(aat.is_active).toBe(true);
    });
  });

  describe('Database interface', () => {
    it('includes property_access_config', () => {
      type Row = Database['public']['Tables']['property_access_config']['Row'];
      const _check: Row extends PropertyAccessConfig ? true : never = true;
      expect(_check).toBe(true);
    });

    it('includes temporary_access_grants', () => {
      type Row = Database['public']['Tables']['temporary_access_grants']['Row'];
      const _check: Row extends TemporaryAccessGrant ? true : never = true;
      expect(_check).toBe(true);
    });

    it('includes anonymous_access_tokens', () => {
      type Row = Database['public']['Tables']['anonymous_access_tokens']['Row'];
      const _check: Row extends AnonymousAccessToken ? true : never = true;
      expect(_check).toBe(true);
    });

    it('does not include profiles (view dropped)', () => {
      // @ts-expect-error - profiles should be removed
      type _Dead = Database['public']['Tables']['profiles'];
    });
  });
});
