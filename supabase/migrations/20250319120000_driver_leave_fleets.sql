-- Driver leave fleet: left_at column + leave_fleet RPC.
-- Enables "Leave fleet" in the app; driver keeps read access for passbook history.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'left_at'
  ) THEN
    ALTER TABLE public.drivers ADD COLUMN left_at timestamptz;
  END IF;
END $$;

COMMENT ON COLUMN public.drivers.left_at IS 'When set, driver has left this fleet; connection appears in passbook history only.';

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
  SET left_at = now()
  WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND left_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No active driver link found for this organization';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.leave_fleet(uuid) IS 'Driver leaves a fleet: sets left_at so connection moves to passbook history.';

GRANT EXECUTE ON FUNCTION public.leave_fleet(uuid) TO authenticated;
