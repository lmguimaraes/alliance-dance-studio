# Apply-ready overlay

This directory contains changed/new files plus a deletion manifest for the repository root. It is not a fork, commit, or complete source checkout.

## Apply

Use a clean branch or commit your current work first:

```bash
chmod +x /path/to/alliance-dance-studio-stripe/apply-overlay.sh
/path/to/alliance-dance-studio-stripe/apply-overlay.sh /path/to/alliance-dance-studio
cd /path/to/alliance-dance-studio
git diff --stat
git diff
```

The script first deletes the obsolete paths in `FILES_TO_DELETE.txt`, then copies the retained replacements. It does not touch `.env`, install packages, migrate a database, or create a commit.

## What changes

- `client/src/pages/StudioRental.tsx`: live server availability, disabled occupied times, contact form, hosted Checkout redirect, success verification, and cancellation return handling.
- `server/bookingPolicy.ts`, `bookingRepository.ts`, `stripe.ts`: authoritative validation/pricing, atomic multi-studio holds, safe cancellation, idempotent fulfillment, and signed webhook handling.
- `server/routers.ts`, `db.ts`: narrow public API, bounded input, rate limits, and no public customer-data query.
- `drizzle/schema.ts` and `drizzle/migrations/0001_stripe_reservations.sql`: payment-aware reservation state and booking linkage.
- `server/_core/*`: raw-body webhook ordering, fixed callback origin/port, bounded parsers, baseline headers, hardened OAuth state/session cookies, and credential-safe configuration.
- `client/src/components/ui/*`: six small primitives used by active routes; the unused generated shadcn/Radix scaffold is removed.
- `package.json`: unused libraries removed; pnpm declared as the sole package manager.

## Install and validate

Because dependencies were pruned in `package.json`, regenerate the lockfile in the full checkout:

```bash
pnpm install --no-frozen-lockfile
git add package.json pnpm-lock.yaml
git diff --check
pnpm format
pnpm check
pnpm test:booking
pnpm test
pnpm build
```

Review and apply the database migration to a backed-up test database, then complete every test in `STRIPE_TESTING.md`. Do not commit until the generated `pnpm-lock.yaml`, typecheck, tests, and production build are clean.
