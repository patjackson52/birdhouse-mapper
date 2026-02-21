export type BirdhouseStatus = 'active' | 'planned' | 'damaged' | 'removed';

export type UpdateType =
  | 'installation'
  | 'observation'
  | 'maintenance'
  | 'damage'
  | 'sighting';

export type UserRole = 'admin' | 'editor';

export interface Birdhouse {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  species_target: string | null;
  status: BirdhouseStatus;
  installed_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface BirdhouseUpdate {
  id: string;
  birdhouse_id: string;
  update_type: UpdateType;
  content: string | null;
  update_date: string;
  created_at: string;
  created_by: string | null;
}

export interface Photo {
  id: string;
  birdhouse_id: string | null;
  update_id: string | null;
  storage_path: string;
  caption: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface BirdSpecies {
  id: string;
  common_name: string;
  scientific_name: string | null;
  description: string | null;
  habitat: string | null;
  likelihood: string | null;
  image_url: string | null;
}

export interface Profile {
  id: string;
  display_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface BirdhouseWithDetails extends Birdhouse {
  updates: (BirdhouseUpdate & { photos: Photo[] })[];
  photos: Photo[];
}

export interface Database {
  public: {
    Tables: {
      birdhouses: {
        Row: Birdhouse;
        Insert: Omit<Birdhouse, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Birdhouse, 'id' | 'created_at'>>;
        Relationships: [];
      };
      birdhouse_updates: {
        Row: BirdhouseUpdate;
        Insert: Omit<BirdhouseUpdate, 'id' | 'created_at'>;
        Update: Partial<Omit<BirdhouseUpdate, 'id' | 'created_at'>>;
        Relationships: [];
      };
      photos: {
        Row: Photo;
        Insert: Omit<Photo, 'id' | 'created_at'>;
        Update: Partial<Omit<Photo, 'id' | 'created_at'>>;
        Relationships: [];
      };
      bird_species: {
        Row: BirdSpecies;
        Insert: Omit<BirdSpecies, 'id'>;
        Update: Partial<Omit<BirdSpecies, 'id'>>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
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
