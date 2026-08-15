-- Fix: story-detail unreachable for a snapshot-only Reach campaign (source
-- post deleted/deactivated) — the same "no longer available" screen the
-- 20270215190000 fix did NOT cover, because the gap is upstream of it, in
-- get_story_preview itself.
--
-- get_network_feed's Branch B (snapshot-served campaigns) hands the client
-- id = COALESCE(rc.post_id, rc.id) — when the original post is gone,
-- rc.post_id is NULL, so the id shown and tapped is rc.id, the campaign's
-- own id. But get_story_preview's snapshot lookup branch matched on
-- `WHERE rc.post_id = p_post_id`, and `NULL = p_post_id` is never true in
-- SQL. So a still-active, boosted campaign whose source story was deleted
-- could never be found by the exact id the feed displayed it under — every
-- tap into it landed on the generic "may have been deleted" screen,
-- regardless of whether the campaign (and its underlying indent) was still
-- perfectly live.
--
-- Fix: match on the same coalesced id the feed handed out, not on
-- rc.post_id alone.

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
  SELECT p.id, p.organization_id, o.name AS org_name, p.type, p.origin, p.destination,
    p.load_date, p.vehicle_type, p.expires_at,
    CASE
      WHEN upper(coalesce(p.type, '')) = 'LOAD' AND p.source_indent_id IS NOT NULL
        THEN public.indent_open_for_marketplace_bids(p.source_indent_id)
      ELSE p.is_active
    END AS is_active
  FROM public.posts p
  JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.id = p_post_id

  UNION ALL

  SELECT
    COALESCE(rc.post_id, rc.id) AS id, rc.org_id AS organization_id, o.name AS org_name,
    COALESCE(rc.snapshot_post_type, 'UPDATE') AS type,
    rc.snapshot_origin AS origin, rc.snapshot_destination AS destination,
    NULL::date AS load_date, rc.snapshot_vehicle_type AS vehicle_type,
    rc.expires_at, true AS is_active
  FROM public.reach_campaigns rc
  JOIN public.organizations o ON o.id = rc.org_id
  WHERE COALESCE(rc.post_id, rc.id) = p_post_id
    AND rc.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.posts p2
      WHERE p2.id = rc.post_id
        AND (
          CASE
            WHEN upper(coalesce(p2.type, '')) = 'LOAD' AND p2.source_indent_id IS NOT NULL
              THEN public.indent_open_for_marketplace_bids(p2.source_indent_id)
            ELSE p2.is_active
          END
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.bids ab
      WHERE ab.post_id = rc.post_id AND ab.status = 'accepted'
    )
    AND (
      rc.snapshot_source_indent_id IS NULL
      OR public.indent_open_for_marketplace_bids(rc.snapshot_source_indent_id)
    )
  ORDER BY is_active DESC
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.get_story_preview(uuid) IS
  'Story-link preview. Indent-linked LOAD is_active mirrors indent_open_for_marketplace_bids; falls back to Reach campaign snapshot when live projection is gone but indent (if any) is still open. Snapshot branch matches on COALESCE(rc.post_id, rc.id) — the same id get_network_feed hands out for a post-less snapshot row (20270215200000 fix; rc.post_id alone is NULL and never matches when the source post was deleted).';
