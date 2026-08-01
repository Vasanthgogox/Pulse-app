SELECT
  count(*)::int AS branch_b_candidates,
  count(*) FILTER (WHERE rc.snapshot_rate_offer IS NOT NULL)::int AS with_price,
  count(*) FILTER (WHERE rc.snapshot_rate_offer IS NULL)::int AS missing_price,
  count(*) FILTER (WHERE rc.snapshot_origin IS NULL)::int AS missing_origin,
  count(*) FILTER (WHERE rc.snapshot_destination IS NULL)::int AS missing_destination,
  count(*) FILTER (WHERE public.indent_open_for_marketplace_bids(
    coalesce(rc.snapshot_source_indent_id, (SELECT p.source_indent_id FROM public.posts p WHERE p.id = rc.post_id))
  ))::int AS still_open_indent
FROM public.reach_campaigns rc
WHERE rc.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.posts p2
    WHERE p2.id = rc.post_id
      AND CASE
        WHEN upper(coalesce(p2.type,''))='LOAD' AND p2.source_indent_id IS NOT NULL
          THEN public.indent_open_for_marketplace_bids(p2.source_indent_id)
        ELSE p2.is_active
      END
  );
