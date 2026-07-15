-- Global booking reference for cross-org trips (indent awards).
-- Org-local trip_number collides when a supplier receives loads from multiple client orgs
-- that each have their own TRP001 / IND001. BKG-XXXXXX is org-independent and serves as
-- the shared reference both client and supplier quote.

CREATE SEQUENCE IF NOT EXISTS public.booking_ref_seq START 1;

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS booking_ref text;

-- Backfill existing indent-linked trips (one sequence value each, order by created_at for stability).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.trips
    WHERE indent_id IS NOT NULL AND booking_ref IS NULL
    ORDER BY created_at
  LOOP
    UPDATE public.trips
    SET booking_ref = 'BKG-' || LPAD(nextval('public.booking_ref_seq')::text, 6, '0')
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- Auto-assign on insert when indent_id is present.
CREATE OR REPLACE FUNCTION public.set_trip_booking_ref()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.indent_id IS NOT NULL AND NEW.booking_ref IS NULL THEN
    NEW.booking_ref := 'BKG-' || LPAD(nextval('public.booking_ref_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_set_booking_ref ON public.trips;
CREATE TRIGGER trips_set_booking_ref
  BEFORE INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.set_trip_booking_ref();
