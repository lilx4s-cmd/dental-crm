import { z } from 'zod';
import { Role } from '../enums';
import { passwordProblems } from '../access/password-policy';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  // One policy, checked here and by the API's `@IsStrongPassword()` decorator, which reads the
  // same function. See access/password-policy.ts for why length rather than character classes.
  password: z.string().superRefine((value, ctx) => {
    for (const message of passwordProblems(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  }),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum([
    Role.SUPER_ADMIN,
    Role.CLINIC_MANAGER,
    Role.RECEPTION,
    Role.SALES_CONSULTANT,
    Role.DENTIST,
  ]),
  specialization: z.string().optional(),
});
export type CreateUserDto = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = CreateUserSchema.partial().omit({ password: true });
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: z.enum([
    Role.SUPER_ADMIN,
    Role.CLINIC_MANAGER,
    Role.RECEPTION,
    Role.SALES_CONSULTANT,
    Role.DENTIST,
  ]),
  isActive: z.boolean(),
  specialization: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type UserDto = z.infer<typeof UserSchema>;
