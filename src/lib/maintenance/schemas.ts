import { z } from 'zod';

const statusSchema = z.enum(['planned', 'in_progress', 'completed', 'cancelled']);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)');
// Accept any RFC 4122 UUID shape. Zod v4's .uuid() rejects zero-version
// UUIDs (e.g. '00000000-0000-0000-0000-000000000100') used in seed data.
const uuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'Invalid UUID',
);

export const createMaintenanceProjectSchema = z.object({
  orgId: uuidSchema,
  propertyId: uuidSchema,
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
  projectId: uuidSchema,
  itemIds: z.array(uuidSchema).min(1, 'At least one item required'),
});

export const linkKnowledgeSchema = z.object({
  projectId: uuidSchema,
  knowledgeIds: z.array(uuidSchema).min(1, 'At least one article required'),
});

export const setItemCompletionSchema = z.object({
  projectId: uuidSchema,
  itemId: uuidSchema,
  completed: z.boolean(),
});
