export type MaintenanceStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export interface MaintenanceProject {
  id: string;
  org_id: string;
  property_id: string | null;
  title: string;
  description: string | null;
  status: MaintenanceStatus;
  scheduled_for: string | null; // ISO date string, e.g. "2026-05-15"
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceProjectRowData extends MaintenanceProject {
  items_completed: number;
  items_total: number;
  knowledge_count: number;
  creator_name: string | null;
}

export interface MaintenanceProjectItem {
  maintenance_project_id: string;
  item_id: string;
  org_id: string;
  completed_at: string | null;
  completed_by: string | null;
  added_at: string;
}

export interface LinkedItem {
  item_id: string;
  name: string;
  type_name: string | null;
  icon: string | null;
  last_maintained_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
}

export interface LinkedKnowledge {
  knowledge_item_id: string;
  title: string;
  slug: string;
  visibility: 'org' | 'public';
}

export interface CreateMaintenanceProjectInput {
  orgId: string;
  propertyId: string;
  title: string;
  description?: string;
  scheduledFor?: string | null; // ISO date or null
}

export interface UpdateMaintenanceProjectInput {
  title?: string;
  description?: string | null;
  scheduledFor?: string | null;
  status?: MaintenanceStatus;
}
