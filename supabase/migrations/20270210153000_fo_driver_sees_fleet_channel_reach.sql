-- Fleet Owner (driver-cum-owner) must see Business Boosted LOAD Stories that
-- were distributed on the fleet channel. Today get_driver_reach_stories only
-- returns 'driver' channel campaigns; active boosts are often fleet-only.
-- FO has no Business org, so fleet-channel Reach never lands via get_network_feed.
--
-- Also widen submit_driver_direct_bid so an independent FO can Bid Now on a
-- fleet-channel story they can now see (same post, still driver_direct_bids).
-- Does not change organic FO capacity / VEHICLE_AVAILABILITY 3B.1 path.

CREATE OR REPLACE FUNCTION public.get_driver_reach_stories()
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
      -- Ordinary drivers: driver-channel Reach only.
      'driver' = ANY(rc.distribution_channels)
      -- Driver-cum-Fleet Owner: also fleet-channel Boosted LOADs (no personal org).
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

COMMENT ON FUNCTION public.get_driver_reach_stories() IS
  'Driver Story tab: driver-channel boosted stories for all drivers; Fleet Owners also receive fleet-channel boosted LOAD stories (they have no Business org for Network fleet Reach). Organic FO capacity Stories are separate (posts / get_network_feed).';

CREATE OR REPLACE FUNCTION public.submit_driver_direct_bid(
  p_post_id uuid,
  p_amount  numeric,
  p_note    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bid_id uuid;
  v_is_fo boolean := public.is_driver_fleet_owner(v_uid);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role = 'driver')
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = v_uid AND om.role = 'driver' AND om.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a driver';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  -- Live boost the caller may see: driver channel for everyone; fleet channel
  -- for Fleet Owners (matches get_driver_reach_stories audience).
  IF NOT EXISTS (
    SELECT 1
    FROM public.reach_campaigns rc
    JOIN public.posts p ON p.id = rc.post_id
    WHERE rc.post_id = p_post_id
      AND rc.status = 'active'
      AND p.is_active
      AND (
        'driver' = ANY (rc.distribution_channels)
        OR (
          v_is_fo
          AND 'fleet' = ANY (rc.distribution_channels)
          AND upper(coalesce(rc.snapshot_post_type, p.type, '')) = 'LOAD'
        )
      )
  ) THEN
    RAISE EXCEPTION 'not_biddable: post % is not an active story for this driver', p_post_id;
  END IF;

  INSERT INTO public.driver_direct_bids (post_id, driver_user_id, amount, note)
  VALUES (p_post_id, v_uid, p_amount, NULLIF(TRIM(COALESCE(p_note, '')), ''))
  ON CONFLICT (post_id, driver_user_id) DO UPDATE SET
    amount = EXCLUDED.amount,
    note = EXCLUDED.note,
    updated_at = now()
  WHERE public.driver_direct_bids.status = 'pending'
  RETURNING id INTO v_bid_id;

  IF v_bid_id IS NULL THEN
    RAISE EXCEPTION 'bid_locked: an existing decided bid cannot be changed';
  END IF;

  RETURN jsonb_build_object('bid_id', v_bid_id, 'post_id', p_post_id, 'amount', p_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_driver_direct_bid(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_driver_direct_bid(uuid, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.submit_driver_direct_bid(uuid, numeric, text) IS
  'Independent driver (incl. Fleet Owner) bids on a live Reach story as themselves — no organization. Driver-channel for all drivers; fleet-channel LOAD also allowed for is_driver_fleet_owner. Award/acceptance not built here.';
