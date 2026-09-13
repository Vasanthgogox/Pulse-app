-- Phase 2B / 2C foundation: universal trip INSERT → stop_execution_state seed.
--
-- Invariant: any canonical trip (trips.indent_id IS NOT NULL) whose indent has
-- execution_plan_id set receives one stop_execution_state row per
-- execution_plan_stops row, in the SAME transaction as the trip INSERT.
--
-- Option A (approved): AFTER INSERT trigger on public.trips so every production
-- path (RPCs + client createTrip()) shares one seeder. No application changes.
--
-- Zero-stop plan → RAISE (rolls back the trip). Non-plan / mover-asset
-- (indent_id IS NULL) → no-op.
--
-- Not a browser RPC: EXECUTE revoked from PUBLIC / anon / authenticated.
-- Trigger + table-owner DEFINER only. Does not weaken SES RLS.

CREATE OR REPLACE FUNCTION public.seed_stop_execution_state_for_trip(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_trip public.trips%ROWTYPE;
  v_plan_id uuid;
  v_stop_count integer;
BEGIN
  SELECT * INTO v_trip
  FROM public.trips
  WHERE id = p_trip_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Canonical execution trip only. Mover-asset uses source_indent_id and
  -- leaves indent_id NULL — do not seed a second SES set.
  IF v_trip.indent_id IS NULL THEN
    RETURN;
  END IF;

  SELECT i.execution_plan_id
  INTO v_plan_id
  FROM public.indents i
  WHERE i.id = v_trip.indent_id;

  IF v_plan_id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*)
  INTO v_stop_count
  FROM public.execution_plan_stops eps
  WHERE eps.execution_plan_id = v_plan_id;

  IF v_stop_count = 0 THEN
    RAISE EXCEPTION
      'Cannot create trip: execution plan % has no stops',
      v_plan_id;
  END IF;

  INSERT INTO public.stop_execution_state (
    trip_id,
    stop_id,
    sequence,
    driver_id,
    status
  )
  SELECT
    v_trip.id,
    eps.id,
    eps.sequence,
    v_trip.driver_id,
    'pending'
  FROM public.execution_plan_stops eps
  WHERE eps.execution_plan_id = v_plan_id
  ON CONFLICT (trip_id, stop_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.seed_stop_execution_state_for_trip(uuid) IS
  'Internal. Seeds pending stop_execution_state for a canonical plan-originated trip. Invoked by trg_seed_stop_execution_state on trips INSERT. Not a client RPC.';

REVOKE ALL ON FUNCTION public.seed_stop_execution_state_for_trip(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_stop_execution_state_for_trip(uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_seed_stop_execution_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.seed_stop_execution_state_for_trip(NEW.id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_seed_stop_execution_state() IS
  'AFTER INSERT on trips: seed stop_execution_state only. Does not mutate trip, indent, driver, vehicle, finance, DCO, or POD.';

REVOKE ALL ON FUNCTION public.trg_seed_stop_execution_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_seed_stop_execution_state() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_seed_stop_execution_state ON public.trips;

CREATE TRIGGER trg_seed_stop_execution_state
  AFTER INSERT ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_seed_stop_execution_state();
