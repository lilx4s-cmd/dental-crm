# Technical Debt

Things knowingly left undone, with the reason. Anything here was a decision, not an oversight — if
it was an oversight it belongs in `BUG_REPORT.md`.

---

## From Phase A

### The audit trail records intent, not a diff

`AuditInterceptor` writes `newValues` as *what was asked for* — the request body — rather than a
genuine before/after. Capturing the previous state would mean a read before every write on every
audited route, which is real cost on the hot path.

**Revisit when:** someone needs to answer "what did this field say last Tuesday" rather than "who
changed this and when". The honest fix at that point is Prisma middleware capturing the row, paired
with the interceptor for the actor — neither half is sufficient alone.

### The audit trail only sees HTTP

The interceptor has no visibility into a change made outside a request. There is no such path today
— no cron, no queue, no scripts in the repo — but Phase B introduces a scheduler, and the first
scheduled job that writes to a patient record will be invisible to the trail.

**Revisit when:** Phase B lands `@nestjs/schedule`. Budget for it there, not after.

### The password blocklist is a speed bump, not a corpus check

`packages/shared/src/access/password-policy.ts` blocks about twenty obvious choices plus this
clinic's own words. It will not catch the millionth-most-common password.

**The right answer** is a k-anonymity range query against Have I Been Pwned: send the first five
characters of the SHA-1, compare suffixes locally, never transmit the password. Roughly a day
including the offline path — which must fail *open*, since an unreachable third party must not stop
an admin resetting a password during an incident.

### Campaign name uniqueness is a race, not a constraint

`campaigns.service.ts` prevents duplicate names with `findFirst` then `create`. Two concurrent
requests both see nothing and both insert. There are 0 campaigns today, so nothing has hit it.

**The fix** is `@unique` on `Campaign.name` plus handling Prisma's `P2002` in the service, so the
user still gets "a campaign with that name exists" rather than a 500. Left out of P-3 because
adding a constraint is a behaviour change and P-3 was scoped to indexes.

### ESLint 9 is installed but unusable

`apps/api` resolves ESLint **9** from `@whiskeysockets/eslint-config`, a transitive dependency of
Baileys. v9 requires flat config; this repo uses `.eslintrc.json`. An npm `override` does not
dislodge it — the offending package is a git dependency and npm keeps re-resolving it — so
`apps/api`'s lint script names the hoisted v8 binary outright:

```
"lint": "node ../../node_modules/eslint/bin/eslint.js src test --ext .ts"
```

Unusual, and it works on both Windows and Linux. **Revisit when** migrating to `eslint.config.js`,
which removes the need for the workaround entirely and is required before ESLint 8 reaches
end-of-life.

### `next lint` is deprecated

`apps/web` still uses `next lint`, which Next.js 16 removes. Migration is
`npx @next/codemod@canary next-lint-to-eslint-cli .`. Bundle it with the flat-config migration
above — they touch the same files.

### Four `no-explicit-any` warnings left in place

`facebook.service.ts:62`, `invoices.controller.ts:41`, `whatsapp.service.ts:84`, and one more. All
sit at boundaries with untyped third-party payloads — Meta's webhook shape, Baileys' message
objects. Typing them properly means writing schemas for someone else's undocumented JSON: worth
doing, not worth blocking Phase A on.

---

## Architectural, pre-existing

### No repository layer

Services call `this.prisma.*` directly. Defensible at 32k LOC — Prisma is already a data-access
abstraction — but query logic is duplicated across services and cannot be unit-tested without
mocking Prisma's full shape.

**Recommendation:** adopt the pattern for *new* modules only. Retrofitting 131 routes would be
weeks of churn with no behaviour change, which is the worst kind of refactor.

### Five models no code queries

`Notification`, `InstallmentPlan`, `InstallmentSchedule`, `Resource`, and `CallLog` — the last has
a single `updateMany` from the merge routine and is never created or read. Plus two dead columns,
`Appointment.reminderSentAt` and `Appointment.googleCalendarEventId`.

Each is scheduled — `Notification` in Phase B, `Resource` in Phase C, the installment pair in
Phase E — but until then they are schema that lies about what the system does.

### No soft deletes

A deleted patient is gone. Medical records generally may not be hard-deleted. Needs `deletedAt` on
`Patient`, `TreatmentPlan`, `Invoice` and `Lead`, plus a global filter. Scheduled for Phase D;
listed here because every day it waits is more rows that cannot be recovered.

### Single-tenant with no `clinicId`

A deliberate decision, and the right one for one clinic. Recorded because multi-tenancy later is a
migration across every table, and nobody should discover that by surprise.

### The committed `packages/shared/dist`

Both apps consume it, and `apps/api`'s tsconfig has no path alias back to source, so a stale `dist`
means the API typechecks against yesterday's types. Every change to `packages/shared` requires
`npx tsc` there first. CI rebuilds it; a developer who forgets gets a confusing error.

**The fix** is a TypeScript project reference or a path alias in `apps/api/tsconfig.json`, matching
what `apps/web` already does.

### Phone numbers assume Turkey

`normalizePhoneForWhatsApp` maps any leading `0` to `+90`, so a Saudi lead entered as
`0555 123 4567` dials a wrong Turkish number. The `00` international prefix was fixed; the country
guess was not, because fixing it properly needs a decision — infer from `Lead.source`, add a
country column, or require E.164 at entry. **Open question 4 in `PROJECT_MASTER_PLAN.md`.**

### The API test suite takes ~25 minutes

Dominated by `ts-jest` compiling each suite. `@swc/jest` as the transform would cut it
substantially. It matters more now that CI runs it on every push and every pull request.
