-- Gate 2: list candidates that can be forced onto get_network_feed Branch B.
-- Requirement: active Reach campaign + indent still open for bids + live post.

SELECT
  p.id AS post_id,
  rc.id AS campaign_id,
  p.organization_id AS shipper_org_id,
  i.id AS indent_id,
  i.status AS indent_status,
  p.is_active AS post_active,
  rc.snapshot_rate_offer,
  rc.snapshot_origin,
  rc.snapshot_destination,
  rc.snapshot_vehicle_type,
  rc.snapshot_material,
  public.indent_open_for_marketplace_bids(
    coalesce(rc.snapshot_source_indent_id, p.source_indent_id)
  ) AS indent_open
FROM public.reach_campaigns rc
JOIN public.posts p ON p.id = rc.post_id
JOIN public.indents i ON i.id = coalesce(rc.snapshot_source_indent_id, p.source_indent_id)
WHERE rc.status = 'active'
  AND p.is_active = true
  AND public.indent_open_for_marketplace_bids(
    coalesce(rc.snapshot_source_indent_id, p.source_indent_id)
  )
ORDER BY rc.published_at DESC NULLS LAST
LIMIT 20;
