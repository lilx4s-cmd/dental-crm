# Next Phase

Where Phase A stands, what remains in it, and what Phase B opens with.

---

## Phase A — remaining

Four items, ~4 weeks. Two of them are the reason Phase A exists at all.

### C-1 · Email transport → password reset · ~1 week · **do first**

No email transport exists anywhere in the API. The consequence is not marketing: **there is no
password reset**, so a staff member who forgets their password is recoverable only by hand-editing
the production database. This is a guaranteed future incident.

`nodemailer` is installed (added during Phase A, not yet wired). Remaining:

- A `MailService` behind an interface, SMTP by default so the clinic's existing mailbox works
  without signing up to a vendor. It must report `isConfigured` and **fail visibly** rather than
  silently pretending to send.
- A `PasswordResetToken` model storing a hash, never the raw token, with a short expiry.
- `POST /auth/forgot-password` — public, rate-limited, and **always** 204 regardless of whether the
  address exists, or it becomes the enumeration oracle C-6 just closed.
- `POST /auth/reset-password` — validates against the shared password policy, revokes every session.
- Two web pages: request, and set-new-password from a link.

**Email verification is deliberately excluded.** There is no self-signup — an admin creates every
account — so verification adds a step without closing a hole. Flagging the exclusion rather than
quietly dropping it; say the word if you want it.

### C-3 · 2FA and self-service account security · ~1.5 weeks

Admin session revocation already exists (`GET /users/:id/sessions`,
`POST /users/:id/revoke-sessions`). What is missing is anything a user can do *themselves*:

- **Change my own password** — today only an admin can rotate a password, so a user who suspects
  compromise must find one.
- **TOTP 2FA** — `otplib` + a QR, with single-use recovery codes stored hashed.
- **See my own sessions** — `RefreshToken` already stores `createdByIp` and `userAgent`, so the data
  to show device and location is sitting there unused; today they are only counted.

Sequenced after C-1 because both touch `AuthService`, the auth controller and the `User` schema.
Running them concurrently would mean two migrations and three-way merges on the same files for no
gain — this is exactly the work that should not be parallelised.

### S-7 · CSRF double-submit token · ~0.5 week

The refresh cookie is `SameSite=none` because web and API are on different registrable domains, so
it *is* sent on cross-site requests. Impact today is limited — CORS stops an attacker reading the
rotated token — but the safety is incidental rather than designed. A double-submit token on
`/auth/refresh` makes it deliberate.

### C-4 · Backup and restore drill · ~0.5 week · **needs you**

Supabase takes automatic backups. Nobody has ever restored one. An untested backup is not a backup,
and this is the cheapest insurance on the entire roadmap.

**I cannot do this alone** — it needs your Supabase dashboard access to create a restore target.
The drill: restore the most recent backup into a scratch project, run the row-count checks against
it (the same script used to verify the Phase A migrations), and write down the wall-clock time it
took. That number is your actual recovery-time objective; right now nobody knows it.

---

## Phase B — make the clinic run itself · ~6 weeks

Opens once Phase A is closed. Chosen next because these are the two items with direct, measurable
revenue impact, and both are small once Phase A's plumbing exists.

1. **`@nestjs/schedule`** — the missing organ. No cron, no queue, no background worker exists, and
   every automation in the brief is blocked on it.
2. **C-5 · Appointment reminders** — `Notification` is a dead table and `Appointment.reminderSentAt`
   has never been written. Medical-tourism patients fly in; a missed appointment is a wasted flight
   and often a lost case. Delivery over WhatsApp (already built, three transports) and email (C-1).
3. **H-12 · Meta Lead Ads** — the webhook receives `leadgen_id` and never calls the Graph API to
   fetch it, so every paid lead arrives as "Unknown". Half a week, and paid traffic is currently
   arriving unusable.
4. **H-2 · Reporting suite** — doctor and coordinator performance, lead-source attribution,
   treatment profitability, marketing ROI, no-show analysis. All computable from data already
   stored, and cheap now the indexes exist.
5. **U-2 · Notification centre** — a bell and an unread count, so C-5 has somewhere to land in-app.

**Audit gap to budget for in Phase B, not after:** `AuditInterceptor` only sees HTTP requests. The
first scheduled job that writes to a patient record will be invisible to the trail.

---

## Decisions still open

Unchanged from `PROJECT_MASTER_PLAN.md` §9, and unblocked by nothing I can do:

1. **Multi-pipeline** — does the clinic run more than one sales process? If not: 2 weeks saved.
2. **Contacts & Companies** — Bitrix has them because it is generic B2B. You sell to individuals who
   fly in. Add them, or keep Lead → Patient?
3. **SMS provider** — Twilio is expensive for Turkey/Gulf traffic. A regional provider may fit
   better. Which?
4. **Phone country assumption** — any leading `0` is currently treated as Turkish, so a Saudi lead
   entered as `0555…` dials a wrong number. Infer from `Lead.source`, add a country column, or
   require E.164 at entry?
5. **Arabic dossier** — still waiting on you to open `arabic-spike.pdf` and confirm the letters
   join. Clinical copy stays behind human review regardless.
6. **Consent forms** — Turkish KVKK, GDPR for EU patients, or both?
7. **Reset the eight staff passwords** — operational, and the only Phase A item with your name on
   it. Settings → Team → person → *Set a new password*.

---

## Recommendation

Start C-1. It is the largest remaining hole in day-to-day operation, it needs no decision from you,
and `nodemailer` is already installed and waiting.
