// ======================
// Enums / Union types
// ======================

export type ItemStatus = 'active' | 'planned' | 'damaged' | 'removed';

export type FieldType = 'text' | 'number' | 'dropdown' | 'date';

export type UserRole = 'admin' | 'editor';

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
}

export interface SiteConfigRow {
  key: string;
  value: unknown;
  updated_at: string;
}

// ======================
// Composite types
// ======================

export interface ItemWithDetails extends Item {
  item_type: ItemType;
  updates: (ItemUpdate & { update_type: UpdateType; photos: Photo[] })[];
  photos: Photo[];
  custom_fields: CustomField[]; // field definitions for this item's type
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
        Insert: Omit<Profile, 'created_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
        Relationships: [];
      };
      site_config: {
        Row: SiteConfigRow;
        Insert: Omit<SiteConfigRow, 'updated_at'>;
        Update: Partial<Omit<SiteConfigRow, 'key'>>;
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
