-- P0.1 follow-on: Branch B must not serve awarded loads, and must not wipe the
-- indent-owned lifetime rules from 20270128104000_reach_story_lifetime_from_indent.
--
-- Prior bug: Branch B used "NOT EXISTS accepted bids" to detect award, but the
-- live award path writes direct_quotes + indents.status — never bids.status.
-- Also: this migration previously recreated get_network_feed with
-- WHERE p.is_active = true only, which would undo indent-owned visibility.
--
-- Combined authority:
--   Branch A LOAD+indent → indent_open_for_marketplace_bids (+ owner history)
--   Branch B → campaign active, post projection inactive, indent not terminal,
--              snapshot_rate_offer for price (column from 20270129000000)

CREATE OR REPLACE FUNCTION public.get_network_feed(p_org_id uuid, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
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
  SELECT * FROM (
    -- Branch A: live posts. Indent-linked LOAD visibility follows indent lifecycle.
    SELECT
      p.id, p.organization_id, o.name AS org_name, o.avatar_seed AS org_avatar_seed, o.logo_url AS org_avatar_url,
      p.author_user_id, p.type, p.content, p.origin, p.destination, p.load_date, p.vehicle_type, p.weight_tonnes,
      p.rate_offer, p.material, p.expires_at,
      CASE
        WHEN upper(coalesce(p.type, '')) = 'LOAD' AND p.source_indent_id IS NOT NULL
          THEN public.indent_open_for_marketplace_bids(p.source_indent_id)
        ELSE p.is_active
      END AS is_active,
      p.view_count,
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
    WHERE
      (
        (
          upper(coalesce(p.type, '')) = 'LOAD'
          AND p.source_indent_id IS NOT NULL
          AND public.indent_open_for_marketplace_bids(p.source_indent_id)
        )
        OR (
          upper(coalesce(p.type, '')) = 'LOAD'
          AND p.source_indent_id IS NOT NULL
          AND p.organization_id = p_org_id
        )
        OR (
          NOT (
            upper(coalesce(p.type, '')) = 'LOAD'
            AND p.source_indent_id IS NOT NULL
          )
          AND p.is_active = true
        )
      )
      AND (
        p.organization_id = p_org_id
        OR p.organization_id IN (
          SELECT cr.to_organization_id FROM public.connection_requests cr
          WHERE cr.from_organization_id = p_org_id AND cr.status = 'approved'
          UNION
          SELECT cr.from_organization_id FROM public.connection_requests cr
          WHERE cr.to_organization_id = p_org_id AND cr.status = 'approved'
        )
        OR (
          rc.status = 'active'
          AND EXISTS (
            SELECT 1 FROM public.reach_campaign_targets t
            WHERE t.campaign_id = rc.id AND t.org_id = p_org_id AND t.released_at <= now()
          )
        )
      )

    UNION ALL

    -- Branch B: snapshot-served campaigns (source story deleted/deactivated).
    SELECT
      COALESCE(rc.post_id, rc.id) AS id, rc.org_id AS organization_id,
      o.name AS org_name, o.avatar_seed AS org_avatar_seed, o.logo_url AS org_avatar_url,
      rc.created_by AS author_user_id,
      COALESCE(rc.snapshot_post_type, 'UPDATE') AS type,
      rc.snapshot_content AS content, rc.snapshot_origin AS origin, rc.snapshot_destination AS destination,
      NULL::date AS load_date, rc.snapshot_vehicle_type AS vehicle_type, NULL::numeric AS weight_tonnes,
      rc.snapshot_rate_offer AS rate_offer, rc.snapshot_material AS material,
      rc.expires_at, true AS is_active, 0 AS view_count,
      COALESCE(b.cnt, 0) AS bid_count,
      COALESCE(rc.snapshot_posted_at, rc.published_at) AS created_at,
      rc.snapshot_source_indent_id AS source_indent_id,
      true AS is_sponsored, rc.id AS reach_campaign_id
    FROM public.reach_campaigns rc
    JOIN public.organizations o ON o.id = rc.org_id
    LEFT JOIN (
      SELECT post_id, count(*) AS cnt FROM public.bids GROUP BY post_id
    ) b ON b.post_id = rc.post_id
    LEFT JOIN public.indents ind ON ind.id = COALESCE(
      rc.snapshot_source_indent_id,
      (SELECT p3.source_indent_id FROM public.posts p3 WHERE p3.id = rc.post_id)
    )
    WHERE rc.status = 'active'
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
      AND (
        ind.id IS NULL
        OR public.indent_open_for_marketplace_bids(ind.id)
      )
      AND (
        rc.org_id = p_org_id
        OR EXISTS (
          SELECT 1 FROM public.reach_campaign_targets t
          WHERE t.campaign_id = rc.id AND t.org_id = p_org_id AND t.released_at <= now()
        )
      )
  ) feed
  ORDER BY feed.is_sponsored DESC, feed.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$function$;

COMMENT ON FUNCTION public.get_network_feed(uuid, integer, integer) IS
  'Network feed. Indent-linked LOAD stories use indent_open_for_marketplace_bids. Branch B serves campaign snapshots with snapshot_rate_offer while the linked indent (if any) is still open for bids.';
