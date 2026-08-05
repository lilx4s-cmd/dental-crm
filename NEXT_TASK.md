# Next Task

Supersedes `NEXT_PHASE.md`, which described Phase A while it was still open.

---

## Blocking me — I need answers before I can build these

Per the execution contract: I am not going to guess at any of these. Each changes what gets built.

### 1 · Multi-pipeline — does the clinic run more than one sales process?

Bitrix has multiple pipelines because it is a generic B2B tool. If this clinic has one route from
enquiry to treatment, saying so saves two weeks and a lot of permanent complexity.

**If yes:** what are the pipelines, and does a deal ever move between them?

### 2 · Contacts and Companies — add them, or keep Lead → Patient?

The brief lists both. This clinic sells treatment to individuals who fly in, so the objects would
mostly sit empty — and adding them means a data migration across 1,005 live leads. My
recommendation is to keep Lead → Patient, but it is your call.

**Do you have B2B referrers** — agencies, partner clinics, insurers — that send you patients? If
so, Companies earns its place and I will build it.

### 3 · SMS provider

Appointment reminders (Phase B) need one. Twilio is expensive for Turkey and Gulf traffic; a
regional provider is usually cheaper per message. **Which provider do you have or want an account
with?** I need the name before I write the adapter — they are not interchangeable.

### 4 · Phone numbers: what country should a local-format number be assumed to be?

`normalizePhoneForWhatsApp` maps any leading `0` to `+90`, so a Saudi lead entered as
`0555 123 4567` dials a wrong Turkish number. Three options, and I will not pick one for you:

- **(a)** Infer from `Lead.source` / campaign country.
- **(b)** Add a country field to the lead form, defaulting to Turkey.
- **(c)** Require full international format at entry and reject anything else.

**(b)** is my recommendation — explicit, and it makes the data useful for reporting later.

### 5 · Consent forms — which jurisdiction?

Turkish KVKK, GDPR for EU patients, or both? This determines retention periods, what the form must
say, and whether a patient can demand erasure of a clinical record.

**I also need the clinic's actual consent text.** I will not draft medico-legal wording; that has
to come from you or your lawyer.

### 6 · Arabic dossier — ~~waiting on you~~ **PAUSED at your request, 2026-08-04**

English only for now. The work already committed is **gated off**:
`ARABIC_DOSSIER_ENABLED = false` in `treatment-plan-document.ts`, so a plan marked `ar` renders as
English rather than as a half-turned document.

That gate matters. Without it the committed foundation is a trap — Arabic glyphs in a
left-to-right layout with English headings, which looks finished and is not. Nothing in the UI can
set a plan to Arabic today; the API accepts it, which is why the gate is in the renderer rather
than in a form.

To resume: mirror the nine pages using `directionStyles`, flip the flag in the *same* change, and
run `scripts/verify-arabic-pdf.ts` — its checks are deliberately failing until then. ~3 days, plus
your review of the clinical copy before any of it reaches a patient.

<details><summary>Original note</summary>

`H:\dental-crm\arabic-spike.pdf`. I need you to open it and confirm the letters join correctly and
the layout reads right-to-left properly. I have no renderer and cannot see it. The clinical
aftercare copy stays behind human review regardless of what the spike shows — a mistranslation in
surgical instructions is a safety issue, not a typo.

---

## Not blocked — Phase B, ready to start

I can begin these the moment C-4 is signed off. Only item 3 needs an answer above (the SMS
provider), and it can be built email-and-WhatsApp-first without one.

### B1 · A scheduler · ~0.5 week

`@nestjs/schedule` is not a dependency. There is no cron, no queue, no background worker. Every
automation in the brief is blocked on this, so it comes first.

**Also budget here:** `AuditInterceptor` only sees HTTP requests. The first scheduled job that
writes to a patient record will be invisible to the audit trail. That gap should be closed in the
same phase that creates it, not after.

### B2 · Appointment reminders · ~1.5 weeks

`Notification` is a dead table — zero Prisma calls anywhere. `Appointment.reminderSentAt` has never
been written. Medical-tourism patients fly in for these appointments; a missed one is a wasted
flight and often a lost case. Delivery over WhatsApp (already built, three transports) and email
(C-1), with SMS once you answer question 3.

### B3 · Meta Lead Ads · ~0.5 week

The webhook receives `leadgen_id` and never calls the Graph API to fetch it, so **every paid lead
currently arrives as "Unknown"**. Small fix, immediate revenue impact — you are paying for traffic
that lands unusable.

### B4 · Reporting suite · ~3 weeks

Doctor and coordinator performance, lead-source attribution, treatment profitability, marketing
ROI, no-show analysis. All computable from data already stored, and cheap now the indexes exist.

### B5 · Notification centre · ~2 weeks

A bell and an unread count, so B2 has somewhere to land in-app rather than only in someone's inbox.

---

## Recommended order

1. **You:** answer questions 1–5, run the C-4 restore drill, set `ENCRYPTION_KEY` and SMTP.
2. **Me:** B1 → B3 (half a week, immediate revenue) → B2 → B4 → B5.

B3 before B2 because it is smaller and the money is already being spent.
