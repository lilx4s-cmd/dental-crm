export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'],
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    bucket: process.env.S3_BUCKET ?? 'dental-crm',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: process.env.SUPABASE_STORAGE_BUCKET,
  },
  whatsapp: {
    token: process.env.WHATSAPP_CLOUD_API_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    // Echoed back during Meta's one-time webhook handshake.
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    // Meta signs every inbound webhook with the app secret. Without it the endpoint cannot tell a
    // real message from a forged one.
    appSecret: process.env.WHATSAPP_APP_SECRET,
    // QR-linked WhatsApp Web session. Off by default: it drives an unofficial client, which Meta
    // prohibits and which risks the number, so it must never start itself just because the code
    // shipped.
    webEnabled: process.env.WHATSAPP_WEB_ENABLED,
  },
  // Self-hosted Evolution API gateway. Preferred over the in-process Baileys session, because the
  // WhatsApp connection then lives in a service that stays up independently of CRM deploys.
  evolution: {
    url: process.env.EVOLUTION_API_URL,
    apiKey: process.env.EVOLUTION_API_KEY,
    instance: process.env.EVOLUTION_INSTANCE,
    // Evolution does not sign its webhooks, so a shared secret on the URL is the mechanism
    // available for telling a real delivery from anyone who found the endpoint.
    webhookToken: process.env.EVOLUTION_WEBHOOK_TOKEN,
  },
  xai: {
    apiKey: process.env.XAI_API_KEY,
    model: process.env.XAI_MODEL || 'grok-4.5',
    baseUrl: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
  },
});
