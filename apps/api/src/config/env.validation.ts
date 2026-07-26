import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  PORT: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  // File storage (uploads, PDFs) via Supabase. Optional at boot so a missing bucket doesn't take
  // down the entire API — only the files/pdf endpoints that need it fail, per request.
  //
  // Deliberately NOT validated as a URL. validateEnv throws, and a throw here stops the whole
  // application booting: a mistyped storage URL would take the clinic offline entirely, so nobody
  // could see a patient because a photo upload was misconfigured. That is the wrong trade for an
  // optional integration. FilesService parses it instead and reports the problem through the
  // storage-status endpoint, where it is visible without being fatal.
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().optional(),
  // Optional: AI features (treatment plan summaries, WhatsApp drafts, item suggestions) via
  // xAI's Grok API degrade gracefully when unset — see ai/ai.service.ts.
  XAI_API_KEY: z.string().optional(),
  XAI_MODEL: z.string().optional(),
  XAI_BASE_URL: z.string().optional(),
});

export function validateEnv(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs?.join(', ')}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${messages}`);
  }
  return result.data;
}
