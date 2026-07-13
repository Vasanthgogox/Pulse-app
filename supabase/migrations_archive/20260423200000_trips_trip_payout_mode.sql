-- v1 ledger model: market (supplier payable) vs asset (driver / vehicle payable); mutually exclusive CTAs.
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS trip_payout_mode text;

ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_trip_payout_mode_check;
ALTER TABLE public.trips
  ADD CONSTRAINT trips_trip_payout_mode_check
  CHECK (
    trip_payout_mode IS NULL
    OR trip_payout_mode = ANY (ARRAY['market'::text, 'asset'::text])
  );

COMMENT ON COLUMN public.trips.trip_payout_mode IS
  'Ledger payout lane: market = supplier settlement (aggregator); asset = own fleet (driver + vehicle). NULL = infer from supplier_id at read time.';

UPDATE public.trips
SET trip_payout_mode = CASE
  WHEN supplier_id IS NOT NULL THEN 'market'
  ELSE 'asset'
END
WHERE trip_payout_mode IS NULL;
