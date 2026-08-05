# Feature Gap Analysis

**Date:** 2026-08-04 · Combines the Bitrix24, dental-software and medical-tourism comparisons the
brief asked for. Every "present" claim was verified in source; every "absent" claim names the
search that found nothing.

---

## 1 · CRM vs Bitrix24

| Module | Bitrix | Here | Score | Gap |
|---|:---:|:---:|:---:|---|
| Leads | ✔ | ✔ | **8** | No scoring, no `nextFollowUpAt` |
| Contacts | ✔ | ✖ | **—** | Deliberate: this clinic sells to individuals who fly in |
| Companies | ✔ | ✖ | **—** | Deliberate, pending your answer on B2B referrers |
| Deals | ✔ | ✔ | **7** | Faithful board; no WIP limits, no bulk actions |
| Multiple pipelines | ✔ | ✖ | **0** | Stages are a hardcoded array in `packages/shared` |
| Activities | ✔ | ✔ | **7** | `LeadActivity` real; no activity *types* |
| Tasks | ✔ | ✔ | **6** | `LeadTask` exists; no subtasks, no dependencies |
| Calendar | ✔ | ✔ | **6** | Good calendar; no resources, no recurrence, **no reminders** |
| Timeline | ✔ | ~ | **5** | Per-lead activity feed; no unified patient timeline |
| Automation | ✔ | ✖ | **0** | No scheduler, no rules table, nothing |
| Reporting | ✔ | ~ | **4** | Five endpoints where fifteen families are needed |
| Permissions | ✔ | ✔ | **8** | 137 routes guarded; roles are compile-time, not editable |
| Communication | ✔ | ~ | **6** | WhatsApp strong; email/SMS/Instagram absent or stubbed |
| Lead scoring | ✔ | ✖ | **0** | No `score` column |
| Sales funnel | ✔ | ✔ | **7** | Funnel chart present; no forecast |
| Import | ✔ | ✔ | **8** | Hand-written CSV scanner with delimiter detection — genuinely good |
| Export | ✔ | ✖ | **0** | Nothing exports. No CSV, no PDF report, no backup download |
| Duplicate detection | ✔ | ✔ | **7** | Real and working — but only guards `create()`, see below |
| Custom fields | ✔ | ✖ | **0** | Absent |
| Saved views | ✔ | ✖ | **0** | Absent |
| Global search | ✔ | ✖ | **0** | Absent — the biggest daily friction |

**CRM average: 4.6/10** against Bitrix's generality. But see the scorecard: on *this clinic's actual
workflow* the product already fits better than Bitrix does.

**Duplicate detection caveat worth stating plainly:** it works, and 41% of your leads are in a
duplicate group anyway, because the Bitrix migration wrote around it.

---

## 2 · Dental vs modern practice software

| Feature | Here | Score | Note |
|---|:---:|:---:|---|
| Odontogram | ✔ | **8** | Anatomical SVG, shared between screen and PDF so they cannot disagree |
| FDI numbering | ✔ | 10 | |
| Universal / Palmer | ✖ | **0** | FDI only |
| Tooth surfaces | ✖ | **0** | Tooth-level only — changes the unit of diagnosis, a phase of its own |
| Periodontal chart | ✖ | **0** | Absent |
| Diagnoses | ✔ | 7 | Per-tooth conditions |
| Treatment planner | ✔ | **8** | Phases, materials, healing periods, alternatives |
| Clinical notes | ✔ | 6 | Free text; no templates, no structured exam |
| Radiographs / CBCT | ~ | **4** | `XRAY` and `CT_SCAN` categories and storage exist; no viewer, no DICOM |
| Intraoral photos | ~ | 5 | Stored; no before/after comparison view |
| Laboratory | ✔ | 7 | `LabOrder` with status, shade, material, due dates |
| Warranty | ✔ | **9** | Terms snapshotted at issue so a template edit cannot rewrite a promise |
| Shade selection | ✔ | 6 | Field on lab orders; no shade guide UI |
| Approval workflow | ✔ | **8** | Patient portal, hashed links, approve/reject/comment |
| Digital signature | ✖ | **0** | Absent — medico-legal requirement for surgery |
| PDF dossier | ✔ | **8** | 9 pages, cover photo, itinerary, payment terms |
| Treatment progress | ✔ | 7 | Timeline steps |
| Consent forms | ✖ | **0** | Absent — you chose KVKK + GDPR; needs your wording |

**Dental average: 5.4/10.** The core — odontogram, planner, warranty, portal approval, dossier — is
genuinely strong and better than most CRMs will ever be. The gaps are depth (surfaces, perio) and
medico-legal (consent, signature).

---

## 3 · Medical tourism — the real gap

The product is named for this. It scores lowest.

| Feature | Here | Note |
|---|:---:|---|
| Stay dates | ✔ | `TreatmentPlanStay` |
| Day-by-day itinerary | ✔ | `TreatmentPlanScheduleItem`, prints on the dossier |
| Itinerary → calendar | ✔ | Linked this phase |
| **Flights** | ✖ | No model, no field |
| **Hotels** | ✖ | No model |
| **Airport pickup / transfers** | ✖ | No model |
| **Drivers** | ✖ | No model, no role |
| **Translators** | ✖ | No model, no role |
| **Visa documents** | ✖ | No model |
| **Companions** | ✖ | No model |
| **Patient journey board** | ✖ | The lead → recovery → review arc has no view |
| **Travel timeline** | ✖ | Absent |
| Coordinator assignment | ✖ | No `assignedCoordinatorId` on `Patient` |

**Medical tourism: 2/10.** Nine tables and roughly 30 engineer-days from a competent module. This is
where the product should be strongest and where it is weakest — and no competitor named in the brief
does it either, so it is also the largest available advantage.

---

## 4 · Finance

| Feature | Here | Note |
|---|:---:|---|
| Invoices | ✔ | Numbering, line items, statuses |
| Payments | ✔ | Manual recording only |
| Deposits | ✔ | On treatment plans |
| Quotes | ~ | The treatment plan *is* the quote; no distinct object |
| **Installments** | ✖ | Two tables, zero code |
| **Refunds** | ✖ | Absent |
| **Expenses** | ✖ | Absent |
| **Payment gateway** | ✖ | No Stripe/Wise — the ledger records what staff say happened |
| **Doctor commission** | ✖ | Absent |
| Sales commission | ~ | `Patient.salesCommission` stored; never reported on |
| Outstanding payments | ✔ | On the finance page |
| Taxes | ✖ | Absent |

**Finance: 5/10.**

---

## 5 · Communication

| Channel | Here | Note |
|---|:---:|---|
| WhatsApp | ✔ | Three transports — Cloud API, Evolution, Baileys QR. Genuinely strong |
| Unified inbox | ✔ | Real |
| Email | ~ | Transport added this phase; **not wired to the inbox** |
| SMS | ✖ | Blocked on your provider choice |
| Messenger | ~ | Webhook exists; tab has no implementation |
| Instagram | ✖ | Tab only |
| Internal chat | ✖ | Absent |
| Call log | ✖ | Table exists, never written |
| Voice notes | ✖ | Absent |
| Timeline integration | ~ | Messages attach to conversations, not to a patient timeline |

**Communication: 6/10.**

---

## 6 · Automation & AI

**Automation: 1/10.** No `@nestjs/schedule`, no cron, no queue, no rules table, no execution log.
Every trigger in the brief is blocked on this one dependency.

**AI: 7/10.** Four real, well-scoped features against xAI Grok: assistant, plan summary, item
suggestions, WhatsApp draft replies. Missing: patient summary, revenue analysis, translation, risk
prediction, predictive analytics. The existing ones degrade gracefully when unconfigured, which is
the right shape.

---

## Ranked by value per engineer-day

| # | Gap | Days | Why first |
|---|---|---:|---|
| 1 | **Meta Lead Ads Graph fetch** | 3 | Every paid lead arrives as "Unknown". You are already paying for this traffic |
| 2 | **Appointment reminders** | 8 | Patients fly in. A missed appointment is a wasted flight |
| 3 | **Global search** | 7 | Largest daily friction at 1,005 leads |
| 4 | **Kanban virtualization** | 5 | The daily screen degrades as you grow |
| 5 | **Reporting suite** | 15 | All computable from stored data; indexes already exist |
| 6 | **Medical tourism module** | 30 | The product's name, and its lowest score |
| 7 | **Export** | 4 | Nothing leaves the system in any format |
| 8 | **Consent + signature** | 10 | Medico-legal; blocked on your wording |
| 9 | **Automation engine** | 40 | Composes everything else — deliberately last |
