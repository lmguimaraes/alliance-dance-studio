# Stripe test-mode reservation setup

## 1. Apply the overlay and regenerate dependencies

```bash
/path/to/alliance-dance-studio-stripe/apply-overlay.sh /path/to/alliance-dance-studio
cd /path/to/alliance-dance-studio
pnpm install --no-frozen-lockfile
git diff --stat
git diff
```

Commit the regenerated `pnpm-lock.yaml` with `package.json`. `package-lock.json` is deliberately removed.

## 2. Rotate the exposed test secret

The test secret shared in chat must be treated as exposed. Roll/delete it in Stripe test mode and create a replacement for this application. Store it only in `.env` or the deployment secret manager—never in Git, a `VITE_` variable, frontend code, screenshots, or logs.

```dotenv
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://...
DATABASE_SSL=false
STRIPE_SECRET_KEY=sk_test_replace_me
STRIPE_WEBHOOK_SECRET=whsec_replace_me
STRIPE_CURRENCY=cad
STRIPE_TEST_MODE_ONLY=true
```

The reservation feature uses Stripe-hosted Checkout, so it does not require a publishable key in browser code.

## 3. Migrate and optionally seed

For an existing database, back it up and apply the reviewed additive migration:

```bash
psql "$DATABASE_URL" -f drizzle/migrations/0001_stripe_reservations.sql
```

For a disposable development database, `pnpm db:push` is an alternative. The optional seed updates/creates Studio 5, 6, and 7 at CAD 15 private / CAD 22 group per hour and replaces only those studios' availability with 09:00-22:00 daily windows:

```bash
pnpm db:seed
```

Do not run the seed where curated studio availability must be preserved.

## 4. Forward signed webhooks locally

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the displayed `whsec_...` value into `.env`, then restart:

```bash
pnpm dev
```

Keep `APP_URL=http://localhost:3000` and `PORT=3000`. The server intentionally does not fall through to a different port because Checkout return URLs must target the process you are testing.

## 5. Successful payment acceptance test

1. Open `/studio-rental`.
2. Choose one studio, or the Studio 6 + Studio 7 combination.
3. Choose a date, enabled start time, duration, and private/group pricing.
4. Enter customer details and select **Continue to payment**.
5. In Stripe test Checkout use `4242 4242 4242 4242`, any future expiry, and any CVC.
6. Complete payment and return to the site.
7. Confirm the page shows **Reservation confirmed**, the paid amount, and a reservation reference.
8. Open a private window, select the same studio/date, and verify that the paid interval—and starts whose minimum one-hour rental overlaps it—are greyed out.
9. Open `/admin` and verify the associated row(s) are `confirmed` and labelled Stripe-managed.

## 6. Integrity and failure tests

### Concurrent hold

Open two private windows on the same studio/date/time. Start Checkout in window A. Window B must show/reject that interval before A pays. The transaction advisory lock plus in-transaction overlap check is the final authority.

### Cancelled Checkout

Start Checkout, then use Stripe's back/cancel control. The return URL carries a one-time capability in the fragment. The app expires the Stripe Session before releasing the database hold. If Stripe cannot prove the Session is expired, the hold stays in place rather than risking a paid double-booking.

### Abandoned Checkout

Leave Checkout open. Stripe expires the Session after about 31 minutes; the `checkout.session.expired` webhook releases the hold. The database includes a short grace fallback, but webhooks must remain configured and monitored.

### Invalid webhook

POST an arbitrary body without a valid `Stripe-Signature`. The endpoint must return HTTP 400 and must not confirm a reservation.

### Server-owned price

Modify the displayed total in developer tools or craft a tRPC request. Checkout must still use `studios.hourlyRate` / `studios.groupHourlyRate`; the browser never submits price.

### Payment failure / processing

Use Stripe's documented test cards for a decline and authentication scenario. A failed payment must leave the booking unconfirmed. A completed Checkout with payment still processing must not release its inventory through the cancellation endpoint.

## Production switch checklist

- HTTPS `APP_URL` with no path suffix.
- Production webhook endpoint at `/api/stripe/webhook` and its live signing secret.
- Live server key only after deliberately setting `STRIPE_TEST_MODE_ONLY=false`.
- Secrets stored in the deployment secret manager.
- Shared WAF/Redis rate limiting when running more than one Node process.
- Database backup, migration rehearsal, `pnpm audit --prod`, typecheck, tests, build, and a low-risk live acceptance reservation.
- A reviewed cancellation/refund workflow; changing database status alone does not issue a Stripe refund.
