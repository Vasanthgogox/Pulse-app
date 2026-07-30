-- Follow-up to 20260729090658_driver_org_name_security_definer_fn.sql, which
-- is timestamped before 20260828200000_operational_identity_codes_phase1.sql
-- (this file), the migration that actually adds trips.source_indent_id. On a
-- from-scratch replay, that earlier migration now guards itself to skip
-- creating trips_driver_view when the column doesn't exist yet (see that
-- file), so the view needs to be (re)created here instead, once the column
-- is guaranteed to exist. No-op on any environment where the earlier
-- migration already created it (CREATE OR REPLACE is idempotent).
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
  public.org_display_name(t.organization_id) AS organization_name
FROM trips t
WHERE t.driver_id IN (
  SELECT d.id FROM drivers d WHERE d.user_id = auth.uid()
);

COMMENT ON VIEW public.trips_driver_view IS
  'Driver-scoped trip projection (security_invoker; self-scopes via auth.uid()). organization_id + source are REQUIRED by the driver wallet to classify a trip as fleet vs open - removing either silently empties the Fleet Trips tab. organization_name MUST be resolved via public.org_display_name(): a plain JOIN to organizations returns NULL here because security_invoker applies the caller RLS and drivers are not org members. Columns must stay in sync with DriverTripRow in types/trip-views.ts. Guarded by scripts/check-driver-view-contract.ts.';
