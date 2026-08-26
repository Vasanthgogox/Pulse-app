-- Issue B: manual/Aggregate-assigned trips cannot distinguish "supplier
-- deployed their own driver+vehicle" (ASSET) from "supplier outsourced to a
-- third-party/gig driver" (AGGREGATE) — getTripExecutionModel() only detects
-- the ASSET case for source='direct_quote' trips (see
-- features/trips/domain/tripExecutionModel.ts), which manual/Aggregate-module
-- assignments never are. Step 1 of this investigation confirmed ownership
-- cannot be reliably derived from existing data: none of the 42 manual/
-- Aggregate trips with a linked supplier have a real `vehicles` row (only a
-- free-text vehicle_display_number), and the assigned driver's
-- organization_id does not reliably resolve to the supplier's linked org
-- (assign_aggregate_trip_driver creates the driver under whatever
-- p_driver_org_id the caller passes, which is not guaranteed to be the
-- supplier's org). An explicit, dispatcher-captured field is required.
--
-- NULL is the safe default and is NOT backfilled — historical ownership
-- cannot be reliably reconstructed for existing trips, so they keep the
-- existing source/supplier_id-based heuristic in getTripExecutionModel().

ALTER TABLE public.trips
  ADD COLUMN execution_type text
    CHECK (execution_type IS NULL OR execution_type IN ('ASSET', 'AGGREGATE'));

COMMENT ON COLUMN public.trips.execution_type IS
  'Explicit, dispatcher-captured signal for whether a subcontracted (supplier_id IS NOT NULL) trip was executed on the supplier''s own asset (ASSET) or a third-party/outsourced driver (AGGREGATE). NULL for trips predating this column, or where the dispatcher did not specify — getTripExecutionModel() falls back to the legacy source/supplier_id heuristic in that case. Immutable once started_at is set (see trg_lock_execution_type_after_start).';

-- Immutability: once a trip has started, its execution_type must not change —
-- financial/payout logic keys off this the moment money can start moving.
-- Setting it for the first time (NULL -> value) is allowed even after start,
-- since a late correction before any payout has been recorded is still safe;
-- only a change AWAY from an already-set value after start is blocked.
CREATE OR REPLACE FUNCTION public.lock_execution_type_after_start()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.execution_type IS NOT NULL
     AND NEW.execution_type IS DISTINCT FROM OLD.execution_type
     AND OLD.started_at IS NOT NULL THEN
    RAISE EXCEPTION 'execution_type cannot be changed after the trip has started (trip %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_execution_type_after_start ON public.trips;
CREATE TRIGGER trg_lock_execution_type_after_start
  BEFORE UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_execution_type_after_start();
