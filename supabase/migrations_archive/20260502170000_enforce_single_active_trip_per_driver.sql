-- Enforce one active trip per driver across every assignment flow.
-- Active = any non-terminal trip (assigned/in-progress/etc).
-- Terminal statuses are excluded: completed/cancelled/done/delivered.

CREATE OR REPLACE FUNCTION public.driver_has_other_active_trip(
  p_driver_id uuid,
  p_current_trip_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.driver_id = p_driver_id
      AND (p_current_trip_id IS NULL OR t.id <> p_current_trip_id)
      AND lower(trim(coalesce(t.status::text, ''))) NOT IN ('completed', 'cancelled', 'done', 'delivered')
  );
$$;

COMMENT ON FUNCTION public.driver_has_other_active_trip(uuid, uuid) IS
  'True if driver has another non-terminal trip besides the provided trip id.';

CREATE OR REPLACE FUNCTION public.driver_phone_has_other_active_trip(
  p_driver_id uuid,
  p_current_trip_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.drivers d ON d.id = t.driver_id
    WHERE (p_current_trip_id IS NULL OR t.id <> p_current_trip_id)
      AND lower(trim(coalesce(t.status::text, ''))) NOT IN ('completed', 'cancelled', 'done', 'delivered')
      AND right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10) <> ''
      AND right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10) = (
        SELECT right(regexp_replace(coalesce(d_self.phone, ''), '\D', '', 'g'), 10)
        FROM public.drivers d_self
        WHERE d_self.id = p_driver_id
      )
  );
$$;

COMMENT ON FUNCTION public.driver_phone_has_other_active_trip(uuid, uuid) IS
  'True if any driver row with same last-10 phone has another non-terminal trip.';

CREATE OR REPLACE FUNCTION public.enforce_single_active_trip_per_driver()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only enforce for active/non-terminal states.
  v_status := lower(trim(coalesce(NEW.status::text, '')));
  IF v_status IN ('completed', 'cancelled', 'done', 'delivered') THEN
    RETURN NEW;
  END IF;

  -- Skip no-op updates that do not affect assignment/activity state.
  IF TG_OP = 'UPDATE'
     AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF public.driver_has_other_active_trip(NEW.driver_id, NEW.id)
     OR public.driver_phone_has_other_active_trip(NEW.driver_id, NEW.id) THEN
    RAISE EXCEPTION 'Driver is already assigned to another active trip. Complete or unassign that trip first.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_single_active_trip_per_driver() IS
  'Trigger guard: blocks overlapping active trips for the same driver.';

DROP TRIGGER IF EXISTS trg_enforce_single_active_trip_per_driver ON public.trips;
CREATE TRIGGER trg_enforce_single_active_trip_per_driver
BEFORE INSERT OR UPDATE ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_active_trip_per_driver();
