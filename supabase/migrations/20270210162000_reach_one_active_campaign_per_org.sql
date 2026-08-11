-- Pulse Reach invariant: at most ONE draft/active campaign per organization.
--
-- Post-level unique index (idx_reach_campaigns_one_active_per_post) already
-- exists; boosting a *different* load bypassed it and spent more credits.
--
-- Precondition (enforced below): no org may already have >1 draft/active row.
-- AJIO duplicates were cancelled 2026-08-09 with cancel_reason =
-- 'org_one_active_invariant_cleanup' before this migration ships.
--
-- Intentionally NOT changing money → draft status handling here (separate
-- follow-up). This REPLACE keeps the live body and only adds the org guard.

-- ── 1. Refuse to add the unique index if violations remain ──────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.reach_campaigns
    WHERE status IN ('draft', 'active')
    GROUP BY org_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'precondition_failed: resolve multi draft/active reach_campaigns per org before creating idx_reach_campaigns_one_active_per_org';
  END IF;
END $$;

-- ── 2. DB authority: atomic one-draft/active-per-org ────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_reach_campaigns_one_active_per_org
  ON public.reach_campaigns (org_id)
  WHERE status IN ('draft', 'active');

COMMENT ON INDEX public.idx_reach_campaigns_one_active_per_org IS
  'Pulse Reach: one draft/active campaign per organization. Final authority against concurrent publishes; RPC pre-check maps violations to active_boost_exists.';

-- ── 3. RPC: clear pre-check before insert / credit deduct + race mapping ────

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
  v_constraint  text;
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

  -- Org-level invariant (application error). Must run before INSERT and before
  -- any increment_credit_wallet call. Unique index below is the race backstop.
  IF EXISTS (
    SELECT 1 FROM public.reach_campaigns
    WHERE org_id = p_org_id AND status IN ('draft', 'active')
  ) THEN
    RAISE EXCEPTION 'active_boost_exists: organization already has a draft or active Reach campaign';
  END IF;

  v_expires_at := now() + (v_plan.duration_hours || ' hours')::interval;

  BEGIN
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
  EXCEPTION
    WHEN unique_violation THEN
      -- Only remap the Reach one-active indexes. Other uniques (e.g. pkey)
      -- must surface unchanged.
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint IN (
        'idx_reach_campaigns_one_active_per_org',
        'idx_reach_campaigns_one_active_per_post'
      ) THEN
        RAISE EXCEPTION 'active_boost_exists: organization already has a draft or active Reach campaign';
      END IF;
      RAISE;
  END;

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
  'Publishes a Reach campaign. Enforces at most one draft/active campaign per org (active_boost_exists) before insert/credit spend; unique indexes backstop races. Money→draft payment-state is unchanged in this revision.';
