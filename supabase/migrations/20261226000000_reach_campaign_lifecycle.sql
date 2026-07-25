-- Reach campaign lifecycle — real duration, real states, upgrade flow.
-- Renames status vocabulary: published->active, archived->cancelled,
-- scheduled/expired dropped (scheduled: nothing ever set it; expired and
-- completed were the same time-based terminal condition, collapsed to
-- 'completed' — see conversation for why).

-- ── 1. Duration per plan (admin-editable, not hardcoded) ────────────────────

ALTER TABLE public.reach_plans
  ADD COLUMN IF NOT EXISTS duration_hours int NOT NULL DEFAULT 24;

UPDATE public.reach_plans SET duration_hours = 24 WHERE code = 'basic';
UPDATE public.reach_plans SET duration_hours = 48 WHERE code = 'boost';
UPDATE public.reach_plans SET duration_hours = 72 WHERE code = 'max';

-- ── 2. Drop the OLD constraint FIRST, then migrate existing data, THEN add
-- the new constraint. (Bug caught on the actual push attempt: doing the
-- UPDATEs before dropping the old constraint fails on any live rows still
-- carrying the old vocabulary — e.g. this workspace's own real boosted
-- loads — because 'active' isn't a value the OLD constraint allows either.
-- Confirmed the failed attempt rolled back cleanly as one transaction, no
-- partial state, before fixing this ordering.) ─────────────────────────────

ALTER TABLE public.reach_campaigns DROP CONSTRAINT IF EXISTS reach_campaigns_status_check;

UPDATE public.reach_campaigns SET status = 'active'    WHERE status = 'published';
UPDATE public.reach_campaigns SET status = 'draft'     WHERE status = 'scheduled';
UPDATE public.reach_campaigns SET status = 'cancelled' WHERE status = 'archived';
UPDATE public.reach_campaigns SET status = 'completed' WHERE status = 'expired';

ALTER TABLE public.reach_campaigns
  ADD CONSTRAINT reach_campaigns_status_check
  CHECK (status IN ('draft', 'active', 'completed', 'cancelled'));

ALTER TABLE public.reach_campaigns
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill a real expiry for any already-active campaign that predates this
-- migration (published_at + its plan's duration) instead of leaving it null
-- forever.
UPDATE public.reach_campaigns rc
SET expires_at = rc.published_at + (rp.duration_hours || ' hours')::interval
FROM public.reach_plans rp
WHERE rc.plan_id = rp.id
  AND rc.status = 'active'
  AND rc.expires_at IS NULL
  AND rc.published_at IS NOT NULL;

-- Partial unique index used ('draft'/'published') referenced the old
-- vocabulary — recreate against the new one.
DROP INDEX IF EXISTS idx_reach_campaigns_one_active_per_post;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reach_campaigns_one_active_per_post
  ON public.reach_campaigns(post_id)
  WHERE status IN ('draft', 'active');

-- ── 3. publish_reach_campaign — real expires_at, 'active' not 'published' ───

CREATE OR REPLACE FUNCTION public.publish_reach_campaign(
  p_org_id          uuid,
  p_post_id         uuid,
  p_plan_id         uuid,
  p_payment_method  text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan        record;
  v_campaign_id uuid;
  v_purchase_id uuid;
  v_status      text;
  v_expires_at  timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id AND user_id = (select auth.uid()) AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of the boosting organization';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id = p_post_id AND organization_id = p_org_id) THEN
    RAISE EXCEPTION 'not_found: post % does not belong to org %', p_post_id, p_org_id;
  END IF;

  SELECT * INTO v_plan FROM public.reach_plans WHERE id = p_plan_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: reach plan % is not active', p_plan_id;
  END IF;

  IF p_payment_method NOT IN ('credits', 'money') THEN
    RAISE EXCEPTION 'invalid_payment_method: %', p_payment_method;
  END IF;

  v_expires_at := now() + (v_plan.duration_hours || ' hours')::interval;

  INSERT INTO public.reach_campaigns (org_id, post_id, created_by, plan_id, status, published_at, expires_at)
  VALUES (p_org_id, p_post_id, (select auth.uid()), p_plan_id, 'active', now(), v_expires_at)
  RETURNING id INTO v_campaign_id;

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
    jsonb_build_object('campaign_id', v_campaign_id, 'post_id', p_post_id, 'plan_code', v_plan.code, 'payment_method', p_payment_method)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', v_campaign_id,
    'purchase_id', v_purchase_id,
    'purchase_status', v_status,
    'plan_code', v_plan.code,
    'expires_at', v_expires_at
  );
END;
$$;

-- ── 4. Auto-expire — hourly (durations are hour-scale, a daily cron would
-- leave "active" campaigns showing long after they actually ended). ────────

CREATE OR REPLACE FUNCTION public.fn_expire_reach_campaigns()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.reach_campaigns
  SET status = 'completed', completed_at = now()
  WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < now();
$$;

REVOKE ALL ON FUNCTION public.fn_expire_reach_campaigns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_expire_reach_campaigns() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'reach_campaigns_expire',
      '5 * * * *',   -- hourly
      $cron$ SELECT public.fn_expire_reach_campaigns(); $cron$
    );
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron not available: %', SQLERRM;
END;
$$;

-- Run once now so already-expired rows reflect the new status immediately.
SELECT public.fn_expire_reach_campaigns();

-- ── 5. Sponsored badge + daily aggregation — 'published' -> 'active' ───────

DROP FUNCTION IF EXISTS public.get_network_feed(uuid, integer, integer);

CREATE FUNCTION public.get_network_feed(p_org_id uuid, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS TABLE(
   id uuid, organization_id uuid, org_name text, org_avatar_seed text, org_avatar_url text,
   author_user_id uuid, type text, content text, origin text, destination text, load_date date,
   vehicle_type text, weight_tonnes numeric, rate_offer numeric, material text,
   expires_at timestamp with time zone, is_active boolean, view_count integer, bid_count bigint,
   created_at timestamp with time zone, source_indent_id uuid,
   is_sponsored boolean, reach_campaign_id uuid
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- reach_campaign_id points at the MOST RECENT campaign for this post
  -- regardless of status (so the client can still show a completed
  -- campaign's final stats / "Boost again" after it ends) — is_sponsored is
  -- narrower on purpose: true only while that latest campaign is 'active'
  -- (that's what actually earns the feed-sort boost + Sponsored badge).
  SELECT
    p.id, p.organization_id, o.name AS org_name, o.avatar_seed AS org_avatar_seed, o.logo_url AS org_avatar_url,
    p.author_user_id, p.type, p.content, p.origin, p.destination, p.load_date, p.vehicle_type, p.weight_tonnes,
    p.rate_offer, p.material, p.expires_at, p.is_active, p.view_count,
    COALESCE(b.cnt, 0) AS bid_count, p.created_at, p.source_indent_id,
    (rc.status = 'active') AS is_sponsored, rc.id AS reach_campaign_id
  FROM public.posts p
  JOIN public.organizations o ON o.id = p.organization_id
  LEFT JOIN (
    SELECT post_id, count(*) AS cnt FROM public.bids GROUP BY post_id
  ) b ON b.post_id = p.id
  LEFT JOIN LATERAL (
    SELECT rc2.id, rc2.status FROM public.reach_campaigns rc2
    WHERE rc2.post_id = p.id
    ORDER BY rc2.created_at DESC
    LIMIT 1
  ) rc ON true
  WHERE p.is_active = true
    AND (
      p.organization_id = p_org_id
      OR p.organization_id IN (
        SELECT cr.to_organization_id FROM public.connection_requests cr
        WHERE cr.from_organization_id = p_org_id AND cr.status = 'approved'
        UNION
        SELECT cr.from_organization_id FROM public.connection_requests cr
        WHERE cr.to_organization_id = p_org_id AND cr.status = 'approved'
      )
    )
  ORDER BY (rc.status = 'active') DESC, p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.fn_aggregate_reach_daily_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.reach_campaign_daily_metrics (campaign_id, day, impressions, views, bids, credits_used)
  SELECT
    rc.id, (now() - interval '1 day')::date,
    COALESCE(imp.cnt, 0), COALESCE(vw.cnt, 0), COALESCE(bd.cnt, 0), COALESCE(sp.spent, 0)
  FROM public.reach_campaigns rc
  LEFT JOIN (
    SELECT campaign_id, count(*) AS cnt FROM public.reach_events
    WHERE event_type = 'impression' AND created_at >= date_trunc('day', now() - interval '1 day') AND created_at < date_trunc('day', now())
    GROUP BY campaign_id
  ) imp ON imp.campaign_id = rc.id
  LEFT JOIN (
    SELECT campaign_id, count(*) AS cnt FROM public.reach_events
    WHERE event_type = 'view' AND created_at >= date_trunc('day', now() - interval '1 day') AND created_at < date_trunc('day', now())
    GROUP BY campaign_id
  ) vw ON vw.campaign_id = rc.id
  LEFT JOIN (
    SELECT rc2.id AS campaign_id, count(b.*) AS cnt
    FROM public.reach_campaigns rc2
    JOIN public.bids b ON b.post_id = rc2.post_id
      AND b.created_at >= date_trunc('day', now() - interval '1 day') AND b.created_at < date_trunc('day', now())
    GROUP BY rc2.id
  ) bd ON bd.campaign_id = rc.id
  LEFT JOIN (
    SELECT reference_id AS campaign_id, sum(-amount) AS spent
    FROM public.pulse_credit_transactions
    WHERE type = 'spend_reach' AND reference_type = 'reach_campaign_purchase'
      AND created_at >= date_trunc('day', now() - interval '1 day') AND created_at < date_trunc('day', now())
    GROUP BY reference_id
  ) sp ON sp.campaign_id = rc.id
  WHERE rc.status IN ('active', 'completed')
  ON CONFLICT (campaign_id, day) DO UPDATE SET
    impressions = EXCLUDED.impressions, views = EXCLUDED.views,
    bids = EXCLUDED.bids, credits_used = EXCLUDED.credits_used;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_reach_org_summary(p_org_id uuid)
RETURNS TABLE (
  impressions bigint, views bigint, bids bigint, credits_used bigint,
  active_campaigns bigint, total_campaigns bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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

  RETURN QUERY
  SELECT
    COALESCE((SELECT sum(m.impressions) FROM public.reach_campaign_daily_metrics m JOIN public.reach_campaigns rc ON rc.id = m.campaign_id WHERE rc.org_id = p_org_id), 0)::bigint
      + COALESCE((SELECT count(*) FROM public.reach_events e JOIN public.reach_campaigns rc ON rc.id = e.campaign_id WHERE rc.org_id = p_org_id AND e.event_type = 'impression' AND e.created_at >= date_trunc('day', now())), 0),
    COALESCE((SELECT sum(m.views) FROM public.reach_campaign_daily_metrics m JOIN public.reach_campaigns rc ON rc.id = m.campaign_id WHERE rc.org_id = p_org_id), 0)::bigint
      + COALESCE((SELECT count(*) FROM public.reach_events e JOIN public.reach_campaigns rc ON rc.id = e.campaign_id WHERE rc.org_id = p_org_id AND e.event_type = 'view' AND e.created_at >= date_trunc('day', now())), 0),
    COALESCE((SELECT sum(m.bids) FROM public.reach_campaign_daily_metrics m JOIN public.reach_campaigns rc ON rc.id = m.campaign_id WHERE rc.org_id = p_org_id), 0)::bigint
      + COALESCE((SELECT count(*) FROM public.bids b JOIN public.reach_campaigns rc ON rc.post_id = b.post_id WHERE rc.org_id = p_org_id AND b.created_at >= date_trunc('day', now())), 0),
    COALESCE((SELECT sum(m.credits_used) FROM public.reach_campaign_daily_metrics m JOIN public.reach_campaigns rc ON rc.id = m.campaign_id WHERE rc.org_id = p_org_id), 0)::bigint
      + COALESCE((SELECT sum(-t.amount) FROM public.pulse_credit_transactions t JOIN public.reach_campaigns rc ON rc.id = t.reference_id AND t.reference_type = 'reach_campaign_purchase' WHERE rc.org_id = p_org_id AND t.type = 'spend_reach' AND t.created_at >= date_trunc('day', now())), 0)::bigint,
    (SELECT count(*) FROM public.reach_campaigns WHERE org_id = p_org_id AND status = 'active'),
    (SELECT count(*) FROM public.reach_campaigns WHERE org_id = p_org_id);
END;
$$;

-- ── 6. Upgrade flow — charges only the price/credit DIFFERENCE ─────────────
-- Resets remaining time to the new plan's full duration (from now), not a
-- pro-rated extension of whatever time was left — simplest predictable
-- behavior; flagging in case a pro-rated model was intended instead.

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
  v_new_expires := now() + (v_new_plan.duration_hours || ' hours')::interval;

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

REVOKE ALL ON FUNCTION public.upgrade_reach_campaign(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upgrade_reach_campaign(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.upgrade_reach_campaign IS
  'Upgrades an active campaign to a higher plan, charging only the price/credit difference and resetting expires_at to the new plan''s full duration.';
