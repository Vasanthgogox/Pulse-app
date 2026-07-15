-- Add trips.driver_display_name and vehicle_display_number if missing (fixes "Could not find vehicle_display_number").
-- Idempotent: safe if columns already exist.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS driver_display_name text,
  ADD COLUMN IF NOT EXISTS vehicle_display_number text;

COMMENT ON COLUMN public.trips.driver_display_name IS 'Cached driver name for display. Kept in sync by trigger.';
COMMENT ON COLUMN public.trips.vehicle_display_number IS 'Cached vehicle number for display. Synced from vehicles when vehicle_id set; can be set ad-hoc when vehicle_id is null.';
