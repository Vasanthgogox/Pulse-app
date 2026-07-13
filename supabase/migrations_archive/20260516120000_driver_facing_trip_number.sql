-- Independent per-driver trip labels (DRV001, DRV002, …) vs fleet TRP sequence.
-- drivers see DRV* in the driver app; fleet continues using organization TRP* from set_trip_number().

CREATE TABLE IF NOT EXISTS public.driver_trip_counters (
  driver_id uuid PRIMARY KEY REFERENCES public.drivers (id) ON DELETE CASCADE,
  trip_seq bigint NOT NULL DEFAULT 0
);

ALTER TABLE public.driver_trip_counters ENABLE ROW LEVEL SECURITY;

-- No direct client access; trigger uses SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.assign_driver_display_trip_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq bigint;
BEGIN
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Reassignment to a different driver: allocate a new label for the new driver.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.driver_id IS NOT NULL
       AND NEW.driver_id IS NOT NULL
       AND OLD.driver_id IS DISTINCT FROM NEW.driver_id
    THEN
      NEW.driver_display_trip_id := NULL;
    END IF;
  END IF;

  IF NEW.driver_display_trip_id IS NOT NULL AND btrim(NEW.driver_display_trip_id::text) <> '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.driver_trip_counters (driver_id)
  VALUES (NEW.driver_id)
  ON CONFLICT (driver_id) DO NOTHING;

  UPDATE public.driver_trip_counters
  SET trip_seq = trip_seq + 1
  WHERE driver_id = NEW.driver_id
  RETURNING trip_seq INTO seq;

  NEW.driver_display_trip_id := 'DRV' || lpad(seq::text, 3, '0');
  RETURN NEW;
END;
$$;

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS driver_display_trip_id text;

DROP TRIGGER IF EXISTS trg_assign_driver_display_trip_id ON public.trips;
CREATE TRIGGER trg_assign_driver_display_trip_id
  BEFORE INSERT OR UPDATE OF driver_id ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_driver_display_trip_id();

-- Backfill existing assigned trips: sequential DRV per driver by created_at.
WITH ranked AS (
  SELECT
    id,
    driver_id,
    row_number() OVER (PARTITION BY driver_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.trips
  WHERE driver_id IS NOT NULL
)
UPDATE public.trips t
SET driver_display_trip_id = 'DRV' || lpad(ranked.rn::text, 3, '0')
FROM ranked
WHERE t.id = ranked.id
  AND (t.driver_display_trip_id IS NULL OR btrim(t.driver_display_trip_id::text) = '');

INSERT INTO public.driver_trip_counters (driver_id, trip_seq)
SELECT
  driver_id,
  coalesce(
    max(
      CASE
        WHEN driver_display_trip_id ~ '^DRV[0-9]+$'
        THEN substring(driver_display_trip_id FROM 4)::bigint
        ELSE 0::bigint
      END
    ),
    0
  ) AS trip_seq
FROM public.trips
WHERE driver_id IS NOT NULL
  AND driver_display_trip_id IS NOT NULL
  AND btrim(driver_display_trip_id::text) <> ''
GROUP BY driver_id
ON CONFLICT (driver_id) DO UPDATE
SET trip_seq = greatest(
  public.driver_trip_counters.trip_seq,
  excluded.trip_seq
);

COMMENT ON COLUMN public.trips.driver_display_trip_id IS
  'Per-driver sequential label (DRV###). Independent from fleet trip_number (TRP###).';
