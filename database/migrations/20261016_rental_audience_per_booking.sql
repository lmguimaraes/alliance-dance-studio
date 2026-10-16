-- Private or group is now chosen for each studio booking instead of once per
-- order, so one order can mix both rates.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS audience booking_audience;

COMMENT ON COLUMN public.bookings.audience IS
  'Rate the booking was sold at. NULL for bookings added by staff.';

-- Earlier online bookings take the rate of their order.
UPDATE public.bookings AS b
   SET audience = r.audience
  FROM public.reservations AS r
 WHERE b."reservationId" = r.id
   AND b.audience IS NULL
   AND r.audience IS NOT NULL;

-- Orders keep a value only when all of their bookings share it.
ALTER TABLE public.reservations
  ALTER COLUMN audience DROP NOT NULL;

COMMENT ON COLUMN public.reservations.audience IS
  'Rate shared by every booking in the order; NULL when the order mixes private and group.';
