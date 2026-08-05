# Why `jest.testTimeout` is 30s, not the 5s default

`bcrypt` at 10 rounds costs roughly 80ms per hash *by design* — that slowness is the security
property. The auth and two-factor suites do dozens of hashes and comparisons each: enrolment
hashes eight recovery codes, and every login test hashes a password in `beforeAll`.

Jest's 5-second default assumes no test is deliberately slow. That assumption held until the suite
was run on a loaded machine, where `auth.service.spec.ts` and `two-factor.service.spec.ts` failed
28 tests with `Exceeded timeout of 5000 ms` — while passing in isolation. CI on shared GitHub
runners is exactly "a loaded machine", so this would have been an intermittently red pipeline that
trains people to re-run rather than read.

The alternative — making the round count configurable so tests could use fewer — was rejected. A
knob that lowers bcrypt rounds is one that can eventually lower them in production.

The real fix is `@swc/jest` instead of `ts-jest`, which would cut the whole suite from ~25 minutes
to a few. Recorded in `TECHNICAL_DEBT.md`.
