-- Phase B: column-safe trip views for supplier and driver clients.
-- Shipper/dispatcher traffic continues on public.trips (unchanged).

-- Active org from JWT custom claim (optional); used by trips_supplier_view when set.
CREATE OR REPLACE FUNCTION public.auth_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(
    trim(
      COALESCE(
        current_setting('request.jwt.claim.org_id', true),
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')
      )
    ),
    ''
  )::uuid;
$$;

REVOKE ALL ON FUNCTION public.auth_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_org_id() TO authenticated;

COMMENT ON FUNCTION public.auth_org_id() IS
  'Optional active organization id from JWT (org_id claim). When null, supplier view falls back to membership-based scoping.';

-- Supplier-safe columns only (no trip_number, trip_code, trip_operational_code, organization_id).
CREATE OR REPLACE VIEW public.trips_supplier_view
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.booking_ref,
  t.source_indent_code,
  t.supplier_trip_sequence,
  t.status,
  t.pickup_area AS pickup_location,
  t.pickup_area AS pickup_address,
  t.pickup_date AS pickup_scheduled_at,
  t.drop_location AS dropoff_location,
  t.drop_location AS dropoff_address,
  NULL::timestamptz AS dropoff_scheduled_at,
  t.driver_id AS assigned_driver_id,
  t.driver_display_trip_id,
  t.vehicle_id,
  t.notes AS instructions,
  t.created_at,
  t.updated_at
FROM public.trips t
WHERE t.indent_id IS NOT NULL
  AND (
  -- Explicit active org (JWT) when present
  (
    public.auth_org_id() IS NOT NULL
    AND t.supplier_id IN (
      SELECT s.id
      FROM public.suppliers s
      WHERE s.linked_organization_id = public.auth_org_id()
    )
  )
  OR (
    public.auth_org_id() IS NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.suppliers s
        INNER JOIN public.organization_members om
          ON om.organization_id = s.linked_organization_id
        WHERE s.id = t.supplier_id
          AND om.user_id = auth.uid()
          AND om.status = 'active'
      )
      OR EXISTS (
        SELECT 1
        FROM public.direct_quotes dq
        INNER JOIN public.organization_members om
          ON om.organization_id = dq.bidder_organization_id
        WHERE dq.indent_id = t.indent_id
          AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
          AND om.user_id = auth.uid()
          AND om.status = 'active'
      )
    )
  )
);

COMMENT ON VIEW public.trips_supplier_view IS
  'Supplier-facing trip projection: hides trip_number, trip_code, trip_operational_code, organization_id.';

-- Driver-safe columns only (no booking_ref, trip_number, organization_id, supplier_id, trip codes).
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
  NULL::timestamptz AS dropoff_scheduled_at,
  t.notes AS instructions,
  t.vehicle_id,
  t.pickup_lat,
  t.pickup_lon,
  t.drop_lat,
  t.drop_lon,
  t.started_at,
  t.created_at,
  t.updated_at
FROM public.trips t
WHERE t.driver_id IN (
  SELECT d.id
  FROM public.drivers d
  WHERE d.user_id = auth.uid()
);

COMMENT ON VIEW public.trips_driver_view IS
  'Driver-facing trip projection: own assigned trips only; hides booking_ref and shipper operational ids.';

GRANT SELECT ON public.trips_supplier_view TO authenticated;
GRANT SELECT ON public.trips_driver_view TO authenticated;

-- Views use security_invoker so underlying trips RLS applies.

-- Supplier RPC now returns the safe projection (row filter still uses p_org_id + is_org_member).
DROP FUNCTION IF EXISTS public.get_trips_where_org_is_supplier(uuid);

CREATE OR REPLACE FUNCTION public.get_trips_where_org_is_supplier(p_org_id uuid)
RETURNS SETOF public.trips_supplier_view
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT DISTINCT ON (v.id) v.*
  FROM public.trips_supplier_view v
  INNER JOIN public.trips t ON t.id = v.id
  WHERE t.indent_id IS NOT NULL
    AND public.is_org_member(p_org_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.suppliers s
        WHERE s.id = t.supplier_id
          AND s.linked_organization_id = p_org_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.direct_quotes dq
        WHERE dq.indent_id = t.indent_id
          AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
          AND dq.bidder_organization_id = p_org_id
      )
    )
  ORDER BY v.id, v.created_at DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.get_trips_where_org_is_supplier(uuid) IS
  'Indent/load trips for supplier org (safe columns via trips_supplier_view).';

GRANT EXECUTE ON FUNCTION public.get_trips_where_org_is_supplier(uuid) TO authenticated;
