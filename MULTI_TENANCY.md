# Multi-tenancy: where it stands, and what a full retrofit costs

This system runs one clinic. It is built so that a second one is a migration rather than a rewrite,
but the migration has not been done and this file says exactly what is left.

Read this before adding a table.

---

## The rule for new tables

**Every new table carries `organizationId` with a real foreign key to `organizations`.** Not a
nullable string, not a comment — a constraint the database enforces. A tenant key nothing
references is a tenant key that will be wrong the first time anyone forgets it.

Two exceptions, both narrow:

- **Pure join tables** whose tenancy is unambiguous from either side. `LeadTag` joins a lead to a
  tag; the tag already carries `organizationId`, and a second copy on the join could disagree with
  it. A column that can be wrong is worse than one that has to be looked up.
- **Rows that outlive what they point at.** `LeadTagHistory` carries `organizationId` *directly*,
  precisely because its `tagId` is nullable — the tag may be deleted, and a history row that cannot
  say which clinic it belongs to is a history row that cannot be shown to anyone.

When you add a table, decide which of these it is and write the reason in the schema. That comment
is the record of the decision; without it the next person guesses.

---

## What exists today

| | |
|---|---|
| `organizations` | One row: **Kerem Clinic**, `slug = 'kerem-clinic'`, id `00000000-0000-4000-8000-000000000001`. Seeded by `20260805160000_tags_and_organizations`. |
| Tenant-aware tables | `tags`, `lead_tag_history` — FK-enforced. `lead_tags` inherits through `tags`. |
| Tenant-**un**aware tables | The other 41, including `leads`, `patients`, `users`, `appointments`, `invoices`, `treatment_plans`. |

The single place the application assumes one organisation is
`TagsService.currentOrganizationId()` — it resolves the row by slug and caches it. Nothing else
hardcodes a clinic. Everything downstream takes the id as a parameter, so when users carry an
`organizationId` that one function is what changes.

**By slug, not by id.** A staging copy or a fresh developer database has its own uuid for the same
clinic; resolving by slug means the code works against any of them.

---

## Why the 41 were not retrofitted

A decision, taken deliberately, not an oversight.

Adding the column to all 41 is the cheap part — roughly a day of hand-authored SQL and a backfill
to the single existing organisation. The expensive part is that **every query then has to be
scoped**, and a query that forgets is not a bug that shows up in testing: with one tenant in the
database, an unscoped query returns exactly the right answer. It stays right until the day a second
clinic exists, and then it silently returns another clinic's patients.

That is not a risk worth carrying half-finished. Either every read path is scoped or none is, and
"none is" is honest while there is one tenant.

So: new tables are built tenant-ready, which means the retrofit shrinks as the system grows rather
than expanding. The 41 wait for a phase of their own.

---

## What the retrofit involves

Rough shape, in the order it has to happen. The estimates are working days.

### 1. Schema (~5d)

`organizationId TEXT NOT NULL REFERENCES organizations(id)` on all 41 tables, with the composite
indexes that follow from it. Most existing indexes need `organizationId` as their leading column —
`leads(status)` becomes `leads(organizationId, status)`, and so on for roughly 60 indexes. An index
that does not lead with the tenant key is an index the planner cannot use for a tenant-scoped query.

Backfill is a single `UPDATE ... SET organizationId = '00000000-...'` per table, since every
existing row belongs to the one clinic.

### 2. `users` first, and separately

`User.organizationId` is the one that matters, because it is what every other scope is derived
from. It also changes the JWT: `JwtPayload` gains `organizationId`, which means every issued token
becomes stale. Plan for a forced re-authentication, or a grace period where a token without the
claim resolves to the default organisation.

### 3. Query scoping (~7d)

22 services, 137 routes. Two viable approaches:

- **Prisma client extension** (`$extends` with a `query` hook) that injects `organizationId` into
  every `where` for tenant-scoped models. Catches everything by default, including code written
  later, which is its whole value. Needs an explicit escape hatch for genuinely cross-tenant reads
  — there are few, but the webhook handlers are among them, and they authenticate by signature
  rather than by user.
- **Per-service, by hand.** More visible, more auditable, and certain to be incomplete: 137 routes
  is more than a review catches.

Prefer the extension, with a test that fails when a model is added to the schema and not to the
scoped list. Otherwise the list rots.

### 4. The things that are not queries (~3d)

Easy to miss, and each one leaks across tenants if forgotten:

- **Uniqueness.** `User.email @unique` becomes `@@unique([organizationId, email])` — two clinics
  will have a `info@` address. Same for `Patient.caseNumber` and `Invoice.invoiceNumber`, whose
  generators derive from a count and would collide across tenants immediately.
- **File storage.** The Supabase bucket is flat. Paths need an organisation prefix, and the signed
  URL policy needs to enforce it — otherwise a guessed path crosses the boundary regardless of what
  the API does.
- **Webhooks.** WhatsApp and Meta lead-ad webhooks arrive with no user. Which clinic a message
  belongs to has to be derived from the phone number id or the page id, which means a mapping table
  and a rejection path for unrecognised senders.
- **Search.** `SearchService` queries leads and patients directly and would need the same scope.
- **The audit trail.** `AuditLog` should carry `organizationId` so a regulator's request can be
  answered per clinic rather than by filtering on the actor.

### 5. Verification (~2d)

The only test that matters: seed a second organisation, and assert that every list endpoint returns
nothing belonging to it. Anything less passes trivially while there is one tenant.

**Total: roughly 15 working days**, plus the re-authentication event.

---

## What is deliberately *not* per-organisation

- **`PipelineStage`.** The clinic's own sales process, hardcoded in
  `packages/shared/src/pipeline/stages.ts`. Per-clinic pipelines are a product decision, not a
  schema one, and would change the kanban, the reports and every stage-derived status rule.
- **`Role`.** Five roles, shared. Custom roles per clinic is a different feature.
- **`ClinicSettings`.** Currently a singleton. It becomes one row per organisation in step 1, which
  is the smallest of the 41 changes and the one most likely to be forgotten, because nothing reads
  it by id.

---

## If you are here because you are adding a table

1. Does it belong to one clinic? Almost certainly yes → `organizationId`, `NOT NULL`, FK to
   `organizations`, `ON DELETE CASCADE`.
2. Is it a pure join between two tables that already carry it? → no column, and say why in the
   schema.
3. Does it outlive the row it points at? → carry it directly, and say why.
4. Every index on it leads with `organizationId`.
5. Every uniqueness constraint includes `organizationId`.
