-- Pulse Boost V2 — driver distribution + referral incentive escrow.
--
-- Extends the EXISTING reach_campaigns model (no new product):
--   • distribution_channels: campaign can target fleet-owner and/or driver
--     story feeds. Default '{fleet}' — existing campaigns/flow unchanged.
--   • Driver referral rewards (flat only in v1; reward_type is flexible so
--     percentage can be added later WITHOUT a schema change).
--   • Referral Escrow: reward_budget is reserved from the org's Pulse Credits
--     wallet at publish (wallet lock — a liability, NOT revenue; only the
--     boost fee is revenue). Unspent escrow auto-refunds when the campaign
--     ends (expiry or cancellation). No manual finance work.
--   • reach_referrals: driver recommendation pipeline. Drivers never bid
--     directly — they recommend to their fleet owner; reward releases ONLY on
--     conversion (recommend → approve → bid → trip awarded → trip starts).
--
-- Denomination: rewards/escrow are in Pulse Credits (the platform wallet that
-- can actually enforce a lock). reward_type='flat' only for v1 by CHECK in
-- publish; percentage intentionally rejected (percentage-of-what ambiguity).

-- ── 1. Campaign columns (spec field names) ──────────────────────────────────

ALTER TABLE public.reach_campaigns
  ADD COLUMN IF NOT EXISTS distribution_channels text[] NOT NULL DEFAULT '{fleet}',
  ADD COLUMN IF NOT EXISTS driver_reward_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reward_type           text    NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS reward_amount         bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_budget         bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_reserved       bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_paid           bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_refunded       bigint  NOT NULL DEFAULT 0;

ALTER TABLE public.reach_campaigns
  DROP CONSTRAINT IF EXISTS reach_campaigns_reward_type_check;
ALTER TABLE public.reach_campaigns
  ADD CONSTRAINT reach_campaigns_reward_type_check
  CHECK (reward_type IN ('flat', 'percentage'));

ALTER TABLE public.reach_campaigns
  DROP CONSTRAINT IF EXISTS reach_campaigns_distribution_channels_check;
ALTER TABLE public.reach_campaigns
  ADD CONSTRAINT reach_campaigns_distribution_channels_check
  CHECK (distribution_channels <@ ARRAY['fleet','driver']::text[]
         AND array_length(distribution_channels, 1) >= 1);

COMMENT ON COLUMN public.reach_campaigns.reward_reserved IS
  'Referral Escrow still locked for this campaign (credits). Reserved from the org wallet at publish; decremented on payout; refunded on completion.';

-- ── 2. Ledger types for escrow lifecycle ────────────────────────────────────

ALTER TABLE public.pulse_credit_transactions
  DROP CONSTRAINT IF EXISTS pulse_credit_transactions_type_check;
ALTER TABLE public.pulse_credit_transactions
  ADD CONSTRAINT pulse_credit_transactions_type_check
  CHECK (type IN (
    'earn_referral', 'earn_verification', 'spend_reach',
    'admin_adjustment', 'refund', 'expiry',
    'reserve_referral', 'referral_refund'
  ));

-- ── 3. Referral pipeline table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reach_referrals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid        NOT NULL REFERENCES public.reach_campaigns(id) ON DELETE CASCADE,
  driver_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fleet_org_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status         text        NOT NULL DEFAULT 'recommended' CHECK (status IN (
                   'recommended', 'approved', 'rejected',
                   'bid_submitted', 'rewarded', 'expired'
                 )),
  -- Snapshot of the campaign's flat reward at recommendation time — a later
  -- campaign edit can never change what a driver was promised.
  reward_amount  bigint      NOT NULL DEFAULT 0,
  bid_id         uuid        REFERENCES public.bids(id) ON DELETE SET NULL,
  trip_id        uuid        REFERENCES public.trips(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz,
  rewarded_at    timestamptz,
  UNIQUE (campaign_id, driver_user_id)
);

CREATE INDEX IF NOT EXISTS idx_reach_referrals_campaign ON public.reach_referrals(campaign_id);
CREATE INDEX IF NOT EXISTS idx_reach_referrals_fleet_org ON public.reach_referrals(fleet_org_id, status);
CREATE INDEX IF NOT EXISTS idx_reach_referrals_driver ON public.reach_referrals(driver_user_id);

ALTER TABLE public.reach_referrals ENABLE ROW LEVEL SECURITY;

-- Reads: the driver themself, the fleet org receiving the recommendation, and
-- the campaign owner org (analytics). All WRITES go through SECURITY DEFINER
-- RPCs below — no direct insert/update/delete policies.
DROP POLICY IF EXISTS reach_referrals_select ON public.reach_referrals;
CREATE POLICY reach_referrals_select ON public.reach_referrals
  FOR SELECT TO authenticated
  USING (
    driver_user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = reach_referrals.fleet_org_id
        AND om.user_id = (select auth.uid()) AND om.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.reach_campaigns rc
      JOIN public.organization_members om ON om.organization_id = rc.org_id
      WHERE rc.id = reach_referrals.campaign_id
        AND om.user_id = (select auth.uid()) AND om.status = 'active'
    )
  );

-- ── 4. publish_reach_campaign — optional driver distribution + escrow ──────
-- Signature extended with DEFAULTed params: existing 4-arg client calls keep
-- working unchanged (backward compatible). Old signature dropped so PostgREST
-- doesn't see an ambiguous overload.

DROP FUNCTION IF EXISTS public.publish_reach_campaign(uuid, uuid, uuid, text);

CREATE FUNCTION public.publish_reach_campaign(
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
    -- v1 policy: flat rewards only. reward_type stays flexible in the schema
    -- so percentage can ship later without a migration.
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
    snapshot_source_indent_id,
    distribution_channels, driver_reward_enabled, reward_type,
    reward_amount, reward_budget, reward_reserved
  )
  VALUES (
    p_org_id, p_post_id, (select auth.uid()), p_plan_id, 'active', now(), v_expires_at,
    v_post.type,
    COALESCE(v_post.material, CASE WHEN v_post.type = 'LOAD' THEN 'Load' ELSE 'Update' END),
    v_post.origin, v_post.destination, v_post.vehicle_type, v_post.material, v_post.content, v_post.created_at,
    v_post.source_indent_id,
    p_distribution_channels, p_driver_reward_enabled, p_reward_type,
    CASE WHEN p_driver_reward_enabled THEN p_reward_amount ELSE 0 END,
    CASE WHEN p_driver_reward_enabled THEN p_reward_budget ELSE 0 END,
    v_escrow
  )
  RETURNING id INTO v_campaign_id;

  -- Referral Escrow: wallet lock, NOT revenue. Reserved in credits regardless
  -- of how the boost fee itself is paid — raises insufficient_credits (and
  -- rolls back the whole publish) if the wallet can't cover it.
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
      'reward_escrow', v_escrow
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', v_campaign_id,
    'purchase_id', v_purchase_id,
    'purchase_status', v_status,
    'plan_code', v_plan.code,
    'expires_at', v_expires_at,
    'reward_escrow', v_escrow
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_reach_campaign(uuid, uuid, uuid, text, text[], boolean, text, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_reach_campaign(uuid, uuid, uuid, text, text[], boolean, text, bigint, bigint) TO authenticated;

-- ── 5. Escrow release helper (shared by expiry + cancellation) ─────────────

CREATE OR REPLACE FUNCTION public.fn_release_reach_referral_escrow(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campaign record;
BEGIN
  SELECT * INTO v_campaign FROM public.reach_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND OR v_campaign.reward_reserved <= 0 THEN
    RETURN;
  END IF;

  PERFORM public.increment_credit_wallet(
    v_campaign.org_id, 'referral_refund', v_campaign.reward_reserved,
    'reach_campaign', p_campaign_id, 'Referral escrow refund (campaign ended)'
  );

  UPDATE public.reach_campaigns
  SET reward_refunded = reward_refunded + reward_reserved,
      reward_reserved = 0
  WHERE id = p_campaign_id;

  -- Pending recommendations can no longer convert once the campaign is over.
  UPDATE public.reach_referrals
  SET status = 'expired'
  WHERE campaign_id = p_campaign_id
    AND status IN ('recommended', 'approved', 'bid_submitted');
END;
$$;

REVOKE ALL ON FUNCTION public.fn_release_reach_referral_escrow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_release_reach_referral_escrow(uuid) TO service_role;

-- Expiry cron: complete + auto-refund remaining escrow (was a pure UPDATE).
CREATE OR REPLACE FUNCTION public.fn_expire_reach_campaigns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    WITH expired AS (
      UPDATE public.reach_campaigns
      SET status = 'completed', completed_at = now()
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < now()
      RETURNING id
    )
    SELECT id FROM expired
  LOOP
    PERFORM public.fn_release_reach_referral_escrow(v_id);
  END LOOP;
END;
$$;

-- Cancellation refunds remaining escrow too (the no-refund policy covers the
-- boost FEE only — escrow is a reservation and must always return).
CREATE OR REPLACE FUNCTION public.cancel_reach_campaign(
  p_campaign_id uuid,
  p_reason      text DEFAULT 'user_cancelled'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campaign record;
BEGIN
  SELECT * INTO v_campaign FROM public.reach_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: reach campaign %', p_campaign_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_campaign.org_id AND user_id = (select auth.uid()) AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of the boosting organization';
  END IF;

  IF v_campaign.status NOT IN ('draft', 'active') THEN
    RAISE EXCEPTION 'invalid_state: only a draft or active campaign can be cancelled (current: %)', v_campaign.status;
  END IF;

  UPDATE public.reach_campaigns
  SET status = 'cancelled', cancel_reason = p_reason, archived_at = now()
  WHERE id = p_campaign_id;

  PERFORM public.fn_release_reach_referral_escrow(p_campaign_id);

  PERFORM public.emit_platform_event(
    'ReachCampaignCancelled', v_campaign.org_id,
    jsonb_build_object('campaign_id', p_campaign_id, 'reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true, 'campaign_id', p_campaign_id, 'status', 'cancelled', 'reason', p_reason);
END;
$$;

-- ── 6. Referral pipeline RPCs ───────────────────────────────────────────────

-- Driver recommends a boosted load to their fleet owner. Drivers never bid
-- directly with the shipper.
CREATE OR REPLACE FUNCTION public.recommend_reach_campaign(
  p_campaign_id uuid,
  p_fleet_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campaign    record;
  v_referral_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_fleet_org_id AND user_id = (select auth.uid())
      AND status = 'active' AND role = 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be an active driver of the fleet organization';
  END IF;

  SELECT * INTO v_campaign FROM public.reach_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: reach campaign %', p_campaign_id;
  END IF;
  IF v_campaign.status <> 'active' THEN
    RAISE EXCEPTION 'invalid_state: campaign is not active (current: %)', v_campaign.status;
  END IF;
  IF NOT ('driver' = ANY(v_campaign.distribution_channels)) THEN
    RAISE EXCEPTION 'invalid_channel: campaign is not distributed to drivers';
  END IF;
  IF v_campaign.org_id = p_fleet_org_id THEN
    RAISE EXCEPTION 'invalid_target: cannot recommend a campaign to its own organization';
  END IF;
  IF v_campaign.driver_reward_enabled
     AND v_campaign.reward_reserved < v_campaign.reward_amount THEN
    RAISE EXCEPTION 'escrow_exhausted: referral budget for this campaign is used up';
  END IF;

  INSERT INTO public.reach_referrals (campaign_id, driver_user_id, fleet_org_id, reward_amount)
  VALUES (
    p_campaign_id, (select auth.uid()), p_fleet_org_id,
    CASE WHEN v_campaign.driver_reward_enabled THEN v_campaign.reward_amount ELSE 0 END
  )
  ON CONFLICT (campaign_id, driver_user_id) DO NOTHING
  RETURNING id INTO v_referral_id;

  IF v_referral_id IS NULL THEN
    RAISE EXCEPTION 'duplicate: you already recommended this campaign';
  END IF;

  PERFORM public.emit_platform_event(
    'ReachReferralRecommended', p_fleet_org_id,
    jsonb_build_object('referral_id', v_referral_id, 'campaign_id', p_campaign_id)
  );

  RETURN jsonb_build_object('ok', true, 'referral_id', v_referral_id, 'reward_amount',
    CASE WHEN v_campaign.driver_reward_enabled THEN v_campaign.reward_amount ELSE 0 END);
END;
$$;

REVOKE ALL ON FUNCTION public.recommend_reach_campaign(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recommend_reach_campaign(uuid, uuid) TO authenticated;

-- Fleet owner approves / rejects a driver recommendation. Approval unlocks the
-- NORMAL bid flow (fleet owner edits quote and bids as usual — unchanged).
CREATE OR REPLACE FUNCTION public.decide_reach_referral(
  p_referral_id uuid,
  p_approve     boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referral record;
BEGIN
  SELECT * INTO v_referral FROM public.reach_referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: referral %', p_referral_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_referral.fleet_org_id AND user_id = (select auth.uid())
      AND status = 'active' AND role <> 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a non-driver member of the fleet organization';
  END IF;

  IF v_referral.status <> 'recommended' THEN
    RAISE EXCEPTION 'invalid_state: referral already decided (current: %)', v_referral.status;
  END IF;

  UPDATE public.reach_referrals
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      decided_at = now()
  WHERE id = p_referral_id;

  RETURN jsonb_build_object('ok', true, 'referral_id', p_referral_id,
    'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END;
$$;

REVOKE ALL ON FUNCTION public.decide_reach_referral(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_reach_referral(uuid, boolean) TO authenticated;

-- Links the fleet owner's submitted bid to the referral (conversion tracking).
CREATE OR REPLACE FUNCTION public.mark_reach_referral_bid(
  p_referral_id uuid,
  p_bid_id      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referral record;
BEGIN
  SELECT * INTO v_referral FROM public.reach_referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: referral %', p_referral_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_referral.fleet_org_id AND user_id = (select auth.uid()) AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of the fleet organization';
  END IF;

  IF v_referral.status <> 'approved' THEN
    RAISE EXCEPTION 'invalid_state: referral must be approved before a bid (current: %)', v_referral.status;
  END IF;

  UPDATE public.reach_referrals
  SET status = 'bid_submitted', bid_id = p_bid_id
  WHERE id = p_referral_id;

  RETURN jsonb_build_object('ok', true, 'referral_id', p_referral_id, 'status', 'bid_submitted');
END;
$$;

REVOKE ALL ON FUNCTION public.mark_reach_referral_bid(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_reach_referral_bid(uuid, uuid) TO authenticated;

-- Reward release — ONLY on full conversion (trip awarded AND started). Moves
-- escrow reserved → paid atomically; driver earnings derive from rewarded
-- referral rows (pending = recommended/approved/bid_submitted).
CREATE OR REPLACE FUNCTION public.convert_reach_referral(
  p_referral_id uuid,
  p_trip_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referral record;
  v_campaign record;
  v_trip     record;
BEGIN
  SELECT * INTO v_referral FROM public.reach_referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: referral %', p_referral_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_referral.fleet_org_id AND user_id = (select auth.uid()) AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of the fleet organization';
  END IF;

  IF v_referral.status <> 'bid_submitted' THEN
    RAISE EXCEPTION 'invalid_state: referral must have a submitted bid (current: %)', v_referral.status;
  END IF;

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: trip %', p_trip_id;
  END IF;

  SELECT * INTO v_campaign FROM public.reach_campaigns WHERE id = v_referral.campaign_id FOR UPDATE;

  IF v_referral.reward_amount > 0 THEN
    IF v_campaign.reward_reserved < v_referral.reward_amount THEN
      RAISE EXCEPTION 'escrow_exhausted: remaining escrow cannot cover this reward';
    END IF;
    UPDATE public.reach_campaigns
    SET reward_reserved = reward_reserved - v_referral.reward_amount,
        reward_paid     = reward_paid + v_referral.reward_amount
    WHERE id = v_campaign.id;
  END IF;

  UPDATE public.reach_referrals
  SET status = 'rewarded', trip_id = p_trip_id, rewarded_at = now()
  WHERE id = p_referral_id;

  PERFORM public.emit_platform_event(
    'ReachReferralRewarded', v_referral.fleet_org_id,
    jsonb_build_object(
      'referral_id', p_referral_id, 'campaign_id', v_referral.campaign_id,
      'driver_user_id', v_referral.driver_user_id, 'trip_id', p_trip_id,
      'reward_amount', v_referral.reward_amount
    )
  );

  RETURN jsonb_build_object('ok', true, 'referral_id', p_referral_id,
    'status', 'rewarded', 'reward_amount', v_referral.reward_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.convert_reach_referral(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_reach_referral(uuid, uuid) TO authenticated;

COMMENT ON TABLE public.reach_referrals IS
  'Boost V2 driver referral pipeline: recommended -> approved -> bid_submitted -> rewarded (or rejected/expired). Reward releases only on conversion; unspent campaign escrow auto-refunds at completion.';
