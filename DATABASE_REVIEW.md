# Database Review

**Date:** 2026-08-04 · PostgreSQL on Supabase · 41 models · 32 enums · 58 indexes · 85 relations ·
24 `onDelete` rules · 26 migrations.

Live: 1,005 leads · 10 patients · 7 treatment plans · 8 users.

---

## Sound

- **Money is `Decimal(12,2)`** everywhere, never float. Correct, and rarer than it should be.
- **Enums, not strings**, for all 32 categorical fields.
- **`caseNumber` comes from a Postgres sequence**, so two concurrent admissions cannot collide.
- **`mergedIntoId` is excluded from every reporting path** — a regression that was found and fixed.
- **Migrations are hand-authored and idempotent**, verified against production row counts after each
  apply. No `prisma db push` against live data anywhere.
- **Cascade rules considered** — 24 explicit `onDelete`, not left to default.

---

## Findings

### D-1 · Five tables that no code queries · **High**

Verified by searching every `prisma.<model>` and `tx.<model>` call in `apps/api/src`:

| Model | Calls | Consequence |
|---|---|---|
| `Notification` | **none** | No notification is ever created or delivered. Blocks appointment reminders. |
| `InstallmentPlan` | **none** | `PaymentMethod.INSTALLMENT` is an option the system cannot honour. |
| `InstallmentSchedule` | **none** | Same. |
| `Resource` | **none** | Chairs and rooms cannot be booked. |
| `CallLog` | `updateMany` only | Written by the merge routine; never created, never read. Call history is silently lost. |

Plus two dead columns: `Appointment.reminderSentAt` and `Appointment.googleCalendarEventId`.

This is schema that lies about what the system does. Each is scheduled — `Notification` in Phase B,
`Resource` in Phase C, the installment pair in Phase E — but until then a reader of the schema will
believe features exist that do not.

### D-2 · Nine models carry no index of any kind · **Medium**

`WarrantyTemplate`, `InstallmentSchedule`, `InstallmentPlan`, `CallLog`, `TreatmentPlanStay`,
`Resource`, `Tag`, `ClinicSettings`, `TreatmentCategory`.

Most are small lookup tables or dead (D-1), where this is fine. `TreatmentPlanStay` is the one worth
attention — it is read on every treatment-plan load and every dossier render.

### D-3 · No soft deletes anywhere · **High**

A deleted patient is gone. Medical records generally may not be hard-deleted, and under both KVKK
and GDPR — the jurisdictions you selected — retention obligations conflict directly with a `DELETE`.

**Needs:** `deletedAt` on `Patient`, `TreatmentPlan`, `Invoice`, `Lead`, plus a global filter.
~4 days, and it should happen before the consent module, not after.

### D-4 · 41% of leads are in a duplicate group · **High** · *data, not schema*

166 groups covering 416 of 1,005 leads; 156 groups contain more than one **active** deal. One phone
number carries six deals, two of them already `WON`.

Most are byte-identical stored strings, which means the duplicate check never saw them — it guards
`create()` only, and these arrived through the Bitrix migration, which writes directly.

**The detection tool already exists and finds them.** Nobody has run it. Merging is a commercial
judgement (whose deal, whose commission), so it is yours, not mine.

### D-5 · No `clinicId` anywhere · *decision, recorded*

Single-tenant, deliberately and correctly for one clinic. Recorded because multi-tenancy later is a
migration across all 41 tables, and nobody should discover that by surprise.

### D-6 · `Campaign.name` uniqueness is a race · **Low**

`findFirst` then `create`. Two concurrent requests both see nothing and both insert. Zero campaigns
exist, so nothing has hit it. Fix is `@unique` plus handling `P2002` so the user still gets a
sentence rather than a 500.

### D-7 · Missing fields the brief requires · **High**

**`Patient`:** `preferredLanguage`, `emergencyContactName/Phone/Relation`, `passportNumber`,
`passportExpiry`, `assignedCoordinatorId`, `assignedDentistId`.
**`Lead`:** `score`, `nextFollowUpAt`. (`country` was added this week.)

### D-8 · Tables the medical-tourism module needs, none of which exist

`Hotel`, `HotelBooking`, `Driver`, `Transfer`, `Translator`, `TravelDocument`, `Companion`,
`FlightBooking`, `VisaApplication`.

This is why the tourism score is 2/10 — there is no data model to hang it on.

---

## Naming and normalisation

Consistent and good: `camelCase` fields, `snake_case` table mappings via `@@map`, `Id` suffixes on
foreign keys, `At` suffixes on timestamps. No denormalisation found except deliberate snapshots —
warranty terms are copied at issue time so a later template edit cannot rewrite what a patient was
promised, which is correct.

One inconsistency: `Patient.country` and `Lead.country` are ISO alpha-2, but
`IntakeSubmission.countryOfResidence` is free text. They should agree.

---

## Priority

| | Fix | Days |
|---|---|---:|
| 1 | D-4 merge the duplicates | *yours* |
| 2 | D-3 soft deletes on medical records | 4 |
| 3 | D-7 the missing patient/lead fields | 3 |
| 4 | D-1 implement or drop the five dead tables | with their phases |
| 5 | D-8 the tourism data model | 8 (part of the 30-day module) |
| 6 | D-2 index `TreatmentPlanStay` | 0.5 |
| 7 | D-6 campaign name constraint | 0.5 |
