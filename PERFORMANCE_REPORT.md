# Performance Report

**Date:** 2026-08-04 · Bundle figures from `npm run build:web`. Query patterns from source. Runtime
metrics are **not** measured — see Blocked.

---

## Bundle, measured

| Route | First load | Note |
|---|---:|---|
| `/appointments` | **270 kB** | Heaviest. `react-big-calendar` + locale data. |
| `/pipeline` | **263 kB** | `@dnd-kit` + 1,005 unvirtualized cards. |
| `/patients/[id]` | 260 kB | Odontogram + six tabs. |
| `/my-day` | 231 kB | Pulls the full lead-detail sheet. |
| `/settings` | 225 kB | Seven cards including QR generation. |
| `/campaigns` | 220 kB | 5 kB of page on 215 kB of shared — suspicious. |
| `/portal/[token]` | 219 kB | **Patient-facing, often on mobile data abroad.** |
| `/finance` | 214 kB | |
| `/team` | 212 kB | |
| `/patients` | 197 kB | |
| `/inbox` | 179 kB | |
| `/login` | 166 kB | |
| `/reports` | **159 kB** | Was 293 before chart splitting. |
| `/dashboard` | **155 kB** | Was 275. |
| **shared baseline** | **103 kB** | Every route pays this. |

Chart code-splitting removed **121 kB** from `/reports` and **106 kB** from `/dashboard` — the two
routes that were worst, now the two that are best.

---

## Findings

### P-1 · The kanban renders every lead · **Critical**

1,005 cards, no virtualization. This is the most-used screen in the product and the only one whose
performance gets *worse as the clinic succeeds*. At 5,000 leads it will be unusable.

**Fix:** `@tanstack/react-virtual` per column. ~5 days including drag-and-drop interaction with
virtualized rows, which is the fiddly part.

### P-2 · Twenty-six of twenty-nine `findMany` calls are unbounded · **High**

No `take` on: appointments, auth sessions, campaigns, conversations, files, invoices, lab orders,
tags, treatment plans, users, warranties, and 9 of 11 in `leads.service.ts`.

Harmless today. Not harmless for `LeadActivity`, `Message`, and `AuditLog` — the last now takes a
row on every clinical and financial mutation, so it is the fastest-growing table in the database
and nothing bounds a read of it.

**Fix:** default `take` with cursor pagination on the three append-only tables first. ~4 days.

### P-3 · `/campaigns` pays 215 kB for 5 kB of page · **Medium**

A 181-LOC page on a 220 kB first load. Something in the shared chunk is being pulled in that this
route does not need. Worth one `@next/bundle-analyzer` pass across all routes — the same
investigation that found the recharts win.

**Fix:** ~1 day to measure, unknown to fix. Likely another double-digit kB saving.

### P-4 · The patient portal is 219 kB · **High**

The one page **patients** load, frequently on mobile data, frequently roaming from the Gulf. It
should be the lightest route in the app and it is seventh-heaviest.

**Fix:** it shares the dashboard's chunk graph despite needing almost none of it. Isolate it. ~3 days.

### P-5 · No caching layer · **Medium**

Every dashboard load recomputes aggregates from base tables. Fine at current volume; the fix
(Redis, or Postgres materialised views for the report queries) is Phase B work, not now.

### P-6 · No N+1 loops found · *resolved*

`reports.service.ts` was fixed in an earlier phase. A fresh scan of all 22 services found one
remaining `await`-in-loop, in `two-factor.service.ts:207`, which iterates at most 8 hashed recovery
codes and is correct — bcrypt comparison cannot be batched.

### P-7 · The API test suite takes 25 minutes · **Medium** · developer-facing

`ts-jest` compiling each suite. `@swc/jest` would cut it substantially. It matters more now CI runs
it on every push and every pull request.

**Fix:** ~1 day.

---

## Priority

| | Fix | Days | Impact |
|---|---|---:|---|
| 1 | P-1 kanban virtualization | 5 | The daily screen stops degrading |
| 2 | P-4 isolate the patient portal bundle | 3 | The page patients actually load |
| 3 | P-2 bound the append-only reads | 4 | Prevents a cliff, invisible today |
| 4 | P-7 swap jest transform | 1 | 25 min → a few minutes on every CI run |
| 5 | P-3 bundle-analyzer pass | 1 | Measurement; fix unknown |

---

## BLOCKED

**No runtime measurement has been done.** Everything above is static analysis and build output. I
have no browser, so there is no Lighthouse score, no LCP/INP/CLS, no real query timing under load,
and no evidence of how the 1,005-card board actually feels.

**Needed from you:** the deployed URL and permission to run Lighthouse against it, or a Playwright
session. Until then, treat P-1 and P-4 as well-founded predictions rather than measurements — the
DOM-node count and the kB figures are facts, but their effect on a real user is inferred.
