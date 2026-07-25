-- Three pre-deployment refinements, all still local (nothing pushed yet):
-- 1. get_reach_org_summary -> nested jsonb (wallet_balance/campaigns/metrics/
--    reach), future-proof shape even though reach.promised/delivered are
--    computed simply today (no day-bounded live-tail split — see below).
-- 2. upgrade_reach_campaign -> extends entitlement instead of resetting the
--    clock to "now + new duration".
-- 3. reward_rules.key -> no longer a fixed enum, so new growth rules (this
--    IS the "Growth configuration model" — verification_approved and
--    referral_milestone_verified are already DB rows, not hardcoded; this
--    just stops requiring a migration to add the next one).

-- ── 1. get_reach_org_summary — nested jsonb ─────────────────────────────────
-- reach.promised/delivered are computed directly from reach_events (lifetime
-- count per active campaign, capped at that campaign's estimated_reach_max),
-- not through the daily_metrics+live-tail split the other 4 metrics use —
-- simpler, and for 24-72h campaigns the daily rollup rarely has a prior-day
-- row anyway, so the difference is negligible in practice.

DROP FUNCTION IF EXISTS public.get_reach_org_summary(uuid);

CREATE FUNCTION public.get_reach_org_summary(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wallet_balance bigint;
  v_impressions    bigint;
  v_views          bigint;
  v_bids           bigint;
  v_credits_used   bigint;
  v_active         bigint;
  v_completed      bigint;
  v_total          bigint;
  v_promised       bigint;
  v_delivered      bigint;
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_org_id AND user_id = (select auth.uid()) AND status = 'active'
    )
    OR public.has_platform_permission((select auth.uid()), 'analytics.view')
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of org % or hold analytics.view', p_org_id;
  END IF;

  SELECT COALESCE(balance, 0) INTO v_wallet_balance
  FROM public.pulse_credit_wallets WHERE org_id = p_org_id;
  v_wallet_balance := COALESCE(v_wallet_balance, 0);

  SELECT
    count(*) FILTER (WHERE status = 'active'),
    count(*) FILTER (WHERE status = 'completed'),
    count(*)
  INTO v_active, v_completed, v_total
  FROM public.reach_campaigns WHERE org_id = p_org_id;

  v_impressions := COALESCE((SELECT sum(m.impressions) FROM public.reach_campaign_daily_metrics m JOIN public.reach_campaigns rc ON rc.id = m.campaign_id WHERE rc.org_id = p_org_id), 0)::bigint
    + COALESCE((SELECT count(*) FROM public.reach_events e JOIN public.reach_campaigns rc ON rc.id = e.campaign_id WHERE rc.org_id = p_org_id AND e.event_type = 'impression' AND e.created_at >= date_trunc('day', now())), 0);
  v_views := COALESCE((SELECT sum(m.views) FROM public.reach_campaign_daily_metrics m JOIN public.reach_campaigns rc ON rc.id = m.campaign_id WHERE rc.org_id = p_org_id), 0)::bigint
    + COALESCE((SELECT count(*) FROM public.reach_events e JOIN public.reach_campaigns rc ON rc.id = e.campaign_id WHERE rc.org_id = p_org_id AND e.event_type = 'view' AND e.created_at >= date_trunc('day', now())), 0);
  v_bids := COALESCE((SELECT sum(m.bids) FROM public.reach_campaign_daily_metrics m JOIN public.reach_campaigns rc ON rc.id = m.campaign_id WHERE rc.org_id = p_org_id), 0)::bigint
    + COALESCE((SELECT count(*) FROM public.bids b JOIN public.reach_campaigns rc ON rc.post_id = b.post_id WHERE rc.org_id = p_org_id AND b.created_at >= date_trunc('day', now())), 0);
  v_credits_used := COALESCE((SELECT sum(m.credits_used) FROM public.reach_campaign_daily_metrics m JOIN public.reach_campaigns rc ON rc.id = m.campaign_id WHERE rc.org_id = p_org_id), 0)::bigint
    + COALESCE((SELECT sum(-t.amount) FROM public.pulse_credit_transactions t JOIN public.reach_campaigns rc ON rc.id = t.reference_id AND t.reference_type = 'reach_campaign_purchase' WHERE rc.org_id = p_org_id AND t.type = 'spend_reach' AND t.created_at >= date_trunc('day', now())), 0)::bigint;

  SELECT COALESCE(sum(rp.estimated_reach_max), 0) INTO v_promised
  FROM public.reach_campaigns rc JOIN public.reach_plans rp ON rp.id = rc.plan_id
  WHERE rc.org_id = p_org_id AND rc.status = 'active';

  SELECT COALESCE(sum(LEAST(COALESCE(ev.cnt, 0), rp.estimated_reach_max)), 0) INTO v_delivered
  FROM public.reach_campaigns rc
  JOIN public.reach_plans rp ON rp.id = rc.plan_id
  LEFT JOIN (
    SELECT campaign_id, count(*) AS cnt FROM public.reach_events
    WHERE event_type = 'impression' GROUP BY campaign_id
  ) ev ON ev.campaign_id = rc.id
  WHERE rc.org_id = p_org_id AND rc.status = 'active';

  RETURN jsonb_build_object(
    'wallet_balance', v_wallet_balance,
    'campaigns', jsonb_build_object('active', v_active, 'completed', v_completed, 'total', v_total),
    'metrics', jsonb_build_object('impressions', v_impressions, 'views', v_views, 'bids', v_bids, 'credits_used', v_credits_used),
    'reach', jsonb_build_object('promised', v_promised, 'delivered', v_delivered)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_reach_org_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reach_org_summary(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_reach_org_summary IS
  'Overall Reach overview for an org: wallet balance, campaign counts, 4 core metrics, and reach promised/delivered. Nested jsonb shape is deliberately future-proof.';

-- ── 2. upgrade_reach_campaign — extend entitlement, don't restart the clock ─
-- Example: boosted 9:00am on Starter (24h, expires 9:00am+1d). Upgraded to
-- Growth (48h) at 8:45am the next day. New expiry = published_at + 48h =
-- 9:00am+2d — exactly what buying Growth from the start would have given.
-- GREATEST(...) guards against ever moving expires_at backwards, in case a
-- future plan config ever has a shorter duration at a higher price tier.

CREATE OR REPLACE FUNCTION public.upgrade_reach_campaign(
  p_campaign_id     uuid,
  p_new_plan_id     uuid,
  p_payment_method  text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campaign     record;
  v_old_plan     record;
  v_new_plan     record;
  v_diff_credits bigint;
  v_diff_inr     numeric(10,2);
  v_purchase_id  uuid;
  v_status       text;
  v_new_expires  timestamptz;
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

  IF v_campaign.status <> 'active' THEN
    RAISE EXCEPTION 'invalid_state: only an active campaign can be upgraded (current: %)', v_campaign.status;
  END IF;

  SELECT * INTO v_old_plan FROM public.reach_plans WHERE id = v_campaign.plan_id;
  SELECT * INTO v_new_plan FROM public.reach_plans WHERE id = p_new_plan_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: reach plan % is not active', p_new_plan_id;
  END IF;

  IF v_new_plan.credit_price <= v_old_plan.credit_price THEN
    RAISE EXCEPTION 'invalid_upgrade: % is not a higher tier than %', v_new_plan.name, v_old_plan.name;
  END IF;

  v_diff_credits := v_new_plan.credit_price - v_old_plan.credit_price;
  v_diff_inr := v_new_plan.price_inr - v_old_plan.price_inr;
  v_new_expires := GREATEST(
    v_campaign.expires_at,
    v_campaign.published_at + (v_new_plan.duration_hours || ' hours')::interval
  );

  IF p_payment_method = 'credits' THEN
    PERFORM public.increment_credit_wallet(
      v_campaign.org_id, 'spend_reach', -v_diff_credits,
      'reach_campaign_purchase', p_campaign_id, 'Upgrade: ' || v_old_plan.name || ' -> ' || v_new_plan.name
    );
    v_status := 'paid';
  ELSIF p_payment_method = 'money' THEN
    v_status := 'pending';
  ELSE
    RAISE EXCEPTION 'invalid_payment_method: %', p_payment_method;
  END IF;

  INSERT INTO public.reach_campaign_purchases
    (campaign_id, plan_id, payment_method, credits_charged, amount_inr_charged, status)
  VALUES (
    p_campaign_id, p_new_plan_id, p_payment_method,
    CASE WHEN p_payment_method = 'credits' THEN v_diff_credits ELSE 0 END,
    CASE WHEN p_payment_method = 'money' THEN v_diff_inr ELSE 0 END,
    v_status
  )
  RETURNING id INTO v_purchase_id;

  UPDATE public.reach_campaigns
  SET plan_id = p_new_plan_id, expires_at = v_new_expires
  WHERE id = p_campaign_id;

  PERFORM public.emit_platform_event(
    'ReachCampaignUpgraded', v_campaign.org_id,
    jsonb_build_object('campaign_id', p_campaign_id, 'from_plan', v_old_plan.code, 'to_plan', v_new_plan.code)
  );

  RETURN jsonb_build_object(
    'ok', true, 'campaign_id', p_campaign_id, 'purchase_id', v_purchase_id,
    'purchase_status', v_status, 'new_plan_code', v_new_plan.code, 'expires_at', v_new_expires
  );
END;
$$;

-- ── 3. Growth configuration model — reward_rules key is no longer a fixed
-- enum. It already lives in a DB table (not hardcoded in app code); this
-- just means adding e.g. a "first_post" reward later doesn't need a schema
-- migration, only a new row + whatever emits it. No new reward types added
-- here — nothing triggers them yet, so adding rows now would be inert config.

ALTER TABLE public.reward_rules DROP CONSTRAINT IF EXISTS reward_rules_key_check;
ALTER TABLE public.reward_rules ADD CONSTRAINT reward_rules_key_not_blank CHECK (length(trim(key)) > 0);
