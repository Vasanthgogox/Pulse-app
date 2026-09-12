-- Expose trips.operating_mode + dco_payee_id on trips_driver_view so the
-- Driver App can apply DCO economics (driver-owned opex, DCO settlement)
-- without inferring DCO from payout mode or missing supplier_id.
-- Same view body as 20270211100000 plus two additive columns.

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
  t.start_odometer_km,
  t.end_odometer_km,
  t.odometer_distance_km,
  t.gps_distance_km,
  t.distance_discrepancy_km,
  t.distance_source,
  t.odometer_verification_state,
  t.odometer_notes,
  t.odometer_updated_at,
  t.trip_payout_mode,
  t.owner_vehicle_id,
  t.operating_mode,
  t.dco_payee_id
FROM public.trips t
WHERE t.driver_id IN (
  SELECT d.id FROM public.drivers d WHERE d.user_id = (SELECT auth.uid())
);

COMMENT ON VIEW public.trips_driver_view IS
  'Driver-scoped trip projection (security_invoker; self-scopes via auth.uid()). '
  'operating_mode + dco_payee_id (20270912140000) let the driver app treat DCO '
  'trips as driver-owned economics without collapsing them into Asset or Market. '
  'Columns here must stay in sync with DriverTripRow in types/trip-views.ts.';

COMMIT;
