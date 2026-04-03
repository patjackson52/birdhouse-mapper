import type { JSONContent } from '@tiptap/core';

export type KnowledgeVisibility = 'org' | 'public';

export interface KnowledgeItem {
  id: string;
  org_id: string;
  title: string;
  slug: string;
  body: JSONContent | null;
  body_html: string | null;
  excerpt: string | null;
  cover_image_url: string | null;
  tags: string[];
  visibility: KnowledgeVisibility;
  is_ai_context: boolean;
  ai_priority: number | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateKnowledgeInput {
  orgId: string;
  title: string;
  body?: JSONContent;
  bodyHtml?: string;
  excerpt?: string;
  coverImageUrl?: string;
  tags?: string[];
  visibility?: KnowledgeVisibility;
  isAiContext?: boolean;
  aiPriority?: number;
}

export interface UpdateKnowledgeInput {
  title?: string;
  body?: JSONContent;
  bodyHtml?: string;
  excerpt?: string;
  coverImageUrl?: string;
  tags?: string[];
  visibility?: KnowledgeVisibility;
  isAiContext?: boolean;
  aiPriority?: number;
}

export interface KnowledgeFilters {
  search?: string;
  tags?: string[];
  visibility?: KnowledgeVisibility;
  isAiContext?: boolean;
}
