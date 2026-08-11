-- Expose snapshot_rate_offer on driver Stories feed so FO/drivers see target price
-- (Business Pulse story / BidSheet parity). DROP required — RETURNS TABLE widened.

DROP FUNCTION IF EXISTS public.get_driver_reach_stories();

CREATE FUNCTION public.get_driver_reach_stories()
RETURNS TABLE (
  campaign_id            uuid,
  campaign_org_id        uuid,
  org_name               text,
  org_logo_url           text,
  campaign_status        text,
  published_at           timestamptz,
  expires_at             timestamptz,
  snapshot_post_type     text,
  snapshot_title         text,
  snapshot_origin        text,
  snapshot_destination   text,
  snapshot_vehicle_type  text,
  snapshot_material      text,
  snapshot_content       text,
  snapshot_rate_offer    numeric,
  driver_reward_enabled  boolean,
  reward_amount          bigint,
  reward_available       boolean,
  referral_id            uuid,
  referral_status        text,
  referral_reward_amount bigint,
  recommended_at         timestamptz,
  rewarded_at            timestamptz,
  post_id                uuid,
  direct_bid_status      text,
  direct_bid_amount      numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a driver';
  END IF;

  RETURN QUERY
  SELECT
    rc.id, rc.org_id, o.name, o.logo_url,
    rc.status, rc.published_at, rc.expires_at,
    rc.snapshot_post_type, rc.snapshot_title, rc.snapshot_origin, rc.snapshot_destination,
    rc.snapshot_vehicle_type, rc.snapshot_material, rc.snapshot_content,
    rc.snapshot_rate_offer,
    rc.driver_reward_enabled, rc.reward_amount,
    (rc.driver_reward_enabled AND rc.reward_reserved >= rc.reward_amount),
    r.id, r.status, r.reward_amount, r.created_at, r.rewarded_at,
    rc.post_id, db.status, db.amount
  FROM public.reach_campaigns rc
  JOIN public.organizations o ON o.id = rc.org_id
  LEFT JOIN public.reach_referrals r
    ON r.campaign_id = rc.id AND r.driver_user_id = v_uid
  LEFT JOIN public.driver_direct_bids db
    ON db.post_id = rc.post_id AND db.driver_user_id = v_uid
  LEFT JOIN LATERAL (
    SELECT b.id FROM public.bids b
    WHERE b.post_id = rc.post_id AND b.status = 'accepted'
    ORDER BY b.created_at DESC
    LIMIT 1
  ) won ON true
  WHERE (
      'driver' = ANY(rc.distribution_channels)
      OR (
        v_is_fo
        AND 'fleet' = ANY(rc.distribution_channels)
        AND upper(coalesce(rc.snapshot_post_type, '')) = 'LOAD'
      )
    )
    AND (
      (rc.status = 'active' AND (won.id IS NULL OR won.id = r.bid_id))
      OR r.status = 'rewarded'
    )
  ORDER BY (r.status = 'rewarded') DESC, rc.published_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_reach_stories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_reach_stories() TO authenticated;

COMMENT ON FUNCTION public.get_driver_reach_stories() IS
  'Driver Story tab: driver-channel boosted stories; FO also gets fleet-channel LOAD. Includes snapshot_rate_offer for Pulse bid UI parity.';
