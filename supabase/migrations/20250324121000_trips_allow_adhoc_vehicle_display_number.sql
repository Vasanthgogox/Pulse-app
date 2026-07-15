-- Allow ad-hoc vehicle_display_number on trips when vehicle_id is null (aggregate/doc flow).
-- Adds trips.vehicle_display_number and driver_display_name if missing (e.g. from initial_schema),
-- then updates the trigger so when vehicle_id is null we do not overwrite vehicle_display_number.

-- Add display columns if not present (initial_schema.sql did not have them)
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS driver_display_name text,
  ADD COLUMN IF NOT EXISTS vehicle_display_number text;

COMMENT ON COLUMN public.trips.driver_display_name IS 'Cached driver name for display. Kept in sync by trigger.';
COMMENT ON COLUMN public.trips.vehicle_display_number IS 'Cached vehicle number for display. Synced from vehicles when vehicle_id set; can be set ad-hoc when vehicle_id is null.';

-- Create or replace trigger function (must exist for trigger below)
CREATE OR REPLACE FUNCTION public.trips_sync_driver_vehicle_display()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if new.driver_id is not null then
    select name into new.driver_display_name from public.drivers where id = new.driver_id;
  else
    new.driver_display_name := null;
  end if;
  if new.vehicle_id is not null then
    select vehicle_number into new.vehicle_display_number from public.vehicles where id = new.vehicle_id;
  end if;
  -- when vehicle_id is null, do not overwrite vehicle_display_number (ad-hoc from client)
  return new;
end;
$$;

COMMENT ON FUNCTION public.trips_sync_driver_vehicle_display() IS
  'Syncs driver_display_name and vehicle_display_number from drivers/vehicles when driver_id/vehicle_id set. When vehicle_id is null, vehicle_display_number is left unchanged so ad-hoc vehicle numbers (e.g. aggregate trips) persist.';

-- Attach trigger so display columns stay in sync (idempotent)
DROP TRIGGER IF EXISTS trips_sync_driver_vehicle_display ON public.trips;
CREATE TRIGGER trips_sync_driver_vehicle_display
  BEFORE INSERT OR UPDATE OF driver_id, vehicle_id
  ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_sync_driver_vehicle_display();
