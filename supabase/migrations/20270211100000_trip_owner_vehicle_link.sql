-- Owner Vehicle Link (3B.4/3C follow-up) — explicit, additive trip↔owner_vehicle
-- link, decided by the read-only design-decision arc (see
-- docs/DRIVER_FLEET_OWNER_PHASE1.md's "Trip ↔ vehicle association (lock now)"
-- section). Does NOT touch accept_driver_direct_bid, reject_driver_direct_bid,
-- any award-bridge migration, or the Vincent relationship-status backfill.
--
-- Canonical shape (already specified, not designed here):
--   trips.owner_vehicle_id -> owner_vehicles.id, nullable until assigned.
-- "Do not infer trip ownership from owner_vehicles.owner_user_id." /
-- "Who owns the vehicle != which vehicle runs this trip." — no auto-selection
-- is implemented anywhere in this migration, including the exactly-one-vehicle
-- case.
--
-- ── 1. trips.owner_vehicle_id — additive, nullable, no backfill ─────────────
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS owner_vehicle_id uuid
    REFERENCES public.owner_vehicles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.trips.owner_vehicle_id IS
  'Explicit Fleet Owner / Driver-cum-Owner vehicle reference for this trip. Nullable until assigned. Never inferred from owner_vehicles.owner_user_id or from an FO having exactly one vehicle — always set via an explicit driver action through set_trip_owner_vehicle(). ON DELETE SET NULL mirrors trips.driver_id / trips.vehicle_id — see 20250227120000_initial_schema.sql.';

CREATE INDEX IF NOT EXISTS idx_trips_owner_vehicle_id
  ON public.trips (owner_vehicle_id)
  WHERE owner_vehicle_id IS NOT NULL;

-- ── 2. set_trip_owner_vehicle — the only writer of trips.owner_vehicle_id ───
-- Dedicated SECURITY DEFINER RPC rather than a plain RLS-gated UPDATE: this
-- write has several conditions that must be evaluated together (assigned
-- driver + vehicle ownership + active vehicle + non-completed trip), the same
-- reasoning that replaced a broad driver UPDATE policy with a narrow RPC in
-- 20260518030000_security_fix_driver_trip_update.sql.
--
-- Contract (locked by the design-decision arc):
--   * trip must exist and be non-deleted.
--   * caller must be the trip's assigned driver (drivers.user_id = auth.uid()).
--   * trip must not be completed (mirrors updateTripAssignment()'s existing
--     "Cannot change driver or vehicle after the trip is completed" rule,
--     applied explicitly to this field rather than inherited by accident).
--   * p_owner_vehicle_id = NULL explicitly clears any existing value — no
--     separate "clear" endpoint. Mirrors updateTripAssignment()'s own
--     undefined-vs-null convention for trips.vehicle_id.
--   * p_owner_vehicle_id NOT NULL (setting) requires: the row exists, is
--     owned by the caller, is not soft-deleted, and has status = 'active' —
--     the same three-part ownership check plus active-only gate already used
--     by create_fleet_owner_capacity_story (20270210143000).
--   * Clearing (NULL) does not require an active-vehicle or ownership lookup
--     — only trip/caller/completed authorization, since there is no vehicle
--     to validate.
--   * Does not support "FO owns vehicle, a different driver operates it" —
--     that case is explicitly out of scope (roadmap flags it as a future
--     concept, not yet designed) and is not silently enabled here: the
--     assigned-driver check and the vehicle-owner check both resolve to
--     auth.uid(), so they are only ever satisfiable by the same person.
CREATE OR REPLACE FUNCTION public.set_trip_owner_vehicle(
  p_trip_id uuid,
  p_owner_vehicle_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trip    public.trips;
  v_vehicle public.owner_vehicles;
BEGIN
  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: trip %', p_trip_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = v_trip.driver_id AND d.user_id = (select auth.uid())
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller is not the assigned driver for this trip';
  END IF;

  IF v_trip.status = 'completed' THEN
    RAISE EXCEPTION 'invalid_state: cannot change the vehicle after the trip is completed';
  END IF;

  IF p_owner_vehicle_id IS NULL THEN
    UPDATE public.trips SET owner_vehicle_id = NULL, updated_at = now() WHERE id = p_trip_id;
    RETURN jsonb_build_object('ok', true, 'trip_id', p_trip_id, 'owner_vehicle_id', NULL);
  END IF;

  SELECT * INTO v_vehicle
  FROM public.owner_vehicles
  WHERE id = p_owner_vehicle_id
    AND owner_user_id = (select auth.uid())
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: owner vehicle % not found in your fleet', p_owner_vehicle_id;
  END IF;

  IF v_vehicle.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'invalid_state: vehicle is not active (current: %)', v_vehicle.status;
  END IF;

  UPDATE public.trips SET owner_vehicle_id = p_owner_vehicle_id, updated_at = now() WHERE id = p_trip_id;

  RETURN jsonb_build_object('ok', true, 'trip_id', p_trip_id, 'owner_vehicle_id', p_owner_vehicle_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_trip_owner_vehicle(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_trip_owner_vehicle(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.set_trip_owner_vehicle(uuid, uuid) IS
  'Explicitly set or clear a trip''s owner_vehicle_id. Caller must be the trip''s assigned driver. Setting (non-NULL) requires the vehicle to belong to the caller, be non-deleted, and active; clearing (NULL) skips those checks. Blocked once the trip is completed. Never infers a vehicle from ownership or vehicle count.';

-- ── 3. trips_driver_view — expose owner_vehicle_id to the driver app ────────
-- Same view body as 20270209143000_trips_driver_view_odometer_fields.sql
-- (the current definition) plus one added column. No other column removed
-- or renamed.
CREATE OR REPLACE VIEW public.trips_driver_view
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.driver_id,
  t.driver_display_trip_id,
  t.status,
  t.pickup_area AS pickup_location,
  t.pickup_area AS pickup_address,
  t.pickup_date AS pickup_scheduled_at,
  t.drop_location AS dropoff_location,
  t.drop_location AS dropoff_address,
  NULL::timestamp with time zone AS dropoff_scheduled_at,
  t.notes AS instructions,
  t.vehicle_id,
  t.pickup_lat,
  t.pickup_lon,
  t.drop_lat,
  t.drop_lon,
  t.started_at,
  t.created_at,
  t.updated_at,
  t.client_price,
  t.supplier_rate,
  t.driver_commission,
  t.distance,
  t.organization_id,
  t.source,
  t.supplier_id,
  t.completed_at,
  t.trip_number,
  t.indent_id,
  t.source_indent_id,
  public.org_display_name(t.organization_id) AS organization_name,
  -- Odometer / verification (driver Operations tab)
  t.start_odometer_km,
  t.end_odometer_km,
  t.odometer_distance_km,
  t.gps_distance_km,
  t.distance_discrepancy_km,
  t.distance_source,
  t.odometer_verification_state,
  t.odometer_notes,
  t.odometer_updated_at,
  -- Execution model for asset vs aggregate expense/odometer capabilities
  t.trip_payout_mode,
  -- Owner Vehicle Link (3B.4/3C follow-up) — nullable until explicitly assigned.
  t.owner_vehicle_id
FROM public.trips t
WHERE t.driver_id IN (
  SELECT d.id FROM public.drivers d WHERE d.user_id = (SELECT auth.uid())
);

COMMENT ON VIEW public.trips_driver_view IS
  'Driver-scoped trip projection (security_invoker; self-scopes via auth.uid()). '
  'organization_id + source are REQUIRED by the driver wallet to classify a trip '
  'as fleet vs open — removing either silently empties the Fleet Trips tab for '
  'every driver. organization_name is required to label WHICH fleet a trip '
  'belongs to: organizations RLS (is_org_member) blocks drivers from resolving '
  'it client-side. Odometer + trip_payout_mode columns power driver Operations. '
  'owner_vehicle_id (added by 20270211100000) is the explicit Fleet Owner '
  'vehicle link, nullable until set via set_trip_owner_vehicle(). '
  'Columns here must stay in sync with DriverTripRow in types/trip-views.ts.';
