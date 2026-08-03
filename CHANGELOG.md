# Changelog

## Phase A — Harden (2026-08-03, in progress)

Security and correctness work, taken before any new feature, on the principle that the cheap
things that can hurt you should be fixed before the expensive things that would impress you.

### Security

**Sign-in is no longer the loosest door in the building** (C-6, S-1).
`/api/auth/login` sat under the global 300-requests-per-15-minutes limiter — the same budget as
browsing the app — on a system with no second factor. The public portal already had 30 and the
intake form 10; the front door had nothing of its own. Now two limits that cover each other's
blind spot: 10 per 15 minutes per IP (successes uncounted, so a clinic behind one NAT is never
rationed for signing in correctly), plus a per-account lockout escalating 15/30/60 minutes that a
distributed attack cannot avoid by spreading itself across addresses.

The lock expires by being in the past, so nothing has to run to clear it — this system still has
no scheduler. It is capped at an hour rather than being permanent, because an unbounded lock hands
an attacker a denial-of-service: anyone who knows a coordinator's email could keep them out
indefinitely by failing on purpose. Locking also revokes that account's refresh tokens, since a
token an attacker already holds would otherwise outlive the lock.

The lock is *explained* only to someone who supplied the correct password. A wrong guess against a
locked account gets the same "Invalid credentials" as any other, so the lockout never becomes a way
to discover which addresses are real.

**Closed a user-enumeration side channel** (C-6). An unknown email address skipped bcrypt entirely
and answered as fast as the database could, while a known one waited ~80ms. That difference is
measurable over the network, which made the login form an oracle for "does this person work at the
clinic" — the first thing an attacker wants before spending guesses. Both paths now compare
against a hash.

**A password policy where there was none** (S-5). User creation asked for eight characters and
sign-in for six, so `password` and `12345678` were both legal on accounts that can read every
patient's medical history. Now twelve characters, a blocklist including this clinic's own words,
and a check that the password is not the user's own name or email — following NIST SP 800-63B
rather than complexity classes, because mandatory symbols mostly produce `Password1!` and a
password nobody can remember ends up on a note by the reception desk.

One implementation, shared between the API validator and the settings dialog, so the form shows
the rules as you type instead of rejecting you one rule at a time.

Deliberately **not** enforced at sign-in: applying it there would have locked all eight existing
accounts out on the day it shipped. See "Action required" below.

**An audit trail, rather than a login journal** (C-2). `AuditLog` has carried `oldValues` and
`newValues` columns since the schema was written and was populated at exactly two places, both in
`AuthService`. Nothing recorded who changed a diagnosis, who moved a price, or who edited a
medication list. Under KVKK/GDPR that is likely a compliance failure and not merely a missing
feature.

Now a registry of audited routes — the clinical record, the money, and who can reach them —
written by an interceptor that also records refused requests, because an attempt to delete a
treatment plan that came back 403 is often more interesting than one that succeeded. Bodies are
redacted by key and depth-limited. A failing audit never fails the request: a clinic that cannot
save a treatment plan because its log table is unreachable is worse off than one with a gap in its
trail.

### Performance

**Report and dashboard charts are code-split** (P-2). `recharts` was in the first-load JS of both
routes whether or not a chart rendered.

| Route | Before | After | Saved |
|---|---|---|---|
| `/reports` | 293 kB | 172 kB | −121 kB |
| `/dashboard` | 275 kB | 169 kB | −106 kB |

**Indexed the foreign keys Postgres does not** (P-3). Postgres indexes a primary key and a unique
constraint for you but not the referencing side of a foreign key, and Prisma adds none either.
`TreatmentPlanItem.treatmentPlanId` — walked by every plan view, every dossier render, and the
warranty lookup that goes item → plan → patient — was a sequential scan, as were the campaign
columns and `PatientTag.tagId`.

Honest about scale: 6 plan items, 0 campaigns, 0 patient tags. This fixes nothing anyone is
currently feeling. It is insurance bought while the index build is instant.

**Removed a wasted bcrypt round from every token refresh.** `AuthService.refresh` computed a hash
and never read it — roughly 80ms per user per fifteen minutes, for nothing. Found by lint, on the
first day lint was able to run (see below).

### Tooling

**CI, where there was none** (S-9). Typecheck, lint and both test suites on every pull request and
every push to `main`, plus a weekly Dependabot group. `npm audit --audit-level=high` runs as a
separate advisory job that cannot block a merge — a high-severity advisory on a transitive
dependency with no published fix is not a reason to stop a clinic shipping a bug fix.

**Lint now actually runs.** Two problems, both invisible without CI:
- `packages/shared` and `apps/api` quoted their globs for a POSIX shell, so lint failed on Windows
  while passing on Linux — the developer's machine was red and CI would have been green.
- `apps/api` resolved ESLint **9** from a transitive dependency of `@whiskeysockets/baileys`, which
  requires flat config while this repo uses `.eslintrc.json`. API linting had been silently broken.

With it working, nine real errors surfaced — eight unused imports and the wasted bcrypt hash above.

### Tests

204 API tests (was 176) across 20 suites; 63 web tests across 6. All green.
New: account lockout (11), password policy (11), audit registry and redaction (15), plus six
covering the lockout paths through `AuthService`.

### Action required from you

**Reset all eight staff passwords.** The new policy governs setting a password, not verifying one,
so every current password predates it and may be one of the ones now banned. Settings → Team →
choose a person → *Set a new password*. The dialog shows the rules as you type and signs that
person out everywhere. Do this for your own account too.

### Not yet done in Phase A

C-1 (email transport → password reset), C-3 (2FA and self-service password change), S-7 (CSRF
double-submit token), C-4 (backup restore drill — needs your Supabase access). See `NEXT_PHASE.md`.

---

## Earlier work (2026-08-02 → 08-03)

- **One money formatter.** Thirteen call sites each solved it locally, so the same amount rendered
  as `$12,000`, `12 000 $` and `12000 USD` on different screens.
- **Query error states.** `isError` appeared on exactly one screen; everywhere else a failed request
  landed in the same branch as a successful empty one, so `/reports/kpi` returning 500 rendered
  `$0`. The worst case was Settings, whose form fields default to empty strings — a failed load
  rendered a blank form over the real clinic record, and Save wrote those blanks over the address,
  timezone and currency.
- **A web test suite,** where there were none. It immediately found two bugs: `formatDealValue`
  grouped with an ordinary space under a comment claiming otherwise, and
  `normalizePhoneForWhatsApp` read a leading `00` as a Turkish trunk zero, so a Gulf patient's
  `00966…` became `900966…`.
- **`PROJECT_MASTER_PLAN.md`** — gap analysis and roadmap, measured against the code rather than
  assumed.
