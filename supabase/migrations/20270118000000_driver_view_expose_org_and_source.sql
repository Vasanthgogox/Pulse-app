-- ============================================================================
-- trips_driver_view: expose the fields the driver app classifies on.
--
-- ROOT CAUSE (verified live 2026-07-29):
--   The view projected 23 columns and omitted organization_id, source,
--   supplier_id and completed_at. types/trip-views.ts:driverRowToTripRow
--   therefore hardcoded `organization_id: ''` and `source: 'assigned'`.
--
--   DriverWalletScreen classifies a trip with:
--     const isFleetOwnerTrip = isEmployerOrgAtDate(tripOrgId)
--   and isEmployerOrgAtDate opens with `if (!orgId) return false`.
--
--   With organization_id always '', that check returned false for EVERY driver
--   trip. Consequence: the Fleet Trips tab was structurally always empty for
--   every driver, all completed fleet work rendered as "Direct trip" under Open
--   Trips, and drivers filed attribution requests to claim work the app had
--   already recorded — the spurious "Attribution requests" operators see.
--
--   This is independent of 20270117000000 (mover_asset status sync). That fixed
--   the status; this fixes the classification. Both were required.
--
-- SAFETY:
--   security_invoker = true is preserved and the WHERE clause still self-scopes
--   to driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()), so a
--   driver still sees only their own rows. The added columns describe trips the
--   driver personally ran; no other org's data is exposed.
--
-- PERMANENCE:
--   A view silently dropping a column is invisible at runtime — the mapper fills
--   a plausible default and classification quietly fails. Guarding against a
--   repeat:
--     1. COMMENT ON VIEW states the columns are load-bearing.
--     2. The regression test in types/__tests__/trip-views.test.ts asserts the
--        mapper never hardcodes organization_id/source.
--     3. scripts/check-driver-view-contract.ts fails CI if a DriverTripRow field
--        is missing from the view.
-- ============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.trips_driver_view
WITH (security_invoker = true) AS
SELECT
  id,
  driver_id,
  driver_display_trip_id,
  status,
  pickup_area AS pickup_location,
  pickup_area AS pickup_address,
  pickup_date AS pickup_scheduled_at,
  drop_location AS dropoff_location,
  drop_location AS dropoff_address,
  NULL::timestamp with time zone AS dropoff_scheduled_at,
  notes AS instructions,
  vehicle_id,
  pickup_lat,
  pickup_lon,
  drop_lat,
  drop_lon,
  started_at,
  created_at,
  updated_at,
  client_price,
  supplier_rate,
  driver_commission,
  distance,
  -- ── Added: required for driver-side fleet/open classification ──────────────
  organization_id,
  source,
  supplier_id,
  completed_at,
  trip_number,
  indent_id,
  source_indent_id
FROM trips t
WHERE driver_id IN (
  SELECT d.id FROM drivers d WHERE d.user_id = auth.uid()
);

COMMENT ON VIEW public.trips_driver_view IS
  'Driver-scoped trip projection (security_invoker; self-scopes via auth.uid()). '
  'organization_id + source are REQUIRED by the driver wallet to classify a trip '
  'as fleet vs open — removing either silently empties the Fleet Trips tab for '
  'every driver. Columns here must stay in sync with DriverTripRow in '
  'types/trip-views.ts; a field present in the type but absent here becomes a '
  'hardcoded default in the app with no runtime error. '
  'Guarded by scripts/check-driver-view-contract.ts.';

COMMIT;
