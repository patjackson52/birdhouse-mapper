import { z } from 'zod';

const statusSchema = z.enum(['planned', 'in_progress', 'completed', 'cancelled']);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)');

export const createMaintenanceProjectSchema = z.object({
  orgId: z.string().uuid(),
  propertyId: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(5000).optional(),
  scheduledFor: isoDateSchema.nullable().optional(),
});

export const updateMaintenanceProjectSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  scheduledFor: isoDateSchema.nullable().optional(),
  status: statusSchema.optional(),
});

export const linkItemsSchema = z.object({
  projectId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).min(1, 'At least one item required'),
});

export const linkKnowledgeSchema = z.object({
  projectId: z.string().uuid(),
  knowledgeIds: z.array(z.string().uuid()).min(1, 'At least one article required'),
});

export const setItemCompletionSchema = z.object({
  projectId: z.string().uuid(),
  itemId: z.string().uuid(),
  completed: z.boolean(),
});
