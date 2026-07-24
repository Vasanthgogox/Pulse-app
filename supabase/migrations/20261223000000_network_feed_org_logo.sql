-- get_network_feed: surface the org logo + real avatar seed so story bubbles
-- render the organization image instead of a text-initials cover.
-- (Return type changes → must DROP before CREATE.)
DROP FUNCTION IF EXISTS public.get_network_feed(uuid, integer, integer);

CREATE FUNCTION public.get_network_feed(p_org_id uuid, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, organization_id uuid, org_name text, org_avatar_seed text, org_avatar_url text, author_user_id uuid, type text, content text, origin text, destination text, load_date date, vehicle_type text, weight_tonnes numeric, rate_offer numeric, material text, expires_at timestamp with time zone, is_active boolean, view_count integer, bid_count bigint, created_at timestamp with time zone, source_indent_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.organization_id,
    o.name AS org_name,
    o.avatar_seed AS org_avatar_seed,
    o.logo_url AS org_avatar_url,
    p.author_user_id,
    p.type,
    p.content,
    p.origin,
    p.destination,
    p.load_date,
    p.vehicle_type,
    p.weight_tonnes,
    p.rate_offer,
    p.material,
    p.expires_at,
    p.is_active,
    p.view_count,
    COALESCE(b.cnt, 0) AS bid_count,
    p.created_at,
    p.source_indent_id
  FROM public.posts p
  JOIN public.organizations o ON o.id = p.organization_id
  LEFT JOIN (
    SELECT post_id, count(*) AS cnt FROM public.bids GROUP BY post_id
  ) b ON b.post_id = p.id
  WHERE p.is_active = true
    AND (
      p.organization_id = p_org_id
      OR p.organization_id IN (
        SELECT cr.to_organization_id
        FROM public.connection_requests cr
        WHERE cr.from_organization_id = p_org_id AND cr.status = 'approved'
        UNION
        SELECT cr.from_organization_id
        FROM public.connection_requests cr
        WHERE cr.to_organization_id = p_org_id AND cr.status = 'approved'
      )
    )
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$function$;
