import { z } from 'zod';
import { Gender } from '../enums';

export const CreatePatientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.nativeEnum(Gender as Record<string, string>).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  nationalId: z.string().optional(),
  notes: z.string().optional(),
});

export const UpdatePatientSchema = CreatePatientSchema.partial();

export type CreatePatientInput = z.infer<typeof CreatePatientSchema>;
export type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>;
