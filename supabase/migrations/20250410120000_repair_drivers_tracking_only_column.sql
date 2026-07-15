-- Repair: ensure tracking_only exists so claim_trip_by_otp and app code don't error.
-- Safe to run even if 20250401120000 was already applied (ADD COLUMN IF NOT EXISTS).

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS tracking_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.drivers.tracking_only IS 'When true, driver was created only for trip tracking (assign-by-phone on aggregate trip). Exclude from Drivers tab / fleet list.';
