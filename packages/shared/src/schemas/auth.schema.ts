import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  // Deliberately *not* the password policy. This is a shape check on what someone typed, not a
  // judgement on it — the policy applies when a password is set, and applying it here would lock
  // out every existing account whose password predates the policy. It only needs to be non-empty
  // for the request to be worth making.
  password: z.string().min(1, 'Enter your password'),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;
