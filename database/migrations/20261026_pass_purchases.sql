-- Class passes are now paid through Stripe Checkout pages that the site
-- creates. Customers enter their name, email and class on the website, Stripe
-- shows them already filled in, and every sale is recorded here for the admin
-- panel. Stripe Payment Links are no longer used.

-- Class packages are for one class, chosen by the customer.
ALTER TABLE public.class_passes
  ADD COLUMN IF NOT EXISTS requires_class boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.class_passes.requires_class IS
  'The customer chooses the one class this pass is for.';

-- Every class pass except the unlimited one is a package for one class.
UPDATE public.class_passes
   SET requires_class = true
 WHERE category = 'classes'
   AND name_en !~* 'unlimited';

ALTER TABLE public.class_passes
  DROP CONSTRAINT IF EXISTS class_passes_stripe_url_valid;
ALTER TABLE public.class_passes
  DROP COLUMN IF EXISTS stripe_url;

CREATE TABLE IF NOT EXISTS public.pass_purchases (
  id varchar(32) PRIMARY KEY,
  pass_id integer REFERENCES public.class_passes(id) ON DELETE SET NULL,
  -- Names as the customer saw them, kept even if the pass or class changes.
  pass_name text NOT NULL,
  class_id integer REFERENCES public.classes(id) ON DELETE SET NULL,
  class_label text,
  customer_name varchar(120) NOT NULL,
  customer_email varchar(320) NOT NULL,
  amount_cents integer NOT NULL,
  currency varchar(3) NOT NULL,
  locale varchar(5) NOT NULL DEFAULT 'en',
  status text NOT NULL DEFAULT 'checkout_pending',
  stripe_checkout_session_id varchar(255) UNIQUE,
  stripe_payment_intent_id varchar(255),
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pass_purchases_status_valid CHECK (
    status IN ('checkout_pending', 'paid', 'expired', 'cancelled')
  ),
  CONSTRAINT pass_purchases_amount_valid CHECK (amount_cents > 0),
  CONSTRAINT pass_purchases_currency_valid CHECK (currency ~ '^[a-z]{3}$')
);

CREATE INDEX IF NOT EXISTS pass_purchases_created_idx
  ON public.pass_purchases (created_at DESC);

-- Customer data: not readable through Supabase's public API (see README).
ALTER TABLE public.pass_purchases ENABLE ROW LEVEL SECURITY;
