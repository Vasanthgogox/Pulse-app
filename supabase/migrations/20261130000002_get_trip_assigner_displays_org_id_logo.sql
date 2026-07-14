-- Driver assigner RPC: also return assigning org id + logo so the hero can
-- show shipper/fleet branding when trips_driver_view blanks organization_id.

DROP FUNCTION IF EXISTS public.get_trip_assigner_displays_for_driver(uuid[]);

CREATE FUNCTION public.get_trip_assigner_displays_for_driver(p_trip_ids uuid[])
 RETURNS TABLE(
   trip_id uuid,
   display_name text,
   assigner_user_id uuid,
   assigning_organization_name text,
   assigning_organization_id uuid,
   assigning_organization_logo_url text
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  caller AS (
    SELECT (SELECT auth.uid()) AS uid
  ),
  caller_phone AS (
    SELECT
      c.uid,
      right(
        regexp_replace(
          coalesce(p.phone, u.raw_user_meta_data->>'phone', ''),
          '\D', '', 'g'
        ),
        10
      ) AS normalized
    FROM caller c
    LEFT JOIN auth.users u ON u.id = c.uid
    LEFT JOIN public.profiles p ON p.id = c.uid
  ),
  requested AS (
    SELECT rt.trip_id
    FROM unnest(p_trip_ids) AS rt(trip_id)
  ),
  trip_base AS (
    SELECT
      t.id AS trip_id,
      t.driver_id,
      t.created_by_user_id,
      t.owner_user_id,
      t.assigned_by_user_id,
      t.organization_id,
      t.source,
      t.vehicle_id
    FROM requested r
    JOIN public.trips t ON t.id = r.trip_id
  ),
  visibility AS (
    SELECT
      tb.trip_id,
      (
        EXISTS (
          SELECT 1 FROM public.drivers d
          WHERE d.id = tb.driver_id
            AND d.user_id = cp.uid
        )
        OR (
          length(cp.normalized) >= 10
          AND EXISTS (
            SELECT 1
            FROM public.trip_otps o
            JOIN public.drivers d ON d.id = tb.driver_id
            WHERE o.trip_id = tb.trip_id
              AND o.used_at IS NULL
              AND o.expires_at > now()
              AND d.user_id IS NULL
              AND length(right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10)) >= 10
              AND right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10) = cp.normalized
              AND NOT (tb.source = 'direct_quote' AND tb.driver_id IS NOT NULL AND tb.vehicle_id IS NOT NULL)
          )
        )
      ) AS can_see
    FROM trip_base tb
    CROSS JOIN caller_phone cp
    WHERE cp.uid IS NOT NULL
  ),
  visible_trips AS (
    SELECT tb.*
    FROM trip_base tb
    JOIN visibility v ON v.trip_id = tb.trip_id AND v.can_see
  ),
  latest_audit AS (
    SELECT DISTINCT ON (a.trip_id)
      a.trip_id,
      a.changed_by
    FROM public.trip_assignment_audit a
    JOIN visible_trips vt ON vt.trip_id = a.trip_id
    WHERE a.changed_by IS NOT NULL
      AND a.event_type IN ('assignment', 'reassignment')
    ORDER BY a.trip_id, a.changed_at DESC
  ),
  resolved_assigner AS (
    SELECT
      vt.trip_id,
      vt.organization_id,
      coalesce(
        la.changed_by,
        vt.assigned_by_user_id,
        vt.created_by_user_id,
        vt.owner_user_id
      ) AS assigner_uid
    FROM visible_trips vt
    LEFT JOIN latest_audit la ON la.trip_id = vt.trip_id
  ),
  name_resolved AS (
    SELECT
      ra.trip_id,
      ra.organization_id,
      ra.assigner_uid,
      CASE
        WHEN ra.assigner_uid IS NULL THEN NULL
        WHEN p.id IS NOT NULL THEN
          coalesce(
            nullif(trim(p.full_name), ''),
            nullif(split_part(trim(p.email), '@', 1), ''),
            'Dispatcher'
          )
        ELSE
          coalesce(nullif(trim(pu.name), ''), 'Dispatcher')
      END AS display_name
    FROM resolved_assigner ra
    LEFT JOIN public.profiles p ON p.id = ra.assigner_uid
    LEFT JOIN public.users pu ON pu.id = ra.assigner_uid
  )
  SELECT
    nr.trip_id,
    nr.display_name,
    nr.assigner_uid AS assigner_user_id,
    nullif(trim(o.name), '') AS assigning_organization_name,
    o.id AS assigning_organization_id,
    nullif(trim(o.logo_url), '') AS assigning_organization_logo_url
  FROM name_resolved nr
  LEFT JOIN public.organizations o ON o.id = nr.organization_id;
$function$;

COMMENT ON FUNCTION public.get_trip_assigner_displays_for_driver(uuid[]) IS
  'Driver-safe assigner person + assigning org name/id/logo for trip ids the caller can see.';

GRANT EXECUTE ON FUNCTION public.get_trip_assigner_displays_for_driver(uuid[]) TO authenticated;
