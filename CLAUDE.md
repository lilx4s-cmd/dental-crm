# Dental CRM

A production CRM for a medical-tourism dental clinic in Istanbul. Patients arrive mainly from
France, Bosnia and Algeria, book remotely, fly in for treatment, and are followed up afterwards.
Real patient data is in the database — there is no separate staging environment.

## Layout

npm workspaces monorepo. There is no Lerna/Turbo/pnpm layer; plain `npm`.

| Path              | What it is                                                                        |
| ----------------- | --------------------------------------------------------------------------------- |
| `apps/api`        | NestJS 10 + Prisma 5 over PostgreSQL (Supabase)                                   |
| `apps/web`        | Next.js 15 App Router, Tailwind, shadcn/ui, TanStack Query                        |
| `packages/shared` | Types, zod schemas and pure logic used by both                                    |
| `migration/`      | One-off Bitrix24 import scripts. **Gitignored — contains secrets. Never commit.** |

`packages/shared/dist` **is** committed, so Vercel and Render can resolve the workspace without
building it first. If you change `packages/shared`, rebuild it and commit the output.

## Commands

```bash
npm run dev:api      # NestJS watch mode
npm run dev:web      # Next dev on :3000
npm run test:api     # jest, ~1 minute for the full suite
npm run build:web
```

Do not run the API suite concurrently with a Next build — the two starve each other and jest
starts failing on timeouts, which reads as a broken test rather than a busy machine.

`apps/api`'s `lint` script uses single-quoted globs that do not expand on Windows, and there is no
flat `eslint.config.js` at the API root, so `npx eslint` fails there too. `npm run lint` in
`apps/web` works.

## Environment

Deployed as three separate services:

- **web** → Vercel
- **api** → Render, `https://dental-crm-qaz2.onrender.com`
- **database + file storage** → Supabase

Secrets live in the Render dashboard, never in the repo and never in chat.

Two rules that have already caused outages or near-misses:

1. **Supabase needs the legacy `service_role` JWT** (starts `eyJ`), not the newer `sb_secret_…`
   key — supabase-js rejects the latter with "Invalid Compact JWS". That key bypasses every
   row-level security rule, so it belongs in Render only: never in `apps/web`, never in anything
   `NEXT_PUBLIC_`.
2. **Optional integrations must not be strictly validated in `apps/api/src/config/env.validation.ts`.**
   `validateEnv` throws, and a throw there stops the whole application booting. A mistyped storage
   URL would take the clinic offline entirely, so nobody could open a patient record because a
   photo upload was misconfigured. Report the problem through a status endpoint instead — see
   `files.service.ts` `storageStatus()` for the pattern: presence, never values.

The storage bucket is **private**. Code issues short-lived signed URLs; a public bucket would
expose patient x-rays to anyone with the link.

## Caching and headers

**Nothing the API returns may be cached.** `CacheControlInterceptor` sets `no-store` on every
response. An absent `Cache-Control` does not mean "do not cache" — HTTP lets an intermediary apply
its own heuristics, so patient records were cacheable by any proxy on the path and by the browser's
disk cache, where they survive logout and the back button. Nothing the API returns is worth caching
anyway: it is either personal to one user or a few hundred bytes of configuration.

The caching that matters happens on Vercel's CDN and is already correct: `/_next/static` is
fingerprinted and served `immutable` for a year, and the dashboard pages are static shells that
fetch their data client-side, so no patient data ever reaches the edge.

`vercel.json` carries the web app's security headers, since Vercel sends no CSP of its own and JSON
takes no comments. Two things about that CSP:

- `script-src` allows `'unsafe-inline'` and `'unsafe-eval'`. Next's App Router inlines hydration
  scripts, so a strict policy needs per-request nonces from `middleware.ts` — worth doing, not yet
  done. What the policy buys today is origin restriction: no third-party script host can execute.
- `connect-src` names the Render API origin explicitly. **Changing the API's URL means changing
  this line**, or every request from the browser is blocked with nothing in the server logs to
  explain it.

## Database migrations

`prisma migrate dev` fails in this environment (it needs an interactive prompt). Migrations are
**hand-authored**:

1. Edit `apps/api/prisma/schema.prisma`.
2. Create `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql` yourself.
3. `npx prisma migrate deploy && npx prisma generate`.
4. Verify against live data — count the rows you touched, before and after.

Postgres cannot drop enum values in place. Changing one means building a new type and mapping every
dependent column across with an explicit `CASE`. The pipeline-stage rebuild
(`20260726090000_pipeline_stages_to_deal_flow`) is the worked example; it moved 1005 live records.

## Architecture: one shared module per cross-surface concern

Anything that more than one surface needs to agree on lives in `packages/shared`, as pure logic
with no rendering and no Prisma. The reason is concrete: a treatment plan is drawn on screen, drawn
again in a PDF by a different renderer, shown on the patient portal, and replayed in an animation.
Four copies of the geometry would drift, and the clinic would quote one price and print another.

- `dental/tooth-geometry.ts` — arch geometry as renderer-agnostic draw ops (DOM SVG and
  `@react-pdf/renderer` both consume it)
- `treatment-plan/pricing.ts` — every total in the product
- `treatment-plan/presets.ts`, `treatment-plan/aftercare.ts`
- `pipeline/stages.ts`, `pipeline/filters.ts`, `pipeline/next-action.ts`
- `finance/case-economics.ts`
- `schemas/intake.schema.ts` — one zod schema validating in the browser _and_ the API

Add to these rather than reimplementing beside them.

## Conventions worth knowing

**Money and numeric inputs are held as strings in editor components** and converted on submit.
`parseFloat(v) || 0` refills a cleared field with `0` and swallows the decimal point as it is
typed — this was a real, reported bug ("i can not type the amount", "puts 0 before the number").

**Use the semantic design tokens**, not raw Tailwind palette values: `success`, `warning`, `info`,
`destructive`, `destructive-muted`, `popover`, and the elevation scale, defined in
`apps/web/src/app/globals.css` and `tailwind.config.ts`. Contrast has been measured, not assumed —
white on the raw success green is 2.3:1 and fails WCAG AA. If you introduce a colour pairing,
measure it.

**Medical booleans are tri-state.** `null` means unanswered, which is clinically different from an
explicit "no". Recording an unanswered smoking question as "non-smoker" is the kind of wrong answer
that reaches the surgery.

**Public endpoints authenticate or refuse.** `@Public()` routes that accept writes — the intake
form, both WhatsApp webhooks — verify a signature or a shared token in constant time
(`timingSafeEqual`), and reject everything when nothing is configured. An unauthenticated webhook
is a way to write arbitrary content into a patient's history.

**Status endpoints report presence, never values.**

## Messaging

Three WhatsApp transports write to the same `Conversation`/`Message` tables, so switching one out
changes how messages arrive, not what the CRM holds. `WhatsAppSenderService` picks between them:
Evolution (the clinic's self-hosted gateway) → Cloud API → the in-process phone session, which
refuses to start when Evolution is configured because two clients on one number would ingest every
inbound message twice.

Phone numbers are normalised to bare digits everywhere (`905551112233`), matching the form inbound
messages arrive in. A thread the clinic starts and a reply the patient sends must land on the same
conversation.

## Working environment

Windows, PowerShell. The Bash tool's working directory resets between calls — wrap directory-scoped
commands in a subshell or use absolute paths, or the command silently runs somewhere else.

Third-party dashboards (Supabase, Render) change their navigation often; check current docs before
giving click-by-click instructions rather than answering from memory.
