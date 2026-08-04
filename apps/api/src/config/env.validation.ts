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
  // Encrypts secrets that the application must read back but a database leak must not yield —
  // today, TOTP secrets. Optional: without it the key is derived from JWT_ACCESS_SECRET via HKDF,
  // which is sound, but couples two unrelated rotations. Rotating the signing secret would then
  // make every enrolled authenticator undecryptable, and every user would need a recovery code.
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters').optional(),
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
  // Optional: WhatsApp Cloud API. All optional and unvalidated beyond being strings — an
  // unconfigured or mistyped messaging integration must not stop the clinic booting. The
  // /whatsapp/status endpoint reports what is missing instead.
  WHATSAPP_CLOUD_API_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_WEB_ENABLED: z.string().optional(),
  EVOLUTION_API_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCE: z.string().optional(),
  EVOLUTION_WEBHOOK_TOKEN: z.string().optional(),
  // Optional: outbound email. Unset means password reset is unavailable and says so, rather than
  // the API refusing to boot — the same trade made for storage and messaging above. MailService
  // reports the gap through /auth/forgot-password's logs and the health surface.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  // Origin of the web app, used to build password-reset links. Not a hard requirement: it falls
  // back to localhost, which is wrong in production but visible immediately in the email itself.
  WEB_APP_URL: z.string().optional(),
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
