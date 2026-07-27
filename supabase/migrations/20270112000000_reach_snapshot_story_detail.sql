-- Sponsored stories served from a campaign snapshot were unreachable.
--
-- get_network_feed Branch B renders a sponsored card from the campaign
-- snapshot when the source post row is gone (deleted or expired) but the
-- campaign is still active and paid. Clicking that card dead-ended on
-- "This broadcast is no longer available", because the /story-detail route
-- gate resolves the story through get_story_preview, which only ever read
-- public.posts — finding the dead row, or no row at all.
--
-- Two changes here:
--
-- 1. get_story_preview falls back to the campaign snapshot, mirroring
--    Branch B. Reports is_active = true and the campaign's expires_at so the
--    route gate's liveness checks pass for a campaign that is genuinely still
--    serving.
--
-- 2. are_orgs_connected_or_reach_target — the route gate previously required a
--    connection to view any story. That predates Reach: wave targeting
--    (reach_campaign_targets) deliberately delivers to orgs you are NOT
--    connected to, which is the product. Targeted recipients were shown
--    "Connect with <org> to bid" on a story they had been paid-for delivery of.
--
-- Preview exposes route/vehicle/expiry only — never spend, escrow, or purchase
-- state.

CREATE OR REPLACE FUNCTION public.get_story_preview(p_post_id uuid)
 RETURNS TABLE(
   id uuid, organization_id uuid, org_name text, type text, origin text,
   destination text, load_date date, vehicle_type text,
   expires_at timestamp with time zone, is_active boolean
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Branch A: the live post row.
  SELECT p.id, p.organization_id, o.name AS org_name, p.type, p.origin, p.destination,
    p.load_date, p.vehicle_type, p.expires_at, p.is_active
  FROM public.posts p
  JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.id = p_post_id

  UNION ALL

  -- Branch B: snapshot-served campaign (source story deleted/deactivated).
  -- Mirrors get_network_feed Branch B, including its awarded-load exclusion.
  SELECT
    COALESCE(rc.post_id, rc.id) AS id, rc.org_id AS organization_id, o.name AS org_name,
    COALESCE(rc.snapshot_post_type, 'UPDATE') AS type,
    rc.snapshot_origin AS origin, rc.snapshot_destination AS destination,
    NULL::date AS load_date, rc.snapshot_vehicle_type AS vehicle_type,
    rc.expires_at, true AS is_active
  FROM public.reach_campaigns rc
  JOIN public.organizations o ON o.id = rc.org_id
  WHERE rc.post_id = p_post_id
    AND rc.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.posts p2 WHERE p2.id = rc.post_id AND p2.is_active = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.bids ab
      WHERE ab.post_id = rc.post_id AND ab.status = 'accepted'
    )
  ORDER BY is_active DESC
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.get_story_preview(uuid) IS
  'Story-link preview. Falls back to the Reach campaign snapshot when the source post row is gone but the campaign is still active (mirrors get_network_feed Branch B), so paid sponsored impressions do not dead-end on "no longer available".';


-- Connection check for the /story-detail gate, widened for Reach.
CREATE OR REPLACE FUNCTION public.are_orgs_connected_or_reach_target(
  p_viewer_org uuid, p_author_org uuid, p_post_id uuid
)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    p_viewer_org IS NOT NULL
    AND p_author_org IS NOT NULL
    AND (
      p_viewer_org = p_author_org
      OR public.are_orgs_connected(p_viewer_org, p_author_org)
      -- Reach wave targeting delivers beyond your connections — that IS the
      -- product. A released target may open the story it was delivered.
      OR EXISTS (
        SELECT 1
        FROM public.reach_campaigns rc
        JOIN public.reach_campaign_targets t ON t.campaign_id = rc.id
        WHERE rc.post_id = p_post_id
          AND rc.status = 'active'
          AND t.org_id = p_viewer_org
          AND t.released_at <= now()
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.are_orgs_connected_or_reach_target(uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.are_orgs_connected_or_reach_target(uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.are_orgs_connected_or_reach_target(uuid, uuid, uuid) IS
  'Story-detail access check: connected orgs, or an org that is a released Reach wave target for this post. Reach delivers beyond existing connections by design.';
