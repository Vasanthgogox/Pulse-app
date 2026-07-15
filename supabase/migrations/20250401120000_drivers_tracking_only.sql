-- One-time drivers (assigned by phone for aggregate trip tracking) should not appear in the Drivers tab.
-- tracking_only = true: created via assign-by-phone for aggregate trip; exclude from fleet list.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS tracking_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.drivers.tracking_only IS 'When true, driver was created only for trip tracking (assign-by-phone on aggregate trip). Exclude from Drivers tab / fleet list.';
