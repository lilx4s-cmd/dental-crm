# Project Status

**Updated:** 2026-08-06
**Branch:** `main` — deploys to Vercel (web) and Render (API) on push.

---

## Where the project is

**Phase A (Harden) is code-complete.** 10 of 10 items; one — the backup restore drill — needs
Supabase access only you have.

**The CRM UX & Pipeline brief is complete**, including the Communication Center and attachments.

| Suite | Count | State |
|---|---|---|
| API | 529 | green |
| Web | 104 | green |
| Lint | 3 packages | green |
| Builds | api + web | green |

Live production data: **1,005 leads, 11 patients, 8 staff accounts**. 45 Prisma models, 30
migrations, all applied and verified against production.

---

## What shipped since 2026-08-04

| Feature | Commit | Notes |
|---|---|---|
| Unread tracking | `2f8b6fb` | Sidebar badge counts *threads*, not messages. `Conversation.lastReadAt` — `Message.readAt` meant the opposite (the patient reading us). |
| Bulk actions | `86d65ae` | Archive, note, CSV export, delete. Ids are a request, not a permission. Export is audited as `EXPORT` for KVKK/GDPR. |
| Tags + `Organization` | `71d29cc` | The tags module had endpoints nothing called; the table was empty after a year. New tables carry `organizationId` with a real FK — see MULTI_TENANCY.md. |
| Context menus, card fields, bulk reminders, **My Day fix** | `8136992` | My Day never showed a single task. See below. |
| Pinning, thread search, saved replies, deal timeline | `020678f` | The inbox is usable past forty threads. |
| Attachments | *this commit* | Images, video, audio, PDF, Office, text, archives. |

### The My Day bug, since it was the worst of them

The page never showed a task. Two rules combined: it rendered only what the cadence rules flagged,
and a deal carrying an open task was deliberately *removed* from that list. So setting a reminder
made a deal disappear from the one screen it should have appeared on more prominently.

Production had exactly one open task, due that day, invisible twice over — its deal was `WON`, and
the list filters to `ACTIVE`. Fixed with a "My tasks" tab that ignores lead status and scopes by
the task's assignee.

---|---|
| API | 295 | green |
| Web | 65 | green |
| Lint | 3 packages | green (4 `no-explicit-any` warnings, all at third-party boundaries) |

~34,000 LOC across `apps/api`, `apps/web`, `packages/shared`. 39 Prisma models, 25 migrations,
137 routes. Live production data: **1,005 leads, 10 patients, 7 treatment plans, 8 staff accounts**.

---

## Phase A — what shipped

| ID | Item | Notes |
|---|---|---|
| **C-6** | Login rate limit + account lockout | `/auth/login` had no limit of its own — it inherited the 300/15min *browsing* budget, with no 2FA behind it. Also closed a timing oracle that answered "does this person work here". |
| **S-5** | Password policy | `password` and `12345678` were both legal on accounts that read medical histories. Now 12 chars, blocklist, own-name check. |
| **C-2** | Audit trail | Was a login journal: two write sites, both in `AuthService`. Now covers the clinical record, the money, and who can reach them — including refused requests. |
| **C-1** | Email transport → password reset | A forgotten password was recoverable only by hand-editing production. |
| **C-3** | 2FA + self-service account security | TOTP with recovery codes, own-password change, own-session listing. |
| **S-7** | CSRF protection | Origin allowlist + double-submit token on `/auth/refresh`, the only cookie-authenticated route. |
| **P-2** | Chart code-splitting | `/reports` 293→172 kB, `/dashboard` 275→169 kB. |
| **P-3** | Foreign-key indexes | Postgres does not index the referencing side; Prisma adds none. |
| **S-9** | CI + dependency scanning | There was none. Setting it up revealed lint had never run on two of three packages. |

### Things found along the way, not on the plan

- **A wasted bcrypt round on every token refresh** — `AuthService.refresh` computed a hash and
  discarded it. ~80ms per user per 15 minutes, since the refresh flow was written. Found by lint,
  on the first day lint could run.
- **API lint had never worked.** Globs quoted for a POSIX shell (red on Windows, green on Linux),
  and ESLint 9 pulled in transitively by Baileys demanding flat config this repo does not have.
- **36 stale build artifacts committed inside `packages/shared/src/`**, dated 18 July. The API's
  jest resolves `.js` before `.ts`, so every test touching shared code through a relative import
  was running against **compiled output from 18 July rather than source**. Nine modules were
  shadowed, including two I had edited the day before.
- **The audit trail recorded commands as creations** — seven real password resets were written as
  `CREATE User`. Found by reading what production actually wrote, not by a test.

---

## What needs you

Nothing below can be done from this repository.

1. **`ENCRYPTION_KEY` on Render** — `openssl rand -base64 48`. Set this *before* anyone enables
   2FA. Without it the key derives from `JWT_ACCESS_SECRET`, which is sound but couples two
   rotations: rotating the signing secret would make every enrolled authenticator undecryptable.
2. **SMTP on Render** — `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, and `WEB_APP_URL`.
   Until these are set, password reset refuses rather than pretending to send. `WEB_APP_URL` is the
   one that fails quietly: it falls back to `localhost:3000`, so links would be sent that nobody
   outside your laptop can open.
3. **The eighth staff password.** Seven of eight were reset; one `CLINIC_MANAGER` account, last
   modified 19 July, still holds a pre-policy password.
4. **C-4, the backup restore drill.** Supabase takes backups; nobody has restored one. Needs your
   dashboard access to create a restore target. This is the cheapest insurance on the roadmap and
   the only Phase A item still open.
5. **Six product decisions** — see `NEXT_TASK.md`. Two of them change the plan materially.

---

## What is next

**Phase B — make the clinic run itself.** Opens once C-4 is done. Appointment reminders are the
headline: `Notification` is a dead table, `Appointment.reminderSentAt` has never been written, and
there is no scheduler. Medical-tourism patients fly in for these appointments.

Detail in `NEXT_TASK.md`.
