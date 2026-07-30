-- The LEFT JOIN to organizations inside trips_driver_view returns NULL for drivers:
-- the view is security_invoker, so the join runs under the caller's RLS, and
-- `organizations` policy is is_org_member(id) — a driver is never a member of the
-- org that hires them. Resolve the name through a SECURITY DEFINER function instead.
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
  'Returns an organization display name, bypassing the is_org_member RLS policy. Exists so security_invoker views (trips_driver_view) can label a row with its owning org for users who are not members of that org - e.g. a driver seeing which fleet dispatched their trip. Exposes only the name, never any other org column.';

REVOKE ALL ON FUNCTION public.org_display_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_display_name(uuid) TO authenticated;

-- Guarded: source_indent_id doesn't exist on public.trips yet at this point on
-- a from-scratch replay (added by 20260828200000_operational_identity_codes_phase1.sql,
-- a month later). Backfilled by 20260828200001_trips_driver_view_backfill.sql
-- once the column exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = to_regclass('public.trips')
      AND attname = 'source_indent_id' AND attnum > 0 AND NOT attisdropped
  ) THEN
    EXECUTE $exec$
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
    $exec$;
  END IF;
END $$;
