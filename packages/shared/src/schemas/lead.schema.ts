import { z } from 'zod';
import { LeadSource, PipelineStage, LeadStatus } from '../enums';

export const CreateLeadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  source: z.nativeEnum(LeadSource as Record<string, string>),
  campaignId: z.string().uuid().optional(),
  estimatedValue: z.number().positive().optional(),
  currency: z.string().length(3).default('USD'),
  notes: z.string().optional(),
  assignedToId: z.string().uuid().optional(),
});

export const UpdateLeadSchema = CreateLeadSchema.partial();

export const UpdateLeadStageSchema = z.object({
  stage: z.nativeEnum(PipelineStage as Record<string, string>),
  note: z.string().optional(),
});

export const UpdateLeadStatusSchema = z.object({
  status: z.nativeEnum(LeadStatus as Record<string, string>),
  lostReason: z.string().optional(),
});

export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;
export type UpdateLeadInput = z.infer<typeof UpdateLeadSchema>;
export type UpdateLeadStageInput = z.infer<typeof UpdateLeadStageSchema>;
