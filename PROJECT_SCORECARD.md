# Project Scorecard

**Date:** 2026-08-04 · **Commit:** `7dd97e6`

Scores are against *what a clinic of this size needs to run on this software*, not against a
feature checklist. A 10 means "I would not change this"; a 5 means "works, but a competitor would
win on it"; below 4 means "this will cause a real problem".

---

| Dimension | Score | Basis |
|---|:---:|---|
| **Architecture** | 8 | Clean monorepo; pure shared layer both apps and the PDF renderer read from, so pricing and tooth geometry cannot disagree. No repository layer, and services call Prisma directly. |
| **UI** | 6 | Coherent shadcn/Radix system, real dark mode, faithful Bitrix board. Nothing bespoke; four pages carry over 400 LOC of layout. |
| **UX** | 5 | Strong on the two daily paths (board, patient record). No global search, no saved views, no bulk actions, 12 of 19 pages have no mobile layout. |
| **CRM** | 6 | Pipeline, duplicates, import, filters, transfer, activity — all real. No scoring, no multi-pipeline, no custom fields, no saved views. |
| **Dental** | 7 | Anatomical odontogram shared between screen and PDF; phases, warranties, portal approval. Tooth-level only — no surfaces, no perio chart, FDI only. |
| **Medical tourism** | **2** | The thing the product is named for. Stay and day-by-day itinerary exist. Hotels, drivers, translators, transfers, visas, companions: none. |
| **Security** | 8 | Six criticals closed this week. Open: file-upload validation, per-record file scoping, share-link expiry. See `SECURITY_REPORT.md`. |
| **Performance** | 6 | Charts split (−121 kB on reports). 1,005 unvirtualized kanban cards and 26 unbounded queries remain. |
| **Accessibility** | **3** | ~80 of 128 labels unbound; drag-and-drop has no keyboard path; the odontogram is an interactive SVG with no accessible representation. |
| **Scalability** | 6 | Fine to ~5,000 leads. Single tenant by decision. No caching layer, no queue, no scheduler. |
| **Maintainability** | 8 | Comments explain *why*; 381 tests; migrations hand-authored and verified against production. |
| **Code quality** | 8 | Strong typing, discriminated unions where they prevent real bugs, duplication actively removed. |
| **Testing** | 7 | 316 API + 65 web. Zero E2E — nothing exercises login → lead → plan → invoice as a user. |
| **Documentation** | 8 | Nine planning and audit documents, all measured rather than asserted. |
| **Data integrity** | 5 | **41% of leads sit in a duplicate group.** 5 dead tables. No soft deletes on medical records. |

## **Overall: 6.1 / 10**

A secure, well-tested clinical CRM with a genuinely good treatment planner — and almost none of the
medical-tourism operations it is named for.

---

## What moves the number most

| Do this | Score effect | Days |
|---|---|---|
| Appointment reminders (`Notification` is a dead table) | UX 5→6, tourism 2→3 | 8 |
| Medical tourism module (hotels, drivers, translators, transfers) | tourism 2→7, overall +0.6 | 30 |
| Kanban virtualization | performance 6→8 | 5 |
| Label association + keyboard kanban + odontogram alternative | a11y 3→7 | 8 |
| Reporting suite | CRM 6→8 | 15 |
| Merge the 166 duplicate groups | integrity 5→8 | *yours* |
| Mobile layouts for the 12 pages without any | UX 5→7 | 10 |

---

## Honest comparison

Against the products in the brief, on the work a Turkish medical-tourism dental clinic actually does:

| | Bitrix24 | HubSpot | Salesforce Health Cloud | **This** |
|---|:---:|:---:|:---:|:---:|
| Generic CRM depth | 9 | 9 | 8 | 6 |
| Dental clinical | 0 | 0 | 3 | **7** |
| Medical tourism ops | 0 | 0 | 1 | **2** |
| Fits *this* clinic's actual workflow | 4 | 3 | 3 | **8** |
| Cost | £ | ££££ | £££££ | — |

The product already beats all three on the axis that matters — a Bitrix board staff recognise,
attached to an odontogram and a treatment dossier none of them have. **Medical tourism is the gap
where it should be strongest**, and it is the lowest-scoring dimension on the card.

That is the finding I would act on.
