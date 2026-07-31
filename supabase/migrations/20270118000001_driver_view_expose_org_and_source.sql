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

-- ── Org name resolver ─────────────────────────────────────────────────────────
-- SECURITY DEFINER so a security_invoker view can label a row with its owning
-- org for a user who is NOT a member of that org (a driver seeing which fleet
-- dispatched their trip). Exposes only `name`, never any other org column.
CREATE OR REPLACE FUNCTION public.org_display_name(p_org_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT o.name FROM public.organizations o WHERE o.id = p_org_id;
$fn$;

COMMENT ON FUNCTION public.org_display_name(uuid) IS
  'Returns an organization display name, bypassing the is_org_member RLS policy. '
  'Exists so security_invoker views (trips_driver_view) can label a row with its '
  'owning org for users who are not members of that org — e.g. a driver seeing '
  'which fleet dispatched their trip. Exposes only the name.';

REVOKE ALL ON FUNCTION public.org_display_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_display_name(uuid) TO authenticated;

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
  -- ── Added: required for driver-side fleet/open classification ──────────────
  t.organization_id,
  t.source,
  t.supplier_id,
  t.completed_at,
  t.trip_number,
  t.indent_id,
  t.source_indent_id,
  -- Dispatching org's display name.
  --
  -- MUST go through org_display_name(). A plain `LEFT JOIN organizations` here
  -- returns NULL for every driver: the view is security_invoker, so the join runs
  -- under the CALLER's RLS, and the organizations policy is is_org_member(id) —
  -- a driver is never a member of the org that hires them. Verified by
  -- impersonating a driver (set role authenticated + their jwt sub): the join
  -- yielded NULL, the function yields the real name.
  public.org_display_name(t.organization_id) AS organization_name
FROM trips t
WHERE t.driver_id IN (
  SELECT d.id FROM drivers d WHERE d.user_id = auth.uid()
);

COMMENT ON VIEW public.trips_driver_view IS
  'Driver-scoped trip projection (security_invoker; self-scopes via auth.uid()). '
  'organization_id + source are REQUIRED by the driver wallet to classify a trip '
  'as fleet vs open — removing either silently empties the Fleet Trips tab for '
  'every driver. organization_name is required to label WHICH fleet a trip '
  'belongs to: organizations RLS (is_org_member) blocks drivers from resolving '
  'it client-side. Columns here must stay in sync with DriverTripRow in '
  'types/trip-views.ts; a field present in the type but absent here becomes a '
  'hardcoded default in the app with no runtime error. '
  'Guarded by scripts/check-driver-view-contract.ts.';

COMMIT;
