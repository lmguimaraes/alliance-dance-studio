# Security and code-quality review

Scope: the public `master` branch reviewed on September 3, 2026, with emphasis on reservations, public API boundaries, database integrity, authentication, and dependency/UI bloat.

## Addressed

| Severity | Finding | Remediation in this overlay |
|---|---|---|
| Critical | A Stripe test secret was shared in chat. | No supplied key is present in the files. Rotate/delete it and inject the replacement through server-only `STRIPE_SECRET_KEY`. Test-only mode rejects live keys by default. |
| High | The public booking query returned full rows, including customer contact details and special requests. | Replaced by `bookings.schedule`, which returns only studio metadata, opening windows, anonymous busy intervals, currency, and scheduling rules. |
| High | Public callers could create unpaid `pending` bookings that blocked inventory indefinitely. | Replaced with a Stripe-associated hold that expires/cancels and confirms only after verified payment. |
| High | Availability checking and insertion were separate, permitting concurrent double-booking. | Sorted PostgreSQL advisory transaction locks serialize each studio/date; overlap is rechecked inside the hold transaction before inserts. |
| High | Confirmation was not tied to authenticated payment. | Signed raw-body webhooks and success-page fallback both retrieve the Checkout Session and verify reservation ID, total, and currency before idempotent confirmation. |
| High | Cancellation could release a hold while an uncertain Stripe Session might still settle. | Cancellation releases only after Stripe reports the Session expired (or no Session was attached). Paid Sessions are fulfilled; completed/uncertain Sessions retain the hold. |
| High | Client/demo data controlled prices and studio choices. | Studios/rates come from PostgreSQL and every line total is recomputed server-side. Only the Studio 6 + Studio 7 combination is allowed. |
| High | OAuth `state` was not an unpredictable login-CSRF nonce. | Added 256-bit random state in a short-lived HttpOnly cookie, timing-safe validation, one trusted callback origin, and bounded query parameters. |
| Medium | Database diagnostics and booking helpers could log credentials/customer payloads. | Replacement DB/seed/payment code logs only bounded error messages and non-sensitive reservation/event IDs. |
| Medium | A public debug endpoint exposed database/configuration state. | Removed it; `system.health` returns only `{ ok: true }`. |
| Medium | Request body limits were 50 MB. | JSON/webhook bodies are capped at 1 MB and URL-encoded bodies at 64 KB. |
| Medium | Date parsing used server-local assumptions. | Strict date/time formats, Toronto-local current-time checks, fixed 30-minute boundaries, and noon date markers that avoid midnight rollover. |
| Medium | Customer fields lacked practical bounds. | Strict Zod objects; bounded/trimmed name, email, phone, and special requests. |
| Medium | Public payment endpoints lacked abuse controls. | Per-process IP rate limits with explicit proxy trust configuration. |
| Medium | Session cookies/OAuth session JWTs had weak browser/context binding. | `SameSite=Lax`, production `Secure`, HttpOnly cookies, 32-character minimum secret, fixed lifetime, issuer/audience/algorithm/app-ID validation. |
| Medium | Client auth persisted user data in `localStorage`. | Authentication state now comes from the HttpOnly session-backed `auth.me` query only. |
| Medium | Admins could manually confirm payment-managed bookings. | Stripe-linked rows reject manual status changes; paid cancellations/refunds require a separate reviewed workflow. |
| Low | Express disclosed its framework and lacked baseline browser headers. | Disabled `X-Powered-By`; added nosniff, frame, referrer, permissions, API no-store, and production HSTS headers. |
| Low | The development server could silently switch ports, breaking trusted OAuth/Stripe return URLs. | Startup now fails on port conflict; `PORT` and `APP_URL` must match. |
| Low | The client error boundary exposed detailed stack information. | Production UI shows a generic recovery message; detailed logging is development-only. |

## Bloat removed

- Replaced the roughly 2,380-line local-demo reservation page with a focused server-backed booking/payment flow.
- Removed localStorage booking persistence, recurrence/cart logic, duplicated pricing/date arithmetic, and the local-development bypass.
- Removed the unused Component Showcase, dashboard/map components, generated service helpers, storage scaffold, todo placeholder, and duplicate npm lockfile.
- Replaced the generated UI directory with six active primitives: button, badge, card, input, scroll area, and toaster.
- Removed unused Radix packages and `@supabase/supabase-js`, `class-variance-authority`, `date-fns`, `luxon`, `next-themes`, `react-day-picker`, `react-hook-form`, `tailwindcss-animate`, and the typography plugin.
- Reduced seeded availability from many hourly rows to one daily window per studio/day, inside a transaction.

`axios` remains because the Manus OAuth client uses it. `tw-animate-css` remains because the active stylesheet imports it. `@radix-ui/react-slot` remains for the active `Button asChild` pattern.

## Remaining launch work

1. Rotate the exposed Stripe test secret before testing.
2. Regenerate and commit `pnpm-lock.yaml`, then run a current `pnpm audit --prod` in CI.
3. Keep signed Stripe webhooks enabled and monitored in every environment; the browser return is not a reliable fulfillment mechanism by itself.
4. Move rate limiting to shared infrastructure for multi-instance deployments.
5. Back up and rehearse the additive database migration.
6. Add an authenticated, audited refund/cancellation workflow before staff can cancel paid reservations.
7. Add customer/admin notifications and define contact-data retention/deletion policy.
8. Add a tested Content Security Policy after inventorying the site's image/font/analytics/OAuth/Stripe origins.
9. Monitor administrator accounts and require MFA at the identity provider.

## Verification completed in this environment

- Syntax transpilation passed for every TypeScript/TSX file in the overlay.
- Standalone executable checks passed for interval merge/intersection/overlap, Toronto-local validation, `24:00` end handling, price arithmetic, studio-combination validation, and rate-limit reset/isolation.
- JSON parsing, shell syntax, deletion/copy ordering, and secret-pattern scans were checked.

A real PostgreSQL transaction, Stripe API call, signed webhook, complete repository typecheck/build, dependency audit, and browser E2E require the full checkout, regenerated lockfile, database, and freshly rotated Stripe test credentials. Follow `STRIPE_TESTING.md` before merging.
