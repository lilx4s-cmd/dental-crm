# Bug Report

Defects found and their disposition. Distinct from `TECHNICAL_DEBT.md`, which records deliberate
decisions — everything here was something being wrong, not something being deferred.

---

## Phase A — found and fixed

### 1 · Login was rate-limited only by the global browsing budget · **Critical** · fixed

`/api/auth/login` inherited the app-wide 300-requests-per-15-minutes limiter. The public portal had
its own limit of 30 and the intake form 10; the front door had nothing. Three hundred password
attempts per IP per quarter hour, against a system with no second factor and no lockout, makes
credential stuffing an afternoon's work.

**Fixed:** 10/15min per IP with successful sign-ins uncounted, plus a per-account lockout that a
distributed attack cannot dodge by spreading across addresses. `main.ts`,
`packages/shared/src/access/lockout.ts`.

### 2 · The login form was a user-enumeration oracle · **High** · fixed

An unknown email address returned as fast as the database could answer; a known one waited ~80ms
for bcrypt. The difference is measurable over the network, so the form answered "does this person
work at the clinic" for anyone who asked — the first thing worth knowing before spending guesses.

**Fixed:** both paths now compare against a hash. `auth.service.ts`, `DUMMY_HASH`.

### 3 · No password policy · **Critical** · fixed

Creation asked for 8 characters, sign-in for 6. `password` and `12345678` were both legal on
accounts that can read every patient's medical history, passport scans and radiographs.

**Fixed:** 12 characters, a blocklist including the clinic's own words, and a check against the
user's own name and email. `packages/shared/src/access/password-policy.ts`.
**Residual risk:** the eight existing accounts still hold pre-policy passwords — see the action
item in `CHANGELOG.md`. The policy governs setting a password, not verifying one, deliberately.

### 4 · The audit log was a login journal · **Critical** · fixed

`AuditLog` carried `oldValues`/`newValues` columns and was written at exactly two sites, both in
`AuthService`. Nothing recorded who changed a diagnosis, a price, or a medication list.

**Fixed:** `AuditInterceptor` over a registry of clinical, financial and access routes. Refused
requests are recorded too.

### 5 · A wasted bcrypt round on every token refresh · **Medium** · fixed

`AuthService.refresh` computed `const tokenHash = await bcrypt.hash(rawToken, …)` and never read
it — the comparison below uses `bcrypt.compare` against the stored hash. Roughly 80ms per user per
fifteen minutes, for nothing.

**Found by:** ESLint, on the first day it was able to run on this package (see #6).

### 6 · API linting had been silently broken · **High** · fixed

Two independent faults:

- `packages/shared` and `apps/api` quoted their globs POSIX-style (`eslint 'src/**/*.ts'`). On
  Windows `cmd.exe` passes the quotes through literally, so nothing matched and lint failed — while
  the same command passes on Linux. The developer's machine was red and CI would have been green.
- `apps/api` resolves ESLint **9** from a transitive dependency of Baileys. v9 requires flat config;
  this repo uses `.eslintrc.json`, so any invocation failed outright.

**Fixed:** `--ext .ts` instead of shell globs, and `apps/api` names the hoisted v8 binary directly.
Nine real errors surfaced immediately — eight unused imports plus #5.
**Follow-up:** flat-config migration, recorded in `TECHNICAL_DEBT.md`.

### 7 · Foreign keys were unindexed · **Medium** · fixed

Postgres indexes primary keys and unique constraints automatically but not the referencing side of
a foreign key, and Prisma adds none. `TreatmentPlanItem.treatmentPlanId` — walked by every plan
view, every dossier render and the warranty lookup — was a sequential scan, as were
`PatientTag.tagId` and two campaign columns.

**Severity is Medium, not High**, and honestly so: 6 plan items, 0 campaigns, 0 patient tags today.
Nobody is feeling this. It is insurance taken while the index build is instant.

---

## Found earlier in this engagement

### 8 · A 403 during token refresh was delivered as data · **Critical** · fixed

`apiRequest`'s queued-refresh branch called `.json()` without checking `ok`. A caller that waited on
someone else's in-flight token refresh received `{ statusCode: 403, message: 'Forbidden' }` **as its
query data** — React Query reported success and the component rendered the error object. Only the
*second* concurrent caller was affected, so no single-request test could have caught it.

**Fixed and pinned:** reverting the fix makes the regression test fail with the original symptom.
`apps/web/src/lib/api-client.spec.ts`.

### 9 · Failed requests were indistinguishable from empty results · **Critical** · fixed

`isError` appeared on one screen in the whole app. `/reports/kpi` returning 500 rendered **$0 total
revenue**; the calendar rendered an **empty week**; My Day said **"Nothing overdue"**. None of these
look broken, so they get believed — a receptionist reads a blank week as a free week.

Worst instance: **Settings**. Its form fields default to empty strings, so a failed load rendered a
blank form over the real clinic record, and pressing Save wrote those blanks over the address,
timezone and currency that every invoice and every date is formatted from.

**Fixed:** `components/ui/query-state.tsx`, wired across every dashboard surface.

### 10 · Gulf phone numbers were mangled · **High** · fixed

`normalizePhoneForWhatsApp` read a leading `00` as a Turkish trunk zero, so a patient's
`00966 50 123 4567` became `900966501234567` and the chat opened with nobody. The CSV importer
already stripped `00` correctly; this path did not.

**Partially fixed.** The `00` case is correct now. The broader assumption — that *any* leading `0`
is Turkish — remains, and needs a decision from the clinic. See `TECHNICAL_DEBT.md`.

### 11 · Deal values could wrap mid-number · **Low** · fixed

`formatDealValue` grouped digits with an ordinary space, beneath a comment claiming it used a
no-break one specifically so a figure could not split across two lines in a kanban column. It
could, and `45 000` read as two numbers. Now U+00A0.

### 12 · Nine money formatters disagreed · **Medium** · fixed

The same amount rendered `$12,000`, `12 000 $` and `12000 USD` on different screens; one used the
browser locale, so it changed shape by machine. A patient reading a quote and then an invoice saw
two notations for the number they owe.

---

## Open — not yet fixed

| # | Issue | Severity | Where |
|---|---|---|---|
| 13 | No password reset. A locked-out staff member is recoverable only by hand-editing production. | **Critical** | C-1, Phase A remainder |
| 14 | No 2FA, and no self-service password change — a user who suspects compromise must find an admin. | **Critical** | C-3 |
| 15 | Backups have never been restore-tested. 1,005 live leads. | **Critical** | C-4 — needs your Supabase access |
| 16 | CSRF is prevented incidentally by CORS, not by design. The refresh cookie is `SameSite=none` and *is* sent cross-site. | **Medium** | S-7 |
| 17 | No appointment reminders. `Notification` is a dead table, `reminderSentAt` never written, no scheduler. Patients fly in for these appointments. | **Critical** | C-5, Phase B |
| 18 | Meta Lead Ads webhook never calls the Graph API for `leadgen_id`, so paid leads arrive as "Unknown". | **High** | H-12, Phase B |
