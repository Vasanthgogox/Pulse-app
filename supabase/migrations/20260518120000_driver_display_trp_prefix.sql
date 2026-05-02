-- Driver-facing trip labels use the same TRP### visual format as fleet, but the sequence is
-- independent per driver (driver_trip_counters), not per organization.

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

  NEW.driver_display_trip_id := 'TRP' || lpad(seq::text, 3, '0');
  RETURN NEW;
END;
$$;

-- Migrate existing DRV### labels to TRP### (same numeric suffix).
UPDATE public.trips
SET driver_display_trip_id = 'TRP' || substring(driver_display_trip_id FROM 4)
WHERE driver_display_trip_id ~ '^DRV[0-9]+$';

INSERT INTO public.driver_trip_counters (driver_id, trip_seq)
SELECT
  driver_id,
  coalesce(
    max(
      CASE
        WHEN driver_display_trip_id ~ '^TRP[0-9]+$'
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
  'Per-driver sequential label (TRP###), same format as fleet trip_number but from driver_trip_counters.';
