# Roadmap

**Date:** 2026-08-04 · Supersedes the phase list in `PROJECT_MASTER_PLAN.md`, which was written
before Phase A shipped.

Estimates are engineer-days. Risk is the chance of breaking something live. Every item names its
dependency, because several look independent and are not.

---

## Now — before anything else

Four items, all yours, none of which I can do.

| | Item | Why it cannot wait |
|---|---|---|
| N-1 | **Restore-test a backup** | Nobody has ever restored one. The recovery-time objective is unknown. Half a day, and it is the cheapest insurance here |
| N-2 | **Set `ENCRYPTION_KEY` on Render** | Until it exists, 2FA secrets derive their key from `JWT_ACCESS_SECRET`, coupling two unrelated rotations. Do this *before* anyone enrols |
| N-3 | **Set SMTP** (`SMTP_HOST`, `MAIL_FROM`, `WEB_APP_URL`) | Password reset is built and inert. `WEB_APP_URL` fails quietly — it falls back to localhost, so links would go out that nobody can open |
| N-4 | **Reset the eighth staff password** | One `CLINIC_MANAGER`, last modified 19 July, still on a pre-policy password |

---

## Critical — 3 weeks

| | Item | Days | Risk | Depends on | Business impact |
|---|---|---:|:---:|---|---|
| C-1 | **Meta Lead Ads Graph fetch** | 3 | Low | — | Every paid lead currently arrives as "Unknown". You are buying traffic that lands unusable |
| C-2 | **Scheduler** (`@nestjs/schedule`) | 3 | Low | — | Nothing else in automation can start without it |
| C-3 | **Appointment reminders** | 8 | Medium | C-2, N-3 | Patients fly in. A missed appointment is a wasted flight and usually a lost case |
| C-4 | **File upload validation** | 4 | Low | — | Any type, any size, client-declared. Stored XSS is reachable |
| C-5 | **Kanban virtualization** | 5 | Medium | — | 1,005 DOM nodes on the most-used screen; worsens as you grow |

**Also budget in C-2:** the audit interceptor only sees HTTP requests. The first scheduled job that
writes to a patient record is invisible to the trail. Close that gap in the phase that creates it.

---

## High — 8 weeks

| | Item | Days | Risk | Depends on | Impact |
|---|---|---:|:---:|---|---|
| H-1 | **Global search / command palette** | 7 | Low | — | Largest daily friction |
| H-2 | **Reporting suite** — doctor, coordinator, source, profitability, ROI, no-show | 15 | Low | — | All computable now; indexes exist |
| H-3 | **Accessibility remediation** — label binding, keyboard kanban, odontogram alternative | 8 | Low | — | Score 3→7. Also a legal exposure under EU accessibility rules |
| H-4 | **Mobile layouts** for the 12 pages with no breakpoints | 10 | Low | — | Start with the patient portal — patients open it on phones, abroad |
| H-5 | **Soft deletes** on medical records | 4 | **High** | — | KVKK/GDPR retention conflicts with `DELETE`. Touches every query |
| H-6 | **Share-link expiry and revocation** | 2 | Low | — | A forwarded plan link works forever |
| H-7 | **Audit-log viewer** | 3 | Low | — | The trail is written and cannot be read from the app |
| H-8 | **Export** (CSV, PDF) | 4 | Low | — | Nothing leaves the system in any format |
| H-9 | **Patient/lead fields** — coordinator, dentist, passport, emergency contact, language | 3 | Low | — | Blocks the tourism module |

---

## Medium — 12 weeks

| | Item | Days | Risk | Depends on |
|---|---|---:|:---:|---|
| M-1 | **Medical tourism module** — hotels, drivers, translators, transfers, visas, companions, journey board | 30 | Medium | H-9 |
| M-2 | **Payment gateway** (Stripe/Wise) + installments | 12 | Medium | — |
| M-3 | **Consent forms + digital signature** | 10 | Medium | **your wording**, H-5 |
| M-4 | **Notification centre** | 5 | Low | C-3 |
| M-5 | **Email into the unified inbox** | 5 | Low | N-3 |
| M-6 | **Commission reporting** — doctor and sales | 5 | Low | H-2 |
| M-7 | **Bound the unbounded queries** | 4 | Low | — |
| M-8 | **Saved views + bulk actions** | 6 | Low | — |
| M-9 | **E2E suite** | 6 | Low | — |
| M-10 | **Field-level encryption** for medical columns | 4 | Medium | — |

---

## Low — as capacity allows

Lead scoring (4) · custom fields (10) · multi-pipeline (8, *confirm you need it first*) · tooth
surfaces + periodontal chart (20) · Universal/Palmer numbering (3) · Google/Outlook calendar sync
(6) · Instagram DM (5) · internal chat (8) · call logging (5) · Redis caching (4) · `@swc/jest` (1) ·
ESLint flat config (2) · inventory (12) · DICOM viewer (15).

---

## Deliberately last

**The automation engine — 40 days.** The brief's flagship, and it should be built *after* the
modules it automates, not before. Every trigger worth writing ("treatment approved → generate
invoice → request deposit → book hotel → assign driver") names something that does not exist yet.
Building the engine first means building it twice.

---

## Sequence

```
NOW  ── N-1 restore drill ─┬─ N-2 ENCRYPTION_KEY ── N-3 SMTP ── N-4 password
                           │
CRIT ── C-1 Meta ──────────┴─ C-2 scheduler ── C-3 reminders
        C-4 uploads          C-5 virtualization        (parallel, independent)

HIGH ── H-1 search  H-2 reporting  H-3 a11y  H-4 mobile  H-9 fields
        H-5 soft deletes ← do before M-3 consent

MED  ── M-1 tourism (needs H-9) ── M-3 consent (needs H-5 + your wording)
        M-2 payments   M-4 notifications (needs C-3)

LAST ── automation engine
```

**Critical + High ≈ 11 weeks.** That gets you a system with no known security holes, working paid-lead
capture, appointment reminders, real reporting, and a UI usable on a phone and by keyboard.

**Through Medium ≈ 23 weeks**, and the medical-tourism module — the thing the product is named for
and currently its weakest dimension — is inside that.

---

## Decisions still open

1. **Multi-pipeline** — one sales process or several? Saves 8 days if one.
2. **Contacts & Companies** — do agencies or partner clinics refer patients to you?
3. **SMS provider** — blocks the third reminder channel.
4. **Consent wording** — from you or your lawyer; I will not draft medico-legal text.
5. **File access policy** — should a coordinator assigned to patient A be able to open patient B's
   radiographs? Currently yes.
6. **The 166 duplicate groups** — merging decides whose deal and whose commission it is.
