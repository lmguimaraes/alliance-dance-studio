-- Alliance Dance: base schema for a fresh database.
--
-- Production databases already contain these objects, so every statement is a
-- no-op there (IF NOT EXISTS / duplicate_object guards). On an empty database
-- this runs first and lets the later migrations apply cleanly.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $base$
BEGIN
  CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$base$;

DO $base$
BEGIN
  CREATE TYPE booking_audience AS ENUM ('private', 'group');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$base$;

DO $base$
BEGIN
  CREATE TYPE reservation_status AS ENUM ('checkout_pending', 'paid', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$base$;

CREATE TABLE IF NOT EXISTS public.studios (
  id serial PRIMARY KEY,
  name varchar NOT NULL,
  description text,
  "hourlyRate" integer NOT NULL DEFAULT 1500,
  image text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
  capacity integer NOT NULL DEFAULT 1,
  size text NOT NULL DEFAULT 'Not specified',
  "groupHourlyRate" integer NOT NULL DEFAULT 2200,
  "imageUrl" text
);

CREATE TABLE IF NOT EXISTS public."timeSlots" (
  id serial PRIMARY KEY,
  "studioId" integer NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  "dayOfWeek" integer NOT NULL,
  "startTime" varchar NOT NULL,
  "endTime" varchar NOT NULL,
  "isAvailable" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reservations (
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
  "holdExpiresAt" timestamp with time zone NOT NULL,
  "paidAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id serial PRIMARY KEY,
  "studioId" integer NOT NULL REFERENCES public.studios(id) ON DELETE RESTRICT,
  "userEmail" varchar NOT NULL,
  "userName" varchar NOT NULL,
  "userPhone" varchar,
  "bookingDate" timestamp without time zone NOT NULL,
  "startTime" varchar NOT NULL,
  "endTime" varchar NOT NULL,
  status booking_status NOT NULL DEFAULT 'pending',
  "specialRequests" text,
  "totalPrice" integer NOT NULL,
  "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
  duration integer NOT NULL DEFAULT 60,
  "reservationId" varchar(32)
);

-- Legacy booking store from an earlier version of the site. The application
-- still treats its active items as busy time and lets staff cancel them.
CREATE TABLE IF NOT EXISTS public.studio_booking_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'awaiting_payment_method' CHECK (
    status IN ('awaiting_payment_method', 'scheduled', 'paid', 'payment_failed', 'cancelled', 'expired')
  ),
  currency text NOT NULL DEFAULT 'cad',
  total_amount_cents integer NOT NULL CHECK (total_amount_cents >= 0),
  start_at timestamp with time zone NOT NULL,
  end_at timestamp with time zone NOT NULL,
  charge_at timestamp with time zone NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  special_requests text,
  stripe_customer_id text,
  stripe_checkout_session_id text,
  stripe_setup_intent_id text,
  stripe_payment_method_id text,
  stripe_payment_intent_id text,
  last_payment_error text
);

CREATE TABLE IF NOT EXISTS public.studio_booking_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_group_id uuid NOT NULL REFERENCES public.studio_booking_groups(id),
  studio_id integer NOT NULL REFERENCES public.studios(id),
  start_at timestamp with time zone NOT NULL,
  end_at timestamp with time zone NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  time_range tstzrange GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED
);
