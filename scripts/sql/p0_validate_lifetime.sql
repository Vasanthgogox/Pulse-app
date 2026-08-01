WITH open_stories AS (
  SELECT p.id AS post_id, p.source_indent_id, p.is_active AS row_active,
         p.rate_offer, p.expires_at, p.created_at,
         i.status AS indent_status,
         public.indent_open_for_marketplace_bids(p.source_indent_id) AS open_for_bids,
         (p.expires_at IS NOT NULL AND p.expires_at < now()) AS past_expires_at,
         (p.created_at + interval '24 hours' < now()) AS past_24h_clock
  FROM public.posts p
  JOIN public.indents i ON i.id = p.source_indent_id
  WHERE upper(coalesce(p.type,'')) = 'LOAD'
    AND p.source_indent_id IS NOT NULL
    AND p.created_at > now() - interval '90 days'
)
SELECT
  count(*)::int AS load_stories_90d,
  count(*) FILTER (WHERE open_for_bids)::int AS backend_says_open,
  count(*) FILTER (WHERE open_for_bids AND past_expires_at)::int AS open_but_past_expires_at,
  count(*) FILTER (WHERE open_for_bids AND past_24h_clock)::int AS open_but_past_24h,
  count(*) FILTER (WHERE open_for_bids AND NOT coalesce(row_active,false))::int AS open_but_row_inactive,
  count(*) FILTER (WHERE open_for_bids AND rate_offer IS NULL)::int AS open_missing_rate_offer,
  count(*) FILTER (WHERE NOT open_for_bids AND indent_status = 'awarded')::int AS awarded_closed_ok
FROM open_stories;
