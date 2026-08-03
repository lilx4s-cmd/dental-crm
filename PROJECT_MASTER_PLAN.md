# Dental CRM — Project Master Plan

**Date:** 2026-08-03
**Scope of this document:** gap analysis and roadmap. No code was changed to produce it.
**Method:** direct inspection of the codebase at commit `9c21fd7`. Every count below was measured,
not estimated. Where something is claimed absent, the search that found nothing is named.

---

## 0. Read this first — scope reality

The brief asks for feature parity with Bitrix24 **and** Salesforce Health Cloud **and** BrightPlan
**and** a medical-tourism operations system, across roughly 300 named features in 20 domains.

That is not a phase or two. Bitrix24 has been built by a company of ~500 people since 2012.
Realistically the brief as written is **8–14 engineer-years**. Delivered by one agent working with
you, at the pace this project has actually moved, the full list is a multi-year programme.

This document does not pretend otherwise. What it does instead:

1. States what **already exists** — which is substantially more than the brief assumes. Six items
   on the "build this" list are built and working today.
2. Separates **things that are dangerous** from **things that are missing**. A CRM missing
   lead scoring is incomplete. A clinical system with no audit trail and no password reset is
   a liability. These are not the same priority and the brief lists them side by side.
3. Sequences the rest so each phase ships something usable, rather than leaving the system
   half-migrated for months.

**The recommendation is to reorder the brief**, not to reduce it: fix the five Critical items
first (≈3–4 weeks), because they are cheap and they are the ones that can cost you a patient
record, a locked-out clinic, or a regulatory problem. Feature parity work starts after that.

---

## 1. Current Architecture

### Shape

```
dental-crm/                      npm workspaces monorepo
├── apps/api          NestJS 10 · REST · 12,154 LOC · 22 controllers · 131 routes
├── apps/web          Next.js 15 App Router · 17,568 LOC · 17 routes
└── packages/shared   Pure TS, no I/O · 2,887 LOC · consumed by both, dist committed
```

**Total application code: ~32,600 LOC.** Database: PostgreSQL on Supabase, 39 models,
1,311 schema lines, 21 migrations. Live production data — 1,005 leads, 9 appointments,
6 treatment plans.

**Deployment:** Vercel (web) + Render (API), both auto-deploying from `main`.

### Layering

| Concern | Where it lives | Assessment |
|---|---|---|
| HTTP | `*.controller.ts` + DTOs with `class-validator` | Sound. Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`. |
| Business logic | `*.service.ts` | Sound, but services talk to Prisma directly — no repository layer. See W-2. |
| Cross-cutting | `common/` — 2 guards, 1 filter, 2 interceptors, 3 decorators | Correctly registered globally in `app.module.ts:69-74`. |
| Shared logic | `packages/shared` | **The strongest part of this codebase.** Pricing, payment maths, tooth geometry, access policy, CSV parsing all live here as pure functions with no I/O, so the API, the web app and the PDF renderer cannot disagree about them. |
| Data | Prisma | Good use of `Decimal(12,2)` for money. Enums throughout. |

### Authentication as built

JWT access token (15 min) + refresh token in an httpOnly cookie, `sameSite: 'none'` +
`Secure` in production because web and API are on different origins. Rotation on refresh, with a
queue so concurrent 401s trigger exactly one refresh (`api-client.ts:149`).

`RolesGuard` + `@Roles` across 17 of 22 controllers. The 5 without are verified correct:
`auth`, `facebook` (webhook, HMAC-verified), `health`, `intake` (public enquiry form),
`portal` (hashed share-link token). **RBAC coverage is complete.**

### Testing as built

- API: **176 tests, 18 suites**, all passing (`npm run test:api`, 749s).
- Web: **63 tests, 6 suites**, all passing (`npm run test:web`).
- E2E: one skeleton file, `apps/api/test/app.e2e-spec.ts`. Effectively none.

### Already built — do not rebuild

The brief lists these as work to do. They exist and function:

| Brief item | Reality |
|---|---|
| Interactive odontogram | Built. Anatomical SVG geometry in `packages/shared/src/dental/tooth-geometry.ts`, with web/PDF render parity. FDI numbering. |
| WhatsApp integration | Three transports: Cloud API, Evolution API, and Baileys with QR pairing. Transport-agnostic sender. |
| AI module | Live against xAI Grok — assistant, plan summaries, item suggestions, WhatsApp draft replies. |
| Treatment planner | Phases, items, materials, warranties with snapshotted terms, stay + day-by-day itinerary, 9-page PDF dossier. |
| Patient portal + approval | Hashed share links, approve/reject/comment, PDF download. |
| Duplicate detection + merge | Built, with `mergedIntoId` correctly excluded from reporting. |
| CSV import | Hand-written scanner with delimiter detection and column-mapping guesses. |
| OpenAPI docs | Wired at `/api/docs` (`main.ts:75`). |
| Rate limiting | Three tiers: 300/15min global, 30 for portal, 10 for the public intake form. |
| Dark mode + design tokens | `next-themes` + HSL CSS-variable tokens throughout. |

---

## 2. Weaknesses

**W-1 · The audit log is a login journal.** `AuditLog` has `oldValues`/`newValues` columns and is
written at exactly **two sites**, both in `auth.service.ts` (lines 38 and 100 — login and logout).
Nothing records who changed a treatment plan, a price, a diagnosis, or a patient's medication list.
For a system holding medical records this is the single largest structural gap. *(→ C-2)*

**W-2 · No repository layer.** Services call `this.prisma.*` directly. This is defensible at
32k LOC and Prisma is already a data-access abstraction — but it means query logic is duplicated
across services and cannot be unit-tested without mocking Prisma's full shape. The brief asks for
the repository pattern explicitly. Recommend adopting it *for new modules only*, not retrofitting
131 routes.

**W-3 · Four tables exist that no code ever queries.** Verified by searching for every
`prisma.<model>` and `tx.<model>` call in `apps/api/src`:

| Model | Prisma calls found | Consequence |
|---|---|---|
| `Notification` | **none** | No notification is ever created or delivered. |
| `InstallmentPlan` | **none** | Installments cannot be created despite `PaymentMethod.INSTALLMENT`. |
| `InstallmentSchedule` | **none** | Same. |
| `Resource` | **none** | Chairs and rooms cannot be booked. |
| `CallLog` | `updateMany` only | Written by the merge routine; never created, never read. |

Plus two dead columns: `Appointment.reminderSentAt` and `Appointment.googleCalendarEventId` — zero
references anywhere in the repo.

**W-4 · No scheduler.** `@nestjs/schedule` is not a dependency. There is no cron, no queue, no
background worker. Every feature in the brief's Automation section, plus appointment reminders,
plus follow-up nudges, is blocked on this. *(→ C-5, H-2)*

**W-5 · No email transport.** No `nodemailer`, `resend`, `@sendgrid/mail` or equivalent in
`apps/api/package.json`. Consequences beyond marketing: **no password reset, no email verification,
no invoice delivery**. *(→ C-1)*

**W-6 · Single assignee on a lead.** `Lead.assignedToId` is one user. The clinic's workflow has a
sales coordinator *and* a dentist on a case; the brief asks for both plus translator and driver.
Every routing, workload and commission report is limited by this one column.

**W-7 · Reporting is five endpoints.** `kpi`, `revenue`, `appointments`, `patient-growth`,
`lead-funnel`. The brief asks for fifteen report families. Notably absent and all computable from
data already stored: doctor performance, coordinator performance, lead-source attribution,
treatment profitability, marketing ROI, no-show analysis, forecast.

**W-8 · No E2E tests.** 239 unit/integration tests, one empty E2E skeleton. Nothing exercises
login → create lead → convert → plan → invoice as a user would.

---

## 3. Gap Analysis

Severity means **operational risk to a live clinic**, not distance from Bitrix24.
Estimates are engineer-weeks, rough, and assume the existing architecture.

### CRITICAL — fix before anything else

| ID | Gap | Why critical | Est. |
|---|---|---|---|
| **C-1** | **No password reset, no email verification.** No email transport exists (W-5). | A staff member who forgets their password cannot be recovered except by hand-editing the production database. This is a guaranteed future incident, not a hypothetical. | 1w |
| **C-2** | **No audit trail on clinical or financial data** (W-1). | Nothing records who changed a diagnosis, a price, or a medication list. For medical records this is a liability and, under GDPR/KVKK, likely a compliance failure. The columns already exist — this is an interceptor, not a migration. | 1w |
| **C-3** | **No 2FA. No self-service password change.** Admin session revocation exists (see S-4); *self-service* account security does not. | The system holds passport scans, radiographs and medical histories. One phished password is total access, and the victim cannot rotate their own password or kill their own sessions — they must find an administrator. | 1.5w |
| **C-4** | **No verified backup and restore.** Supabase takes automatic backups; nobody has tested a restore. | 1,005 live leads and 6 real treatment plans. An untested backup is not a backup. This is a half-day of work and it is the cheapest insurance on this list. | 0.5w |
| **C-5** | **No appointment reminders.** `Notification` is dead, `reminderSentAt` is never written, no scheduler (W-3, W-4). | Medical tourism patients fly in. A missed appointment is a wasted flight and a lost case. This is direct, quantifiable revenue loss happening now. | 1.5w |
| **C-6** | **No rate limit on login.** `main.ts` adds stricter limiters for `/api/portal` (30) and `/api/intake` (10), but `/api/auth/login` sits under the global 300/15min. No account lockout. | 300 password attempts per IP per 15 minutes against a system with no 2FA (C-3). Credential stuffing is trivially viable. **This is the cheapest fix on the list — under an hour.** | 0.2w |

**Critical total: ≈ 5.7 weeks.**

### HIGH — blocks daily work or a named business goal

| ID | Gap | Note | Est. |
|---|---|---|---|
| H-1 | **Automation engine.** Trigger/condition/action, no-code builder. | The brief's flagship. Entirely blocked on W-4. Needs a rules table, an execution log, and a scheduler before any UI. | 6–8w |
| H-2 | **Reporting suite** (W-7). | All computable from stored data. Cheap now that Phase 0's indexes exist. | 3w |
| H-3 | **Global search.** No command palette; searched for `cmdk`/`globalSearch` — nothing. | Every competitor named has this. At 1,005 leads it is already needed. | 1.5w |
| H-4 | **Consent forms + digital signature.** Grep for "signature" returns only HMAC webhook verification. | Medico-legal requirement for surgical treatment, not a nice-to-have. | 2w |
| H-5 | **Coordinator/dentist/translator/driver assignment** (W-6). Also no `translator`, `driver` or `coordinator` role; `Resource` is `CHAIR \| ROOM` and unused. | Blocks the entire Medical Tourism section of the brief. | 2w |
| H-6 | **Payment gateway.** No Stripe/Wise. Payments are manually recorded rows. | Deposits are the conversion moment in medical tourism. | 2w |
| H-7 | **Multi-pipeline.** No `Pipeline` model; stages are a hardcoded array in `packages/shared`. | Brief asks for it; the clinic may not need it. **Confirm before building.** | 2w |
| H-8 | **Tooth surfaces + Universal/Palmer numbering.** FDI only, tooth-level only. Also no periodontal chart. | Changes the unit of diagnosis from tooth to surface — touches storage, geometry, both renderers and the editor. A phase of its own. | 4w |
| H-9 | **Inventory.** Nothing exists. | Implants and crowns have lot numbers and expiry dates; traceability is a clinical requirement. | 3w |
| H-10 | **E2E tests** (W-8). | | 1.5w |
| H-11 | **Google Calendar sync.** `googleCalendarEventId` is a dead column. | Dentists live in their own calendars. | 1.5w |
| H-12 | **Meta Lead Ads.** Webhook receives `leadgen_id` but never calls the Graph API to fetch the lead, so real ad leads arrive as "Unknown". | Paid traffic is currently arriving unusable. Small fix, real revenue impact. | 0.5w |

**High total: ≈ 29–31 weeks.**

### MEDIUM — parity and scale

| ID | Gap | Est. |
|---|---|---|
| M-1 | Custom fields (searched `customField` — absent) | 3w |
| M-2 | Saved views + smart filters (`savedView` — absent) | 2w |
| M-3 | Lead scoring (no `score` column) | 1.5w |
| M-4 | Contacts + Companies as first-class objects | 3w |
| M-5 | Kanban virtualization — 1,005 leads render as 1,005 DOM nodes | 1w |
| M-6 | Notification centre UI + in-app/push delivery | 2w |
| M-7 | File versioning, folders, per-file permissions | 2w |
| M-8 | Call logging (`CallLog` is write-only, W-3) + voice notes | 2w |
| M-9 | Instagram DM + internal team chat | 3w |
| M-10 | Outbound webhooks + API keys for third parties | 2w |
| M-11 | Forecast + pipeline analytics | 2w |
| M-12 | Installments (two dead tables, W-3) | 1.5w |
| M-13 | Chair/room booking (`Resource` dead, W-3) | 1.5w |
| M-14 | Redis caching layer | 1.5w |

**Medium total: ≈ 28 weeks.**

### LOW — defer

Outlook sync · Google Drive / Dropbox · n8n / Zapier connectors · TikTok Ads · CBCT DICOM viewer ·
multi-currency FX · white-label theming · mobile apps. **≈ 20 weeks.**

### Totals

| Band | Estimate |
|---|---|
| Critical | 5.7w |
| High | 29–31w |
| Medium | 28w |
| Low | 20w |
| **Total** | **≈ 83–85 engineer-weeks ≈ 1.7 engineer-years** |

That figure covers the brief as scoped here. It is lower than the 8–14 year estimate in §0 because
this plan targets *this clinic's* workflows rather than Bitrix24's full generality — no marketplace,
no app store, no multi-tenancy, no BPM designer, no telephony stack.

---

## 4. Performance

**Measured:** first-load JS from `npm run build:web`.

| Route | First load | Note |
|---|---|---|
| `/appointments` | **282 kB** | `react-big-calendar` + locale data. Worst on the app. |
| `/reports` | 289 kB | `recharts` — five chart families eagerly imported. |
| `/pipeline` | 275 kB | `@dnd-kit` + 1,005 unvirtualized cards. |
| shared | 103 kB | Reasonable. |

**P-1 · No list virtualization.** The pipeline board renders every lead. At 1,005 it is already
janky on mid-range hardware; at 5,000 it will be unusable. *(M-5)*

**P-2 · Charts are not code-split.** `recharts` loads on `/reports` whether or not a chart renders.
`next/dynamic` with `ssr: false` around each chart family would cut ~120 kB. **Half a day.**

**P-3 · Twelve models still carry zero indexes.** Most are small or dead, but three are not:
`TreatmentPlanItem` (queried per plan), `Campaign`, and `Tag`/`PatientTag` (joined on every patient
list). **Half a day.**

**P-4 · No caching layer.** Every dashboard load recomputes aggregates from base tables. Fine at
current volume; the fix is `M-14`, not urgent.

**P-5 · No N+1 audit since the reports fix.** Phase 0 fixed the known loops in `reports.service.ts`.
Nothing has checked the other 20 services. Worth one systematic pass with query logging on.

---

## 5. Security

### Sound today

Helmet · three-tier rate limiting · `trust proxy: 1` (correct for Render, and set narrowly so a
client cannot forge `X-Forwarded-For`) · `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`
· Prisma parameterised queries throughout (no raw SQL concatenation found) · bcrypt · httpOnly +
`Secure` + `SameSite` refresh cookie with rotation · private Supabase bucket with 300s signed URLs
· Facebook webhook HMAC verified with `timingSafeEqual`, and it *refuses* rather than accepts when
unconfigured · RBAC on every non-public route.

That is a better baseline than most projects this size. The gaps below are real but they are gaps
in an otherwise defended system.

### Findings

| ID | Finding | Severity |
|---|---|---|
| **S-1** | ~~No login rate limit or account lockout.~~ **Done 2026-08-03** (C-6). 10/15min per IP with successes uncounted, plus a per-account lockout escalating 15/30/60 minutes. Also closed a user-enumeration timing side channel: an unknown email skipped bcrypt and answered in under a millisecond where a known one took ~80ms. | **Done** |
| **S-2** | No 2FA (C-3). | **Critical** |
| **S-3** | No audit trail on clinical/financial mutations (C-2). | **Critical** |
| **S-4** | ~~No session listing or revocation.~~ **Corrected 2026-08-03 — this was wrong.** `GET /users/:id/sessions`, `POST /users/:id/revoke-sessions` and an admin password reset that revokes sessions all exist (`users.controller.ts:49-65`). What is actually missing: (a) sessions are *counted*, not listed — no device, IP or last-used, so a suspicious session cannot be picked out from a legitimate one, though `RefreshToken` already stores `createdByIp` and `userAgent`; (b) all three are admin-only, so a user who suspects their own account is compromised can do nothing themselves; (c) **there is no self-service password change at all** — only an admin can rotate a password. | **High** |
| **S-5** | ~~No password policy.~~ **Done 2026-08-03.** Was `min(8)` at creation and `min(6)` at login, so `password` and `12345678` were both legal on accounts that can read every patient's medical history. Now 12 characters, a blocklist, and a check against the user's own name/email — shared between the API validator and the settings form. **Open:** no breach-corpus (HIBP) check; and **the eight existing accounts still hold pre-policy passwords** — see §9.7. | **Done / partial** |
| **S-6** | Medical data is not encrypted at rest beyond Supabase's disk encryption. `medications`, `medicalConditions`, `isPregnant`, `takesBloodThinners` are plaintext columns. Field-level encryption would mean anyone with a read replica or a leaked backup gets nothing. | **High** |
| **S-7** | CSRF: mitigated in practice, not by design. The refresh cookie is `SameSite=none` (required — cross-origin deploy), so it *is* sent cross-site. A forged POST to `/api/auth/refresh` would succeed at the cookie level, but CORS prevents the attacker reading the returned token, so impact is limited to token rotation. **Add a double-submit CSRF token anyway** — the current safety is incidental. | **Medium** |
| **S-8** | No secret rotation procedure. JWT signing key has never been rotated and there is no mechanism to. | **Medium** |
| **S-9** | No dependency scanning in CI. `npm audit` reported issues during install and nothing gates on it. | **Medium** |
| **S-10** | Portal share-link tokens are hashed, but there is no expiry or revocation. A forwarded link works forever. | **Medium** |

---

## 6. Database

### Sound

`Decimal(12,2)` for all money · enums not strings · `caseNumber` from a Postgres sequence, so two
concurrent admissions cannot collide · cascade rules considered · `mergedIntoId` correctly excluded
from reporting paths · 21 hand-authored migrations, all applied.

### Improvements

**D-1 · Resolve the five dead models (W-3).** Each needs an explicit decision, not drift:

| Model | Recommendation |
|---|---|
| `Notification` | **Implement** — C-5 depends on it. |
| `Resource` | **Implement** — H-5/M-13; extend enum with `EQUIPMENT`. |
| `InstallmentPlan` / `InstallmentSchedule` | **Implement** — M-12; `PaymentMethod.INSTALLMENT` already promises it. |
| `CallLog` | **Implement or drop** — M-8. Currently it silently loses call history. |

**D-2 · No soft deletes anywhere.** A deleted patient is gone. Medical records generally may not be
hard-deleted. Add `deletedAt` to `Patient`, `TreatmentPlan`, `Invoice`, `Lead` and filter globally.

**D-3 · Fields the brief needs that don't exist:**
- `Patient`: `preferredLanguage`, `emergencyContactName/Phone/Relation`, `passportNumber`,
  `passportExpiry`, `assignedCoordinatorId`, `assignedDentistId`
- `Lead`: `score`, `country`, `preferredLanguage`, `nextFollowUpAt`

**D-4 · New models required by the roadmap:** `Pipeline`, `PipelineStage`, `CustomFieldDefinition`,
`CustomFieldValue`, `SavedView`, `ConsentForm`, `Signature`, `InventoryItem`, `Supplier`,
`PurchaseOrder`, `Hotel`, `Driver`, `Translator`, `TravelBooking`, `AutomationRule`,
`AutomationRun`, `ApiKey`, `OutboundWebhook`, `EmailMessage`, `TwoFactorSecret`.

**D-5 · Single-tenant, and that's correct** — but no `clinicId` anywhere means multi-tenancy later
is a migration across every table. Document the decision; don't pre-build it.

**D-6 · Index the three live models that lack indexes** (P-3).

---

## 7. UI / UX

**Strong:** shadcn/Radix primitives (accessible by construction) · HSL token system with real dark
mode · Bitrix-faithful kanban that staff already recognise · Google-Calendar-style appointments
view · anatomical odontogram.

**U-1 · No global search / command palette** (H-3). The single biggest daily-friction item.

**U-2 · No notification centre.** No bell, no unread count, nothing to receive C-5's output.

**U-3 · Empty states are inconsistent.** Error states were standardised in `9c21fd7`
(`components/ui/query-state.tsx`); empty states are still hand-written per screen with varying
tone and no illustration. Extract `<EmptyState>` alongside it.

**U-4 · No accessibility audit has been run.** Radix gives keyboard and ARIA behaviour for free,
but nothing has verified colour contrast on the token palette, focus order on the kanban
(drag-and-drop is a known a11y hazard), or screen-reader labelling on the odontogram — which is an
interactive SVG and almost certainly unusable without sight today.

**U-5 · No mobile layout for the kanban or calendar.** Both assume a wide viewport. Coordinators
use phones.

**U-6 · No onboarding or in-app help.** The brief says "there is instruction everything completed".
Nothing in the app teaches a new coordinator how to use it.

---

## 8. Roadmap

Each phase ends with: static analysis → full test run → fixes → `CHANGELOG.md`, `NEXT_PHASE.md`,
`BUG_REPORT.md`, `TECHNICAL_DEBT.md`. Nothing merges red.

### Phase A — Harden (≈4 weeks) · **start here**

C-6 login limiter + lockout · C-4 verified backup/restore drill · C-2 audit interceptor ·
C-1 email transport → password reset + verification · C-3 2FA + session management ·
S-5 password policy · S-7 CSRF token · S-9 dependency scanning in CI · P-2 chart code-splitting ·
P-3 missing indexes.

*Why first: 5 of 6 Criticals, most under a week each, and every one of them is a thing that can
hurt you before any new feature ships.*

### Phase B — Make the clinic run itself (≈6 weeks)

C-5 notification delivery + appointment reminders (WhatsApp/email/SMS) · `@nestjs/schedule` ·
H-12 Meta Lead Ads Graph fetch · H-2 reporting suite · U-2 notification centre.

*Why second: reminders and working ad leads are the two items with direct, measurable revenue
impact, and both are small once Phase A's plumbing exists.*

### Phase C — Daily-work quality (≈6 weeks)

H-3 global search · H-5 multi-role assignment + coordinator/translator/driver roles ·
U-3 `<EmptyState>` · U-4 accessibility audit + fixes · M-5 kanban virtualization · H-10 E2E suite.

### Phase D — Clinical depth (≈8 weeks)

H-4 consent forms + digital signature · H-8 tooth surfaces, Universal/Palmer, periodontal chart ·
D-2 soft deletes · S-6 field-level encryption for medical columns.

### Phase E — Money (≈6 weeks)

H-6 Stripe/Wise · M-12 installments · treatment profitability · doctor and sales commission
reporting · expenses.

### Phase F — Medical tourism operations (≈6 weeks)

Hotels, drivers, translators, airport transfers, travel documents, visa tracking, the full patient
journey board, coordinator dashboard.

### Phase G — Automation engine (≈8 weeks)

Rules table · execution log · trigger/condition/action runtime · no-code visual builder.
*Deliberately late: it composes every other module, so building it first means building it twice.*

### Phase H — Parity & scale (ongoing)

Custom fields · saved views · lead scoring · contacts/companies · inventory · multi-pipeline ·
webhooks + API keys · Redis · remaining integrations.

**Phases A–G: ≈44 weeks.** Phase H is open-ended.

---

## 9. Decisions needed from you

These change the plan materially and I should not guess:

1. **Multi-pipeline (H-7)** — does the clinic run more than one sales process? If not, 2 weeks saved
   and a lot of complexity avoided.
2. **Contacts & Companies (M-4)** — Bitrix has these because it is a generic B2B tool. This clinic
   sells to individuals who fly in. Add them, or keep Lead → Patient?
3. **SMS provider** — Twilio is expensive for Turkey/Gulf traffic. A regional provider may be
   better. Which?
4. **Phone country assumption** — `normalizePhoneForWhatsApp` assumes any local-format number is
   Turkish, so a Saudi lead entered as `0555…` dials a wrong Turkish number. Fixing it properly
   needs a rule: infer from `Lead.source`, add a country field, or require E.164 at entry?
5. **Arabic dossier** — still blocked on you opening `arabic-spike.pdf` and confirming the letters
   join. Clinical copy stays behind human review regardless.
6. **Consent forms (H-4)** — which jurisdiction's requirements? Turkish KVKK, GDPR for EU patients,
   or both?

7. **Reset the eight existing staff passwords — action for you, not code.** The new policy applies
   when a password is *set*. It is deliberately not enforced at sign-in, because doing so would
   have locked all eight accounts out of the system on the day it shipped. So every current
   password still predates the policy and may well be one of the ones now banned. Until C-3 ships
   there is no self-service change, so this has to go through
   Settings → Team → a person → *Set a new password*, which now shows the rules as you type and
   signs that person out everywhere. **Do this for all eight, including your own.**

---

## 10. What I recommend we do next

Start **Phase A, item C-6** — the login rate limiter and account lockout. It is under an hour, it
closes the most exploitable hole in the system, and it needs no decisions from you.

Then work down Phase A in order. I'll produce `CHANGELOG.md`, `NEXT_PHASE.md`, `BUG_REPORT.md` and
`TECHNICAL_DEBT.md` at the end of it.

Say the word and I'll begin.
