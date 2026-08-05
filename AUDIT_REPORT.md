# Enterprise Audit — Dental CRM

**Date:** 2026-08-04 · **Commit:** `7dd97e6` · **Method:** direct source inspection, live build
measurement, and read-only queries against the production database.

Every number here was measured. Where something could not be verified, it appears under
**Blocked Items** rather than being estimated.

---

## Scope inspected

| | |
|---|---|
| Web routes | 19 (all) |
| React components | 76 across 13 directories |
| API routes | 137 across 22 controllers |
| Prisma models | 41 · 32 enums · 58 indexes · 26 migrations |
| Code | 15,308 API + 18,757 web + 3,345 shared = **37,410 LOC** |
| Tests | 316 API (26 suites) + 65 web (6 suites) |
| Live data | 1,005 leads · 10 patients · 7 treatment plans · 8 staff |

---

## Cross-cutting findings

These affect most pages, so they are stated once rather than repeated nineteen times.

### X-1 · Labels are mostly not associated with their inputs · **High** · a11y

128 `<Label>` components, **48 `htmlFor` attributes**. Roughly 80 labels are visually adjacent to
their field but not programmatically bound to it. A screen reader announces "edit text, blank"
instead of "Deposit amount". Radix does this correctly *inside* its own primitives (Select,
Checkbox); the gap is in hand-written form rows.

**Fix:** `htmlFor`/`id` on every pair. Mechanical, roughly a day, and it is the single highest
accessibility return in the codebase.

### X-2 · Twelve of nineteen pages have no responsive breakpoints at all · **High** · UX

`pipeline`, `appointments`, `inbox`, `patients`, `team`, `my-day`, all three auth pages, `intake`,
the marketing root, and the patient portal contain no `sm:`/`md:`/`lg:` classes whatsoever. The
portal one matters most — that is the page **patients** open, frequently on a phone, often abroad.

The dashboard pages that *do* have breakpoints (finance, reports, settings, patient record) are
laid out for a desktop first and degrade rather than adapt.

### X-3 · Twenty-six of twenty-nine `findMany` calls are unbounded · **Medium** · performance

No `take`. Fine at 1,005 leads and 10 patients; not fine for `LeadActivity`, `Message` or
`AuditLog`, which now grow on every action and every mutation respectively. The audit table in
particular went from two rows per session to one per write in this release.

### X-4 · No `EmptyState` primitive · **Low** · UX consistency

Error states were standardised (`components/ui/query-state.tsx`) but empty states are still
hand-written per screen, with different tone, different iconography and different calls to action.
Twenty UI primitives exist; this is the obvious twenty-first.

### X-5 · No global search, no command palette · **High** · UX

Nothing matches `cmdk`, `CommandPalette`, or `globalSearch`. At 1,005 leads this is already the
largest daily friction in the product, and every competitor named in the brief has it.

---

## Page-by-page

Scored 1–10. "Complexity" is engineer-days for the recommended work.

### 1 · `/login`

**Purpose:** Sign in. Now also the entry to account recovery and the 2FA challenge.
**Strengths:** Clean; delegates to shared `LoginSchema`; 2FA challenge handled as a discriminated
union so a half-finished sign-in is a type error rather than a runtime surprise; "Forgot password?"
present.
**Weaknesses:** No breakpoints (X-2). No "remember this device" — every 2FA user types a code every
session, which is the friction that makes people turn 2FA off.
**Security:** Strong after this release — 10/15min IP limit, per-account lockout, timing-equalised
so the form is not an account oracle.
**Missing:** Caps-lock hint; no link to support when locked out.
**Priority:** Medium · **Complexity:** 2 · **Score: 8/10**

### 2 · `/forgot-password`, `/reset-password`

**Purpose:** Self-service recovery.
**Strengths:** Enumeration-safe — identical response whether or not the address exists, and all
four refusal paths share one message so a token cannot be probed. Password rules shown live from
the same function the API enforces.
**Weaknesses:** Inert until SMTP is configured (see Blocked Items). No resend cooldown *shown* —
the 5/15min limit exists server-side but the UI does not say so, so a user hits an opaque 429.
**Priority:** Low · **Complexity:** 1 · **Score: 8/10**

### 3 · `/dashboard`

**Purpose:** Management overview.
**Strengths:** 155 kB first load after chart code-splitting (was 275). Error states distinguish
failure from a real zero. Stage labels now come from the shared table.
**Weaknesses:** Five stat tiles and one chart — thin for a "dashboard". No date-range control, no
comparison to previous period, no drill-through from a tile to the underlying list.
**Missing:** Trend arrows, targets, per-user view, anything actionable.
**Priority:** High · **Complexity:** 8 · **Score: 6/10**

### 4 · `/pipeline` — the most-used screen

**Purpose:** Bitrix-style kanban board.
**Strengths:** Faithful to the Bitrix board staff already know; drag-and-drop; rich filter bar (438
LOC); duplicate detection and merge; stage-gated document expectations.
**Weaknesses:** **263 kB and every one of 1,005 leads rendered as a DOM node** — no virtualization.
This is the worst-performing interaction in the product and it degrades as the clinic succeeds.
**UX:** No saved views, no bulk actions, no keyboard navigation. Drag-and-drop has no keyboard
alternative at all, which makes the primary workflow unusable without a mouse.
**Missing:** Lead scoring, multiple pipelines, per-column WIP limits.
**Priority:** **Critical** (virtualization) · **Complexity:** 6 · **Score: 6/10**

### 5 · `/patients` and `/patients/[id]`

**Purpose:** Patient list and the clinical record.
**Strengths:** The record is the strongest page in the app — tabs for appointments, treatment
plans, invoices, files, case planning; medical history now carried across from the enquiry form;
role-gated so a sales consultant cannot read radiographs.
**Weaknesses:** 548 LOC in one file. List has no filters beyond search — no tag, country, dentist,
or aftercare filter. No patient photo anywhere despite `File` supporting it.
**Missing:** Emergency contact, passport/visa fields, preferred language, assigned coordinator and
dentist — all named in the brief, none present.
**Priority:** High · **Complexity:** 10 · **Score: 7/10**

### 6 · `/appointments`

**Purpose:** Google-Calendar-style scheduling.
**Strengths:** Genuinely good — day/week/month/agenda, 30-minute slots, clinic-hours default,
correct range fetching per view.
**Weaknesses:** **270 kB, the heaviest route.** No breakpoints, so unusable on the phone a
receptionist actually holds. No chair or room booking (`Resource` exists and is never queried). No
recurring appointments. No drag-to-reschedule.
**Missing:** Reminders (the `Notification` table is dead), Google/Outlook sync
(`googleCalendarEventId` is a dead column), waiting list, double-booking warnings.
**Priority:** **Critical** (reminders) · **Complexity:** 12 · **Score: 6/10**

### 7 · `/finance`

**Purpose:** Invoices and payments.
**Strengths:** 713 LOC covering invoice creation, payment recording, status transitions; money now
formatted one way everywhere.
**Weaknesses:** Largest page file in the app; three dialogs inline in one module. No quotes as a
distinct object. Installments have two database tables and **zero code**. No refunds, no expenses,
no commission reporting despite `Patient.salesCommission` existing.
**Security:** No payment gateway — every payment is a manually keyed row, so the ledger records
what staff say happened, not what did.
**Priority:** High · **Complexity:** 15 · **Score: 5/10**

### 8 · `/reports`

**Purpose:** Analytics.
**Strengths:** 159 kB after code-splitting. Five charts, all with real error states.
**Weaknesses:** **Five endpoints total.** No doctor performance, no coordinator performance, no
source attribution, no treatment profitability, no marketing ROI, no no-show analysis, no forecast.
No date range. No export.
**Everything missing is computable from data already stored** and cheap now the indexes exist.
**Priority:** High · **Complexity:** 15 · **Score: 4/10**

### 9 · `/inbox`

**Purpose:** Unified conversations.
**Strengths:** WhatsApp via three transports; retry on failed sends; archive; error states on both
panes.
**Weaknesses:** No breakpoints — a two-pane layout on a phone. No search within conversations. No
templates or canned replies. Instagram and Messenger are tabs with no backing implementation.
**Missing:** Email as a channel (no transport until this release, still not wired to the inbox),
internal notes on a thread, assignment.
**Priority:** High · **Complexity:** 10 · **Score: 6/10**

### 10 · `/my-day`

**Purpose:** The morning follow-up list.
**Strengths:** Genuinely differentiated — rules decide who needs contact, AI only writes the
message. Recycle list for cold deals with an angle suited to how far each got.
**Weaknesses:** No breakpoints. No snooze, no "done" acknowledgement, no ordering control.
**Priority:** Medium · **Complexity:** 4 · **Score: 7/10**

### 11 · `/settings`

**Purpose:** Clinic configuration, team, integrations, account security.
**Strengths:** WhatsApp QR pairing, storage status, plan defaults, and now full self-service
account security — 2FA enrolment with QR and recovery codes, own-password change, own-session list
with device and IP.
**Weaknesses:** 225 kB. No audit-log viewer — the trail is written and **cannot be read from the
app**, which halves its value. No role/permission editor despite the brief asking for one; roles
are a compile-time constant.
**Priority:** High · **Complexity:** 8 · **Score: 7/10**

### 12 · `/team`

**Purpose:** Sales activity and lead transfer.
**Strengths:** Transfer panel with preview; activity feed with stage transitions.
**Weaknesses:** No breakpoints. No per-person performance figures — the page shows *what happened*
but never *how well anyone did*, which is what a manager opens it for.
**Priority:** Medium · **Complexity:** 5 · **Score: 6/10**

### 13 · `/campaigns`

**Purpose:** Ad campaign tracking.
**Strengths:** Platform, budget, date range, lead counts.
**Weaknesses:** Thin. No cost-per-lead, no cost-per-sale, no ROI — the three numbers the page
exists to produce.

**Correction (2026-08-04, after building the fix):** this report first said paid leads "arrive as
Unknown". They did not arrive at all. The handler read `entry.leadgen_id` and `entry.field_data`
straight off the entry; Meta nests the identifier under `entry.changes[].value` and never sends
`field_data` in a webhook at all. So the guard `if (!entry.leadgen_id) continue` skipped every
delivery and the integration silently created nothing. Verified against production: **zero leads
carry a leadgen_id and none is named "Unknown"** — the 5 FACEBOOK_ADS leads on file came from the
Bitrix migration. Fixed in this release.
**Priority:** **Critical** (the Graph fetch is half a week) · **Complexity:** 6 · **Score: 3/10**

### 14 · `/intake` (public)

**Purpose:** Public enquiry form with medical questionnaire.
**Strengths:** 560 LOC, thorough; rate-limited to 10/15min; feeds the medical history that now
carries to the patient record.
**Weaknesses:** No breakpoints on a form patients fill in on phones. No progress indicator on a
long form. No save-and-resume.
**Priority:** High · **Complexity:** 4 · **Score: 6/10**

### 15 · `/portal/[token]` (public, patient-facing)

**Purpose:** The patient reads and approves their treatment plan.
**Strengths:** Hashed share links; approve/reject/comment; PDF download; an animation route
explaining the treatment.
**Weaknesses:** **No breakpoints on the one page patients definitely open on a phone, abroad.**
Share links never expire and cannot be revoked — a forwarded link works forever.
**Priority:** **Critical** (mobile + link expiry) · **Complexity:** 5 · **Score: 5/10**

---

## Module scores

| Module | Score | One-line verdict |
|---|---|---|
| Authentication & account security | **9/10** | Genuinely strong after this release |
| Pipeline / Deals | 6/10 | Right shape, will not scale past ~2,000 leads |
| Patients | 7/10 | Best page in the app; missing tourism fields |
| Dental / odontogram | 7/10 | Anatomical and shared with the PDF; tooth-level only |
| Treatment planning | 7/10 | Phases, warranties, portal approval, 9-page dossier |
| Appointments | 6/10 | Good calendar, no reminders, no resources |
| Finance | 5/10 | Records payments; no gateway, no installments, no commission |
| Reporting | 4/10 | Five endpoints where fifteen families are needed |
| Communication | 6/10 | WhatsApp strong, everything else absent or a stub |
| Medical tourism | **2/10** | Essentially unbuilt — see below |
| Automation | **1/10** | No scheduler, no engine, nothing |
| AI | 7/10 | Four real features, well-scoped |
| Security | 8/10 | See `SECURITY_REPORT.md` |
| Performance | 6/10 | See `PERFORMANCE_REPORT.md` |
| Accessibility | **3/10** | Labels unbound, kanban keyboard-inaccessible |
| Database | 7/10 | See `DATABASE_REVIEW.md` |
| Code quality | 8/10 | Strong shared layer, honest comments, real tests |

**Overall product: 6.1/10** — a solid, secure, well-tested clinical CRM with a genuinely good
treatment planner, and almost none of the medical-tourism operations the brief is named for.

---

## BLOCKED ITEMS

Things I could not verify, and what each needs from you.

1. **Live UI behaviour.** I have no browser and no renderer. Everything above is from source, build
   output and the database — I have never *seen* a page. Any judgement about visual quality,
   contrast, or how a layout actually breaks on a phone is inference. **Needed:** you clicking
   through, or a staging URL with Playwright permitted.
2. **PDF appearance.** Same limitation. `treatment-plan-sample.pdf` has still never been confirmed
   opened by you.
3. **Real Lighthouse / Core Web Vitals.** Bundle sizes are measured; runtime performance is not.
   **Needed:** the deployed URL and permission to run Lighthouse against it.
4. **Supabase storage contents.** I can read the database but have not enumerated the bucket, so I
   cannot say whether any file already stored has a dangerous content type. **Needed:** confirmation
   you want me to enumerate it.
5. **Whether the 166 duplicate groups are genuinely duplicates.** I verified the phone numbers match
   and that 156 groups contain multiple active deals. Whether they are the same *person* is a
   clinical/commercial judgement. **Needed:** you spot-checking five of them.
6. **Consent-form wording (Q5).** You chose KVKK + GDPR. I will not draft medico-legal text.
   **Needed:** the clinic's actual consent wording, from you or your lawyer.
7. **SMS provider (Phase B).** Still unanswered. Blocks appointment reminders' third channel.
