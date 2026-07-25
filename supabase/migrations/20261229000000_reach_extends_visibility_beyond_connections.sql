-- Real bug, not a rendering issue: get_network_feed only ever showed a post
-- to the owning org or orgs already connected to it. A boosted campaign got
-- zero extended reach — it just sorted higher among people who could already
-- see it, so an org with no existing connection to the booster could never
-- see the sponsored post at all. That's the opposite of what "reach 25/60/150
-- verified fleet owners" is supposed to mean.
--
-- Fix: an ACTIVE-campaign (sponsored) post is now visible network-wide, not
-- gated on an existing connection_requests row.
--
-- What this does NOT yet do (still the deferred audience-matching engine,
-- see ADR-009 / the Phase 2 revision notes): it doesn't filter recipients to
-- specifically "verified fleet owners", and it doesn't enforce the plan's
-- exact estimated_reach_max as a hard cap on how many distinct orgs ever see
-- it — every org on the platform can currently see any active sponsored
-- post. That precision is real future work, not something to fake here.

DROP FUNCTION IF EXISTS public.get_network_feed(uuid, integer, integer);

CREATE FUNCTION public.get_network_feed(p_org_id uuid, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS TABLE(
   id uuid, organization_id uuid, org_name text, org_avatar_seed text, org_avatar_url text,
   author_user_id uuid, type text, content text, origin text, destination text, load_date date,
   vehicle_type text, weight_tonnes numeric, rate_offer numeric, material text,
   expires_at timestamp with time zone, is_active boolean, view_count integer, bid_count bigint,
   created_at timestamp with time zone, source_indent_id uuid,
   is_sponsored boolean, reach_campaign_id uuid
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id, p.organization_id, o.name AS org_name, o.avatar_seed AS org_avatar_seed, o.logo_url AS org_avatar_url,
    p.author_user_id, p.type, p.content, p.origin, p.destination, p.load_date, p.vehicle_type, p.weight_tonnes,
    p.rate_offer, p.material, p.expires_at, p.is_active, p.view_count,
    COALESCE(b.cnt, 0) AS bid_count, p.created_at, p.source_indent_id,
    (rc.status = 'active') AS is_sponsored, rc.id AS reach_campaign_id
  FROM public.posts p
  JOIN public.organizations o ON o.id = p.organization_id
  LEFT JOIN (
    SELECT post_id, count(*) AS cnt FROM public.bids GROUP BY post_id
  ) b ON b.post_id = p.id
  LEFT JOIN LATERAL (
    SELECT rc2.id, rc2.status FROM public.reach_campaigns rc2
    WHERE rc2.post_id = p.id
    ORDER BY rc2.created_at DESC
    LIMIT 1
  ) rc ON true
  WHERE p.is_active = true
    AND (
      p.organization_id = p_org_id
      OR p.organization_id IN (
        SELECT cr.to_organization_id FROM public.connection_requests cr
        WHERE cr.from_organization_id = p_org_id AND cr.status = 'approved'
        UNION
        SELECT cr.from_organization_id FROM public.connection_requests cr
        WHERE cr.to_organization_id = p_org_id AND cr.status = 'approved'
      )
      OR rc.status = 'active'  -- sponsored posts reach beyond your existing connections
    )
  ORDER BY (rc.status = 'active') DESC, p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$function$;

COMMENT ON FUNCTION public.get_network_feed(uuid, integer, integer) IS
  'Network feed. Sponsored (active-campaign) posts are visible platform-wide, not just to connected orgs — that IS the Reach product: paying to extend visibility beyond your existing connections. Not yet audience-filtered or reach-capped (deferred audience-matching engine).';
