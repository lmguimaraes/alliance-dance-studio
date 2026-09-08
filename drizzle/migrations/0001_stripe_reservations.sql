-- Stripe-backed studio reservations.
-- Safe to run once against the existing PostgreSQL schema.

DO $$
BEGIN
  CREATE TYPE booking_audience AS ENUM ('private', 'group');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE reservation_status AS ENUM (
    'checkout_pending',
    'paid',
    'expired',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS "groupHourlyRate" integer;

-- Preserve current pricing until the studio owner sets a separate group rate.
UPDATE studios
SET "groupHourlyRate" = "hourlyRate"
WHERE "groupHourlyRate" IS NULL;

CREATE TABLE IF NOT EXISTS reservations (
  id varchar(32) PRIMARY KEY,
  "userName" varchar(120) NOT NULL,
  "userEmail" varchar(320) NOT NULL,
  "userPhone" varchar(40),
  audience booking_audience NOT NULL,
  "specialRequests" text,
  "amountTotal" integer NOT NULL CHECK ("amountTotal" > 0),
  currency varchar(3) NOT NULL,
  status reservation_status NOT NULL DEFAULT 'checkout_pending',
  "stripeCheckoutSessionId" varchar(255),
  "stripePaymentIntentId" varchar(255),
  "cancelTokenHash" varchar(64) NOT NULL,
  "holdExpiresAt" timestamptz NOT NULL,
  "paidAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS "reservationId" varchar(32);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_reservationId_reservations_id_fk'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT "bookings_reservationId_reservations_id_fk"
      FOREIGN KEY ("reservationId")
      REFERENCES reservations(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS reservations_stripe_session_unique
  ON reservations ("stripeCheckoutSessionId");

CREATE UNIQUE INDEX IF NOT EXISTS reservations_payment_intent_unique
  ON reservations ("stripePaymentIntentId");

CREATE INDEX IF NOT EXISTS reservations_status_expiry_idx
  ON reservations (status, "holdExpiresAt");

CREATE INDEX IF NOT EXISTS reservations_email_idx
  ON reservations ("userEmail");

CREATE INDEX IF NOT EXISTS bookings_reservation_idx
  ON bookings ("reservationId");

CREATE INDEX IF NOT EXISTS bookings_availability_idx
  ON bookings ("studioId", "bookingDate", status);

CREATE INDEX IF NOT EXISTS time_slots_studio_day_idx
  ON time_slots ("studioId", "dayOfWeek", "isAvailable");
