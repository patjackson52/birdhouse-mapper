import { describe, it, expect } from 'vitest';
import type {
  Property,
  PropertyMembership,
  Item,
  ItemUpdate,
  Photo,
  LocationHistory,
  ItemType,
  CustomField,
  UpdateType,
  Entity,
  Invite,
  Org,
  Database,
} from '../types';

describe('Phase 2 types', () => {
  describe('Property', () => {
    it('has required fields', () => {
      const prop: Property = {
        id: 'test',
        org_id: 'org-1',
        name: 'Test Property',
        slug: 'test-property',
        description: null,
        is_active: true,
        map_default_lat: 47.6,
        map_default_lng: -122.5,
        map_default_zoom: 14,
        map_style: null,
        map_bounds: null,
        custom_map: null,
        landing_headline: null,
        landing_body: null,
        landing_image_url: null,
        landing_page: null,
        primary_color: null,
        logo_url: null,
        about_content: null,
        footer_text: null,
        footer_links: null,
        custom_nav_items: null,
        is_publicly_listed: false,
        primary_custom_domain_id: null,
        created_by: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
        map_display_config: null,
        communications_enabled: false,
      };
      expect(prop.org_id).toBe('org-1');
    });
  });

  describe('PropertyMembership', () => {
    it('has required fields', () => {
      const pm: PropertyMembership = {
        id: 'test',
        org_id: 'org-1',
        property_id: 'prop-1',
        user_id: 'user-1',
        role_id: 'role-1',
        grant_type: 'explicit',
        granted_by: null,
        note: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      expect(pm.grant_type).toBe('explicit');
    });

    it('rejects invalid grant_type at compile time', () => {
      // @ts-expect-error - 'permanent' is not a valid grant_type
      const _bad: PropertyMembership['grant_type'] = 'permanent';
    });
  });

  describe('Updated content types have org_id/property_id', () => {
    it('Item has org_id and property_id', () => {
      const item = {} as Item;
      const _orgId: string = item.org_id;
      const _propId: string = item.property_id;
      expect(true).toBe(true);
    });

    it('ItemUpdate has org_id and property_id', () => {
      const update = {} as ItemUpdate;
      const _orgId: string = update.org_id;
      const _propId: string = update.property_id;
      expect(true).toBe(true);
    });

    it('Photo has org_id and property_id', () => {
      const photo = {} as Photo;
      const _orgId: string = photo.org_id;
      const _propId: string = photo.property_id;
      expect(true).toBe(true);
    });

    it('LocationHistory has org_id and property_id', () => {
      const loc = {} as LocationHistory;
      const _orgId: string = loc.org_id;
      const _propId: string = loc.property_id;
      expect(true).toBe(true);
    });

    it('ItemType has org_id', () => {
      const type = {} as ItemType;
      const _orgId: string = type.org_id;
      expect(true).toBe(true);
    });

    it('Entity has org_id', () => {
      const ent = {} as Entity;
      const _orgId: string = ent.org_id;
      expect(true).toBe(true);
    });

    it('Invite has org_id', () => {
      const inv = {} as Invite;
      const _orgId: string = inv.org_id;
      expect(true).toBe(true);
    });
  });

  describe('Org has config columns', () => {
    it('has logo_url, favicon_url, theme, tagline, setup_complete', () => {
      const org = {} as Org;
      const _logo: string | null = org.logo_url;
      const _favicon: string | null = org.favicon_url;
      const _theme: unknown = org.theme;
      const _tagline: string | null = org.tagline;
      const _setup: boolean = org.setup_complete;
      const _defaultProp: string | null = org.default_property_id;
      expect(true).toBe(true);
    });
  });

  describe('Database interface', () => {
    it('includes properties table', () => {
      type PropertiesRow = Database['public']['Tables']['properties']['Row'];
      const _check: PropertiesRow extends Property ? true : never = true;
      expect(_check).toBe(true);
    });

    it('includes property_memberships table', () => {
      type PmRow = Database['public']['Tables']['property_memberships']['Row'];
      const _check: PmRow extends PropertyMembership ? true : never = true;
      expect(_check).toBe(true);
    });

    it('does not include site_config', () => {
      // @ts-expect-error - site_config should be removed from Database
      type _Dead = Database['public']['Tables']['site_config'];
    });
  });
});
