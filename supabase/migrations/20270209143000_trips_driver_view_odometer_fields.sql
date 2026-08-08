-- Expose odometer verification + payout mode on trips_driver_view so driver
-- trip-detail Operations (odometer card + expense capabilities) can render
-- correctly when the client uses the driver view instead of a full trips SELECT.

BEGIN;

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
  t.trip_payout_mode
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
  'Columns here must stay in sync with DriverTripRow in types/trip-views.ts.';

COMMIT;
