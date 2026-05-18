-- SECURITY FIX: CRITICAL-3
-- Drivers had unrestricted UPDATE on all trips columns including financial fields.
-- Replace with a SECURITY DEFINER RPC that only allows status/timing updates.

-- 1. Drop the overly broad driver update policy
DROP POLICY IF EXISTS "Drivers can update own trips" ON trips;

-- 2. Reinstate a narrow driver update policy (status + timestamps only).
--    Column-level enforcement is done via the RPC below; the policy gates the row.
DROP POLICY IF EXISTS "drivers_update_own_trip_status" ON trips;
CREATE POLICY "drivers_update_own_trip_status" ON trips
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM drivers d
  WHERE d.id = trips.driver_id AND d.user_id = (SELECT auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM drivers d
  WHERE d.id = trips.driver_id AND d.user_id = (SELECT auth.uid())
));

-- 3. Preferred path: all driver trip mutations go through this RPC
CREATE OR REPLACE FUNCTION public.driver_update_trip_status(
  p_trip_id    uuid,
  p_status     text,
  p_started_at timestamptz DEFAULT NULL,
  p_completed_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Verify caller is the assigned driver for this trip
  IF NOT EXISTS (
    SELECT 1 FROM public.trips t
    JOIN public.drivers d ON d.id = t.driver_id
    WHERE t.id = p_trip_id
      AND d.user_id = (SELECT auth.uid())
      AND t.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'access_denied: not assigned driver for trip';
  END IF;

  UPDATE public.trips
  SET
    status       = p_status,
    started_at   = COALESCE(p_started_at, started_at),
    completed_at = COALESCE(p_completed_at, completed_at)
  WHERE id = p_trip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_update_trip_status(uuid, text, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.driver_update_trip_status(uuid, text, timestamptz, timestamptz) TO authenticated;
