-- Fix: trip_number must be per-org (unique constraint is organization_id + trip_number).
-- The 20260420120000 migration switched to per-user user_counters, causing duplicate key
-- violations when multiple users in the same org create trips.
-- Revert set_trip_number() to use organization_counters (per-org sequence).

CREATE OR REPLACE FUNCTION public.set_trip_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq bigint;
BEGIN
  IF NEW.trip_number IS NULL OR trim(NEW.trip_number) = '' THEN
    INSERT INTO public.organization_counters (organization_id)
    VALUES (NEW.organization_id)
    ON CONFLICT (organization_id) DO NOTHING;

    UPDATE public.organization_counters
    SET trip_seq = trip_seq + 1
    WHERE organization_id = NEW.organization_id
    RETURNING trip_seq INTO seq;

    NEW.trip_number := 'TRP' || lpad(seq::text, 3, '0');

    IF public.column_exists('public', 'trips', 'display_trip_id') THEN
      NEW.display_trip_id := NEW.trip_number;
    END IF;
    IF public.column_exists('public', 'trips', 'sequence_number') THEN
      NEW.sequence_number := seq::integer;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Sync organization_counters.trip_seq to the current max so next insert
-- doesn't collide with existing rows.
INSERT INTO public.organization_counters (organization_id, trip_seq)
SELECT
  organization_id,
  coalesce(
    max(
      CASE
        WHEN trip_number ~ '^TRP[0-9]+$'
        THEN substring(trip_number FROM 4)::bigint
        ELSE 0
      END
    ), 0
  ) AS trip_seq
FROM public.trips
GROUP BY organization_id
ON CONFLICT (organization_id) DO UPDATE
  SET trip_seq = greatest(organization_counters.trip_seq, EXCLUDED.trip_seq);
