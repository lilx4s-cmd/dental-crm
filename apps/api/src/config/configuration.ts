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
  // Off unless explicitly turned on. A developer running the API against the production database —
  // which is how this project works — must not email real patients because the server was left up.
  reminders: {
    enabled: process.env.REMINDERS_ENABLED,
  },
  // Optional. Unset means uploads are recorded as SKIPPED rather than CLEAN — see MalwareScanService.
  malwareScan: {
    url: process.env.MALWARE_SCAN_URL,
    timeoutMs: process.env.MALWARE_SCAN_TIMEOUT_MS,
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
  // Outbound email. SMTP rather than a vendor HTTP API so the clinic's existing mailbox works
  // without signing up to anything new, and so nothing here is locked to one provider.
  //
  // Optional at boot, like every other integration: an unconfigured mail server must not stop the
  // clinic booting. MailService reports what is missing and refuses to pretend it sent anything.
  mail: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    // Implicit TLS on 465, STARTTLS on 587. Defaulting from the port rather than asking for a
    // third setting nobody can answer without reading their provider's documentation.
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === 'true'
      : process.env.SMTP_PORT === '465',
    user: process.env.SMTP_USER,
    // .env.example has documented SMTP_PASS since before any mail code existed, so that name is
    // the one anyone configuring this server will already have typed. SMTP_PASSWORD is accepted
    // too because it is the commoner spelling elsewhere, and a mail server that silently does not
    // authenticate because of a four-character difference is a bad afternoon.
    password: process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD,
    // What the patient-facing world sees in the From line.
    from: process.env.MAIL_FROM,
  },
  // Where a password-reset link should point. The API and the app are on different origins, so the
  // API cannot infer this from its own request.
  webUrl: process.env.WEB_APP_URL ?? 'http://localhost:3000',
  xai: {
    apiKey: process.env.XAI_API_KEY,
    model: process.env.XAI_MODEL || 'grok-4.5',
    baseUrl: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
  },
});
