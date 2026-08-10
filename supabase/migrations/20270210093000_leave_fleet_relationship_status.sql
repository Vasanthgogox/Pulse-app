-- Driver relationship model — Phase 2, writer 3 of 3.
--
-- leave_fleet only ever operates on a row the caller (auth.uid()) currently
-- owns via user_id, so this can only fire from relationship_status =
-- 'active_employee' (a NULL-user_id stub can never call this RPC).
-- relationship_origin is not touched — leaving a fleet does not change how
-- the row originally came to exist.
--
-- Body is otherwise identical to the original definition in
-- 20250319120000_driver_leave_fleets.sql.

CREATE OR REPLACE FUNCTION public.leave_fleet(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.drivers
  SET left_at = now(),
      relationship_status = 'disconnected'
  WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND left_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No active driver link found for this organization';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.leave_fleet(uuid) IS 'Driver leaves a fleet: sets left_at so connection moves to passbook history; relationship_status becomes disconnected (relationship_origin unchanged).';
