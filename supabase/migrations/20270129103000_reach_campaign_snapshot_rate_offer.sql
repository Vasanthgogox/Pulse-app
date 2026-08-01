-- P0.1: reach_campaigns' snapshot columns (title/origin/destination/vehicle/
-- material/content/posted_at, added in 20261230000000) never included a
-- price. Branch B of get_network_feed (campaign-snapshot fallback once the
-- source post is gone) therefore had no rate_offer to show even before this
-- session's Branch B fix (20270129000000) -- it hardcoded NULL because
-- there was nothing else to select. Independent of that fix: a legitimately
-- still-open snapshot-served campaign (source post deleted while the load
-- was still biddable) should keep showing its price, and couldn't.

ALTER TABLE public.reach_campaigns
  ADD COLUMN IF NOT EXISTS snapshot_rate_offer numeric;

-- Best-effort backfill, same guard pattern as the original snapshot backfill
-- (20261230000000): only fills rows that predate this migration and still
-- have a live, linked post to read a price from. publish_reach_campaign
-- below captures it going forward for every new campaign.
UPDATE public.reach_campaigns rc
SET snapshot_rate_offer = p.rate_offer
FROM public.posts p
WHERE p.id = rc.post_id AND rc.snapshot_rate_offer IS NULL;

CREATE OR REPLACE FUNCTION public.publish_reach_campaign(
  p_org_id                uuid,
  p_post_id               uuid,
  p_plan_id               uuid,
  p_payment_method        text,
  p_distribution_channels text[] DEFAULT ARRAY['fleet'],
  p_driver_reward_enabled boolean DEFAULT false,
  p_reward_type           text    DEFAULT 'flat',
  p_reward_amount         bigint  DEFAULT 0,
  p_reward_budget         bigint  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan        record;
  v_post        record;
  v_campaign_id uuid;
  v_purchase_id uuid;
  v_status      text;
  v_expires_at  timestamptz;
  v_escrow      bigint := 0;
  v_wave1       integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id AND user_id = (select auth.uid()) AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of the boosting organization';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id AND organization_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: post % does not belong to org %', p_post_id, p_org_id;
  END IF;

  SELECT * INTO v_plan FROM public.reach_plans WHERE id = p_plan_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: reach plan % is not active', p_plan_id;
  END IF;

  IF p_payment_method NOT IN ('credits', 'money') THEN
    RAISE EXCEPTION 'invalid_payment_method: %', p_payment_method;
  END IF;

  IF NOT (p_distribution_channels <@ ARRAY['fleet','driver']::text[])
     OR COALESCE(array_length(p_distribution_channels, 1), 0) < 1 THEN
    RAISE EXCEPTION 'invalid_distribution: channels must be a non-empty subset of {fleet,driver}';
  END IF;

  IF p_driver_reward_enabled THEN
    IF p_reward_type <> 'flat' THEN
      RAISE EXCEPTION 'invalid_reward_type: only flat rewards are supported in this release';
    END IF;
    IF NOT ('driver' = ANY(p_distribution_channels)) THEN
      RAISE EXCEPTION 'invalid_reward_config: driver rewards require the driver distribution channel';
    END IF;
    IF p_reward_amount <= 0 OR p_reward_budget < p_reward_amount THEN
      RAISE EXCEPTION 'invalid_reward_config: reward amount must be > 0 and budget >= one reward';
    END IF;
    v_escrow := p_reward_budget;
  END IF;

  v_expires_at := now() + (v_plan.duration_hours || ' hours')::interval;

  INSERT INTO public.reach_campaigns (
    org_id, post_id, created_by, plan_id, status, published_at, expires_at,
    snapshot_post_type, snapshot_title, snapshot_origin, snapshot_destination,
    snapshot_vehicle_type, snapshot_material, snapshot_content, snapshot_posted_at,
    snapshot_rate_offer,
    snapshot_source_indent_id,
    distribution_channels, driver_reward_enabled, reward_type,
    reward_amount, reward_budget, reward_reserved
  )
  VALUES (
    p_org_id, p_post_id, (select auth.uid()), p_plan_id, 'active', now(), v_expires_at,
    v_post.type,
    COALESCE(v_post.material, CASE WHEN v_post.type = 'LOAD' THEN 'Load' ELSE 'Update' END),
    v_post.origin, v_post.destination, v_post.vehicle_type, v_post.material, v_post.content, v_post.created_at,
    v_post.rate_offer,
    v_post.source_indent_id,
    p_distribution_channels, p_driver_reward_enabled, p_reward_type,
    CASE WHEN p_driver_reward_enabled THEN p_reward_amount ELSE 0 END,
    CASE WHEN p_driver_reward_enabled THEN p_reward_budget ELSE 0 END,
    v_escrow
  )
  RETURNING id INTO v_campaign_id;

  -- Structured delivery: wave 1 (40% of the plan cap, verified-first) is
  -- allocated immediately — the campaign starts DELIVERED, not discoverable.
  v_wave1 := public.fn_allocate_reach_targets(
    v_campaign_id, 1::smallint, public.fn_reach_wave_size(v_plan.estimated_reach_max, 1::smallint)
  );

  IF v_escrow > 0 THEN
    PERFORM public.increment_credit_wallet(
      p_org_id, 'reserve_referral', -v_escrow,
      'reach_campaign', v_campaign_id, 'Referral escrow: ' || v_plan.name
    );
  END IF;

  IF p_payment_method = 'credits' THEN
    PERFORM public.increment_credit_wallet(
      p_org_id, 'spend_reach', -v_plan.credit_price,
      'reach_campaign_purchase', v_campaign_id, 'Boost: ' || v_plan.name
    );
    v_status := 'paid';
  ELSE
    v_status := 'pending';
  END IF;

  INSERT INTO public.reach_campaign_purchases
    (campaign_id, plan_id, payment_method, credits_charged, amount_inr_charged, status)
  VALUES (
    v_campaign_id, p_plan_id, p_payment_method,
    CASE WHEN p_payment_method = 'credits' THEN v_plan.credit_price ELSE 0 END,
    CASE WHEN p_payment_method = 'money' THEN v_plan.price_inr ELSE 0 END,
    v_status
  )
  RETURNING id INTO v_purchase_id;

  PERFORM public.emit_platform_event(
    'ReachCampaignPublished', p_org_id,
    jsonb_build_object(
      'campaign_id', v_campaign_id, 'post_id', p_post_id, 'plan_code', v_plan.code,
      'payment_method', p_payment_method,
      'distribution_channels', p_distribution_channels,
      'driver_reward_enabled', p_driver_reward_enabled,
      'reward_escrow', v_escrow,
      'wave1_targets', v_wave1
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', v_campaign_id,
    'purchase_id', v_purchase_id,
    'purchase_status', v_status,
    'plan_code', v_plan.code,
    'expires_at', v_expires_at,
    'reward_escrow', v_escrow,
    'wave1_targets', v_wave1
  );
END;
$$;

COMMENT ON FUNCTION public.publish_reach_campaign(uuid, uuid, uuid, text, text[], boolean, text, bigint, bigint) IS
  'Publishes a Reach campaign, snapshotting the source post''s identity fields (including rate_offer, added here) so the campaign survives source-story deletion/deactivation as an accurate, independently-priced record.';
