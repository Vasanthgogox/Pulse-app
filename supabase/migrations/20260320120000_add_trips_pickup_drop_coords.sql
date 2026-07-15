-- Add optional lat/lon for pickup and drop (from place search). Idempotent.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS pickup_lat numeric(12, 7),
  ADD COLUMN IF NOT EXISTS pickup_lon numeric(12, 7),
  ADD COLUMN IF NOT EXISTS drop_lat numeric(12, 7),
  ADD COLUMN IF NOT EXISTS drop_lon numeric(12, 7);

COMMENT ON COLUMN public.trips.pickup_lat IS 'Latitude of pickup place (from place search).';
COMMENT ON COLUMN public.trips.pickup_lon IS 'Longitude of pickup place (from place search).';
COMMENT ON COLUMN public.trips.drop_lat IS 'Latitude of drop place (from place search).';
COMMENT ON COLUMN public.trips.drop_lon IS 'Longitude of drop place (from place search).';
