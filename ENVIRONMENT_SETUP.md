# Environment Setup

Every variable the API reads, what it is for, and what breaks without it.

Set these on **Render** (API service → Environment). The web app needs only
`NEXT_PUBLIC_API_URL`, set on **Vercel**.

`apps/api/.env.example` is the machine-readable version of this file; this one explains the
consequences.

---

## Currently unset, and costing you something

These four are the reason working features are doing nothing. In rough order of what it costs.

### `FACEBOOK_PAGE_ACCESS_TOKEN` — **costing money now**

| | |
|---|---|
| **Purpose** | Fetches a lead's name, phone and email from Meta's Graph API. A lead-ad webhook carries only an identifier — the answers are not in it. |
| **Required?** | For Meta lead ads to be usable at all. |
| **Example** | `EAAG...` (a long opaque string) |
| **How to obtain** | Meta Business Suite → your Page → Settings → Advanced → page access token. Needs the `leads_retrieval` and `pages_show_list` permissions. |
| **What breaks** | A lead still lands on the board, but with no name and no phone — a placeholder carrying the `leadgen_id` so you can look it up in Meta by hand. You are paying for this traffic today. |

### `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `WEB_APP_URL`

| | |
|---|---|
| **Purpose** | All outbound email. Today that means password reset; appointment reminders will use it next. |
| **Required?** | For password reset to work at all. |
| **Example** | `SMTP_HOST=mail.keremclinic.com` · `SMTP_PORT=587` · `MAIL_FROM=Kerem Clinic <no-reply@keremclinic.com>` · `WEB_APP_URL=https://dental-crm-web.vercel.app` |
| **How to obtain** | From the mailbox you already own — cPanel → Email Accounts → Connect Devices shows the SMTP host and port. `SMTP_PASS` is that mailbox's password. |
| **What breaks** | `/forgot-password` refuses rather than pretending to send. A locked-out staff member is recoverable only by an administrator, or by editing the database. |
| **Watch out** | **`WEB_APP_URL` fails quietly.** Unset, it falls back to `http://localhost:3000`, so reset links go out pointing at a machine nobody else can reach. Everything looks like it worked. |

`SMTP_PORT` defaults to 587. `SMTP_SECURE` is inferred from the port (implicit TLS on 465,
STARTTLS on 587) and only needs setting to override that. `SMTP_PASSWORD` is accepted as an alias
for `SMTP_PASS`.

### `ENCRYPTION_KEY` — **set this before anyone turns on 2FA**

| | |
|---|---|
| **Purpose** | Encrypts TOTP secrets at rest, so a leaked database does not hand over the second factor along with the password hashes. |
| **Required?** | Technically optional. Practically yes, and the order matters. |
| **Example** | `openssl rand -base64 48` |
| **What breaks** | Nothing visibly — and that is the problem. Without it the key is derived from `JWT_ACCESS_SECRET` by HKDF, which is cryptographically sound but **couples two unrelated rotations**: rotating your signing secret would make every enrolled authenticator undecryptable, and every user would need a recovery code. |
| **Watch out** | Setting this *after* someone has enrolled changes the key, so their existing secret can no longer be decrypted. Set it first. |

---

## Already set, and load-bearing

Listed so nobody removes one thinking it is unused.

| Variable | Purpose | What breaks if omitted |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection | Nothing boots. Validated at startup. |
| `JWT_ACCESS_SECRET` | Signs 15-minute access tokens. Min 32 chars. | Nothing boots. Rotating it signs everyone out — and see `ENCRYPTION_KEY`. |
| `JWT_REFRESH_SECRET` | Signs 7-day refresh tokens. Min 32 chars. | Nothing boots. |
| `CORS_ORIGIN` | Comma-separated allowlist of web origins. | **Everyone is signed out every 15 minutes.** It also backs the CSRF origin check, so the two cannot disagree. Must list the exact Vercel URL in use. |
| `SUPABASE_URL` | Storage project origin | File upload and download return 503. The rest of the app is unaffected — deliberately. |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage credential | As above. Never readable back out of the API. |
| `SUPABASE_STORAGE_BUCKET` | Bucket name | As above. |
| `NEXT_PUBLIC_API_URL` | *(Vercel)* API origin, no `/api` suffix | The web app talks to `localhost:3001` and nothing loads. |

---

## Optional integrations

Each degrades on its own without affecting anything else. That is deliberate: a mistyped WhatsApp
token must not stop someone seeing a patient.

| Variable | Purpose | What breaks if omitted |
|---|---|---|
| `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Official WhatsApp Business API | That transport is unavailable; Evolution or the QR session still work. |
| `WHATSAPP_APP_SECRET` | Verifies Meta signs each inbound webhook | The webhook **refuses everything**. Without a secret there is nothing to verify against, and accepting unsigned payloads would let anyone who found the URL inject messages. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Meta's one-time handshake | The webhook cannot be registered. |
| `WHATSAPP_WEB_ENABLED` | Turns on the QR-paired session | Off by default on purpose — it drives an unofficial client, which Meta prohibits and which risks the number. |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` | Self-hosted WhatsApp gateway | That transport is unavailable. |
| `EVOLUTION_WEBHOOK_TOKEN` | Shared secret on the webhook URL | Evolution does not sign its webhooks, so this is the only way to tell a real delivery from anyone who found the endpoint. |
| `FACEBOOK_APP_SECRET` | Verifies Meta signs lead-ad webhooks | The webhook refuses everything, for the same reason as WhatsApp's. |
| `FACEBOOK_WEBHOOK_VERIFY_TOKEN` | Meta's handshake for lead ads | The webhook cannot be registered. |
| `XAI_API_KEY` | AI assistant, plan summaries, WhatsApp drafts | Those four features report that AI is not configured. Everything else is unaffected. |
| `XAI_MODEL`, `XAI_BASE_URL` | Override the model or endpoint | Defaults to `grok-4.5` on x.ai. |
| `REMINDERS_ENABLED` | Appointment reminders | Off unless `true`. See below — this one is off by design, not by oversight. |
| `MALWARE_SCAN_URL` | Scans every upload before it becomes a file | Uploads are recorded `SKIPPED`, never `CLEAN` — see below. |
| `MALWARE_SCAN_TIMEOUT_MS` | How long to wait for the scanner | Defaults to 10000. A slow scanner leaves files `PENDING` rather than blocking the upload. |

---

## `REMINDERS_ENABLED` — **appointment reminders are off until you set this**

| | |
|---|---|
| **Purpose** | Turns on the sweep that emails patients a day before their appointment. |
| **Required?** | To send reminders at all. |
| **Example** | `REMINDERS_ENABLED=true` |
| **Where** | Render only. Do **not** set it locally. |
| **What breaks** | Nothing breaks — nothing sends. The API logs "Appointment reminders are off" at start-up so it is visible rather than silent. |
| **Watch out** | Off by default on purpose. Development runs against the production database on this project, so a developer with the API running over lunch would email real patients. The switch is what stops that. |

Also needs SMTP configured — see the email section above. With `REMINDERS_ENABLED=true` and no
SMTP, every reminder fails, is released, and is retried on the next sweep, which is visible in the
logs and sends nothing.

**The scheduler runs inside the API process.** On a host that sleeps when idle, it does not run
while nobody is using the app. `POST /api/reminders/run` (Super Admin) forces a sweep, which is
also how you confirm reminders work without waiting for the next ten-minute tick. It is safe to
press twice — each appointment is claimed with an atomic update, so a second run finds nothing
left to send.

---

## `MALWARE_SCAN_URL` — worth setting once patients can send files

| | |
|---|---|
| **Purpose** | Scans every upload before a `File` row exists for it. Patients attach files in chat, and those land in the same bucket as the radiographs and passport scans. |
| **Required?** | No. The allowlist and `Content-Disposition: attachment` are the primary controls and work without it. |
| **Example** | `MALWARE_SCAN_URL=http://clamav-rest:8080/scan` |
| **How to obtain** | Any endpoint accepting `POST { "url": "..." }` and answering `{ "clean": true }` or `{ "clean": false }`. ClamAV behind a small HTTP wrapper is the usual shape; Cloudmersive and VirusTotal both work with a thin adapter. The URL handed to it is a short-lived signed link, so the scanner needs no credentials of its own. |
| **What breaks** | Nothing. Every file is recorded with `scanStatus = SKIPPED` — **deliberately not `CLEAN`**. Those are different facts, and a file nothing has looked at, recorded as clean, is a claim this system cannot support. |
| **Watch out** | A scanner that is unreachable or slow leaves files `PENDING` and lets the upload through. That is chosen: taking the inbox off the air because a sidecar is down is the worse failure. `PENDING` is visible in the UI and a sweep can re-run over it. |

An infected file is deleted from storage and never becomes a row, so `INFECTED` is a state you
will not normally see — it exists so the refusal has a name.

---

## Not yet needed

Present in `.env.example` for later phases, harmless to leave blank:
`SMS_PROVIDER_API_KEY` (blocked on your choice of provider),
`GOOGLE_CALENDAR_CLIENT_ID` / `_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_GRAPH_API_VERSION`
(defaults to `v20.0`).

---

## Checking your work

After setting anything on Render, the service restarts. Then:

- **Storage** — Settings → the storage card runs a real bucket listing, not a presence check.
- **WhatsApp** — Settings → the WhatsApp card reports which transport is live.
- **Email** — there is no status card yet. Use `/forgot-password` with your own address; an
  unconfigured server refuses rather than silently doing nothing.
- **Meta lead ads** — send a test lead from Meta's Lead Ads Testing Tool. It should appear on the
  board with a real name rather than as a placeholder.
