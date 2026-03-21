import { describe, it, expect } from 'vitest';
import type { Invite, Profile } from '../types';

describe('Invite type structure', () => {
  it('accepts a valid unclaimed Invite', () => {
    const invite: Invite = {
      id: 'inv-1',
      token: 'hashed-token-abc',
      created_by: 'admin-1',
      display_name: 'Sarah M.',
      role: 'editor',
      convertible: true,
      session_expires_at: '2026-03-20T23:59:00Z',
      expires_at: '2026-03-20T10:15:00Z',
      claimed_by: null,
      claimed_at: null,
      created_at: '2026-03-20T10:00:00Z',
    };
    expect(invite.display_name).toBe('Sarah M.');
    expect(invite.claimed_by).toBeNull();
  });

  it('accepts a claimed Invite', () => {
    const invite: Invite = {
      id: 'inv-2',
      token: 'hashed-token-def',
      created_by: 'admin-1',
      display_name: null,
      role: 'editor',
      convertible: false,
      session_expires_at: '2026-03-20T23:59:00Z',
      expires_at: '2026-03-20T10:15:00Z',
      claimed_by: 'user-1',
      claimed_at: '2026-03-20T10:05:00Z',
      created_at: '2026-03-20T10:00:00Z',
    };
    expect(invite.claimed_by).toBe('user-1');
    expect(invite.display_name).toBeNull();
  });
});

describe('Profile with temp account fields', () => {
  it('accepts a permanent user profile', () => {
    const profile: Profile = {
      id: 'user-1',
      display_name: 'Admin User',
      role: 'admin',
      created_at: '2026-01-01T00:00:00Z',
      is_temporary: false,
      session_expires_at: null,
      invite_id: null,
      deleted_at: null,
    };
    expect(profile.is_temporary).toBe(false);
    expect(profile.session_expires_at).toBeNull();
  });

  it('accepts a temporary user profile', () => {
    const profile: Profile = {
      id: 'user-2',
      display_name: 'Volunteer',
      role: 'editor',
      created_at: '2026-03-20T10:05:00Z',
      is_temporary: true,
      session_expires_at: '2026-03-20T23:59:00Z',
      invite_id: 'inv-1',
      deleted_at: null,
    };
    expect(profile.is_temporary).toBe(true);
    expect(profile.invite_id).toBe('inv-1');
  });

  it('accepts a soft-deleted temp profile', () => {
    const profile: Profile = {
      id: 'user-3',
      display_name: 'Past Volunteer',
      role: 'editor',
      created_at: '2026-03-19T10:00:00Z',
      is_temporary: true,
      session_expires_at: '2026-03-19T23:59:00Z',
      invite_id: 'inv-3',
      deleted_at: '2026-03-20T01:00:00Z',
    };
    expect(profile.deleted_at).toBe('2026-03-20T01:00:00Z');
  });
});
