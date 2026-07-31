-- public.are_orgs_connected(uuid, uuid) is called by
-- 20270112000000_reach_snapshot_story_detail.sql's are_orgs_connected_or_reach_target,
-- and by the pre-Reach /story-detail route gate this migration widens, but is
-- never created by any migration in this repo -- it exists on production
-- from a change made outside the tracked migration history. Restoring it
-- here from the schema it's used against: connection_requests is a directed
-- request (from_organization_id -> to_organization_id) with
-- status IN ('pending','approved','rejected'); two orgs are "connected" once
-- either direction has been approved.
CREATE OR REPLACE FUNCTION public.are_orgs_connected(p_org_a uuid, p_org_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.connection_requests cr
    WHERE cr.status = 'approved'
      AND (
        (cr.from_organization_id = p_org_a AND cr.to_organization_id = p_org_b)
        OR (cr.from_organization_id = p_org_b AND cr.to_organization_id = p_org_a)
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.are_orgs_connected(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.are_orgs_connected(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.are_orgs_connected(uuid, uuid) IS
  'True if two orgs have an approved connection_requests row in either direction. Restored from production usage (see 20270111120000) -- not previously tracked as a migration.';
