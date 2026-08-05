# Current Task

**S-7 · CSRF protection** — code complete, in final validation.

---

## What it is

The refresh cookie is `SameSite=none` in production, and that is not a setting that can be
tightened: the app is served from Vercel and the API from Render, which are separate registrable
domains, so a `Strict` cookie is simply never sent. Making it strict is what caused an earlier bug
where every user was signed out the moment their fifteen-minute access token expired.

So the cookie *is* sent on cross-site requests, and a page on another origin can cause a refresh.

**The surface is exactly one endpoint.** Every other authenticated route in the API uses
`Authorization: Bearer`, which a browser never attaches by itself — those are CSRF-immune by
construction. `POST /auth/refresh` is the only route authenticated by a cookie.

**The impact today is bounded, and that is not the same as defended.** CORS stops an attacker
reading the rotated token, so a forged request signs the victim out rather than taking their
account. A clinic signed out mid-appointment is still a real cost, and safety that depends on a
different control happening to be present is not a design.

## How it is done

Two independent checks in `CsrfGuard`, applied only to `/auth/refresh`:

1. **Origin/Referer against the CORS allowlist.** Browsers attach `Origin` to every cross-origin
   POST and a page cannot forge it. This needs no client state, so it protects every session
   immediately, including ones created before the guard existed. Only the origin part of a
   `Referer` is compared — a path is attacker-controlled and carries no authority.

2. **Double-submit token.** Classic double-submit has the client read the cookie and echo it in a
   header — impossible here, because the cookie belongs to the API's domain and the web app cannot
   read it. So the token is delivered in the sign-in **response body** instead, and the app keeps
   it in memory plus a same-site cookie on its own domain. CORS stops an attacker reading that
   response, so they cannot produce the header. Compared with `timingSafeEqual`.

The guard reads the **same config key and the same fallback** as `main.ts` hands to `enableCors`,
so it can never refuse an origin CORS has already accepted. That parity is deliberate and tested:
if the two could disagree, the disagreement would appear as every user being signed out every
fifteen minutes.

## Deliberate compromise

A session created before this shipped has no CSRF cookie. Refusing those outright would sign out
everyone logged in at deploy time. Instead they fall through to the origin check alone, which is
still a real control, and the branch removes itself: refresh tokens expire in seven days, after
which every live session has a token. **Delete that branch after 2026-08-11.** It is marked in
`csrf.guard.ts` and listed in `TECHNICAL_DEBT.md`.

## Verification

- 14 guard tests, including the attack case (another origin, valid cookies) and the parity case.
- 2 client tests: the header is sent, and the rotated token replaces the old one.
- Full API suite and web build/tests before commit.

## Remaining before this is marked done

1. Full API suite green — running.
2. `npm run build:web` and web tests green.
3. Lint green across all three packages.
4. Commit, push, verify production still authenticates.
