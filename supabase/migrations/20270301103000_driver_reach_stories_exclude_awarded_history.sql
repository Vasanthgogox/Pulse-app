-- Driver LOADS / story reel = open opportunities only.
--
-- Bug: get_driver_reach_stories kept rows with
--   OR db.status = 'accepted'
--   OR r.status = 'rewarded'
-- so awarded / converted loads stayed in the driver story queue forever
-- ("Bid accepted by shipper" segments after the indent became a trip).
--
-- Rule (product): once an indent is awarded / assigned / converted to a trip,
-- it must leave the story reel. History / earnings stay on Wallet / History —
-- not in the active story preview.

CREATE OR REPLACE FUNCTION public.get_driver_reach_stories()
RETURNS TABLE (
  campaign_id uuid,
  campaign_org_id uuid,
  org_name text,
  org_logo_url text,
  campaign_status text,
  published_at timestamp with time zone,
  expires_at timestamp with time zone,
  snapshot_post_type text,
  snapshot_title text,
  snapshot_origin text,
  snapshot_destination text,
  snapshot_vehicle_type text,
  snapshot_material text,
  snapshot_content text,
  snapshot_rate_offer numeric,
  driver_reward_enabled boolean,
  reward_amount bigint,
  reward_available boolean,
  referral_id uuid,
  referral_status text,
  referral_reward_amount bigint,
  recommended_at timestamp with time zone,
  rewarded_at timestamp with time zone,
  post_id uuid,
  direct_bid_status text,
  direct_bid_amount numeric,
  direct_bid_counter_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_is_fo boolean := public.is_driver_fleet_owner(v_uid);
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role = 'driver')
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = v_uid AND om.role = 'driver' AND om.status = 'active'
    )
    OR v_is_fo
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a driver';
  END IF;

  RETURN QUERY
  SELECT
    rc.id,
    rc.org_id,
    o.name,
    o.logo_url,
    rc.status,
    rc.published_at,
    rc.expires_at,
    rc.snapshot_post_type,
    rc.snapshot_title,
    rc.snapshot_origin,
    rc.snapshot_destination,
    rc.snapshot_vehicle_type,
    rc.snapshot_material,
    rc.snapshot_content,
    rc.snapshot_rate_offer,
    rc.driver_reward_enabled,
    rc.reward_amount,
    (rc.driver_reward_enabled AND rc.reward_reserved >= rc.reward_amount),
    r.id,
    r.status,
    r.reward_amount,
    r.created_at,
    r.rewarded_at,
    rc.post_id,
    db.status,
    db.amount,
    db.counter_amount
  FROM public.reach_campaigns rc
  JOIN public.organizations o ON o.id = rc.org_id
  LEFT JOIN public.posts p ON p.id = rc.post_id
  LEFT JOIN public.reach_referrals r
    ON r.campaign_id = rc.id AND r.driver_user_id = v_uid
  LEFT JOIN public.driver_direct_bids db
    ON db.post_id = rc.post_id AND db.driver_user_id = v_uid
  LEFT JOIN LATERAL (
    SELECT b.id
    FROM public.bids b
    WHERE b.post_id = rc.post_id
      AND b.status = 'accepted'
    ORDER BY b.created_at DESC
    LIMIT 1
  ) market_won ON true
  LEFT JOIN LATERAL (
    SELECT ddb.id
    FROM public.driver_direct_bids ddb
    WHERE ddb.post_id = rc.post_id
      AND ddb.status = 'accepted'
    ORDER BY ddb.created_at DESC
    LIMIT 1
  ) direct_won ON true
  WHERE (
      'driver' = ANY (rc.distribution_channels)
      OR (
        v_is_fo
        AND 'fleet' = ANY (rc.distribution_channels)
        AND upper(coalesce(rc.snapshot_post_type, '')) = 'LOAD'
      )
    )
    AND rc.status = 'active'
    AND (rc.expires_at IS NULL OR rc.expires_at > now())
    -- No marketplace award and no accepted direct bid (any driver).
    AND market_won.id IS NULL
    AND direct_won.id IS NULL
    -- Caller's own bid must still be open (pending / none). Rejected = history.
    AND (db.status IS NULL OR db.status = 'pending')
    -- Indent-linked loads leave the reel when the indent is no longer open
    -- (awarded / completed / cancelled / …) or already executing as a trip.
    AND (
      coalesce(rc.snapshot_source_indent_id, p.source_indent_id) IS NULL
      OR (
        public.indent_open_for_marketplace_bids(
          coalesce(rc.snapshot_source_indent_id, p.source_indent_id)
        )
        AND lower(trim(coalesce(
          (SELECT i.status::text FROM public.indents i
           WHERE i.id = coalesce(rc.snapshot_source_indent_id, p.source_indent_id)),
          ''
        ))) <> ALL (ARRAY['assigned', 'deployed']::text[])
      )
    )
  ORDER BY rc.published_at DESC;
END;
$function$;

COMMENT ON FUNCTION public.get_driver_reach_stories() IS
  'Driver Story / LOADS reel: active boosted opportunities only. Excludes awarded / accepted / rejected / rewarded history and indent-terminal loads (those belong on Wallet / History / trips).';

REVOKE ALL ON FUNCTION public.get_driver_reach_stories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_reach_stories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_reach_stories() TO service_role;
