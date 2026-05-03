-- Fix single-active-trip guard so ongoing trip progression is never interrupted.
--
-- Problem:
-- Existing trigger blocks ALL updates when any same-driver/same-phone active trip exists.
-- If legacy overlap rows are already present, even status updates on the "real" trip fail.
--
-- Goal:
-- 1) Keep exactly one active trip per real driver (phone-global) going forward.
-- 2) Preserve continuity: allow lifecycle/progress updates on an already-active assignment.
-- 3) One-time self-heal legacy overlaps by unassigning lower-priority active trips.

-- 1) One-time cleanup for existing overlapping active assignments.
-- Keep the highest-priority trip and unassign the rest:
-- - started trip wins over not-started
-- - earlier started/created trip wins (first assignment priority)
WITH active_rows AS (
  SELECT
    t.id,
    t.driver_id,
    t.status,
    t.started_at,
    t.created_at,
    t.updated_at,
    COALESCE(
      NULLIF(right(regexp_replace(COALESCE(d.phone, ''), '\D', '', 'g'), 10), ''),
      'driver:' || t.driver_id::text
    ) AS busy_key
  FROM public.trips t
  JOIN public.drivers d ON d.id = t.driver_id
  WHERE t.driver_id IS NOT NULL
    AND lower(trim(COALESCE(t.status::text, ''))) NOT IN ('completed', 'cancelled', 'done', 'delivered')
),
ranked AS (
  SELECT
    ar.*,
    row_number() OVER (
      PARTITION BY ar.busy_key
      ORDER BY
        CASE WHEN ar.started_at IS NOT NULL THEN 0 ELSE 1 END,
        COALESCE(ar.started_at, ar.created_at, ar.updated_at) ASC,
        ar.created_at ASC,
        ar.id ASC
    ) AS rn
  FROM active_rows ar
)
UPDATE public.trips t
SET
  driver_id = NULL,
  started_at = NULL,
  status = 'assigned',
  updated_at = now()
FROM ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- 2) Trigger refinement:
-- Enforce uniqueness only on assignment/reactivation transitions.
-- Do NOT block status progression for already-active same-driver rows.
CREATE OR REPLACE FUNCTION public.enforce_single_active_trip_per_driver()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_old_status text;
BEGIN
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_status := lower(trim(coalesce(NEW.status::text, '')));
  IF v_status IN ('completed', 'cancelled', 'done', 'delivered') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_status := lower(trim(coalesce(OLD.status::text, '')));

    -- No-op assignment/activity change.
    IF NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;

    -- Critical: keep first active trip moving even if legacy overlap exists.
    -- When this row already had same driver + active status, allow progression updates.
    IF NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id
       AND v_old_status NOT IN ('completed', 'cancelled', 'done', 'delivered') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF public.driver_has_other_active_trip(NEW.driver_id, NEW.id)
     OR public.driver_phone_has_other_active_trip(NEW.driver_id, NEW.id) THEN
    RAISE EXCEPTION 'Driver is already assigned to another active trip. Complete or unassign that trip first.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_single_active_trip_per_driver() IS
  'Blocks new overlapping active assignments per driver/phone, while allowing status progression for an already-active assignment.';
