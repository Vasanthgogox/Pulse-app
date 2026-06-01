-- Latest assignment/reassignment audit row per trip (batch).
-- Replaces PostgREST .in(trip_id) over-fetch; DISTINCT ON returns one row per trip.
-- SECURITY DEFINER + explicit access check (matches trip_assignment_audit RLS).

CREATE INDEX IF NOT EXISTS idx_trip_assignment_audit_latest_assign
  ON public.trip_assignment_audit (trip_id, changed_at DESC)
  WHERE event_type IN ('assignment', 'reassignment');

CREATE OR REPLACE FUNCTION public.get_latest_assignment_audit_by_trip_ids(p_trip_ids uuid[])
RETURNS TABLE (
  trip_id uuid,
  changed_by uuid,
  changed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (a.trip_id)
    a.trip_id,
    a.changed_by,
    a.changed_at
  FROM public.trip_assignment_audit a
  WHERE p_trip_ids IS NOT NULL
    AND cardinality(p_trip_ids) > 0
    AND a.trip_id = ANY (p_trip_ids)
    AND a.event_type IN ('assignment', 'reassignment')
    AND EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = a.trip_id
        AND (
          public.is_org_member(t.organization_id)
          OR EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = t.driver_id
              AND d.user_id = auth.uid()
          )
        )
    )
  ORDER BY a.trip_id, a.changed_at DESC;
$$;

COMMENT ON FUNCTION public.get_latest_assignment_audit_by_trip_ids(uuid[]) IS
  'One latest assignment/reassignment audit row per trip_id. Caller must be org member or assigned driver (same as trip_assignment_audit SELECT RLS).';

GRANT EXECUTE ON FUNCTION public.get_latest_assignment_audit_by_trip_ids(uuid[]) TO authenticated;
