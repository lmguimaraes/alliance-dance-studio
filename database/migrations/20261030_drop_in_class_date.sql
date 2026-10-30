-- Drop-in passes are for one class on one date. The customer picks the date
-- on the website; it is shown on the Stripe page and in Admin -> Pass sales.

ALTER TABLE public.class_passes
  ADD COLUMN IF NOT EXISTS requires_date boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.class_passes.requires_date IS
  'The customer also chooses the date of the class (drop-in).';

-- A date only makes sense for a pass that is tied to a class.
ALTER TABLE public.class_passes
  DROP CONSTRAINT IF EXISTS class_passes_date_needs_class;
ALTER TABLE public.class_passes
  ADD CONSTRAINT class_passes_date_needs_class
  CHECK (NOT requires_date OR requires_class);

UPDATE public.class_passes
   SET requires_date = true
 WHERE requires_class
   AND name_en ~* 'drop';

ALTER TABLE public.pass_purchases
  ADD COLUMN IF NOT EXISTS class_date date;

COMMENT ON COLUMN public.pass_purchases.class_date IS
  'The date of the class, for drop-in passes.';
