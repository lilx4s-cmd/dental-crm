# CRM access and workflow fixes

Base revision: `e6ca3f7731aacde0485a121e11803f59f30f90ff`.

## Changes

- Apply the existing Documents patient-case policy to legacy treatment plans, related lab orders, warranties, AI context, item completion and plan attachments. Reject missing required patient filters and mismatched patient/plan references.
- Honour custom profile permission denials on root-prefix controllers while retaining their original role boundaries.
- Recompute line totals on the server. Use the same effective price catalogue for legacy and visual proposals; require `quotes.approve_discount` for pricing and payment-term exceptions. Non-catalogue prices and discounts also need an exception reason, now supported in the legacy editor.
- Allow itinerary `PUT` requests in the API CORS policy.
- Validate appointment update intervals using the combined existing and submitted times.
- Bind access tokens to an active refresh-session row. Revoking a session or logging out now invalidates its access tokens on the next authenticated request. Existing access tokens without a session ID must refresh; existing refresh cookies can upgrade them. No database migration is required.

## Verification

- API: 84 suites, 988 tests passed (including 53 new regression tests).
- Web: 34 suites, 198 tests passed. The legacy editor test includes exception-reason submission.
- API and web production builds passed. Web TypeScript check passed.
- API lint: no errors, 32 warnings. Web lint: no errors, existing lint/configuration warnings.
- Isolated HTTP tests use the real Nest controllers, JWT strategy, guards and validation with mocked persistence. They verify authentication, current profile permissions, patient scoping, rejected price tampering, valid plan creation, and itinerary PUT preflight/save/response.
- The separate legacy `test:e2e` command is blocked by pre-existing namespace imports of `supertest` and `cookie-parser` in `apps/api/test/auth.e2e-spec.ts` and `app.e2e-spec.ts`. It is not a passing verification result.

## Release checks still required

This branch does not change production data and has not been deployed. After an approved release, verify both web and API revisions, then test owner, restricted sales, clinical and read-only profiles in signed-in browser sessions. Confirm a valid price approval, itinerary save, appointment reschedule, and immediate session revocation. Existing staff may need to refresh or sign in again after the API release.

The checks above are a targeted regression review, not a comprehensive security certification.
