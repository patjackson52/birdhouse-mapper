// ======================
// Enums / Union types
// ======================

export type ItemStatus = 'active' | 'planned' | 'damaged' | 'removed';

export type FieldType = 'text' | 'number' | 'dropdown' | 'date';

export type UserRole = 'admin' | 'editor';

export type BaseRole = 'platform_admin' | 'org_admin' | 'org_staff' | 'contributor' | 'viewer' | 'public';

export type OrgMembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked';

export type SubscriptionTier = 'free' | 'community' | 'pro' | 'municipal';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled';

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
}

export interface ItemType {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface CustomField {
  id: string;
  item_type_id: string;
  name: string;
  field_type: FieldType;
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

export interface UpdateType {
  id: string;
  name: string;
  icon: string;
  is_global: boolean;
  item_type_id: string | null;
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
}

export interface Photo {
  id: string;
  item_id: string | null;
  update_id: string | null;
  storage_path: string;
  caption: string | null;
  is_primary: boolean;
  created_at: string;
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
  created_at: string;
  updated_at: string;
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

export interface Invite {
  id: string;
  token: string;
  created_by: string;
  display_name: string | null;
  role: UserRole;
  convertible: boolean;
  session_expires_at: string;
  expires_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
}

export interface SiteConfigRow {
  key: string;
  value: unknown;
  updated_at: string;
}

export interface Species {
  id: string;
  name: string;
  scientific_name: string | null;
  description: string | null;
  photo_path: string | null;
  conservation_status: string | null;
  category: string | null;
  external_link: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ItemSpecies {
  item_id: string;
  species_id: string;
}

export interface UpdateSpecies {
  update_id: string;
  species_id: string;
}

export interface LocationHistory {
  id: string;
  item_id: string;
  latitude: number;
  longitude: number;
  created_by: string;
  created_at: string;
}

// ======================
// Composite types
// ======================

export interface ItemWithDetails extends Item {
  item_type: ItemType;
  updates: (ItemUpdate & { update_type: UpdateType; photos: Photo[]; species: Species[] })[];
  photos: Photo[];
  custom_fields: CustomField[];
  species: Species[];
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
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'is_temporary' | 'session_expires_at' | 'invite_id' | 'deleted_at'> & Partial<Pick<Profile, 'is_temporary' | 'session_expires_at' | 'invite_id' | 'deleted_at'>>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
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
      site_config: {
        Row: SiteConfigRow;
        Insert: Omit<SiteConfigRow, 'updated_at'>;
        Update: Partial<Omit<SiteConfigRow, 'key'>>;
        Relationships: [];
      };
      species: {
        Row: Species;
        Insert: Omit<Species, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Species, 'id' | 'created_at'>>;
        Relationships: [];
      };
      item_species: {
        Row: ItemSpecies;
        Insert: ItemSpecies;
        Update: never;
        Relationships: [];
      };
      update_species: {
        Row: UpdateSpecies;
        Insert: UpdateSpecies;
        Update: never;
        Relationships: [];
      };
      location_history: {
        Row: LocationHistory;
        Insert: Omit<LocationHistory, 'id' | 'created_at'>;
        Update: never;
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
