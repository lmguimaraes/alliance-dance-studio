# Alliance Dance

The website of Alliance Dance (Montreal): Discover pages for the company, a weekly class schedule with pass purchases, studio rentals with a cart and Stripe Checkout, and a password-protected admin panel.

Built with React 19 and Vite on the front end, and Express, tRPC and PostgreSQL (Supabase) on the server. English, French and Spanish are supported throughout.

## Pages

| Path                      | What it does                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                       | Home: hero, the four parts of Alliance (Academy, Company, Studios, Productions) and a call to action                                                                                                            |
| `/discover/:section`      | Directors, Company, Dancers, Our story, Awards, Teams, Gallery (Instagram feed and studios)                                                                                                                     |
| `/classes`                | Weekly schedule by day: search, style and level chips (from the active classes in the admin), day tabs, a timeline of class cards; passes bought on the site (name, email, class) and paid with Stripe Checkout |
| `/studio-rental`          | Live studio availability. Pick a start and end time on a studio, choose private or group, optionally repeat it weekly for up to 4 weeks (under "Extra options"), add it to the cart                             |
| `/studio-rental/checkout` | Booking summary with live prices, customer details, payment with Stripe Checkout, confirmation                                                                                                                  |
| `/contact`                | Contact details and an email form                                                                                                                                                                               |
| `/admin`                  | Admin panel (password)                                                                                                                                                                                          |

`/about` and `/gallery` redirect to their Discover sections.

## Run it locally

```bash
pnpm install
cp .env.example .env      # then fill in DATABASE_URL and the Stripe test keys
pnpm dev                  # applies database migrations, then starts on APP_URL
```

`pnpm db:seed` creates Studio 5, 6 and 7 with daily 09:00–22:00 hours on an empty database. It replaces the opening hours of those three studios, so don't run it against production.

## Database

Migrations live in `database/migrations` and are applied in file-name order by `pnpm db:migrate`, which `pnpm dev` and `pnpm start` run automatically. Applied files are recorded in `_appMigrations` with a checksum, so never edit a migration after it has run; add a new file instead.

| Migration                                  | Purpose                                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260801_base_schema.sql`                 | Creates the core tables on an empty database. No-op on the existing Supabase database.                                                              |
| `20260909_alpha_rebuild.sql`               | Earlier schema normalisation (already applied in production).                                                                                       |
| `20261015_classes_passes_discover.sql`     | Adds `classes`, `class_passes` and `discover_entries`, seeds the current class schedule and pass links, and enables row level security (see below). |
| `20261016_rental_audience_per_booking.sql` | Stores private or group on each booking (`bookings.audience`), so one order can mix both. `reservations.audience` becomes NULL for mixed orders.    |
| `20261026_pass_purchases.sql`              | Adds `pass_purchases` (every pass sale) and `class_passes.requires_class`, and removes the Payment Link column from `class_passes`.                 |

To apply a migration by hand instead, paste it into the Supabase SQL editor and then record it so the app skips it:

```sql
INSERT INTO "_appMigrations" (id, checksum)
VALUES ('20261015_classes_passes_discover.sql', '<sha256 of the file>');
```

(`shasum -a 256 database/migrations/20261015_classes_passes_discover.sql` prints the checksum.)

### Row level security

The site connects to PostgreSQL directly, as the owner of its tables, so RLS never restricts it. Supabase also exposes every `public` table through its REST API to anyone holding the project's anon key; the latest migration enables RLS (with no policies) on the site's tables so customer data can't be read that way. It only touches tables owned by the role running the migration.

## Studio rentals

- Availability comes from each studio's weekly opening hours (Admin → Studios). Time is busy when it is held or paid in `bookings`, booked by staff, active in the earlier `studio_booking_items` system, or used by a class assigned to that studio.
- Studio X is Studio 6 and Studio 7 booked together: open when both are open, busy when either is busy.
- Bookings start and end on the half hour, last 1 to 8 hours, and can start up to 60 days ahead. Weekly repeats (up to 4 weeks) may run three weeks past that.
- Private or group is chosen for each booking once a time range is picked, and priced at that studio's private or group hourly rate. The admin panel shows which one each online booking was sold at.
- At checkout the server re-checks every date under per-studio locks, writes a hold, and opens Stripe Checkout. Holds last 31 minutes plus a 10-minute grace period. A signed webhook (or the return page) confirms payment; expired or cancelled sessions release the hold.
- Prices are always computed on the server from the studio rates.

### Stripe setup

1. Add a webhook endpoint at `https://<your domain>/api/stripe/webhook` with `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired` and `checkout.session.async_payment_failed`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
2. For local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
3. Test cards: `4242 4242 4242 4242` succeeds, `4000 0000 0000 9995` is declined.
4. Class passes use the same keys and webhook. The customer enters name, email and (for class packages) the class on the website; the Stripe page shows the email locked and the name and class under the pass, and the sale is saved in `pass_purchases` when it is paid. Other Checkout sessions on the account are ignored.
5. At launch, set `STRIPE_TEST_MODE_ONLY=false` and switch to live keys.

Refunds (bookings and passes) are issued from the Stripe Dashboard. Cancelling a paid booking in the admin panel frees the time but does not refund it.

## Admin panel

Open `/admin` (also linked in the footer) and sign in with `ADMIN_PASSWORD`. Until that variable is set the password is `0000` and the panel shows a warning. Sessions last 8 hours in an HttpOnly, SameSite=Strict cookie; changing the password signs everyone out. After 5 wrong passwords from one address (or 30 overall) sign-in pauses for 15 minutes.

- **Bookings**: upcoming, past or all; search; add, edit, cancel or delete. Overlaps with other bookings and classes are refused. Bookings paid online are cancelled rather than deleted, and keep their paid amount.
- **Classes**: weekly classes with type, level, instructor, optional studio (which blocks rentals at that time) and optional first and last dates.
- **Passes**: name and details in three languages, price, and whether the customer chooses a class (one class per pass).
- **Pass sales**: every pass bought on the site with the customer, pass, class, amount and status, with a link to the payment in Stripe. Unfinished checkouts are marked "Not completed" after about 45 minutes.
- **Discover**: directors, dancers, teams and awards, with text in three languages (English is used when a translation is empty).
- **Studios**: rates, capacity, photo and weekly opening hours.

## Checks

```bash
pnpm check     # TypeScript
pnpm test      # unit tests; database tests run when TEST_DATABASE_URL is set
pnpm build     # client and server bundles in dist/
```

The database tests (`server/**/*.integration.test.ts`) create and delete their own rows; point `TEST_DATABASE_URL` at a disposable database with the migrations applied, never at production. Stripe is replaced by an in-memory fake in those tests.

GitHub Actions runs all of the above, against a temporary PostgreSQL, on every push and pull request.

## Production

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start          # migrates, then serves dist/ on PORT
```

Required in production: `DATABASE_URL`, an HTTPS `APP_URL`, `JWT_SECRET` (32+ characters), `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Set `ADMIN_PASSWORD` too. Behind a load balancer or proxy, set `TRUST_PROXY_HOPS` so rate limits see real client addresses. Rate limits are kept in memory per process; use a shared limiter if you run more than one instance.

## Styling

Plain CSS with readable, screen-related class names (`.home-hero`, `.pillars-strip`, `.class-row`, `.studio-card`, `.time-slot--booked`). Design tokens (burgundy `#711323`, black, gold, type scale) are in `client/src/styles/tokens.css`; each page imports its own stylesheet next to it. Fonts are Antonio and Jost, self-hosted through Fontsource.

Burgundy works as stage lighting: a light from above on every page title, a floor light and film grain fixed to the screen (`client/src/styles/base.css`), a lit burgundy stage behind the home page headline, and burgundy-tinted cards, lines and footer edge. Gold stays reserved for headlines, prices and buttons.
