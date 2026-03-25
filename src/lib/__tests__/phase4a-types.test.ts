import { describe, it, expect } from 'vitest';
import type {
  CustomDomain,
  CustomDomainStatus,
  SslStatus,
  DomainType,
  Property,
  AnonymousAccessToken,
  Database,
} from '../types';

describe('Phase 4A types', () => {
  describe('CustomDomain', () => {
    it('has required fields', () => {
      const cd: CustomDomain = {
        id: 'test', org_id: 'org-1', property_id: null,
        domain: 'app.example.com', status: 'active',
        verification_token: null, verified_at: null, last_checked_at: null,
        ssl_status: 'pending', ssl_expires_at: null, caddy_last_issued: null,
        domain_type: 'subdomain', is_primary: true,
        redirect_to_domain_id: null, created_by: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      };
      expect(cd.domain).toBe('app.example.com');
      expect(cd.property_id).toBeNull();
    });

    it('rejects invalid status at compile time', () => {
      // @ts-expect-error - 'unknown' is not valid
      const _bad: CustomDomainStatus = 'unknown';
    });

    it('rejects invalid ssl_status at compile time', () => {
      // @ts-expect-error - 'expired' is not valid
      const _bad: SslStatus = 'expired';
    });

    it('rejects invalid domain_type at compile time', () => {
      // @ts-expect-error - 'cname' is not valid
      const _bad: DomainType = 'cname';
    });
  });

  describe('Updated types', () => {
    it('Property has primary_custom_domain_id', () => {
      const p = {} as Property;
      const _id: string | null = p.primary_custom_domain_id;
      expect(true).toBe(true);
    });

    it('AnonymousAccessToken has allowed_domain_id', () => {
      const t = {} as AnonymousAccessToken;
      const _id: string | null = t.allowed_domain_id;
      expect(true).toBe(true);
    });
  });

  describe('Database interface', () => {
    it('includes custom_domains table', () => {
      type Row = Database['public']['Tables']['custom_domains']['Row'];
      const _check: Row extends CustomDomain ? true : never = true;
      expect(_check).toBe(true);
    });
  });
});
