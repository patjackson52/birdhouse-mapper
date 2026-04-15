import type { TypeLayout } from '@/lib/layout/types';
import type { CommunicationTopic, UserSubscription, Notification as AppNotification, NotificationSend } from '@/lib/communications/types';

// ======================
// Enums / Union types
// ======================

export type ItemStatus = 'active' | 'planned' | 'damaged' | 'removed';

export type FieldType = 'text' | 'number' | 'dropdown' | 'date';

export type UserRole = 'admin' | 'editor';

export type BaseRole = 'platform_admin' | 'org_admin' | 'org_staff' | 'contributor' | 'viewer' | 'public' | 'public_contributor';

export type TemporaryAccessGrantStatus = 'active' | 'expired' | 'revoked' | 'used';

export type OrgMembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked' | 'banned';

export type SubscriptionTier = 'free' | 'community' | 'pro' | 'municipal';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled';

export type CustomDomainStatus = 'pending' | 'verifying' | 'active' | 'failed' | 'disabled';
export type SslStatus = 'pending' | 'issuing' | 'active' | 'failed' | 'expiring_soon';
export type DomainType = 'subdomain' | 'apex';

// ======================
// Table interfaces
// ======================

export interface Item {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  item_type_id: string;
  custom_field_values: Record<string, unknown>;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  org_id: string;
  property_id: string;
}

export interface ItemType {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  layout: TypeLayout | null;
  created_at: string;
  org_id: string;
}

export interface CustomField {
  id: string;
  item_type_id: string;
  name: string;
  field_type: FieldType;
  options: string[] | null;
  required: boolean;
  sort_order: number;
  org_id: string;
}

export interface UpdateType {
  id: string;
  name: string;
  icon: string;
  is_global: boolean;
  item_type_id: string | null;
  sort_order: number;
  org_id: string;
  min_role_create: string | null;
  min_role_edit: string | null;
  min_role_delete: string | null;
}

export interface UpdateTypeField {
  id: string;
  update_type_id: string;
  org_id: string;
  name: string;
  field_type: 'text' | 'number' | 'dropdown' | 'date' | 'url';
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

export interface ItemUpdate {
  id: string;
  item_id: string;
  update_type_id: string;
  content: string | null;
  update_date: string;
  created_at: string;
  created_by: string | null;
  org_id: string;
  property_id: string;
  custom_field_values: Record<string, unknown>;
}

export interface Photo {
  id: string;
  item_id: string | null;
  update_id: string | null;
  storage_path: string;
  caption: string | null;
  is_primary: boolean;
  created_at: string;
  org_id: string;
  property_id: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  role: UserRole;
  created_at: string;
  is_temporary: boolean;
  session_expires_at: string | null;
  invite_id: string | null;
  deleted_at: string | null;
}

export interface Org {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  primary_custom_domain_id: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  theme: unknown | null;
  tagline: string | null;
  setup_complete: boolean;
  default_property_id: string | null;
  created_at: string;
  updated_at: string;
  map_display_config: unknown | null;
  communications_enabled: boolean;
  allow_public_contributions: boolean;
  moderation_mode: 'auto_approve' | 'manual_review';
}

export interface RolePermissions {
  org: { manage_settings: boolean; manage_members: boolean; manage_billing: boolean; manage_roles: boolean; view_audit_log: boolean };
  properties: { create: boolean; manage_all: boolean; view_all: boolean };
  items: { view: boolean; create: boolean; edit_any: boolean; edit_assigned: boolean; delete: boolean };
  updates: { view: boolean; create: boolean; edit_own: boolean; edit_any: boolean; delete: boolean; approve_public_submissions: boolean };
  tasks: { view_assigned: boolean; view_all: boolean; create: boolean; assign: boolean; complete: boolean };
  attachments: { upload: boolean; delete_own: boolean; delete_any: boolean };
  reports: { view: boolean; export: boolean };
  modules: { tasks: boolean; volunteers: boolean; public_forms: boolean; qr_codes: boolean; reports: boolean };
  ai_context: { view: boolean; download: boolean; upload: boolean; manage: boolean };
}

export interface Role {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  base_role: BaseRole;
  color: string | null;
  icon: string | null;
  permissions: RolePermissions;
  is_default_new_member_role: boolean;
  is_public_role: boolean;
  is_system_role: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface OrgMembership {
  id: string;
  org_id: string;
  user_id: string | null;
  role_id: string;
  status: OrgMembershipStatus;
  invited_email: string | null;
  invited_by: string | null;
  invitation_token: string | null;
  invitation_expires_at: string | null;
  accepted_at: string | null;
  is_primary_org: boolean;
  default_property_id: string | null;
  notification_prefs: Record<string, unknown>;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  map_default_lat: number | null;
  map_default_lng: number | null;
  map_default_zoom: number | null;
  map_style: string | null;
  map_bounds: unknown | null;
  custom_map: unknown | null;
  landing_headline: string | null;
  landing_body: string | null;
  landing_image_url: string | null;
  landing_page: unknown | null;
  primary_color: string | null;
  logo_url: string | null;
  about_content: string | null;
  footer_text: string | null;
  footer_links: unknown | null;
  custom_nav_items: unknown | null;
  is_publicly_listed: boolean;
  primary_custom_domain_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  map_display_config: unknown | null;
  communications_enabled: boolean;
}

export interface PropertyMembership {
  id: string;
  org_id: string;
  property_id: string;
  user_id: string | null;
  role_id: string;
  grant_type: 'explicit' | 'temporary';
  granted_by: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invite {
  id: string;
  token: string;
  created_by: string;
  display_name: string | null;
  role_id: string;
  convertible: boolean;
  session_expires_at: string;
  expires_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
  org_id: string;
}

export type EntityFieldType = 'text' | 'number' | 'dropdown' | 'date' | 'url';

export type EntityLinkTarget = 'items' | 'updates';

export interface EntityType {
  id: string;
  org_id: string;
  name: string;
  icon: string;
  color: string;
  link_to: EntityLinkTarget[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EntityTypeField {
  id: string;
  entity_type_id: string;
  org_id: string;
  name: string;
  field_type: EntityFieldType;
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

export interface Entity {
  id: string;
  entity_type_id: string;
  org_id: string;
  name: string;
  description: string | null;
  photo_path: string | null;
  external_link: string | null;
  custom_field_values: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ItemEntity {
  item_id: string;
  entity_id: string;
  org_id: string;
}

export interface UpdateEntity {
  update_id: string;
  entity_id: string;
  org_id: string;
}

export interface LocationHistory {
  id: string;
  item_id: string;
  latitude: number;
  longitude: number;
  created_by: string;
  created_at: string;
  org_id: string;
  property_id: string;
}

export interface PropertyAccessConfig {
  id: string;
  org_id: string;
  property_id: string;
  anon_access_enabled: boolean;
  anon_can_view_map: boolean;
  anon_can_view_items: boolean;
  anon_can_view_item_details: boolean;
  anon_can_submit_forms: boolean;
  anon_visible_field_keys: string[] | null;
  password_protected: boolean;
  password_hash: string | null;
  allow_embed: boolean;
  embed_allowed_origins: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface TemporaryAccessGrant {
  id: string;
  org_id: string;
  property_id: string | null;
  user_id: string | null;
  granted_email: string | null;
  invite_token: string | null;
  role_id: string;
  valid_from: string;
  valid_until: string;
  is_single_use: boolean;
  item_ids: string[] | null;
  status: TemporaryAccessGrantStatus;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  first_used_at: string | null;
  granted_by: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnonymousAccessToken {
  id: string;
  org_id: string;
  property_id: string;
  token: string;
  can_view_map: boolean;
  can_view_items: boolean;
  can_submit_forms: boolean;
  expires_at: string | null;
  use_count: number;
  last_used_at: string | null;
  is_active: boolean;
  label: string | null;
  allowed_domain_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CustomDomain {
  id: string;
  org_id: string;
  property_id: string | null;
  domain: string;
  status: CustomDomainStatus;
  verification_token: string | null;
  verified_at: string | null;
  last_checked_at: string | null;
  ssl_status: SslStatus;
  ssl_expires_at: string | null;
  caddy_last_issued: string | null;
  domain_type: DomainType;
  is_primary: boolean;
  redirect_to_domain_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ======================
// Composite types
// ======================

export interface ItemWithDetails extends Item {
  item_type: ItemType;
  updates: (ItemUpdate & { update_type: UpdateType; photos: Photo[]; entities: (Entity & { entity_type: EntityType })[] })[];
  photos: Photo[];
  custom_fields: CustomField[];
  entities: (Entity & { entity_type: EntityType })[];
}

// ======================
// Database schema type (for Supabase client)
// ======================

export interface Database {
  public: {
    Tables: {
      items: {
        Row: Item;
        Insert: Omit<Item, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Item, 'id' | 'created_at'>>;
        Relationships: [];
      };
      item_types: {
        Row: ItemType;
        Insert: Omit<ItemType, 'id' | 'created_at'>;
        Update: Partial<Omit<ItemType, 'id' | 'created_at'>>;
        Relationships: [];
      };
      custom_fields: {
        Row: CustomField;
        Insert: Omit<CustomField, 'id'>;
        Update: Partial<Omit<CustomField, 'id'>>;
        Relationships: [];
      };
      update_types: {
        Row: UpdateType;
        Insert: Omit<UpdateType, 'id'>;
        Update: Partial<Omit<UpdateType, 'id'>>;
        Relationships: [];
      };
      item_updates: {
        Row: ItemUpdate;
        Insert: Omit<ItemUpdate, 'id' | 'created_at'>;
        Update: Partial<Omit<ItemUpdate, 'id' | 'created_at'>>;
        Relationships: [];
      };
      photos: {
        Row: Photo;
        Insert: Omit<Photo, 'id' | 'created_at'>;
        Update: Partial<Omit<Photo, 'id' | 'created_at'>>;
        Relationships: [];
      };
      orgs: {
        Row: Org;
        Insert: Omit<Org, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Org, 'id' | 'created_at'>>;
        Relationships: [];
      };
      roles: {
        Row: Role;
        Insert: Omit<Role, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Role, 'id' | 'created_at'>>;
        Relationships: [];
      };
      org_memberships: {
        Row: OrgMembership;
        Insert: Omit<OrgMembership, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<OrgMembership, 'id' | 'created_at'>>;
        Relationships: [];
      };
      invites: {
        Row: Invite;
        Insert: Omit<Invite, 'id' | 'created_at' | 'claimed_by' | 'claimed_at'>;
        Update: Partial<Omit<Invite, 'id' | 'created_at'>>;
        Relationships: [];
      };
      properties: {
        Row: Property;
        Insert: Omit<Property, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Property, 'id' | 'created_at'>>;
        Relationships: [];
      };
      property_memberships: {
        Row: PropertyMembership;
        Insert: Omit<PropertyMembership, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PropertyMembership, 'id' | 'created_at'>>;
        Relationships: [];
      };
      entity_types: {
        Row: EntityType;
        Insert: Omit<EntityType, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<EntityType, 'id' | 'created_at'>>;
        Relationships: [];
      };
      entity_type_fields: {
        Row: EntityTypeField;
        Insert: Omit<EntityTypeField, 'id'>;
        Update: Partial<Omit<EntityTypeField, 'id'>>;
        Relationships: [];
      };
      entities: {
        Row: Entity;
        Insert: Omit<Entity, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Entity, 'id' | 'created_at'>>;
        Relationships: [];
      };
      item_entities: {
        Row: ItemEntity;
        Insert: ItemEntity;
        Update: never;
        Relationships: [];
      };
      update_entities: {
        Row: UpdateEntity;
        Insert: UpdateEntity;
        Update: never;
        Relationships: [];
      };
      location_history: {
        Row: LocationHistory;
        Insert: Omit<LocationHistory, 'id' | 'created_at'>;
        Update: never;
        Relationships: [];
      };
      property_access_config: {
        Row: PropertyAccessConfig;
        Insert: Omit<PropertyAccessConfig, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PropertyAccessConfig, 'id' | 'created_at'>>;
        Relationships: [];
      };
      temporary_access_grants: {
        Row: TemporaryAccessGrant;
        Insert: Omit<TemporaryAccessGrant, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<TemporaryAccessGrant, 'id' | 'created_at'>>;
        Relationships: [];
      };
      anonymous_access_tokens: {
        Row: AnonymousAccessToken;
        Insert: Omit<AnonymousAccessToken, 'id' | 'created_at'>;
        Update: Partial<Omit<AnonymousAccessToken, 'id' | 'created_at'>>;
        Relationships: [];
      };
      custom_domains: {
        Row: CustomDomain;
        Insert: Omit<CustomDomain, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CustomDomain, 'id' | 'created_at'>>;
        Relationships: [];
      };
      communication_topics: {
        Row: CommunicationTopic;
        Insert: Omit<CommunicationTopic, 'id' | 'created_at'>;
        Update: Partial<Omit<CommunicationTopic, 'id' | 'created_at'>>;
        Relationships: [];
      };
      user_subscriptions: {
        Row: UserSubscription;
        Insert: Omit<UserSubscription, 'id' | 'created_at'>;
        Update: Partial<Omit<UserSubscription, 'id' | 'created_at'>>;
        Relationships: [];
      };
      notifications: {
        Row: AppNotification;
        Insert: Omit<AppNotification, 'id' | 'created_at'>;
        Update: Partial<Omit<AppNotification, 'id' | 'created_at'>>;
        Relationships: [];
      };
      notification_sends: {
        Row: NotificationSend;
        Insert: Omit<NotificationSend, 'id'>;
        Update: Partial<Omit<NotificationSend, 'id'>>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
