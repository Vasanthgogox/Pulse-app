-- ============================================================
-- Reach campaigns core — "boost a load post" v1 (see plan revision:
-- distribution + payment on top of the EXISTING posts/bids feed, not a new
-- engagement surface). No reach_stories/reactions/replies/templates/
-- automation/audiences for v1 — see roadmap doc for what's deferred and why.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reach_campaigns (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  post_id       uuid        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_by    uuid        NOT NULL REFERENCES auth.users(id),
  plan_id       uuid        NOT NULL REFERENCES public.reach_plans(id),
  status        text        NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'scheduled', 'published', 'archived', 'expired')),
  scheduled_at  timestamptz,
  published_at  timestamptz,
  expires_at    timestamptz,
  archived_at   timestamptz,
  metadata      jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- A post can be re-boosted later (new campaign) but only one non-terminal
-- campaign at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reach_campaigns_one_active_per_post
  ON public.reach_campaigns(post_id)
  WHERE status IN ('draft', 'scheduled', 'published');

CREATE INDEX IF NOT EXISTS idx_reach_campaigns_org      ON public.reach_campaigns(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reach_campaigns_status   ON public.reach_campaigns(status);

DROP TRIGGER IF EXISTS trg_reach_campaigns_updated_at ON public.reach_campaigns;
CREATE TRIGGER trg_reach_campaigns_updated_at
  BEFORE UPDATE ON public.reach_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reach_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reach_campaigns_org_select" ON public.reach_campaigns;
CREATE POLICY "reach_campaigns_org_select" ON public.reach_campaigns
  FOR SELECT USING (
    org_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = (select auth.uid()) AND status = 'active')
    OR public.has_platform_permission((select auth.uid()), 'reach.manage')
  );

DROP POLICY IF EXISTS "reach_campaigns_org_insert" ON public.reach_campaigns;
CREATE POLICY "reach_campaigns_org_insert" ON public.reach_campaigns
  FOR INSERT WITH CHECK (
    org_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = (select auth.uid()) AND status = 'active')
  );

DROP POLICY IF EXISTS "reach_campaigns_org_update" ON public.reach_campaigns;
CREATE POLICY "reach_campaigns_org_update" ON public.reach_campaigns
  FOR UPDATE USING (
    org_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = (select auth.uid()) AND status = 'active')
    OR public.has_platform_permission((select auth.uid()), 'reach.manage')
  );

-- ── Engagement events — impressions + views only. "Bids" is read from the
-- existing public.bids table (joined via post_id), never duplicated here. ──

CREATE TABLE IF NOT EXISTS public.reach_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid        NOT NULL REFERENCES public.reach_campaigns(id) ON DELETE CASCADE,
  event_type     text        NOT NULL CHECK (event_type IN ('impression', 'view')),
  actor_org_id   uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor_user_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reach_events_campaign      ON public.reach_events(campaign_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reach_events_created_brin  ON public.reach_events USING BRIN (created_at);

ALTER TABLE public.reach_events ENABLE ROW LEVEL SECURITY;

-- Any authenticated org member may log an impression/view on someone else's
-- boosted post (same shape as story_views_insert) — SELECT restricted to the
-- campaign owner + platform staff.
DROP POLICY IF EXISTS "reach_events_insert_any_member" ON public.reach_events;
CREATE POLICY "reach_events_insert_any_member" ON public.reach_events
  FOR INSERT WITH CHECK (
    actor_org_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = (select auth.uid()) AND status = 'active')
  );

DROP POLICY IF EXISTS "reach_events_owner_select" ON public.reach_events;
CREATE POLICY "reach_events_owner_select" ON public.reach_events
  FOR SELECT USING (
    campaign_id IN (
      SELECT rc.id FROM public.reach_campaigns rc
      WHERE rc.org_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = (select auth.uid()) AND status = 'active')
    )
    OR public.has_platform_permission((select auth.uid()), 'reach.manage')
  );

-- ── Daily rollup — exactly the 4 numbers that matter (no CTR/CPM/CPC). ──────

CREATE TABLE IF NOT EXISTS public.reach_campaign_daily_metrics (
  campaign_id    uuid        NOT NULL REFERENCES public.reach_campaigns(id) ON DELETE CASCADE,
  day            date        NOT NULL,
  impressions    int         NOT NULL DEFAULT 0,
  views          int         NOT NULL DEFAULT 0,
  bids           int         NOT NULL DEFAULT 0,
  credits_used   bigint      NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, day)
);

ALTER TABLE public.reach_campaign_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reach_daily_metrics_owner_select" ON public.reach_campaign_daily_metrics;
CREATE POLICY "reach_daily_metrics_owner_select" ON public.reach_campaign_daily_metrics
  FOR SELECT USING (
    campaign_id IN (
      SELECT rc.id FROM public.reach_campaigns rc
      WHERE rc.org_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = (select auth.uid()) AND status = 'active')
    )
    OR public.has_platform_permission((select auth.uid()), 'analytics.view')
  );

-- Nightly aggregation for the previous day. Mirrors the pg_cron registration
-- pattern in 20261001000002_subscription_billing_lifecycle.sql
-- (workspace_products_expire).
CREATE OR REPLACE FUNCTION public.fn_aggregate_reach_daily_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.reach_campaign_daily_metrics (campaign_id, day, impressions, views, bids, credits_used)
  SELECT
    rc.id,
    (now() - interval '1 day')::date,
    COALESCE(imp.cnt, 0),
    COALESCE(vw.cnt, 0),
    COALESCE(bd.cnt, 0),
    COALESCE(sp.spent, 0)
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
  WHERE rc.status = 'published'
  ON CONFLICT (campaign_id, day) DO UPDATE SET
    impressions  = EXCLUDED.impressions,
    views        = EXCLUDED.views,
    bids         = EXCLUDED.bids,
    credits_used = EXCLUDED.credits_used;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_aggregate_reach_daily_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_aggregate_reach_daily_metrics() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'reach_campaign_daily_metrics_aggregate',
      '15 3 * * *',   -- 3:15am daily, after workspace_products_expire
      $cron$ SELECT public.fn_aggregate_reach_daily_metrics(); $cron$
    );
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron not available: %', SQLERRM;
END;
$$;

-- ── Campaign purchase — plan selection + payment (credits fully wired now) ──

CREATE TABLE IF NOT EXISTS public.reach_campaign_purchases (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid        NOT NULL REFERENCES public.reach_campaigns(id) ON DELETE CASCADE,
  plan_id             uuid        NOT NULL REFERENCES public.reach_plans(id),
  payment_method      text        NOT NULL CHECK (payment_method IN ('credits', 'money', 'mixed')),
  credits_charged     bigint      NOT NULL DEFAULT 0,
  amount_inr_charged  numeric(10,2) NOT NULL DEFAULT 0,
  status              text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reach_purchases_campaign ON public.reach_campaign_purchases(campaign_id);

ALTER TABLE public.reach_campaign_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reach_purchases_owner_select" ON public.reach_campaign_purchases;
CREATE POLICY "reach_purchases_owner_select" ON public.reach_campaign_purchases
  FOR SELECT USING (
    campaign_id IN (
      SELECT rc.id FROM public.reach_campaigns rc
      WHERE rc.org_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = (select auth.uid()) AND status = 'active')
    )
    OR public.has_platform_permission((select auth.uid()), 'reach.manage')
  );

-- ── publish_reach_campaign — the whole Boost flow in one atomic call ───────
-- Creates the campaign, charges credits (money path stays 'pending' — no
-- payment gateway exists in this codebase yet), and publishes.

CREATE OR REPLACE FUNCTION public.publish_reach_campaign(
  p_org_id          uuid,
  p_post_id         uuid,
  p_plan_id         uuid,
  p_payment_method  text  -- 'credits' | 'money'
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

  INSERT INTO public.reach_campaigns (org_id, post_id, created_by, plan_id, status, published_at)
  VALUES (p_org_id, p_post_id, (select auth.uid()), p_plan_id, 'published', now())
  RETURNING id INTO v_campaign_id;

  IF p_payment_method = 'credits' THEN
    -- increment_credit_wallet raises insufficient_credits and rolls back the
    -- whole transaction (including the campaign insert above) if the wallet
    -- can't cover it — the caller should pre-check balance for a friendly UX,
    -- but this is the authoritative guard.
    PERFORM public.increment_credit_wallet(
      p_org_id, 'spend_reach', -v_plan.credit_price,
      'reach_campaign_purchase', v_campaign_id, 'Boost: ' || v_plan.name
    );
    v_status := 'paid';
  ELSE
    -- No payment gateway wired in yet (none exists anywhere in this
    -- codebase) — recorded pending for a human/ops follow-up until one is.
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
    'plan_code', v_plan.code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_reach_campaign(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_reach_campaign(uuid, uuid, uuid, text) TO authenticated;

-- ── record_reach_event — impression/view logging (mirrors recordStoryView) ──

CREATE OR REPLACE FUNCTION public.record_reach_event(
  p_campaign_id  uuid,
  p_event_type   text,
  p_actor_org_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_event_type NOT IN ('impression', 'view') THEN
    RAISE EXCEPTION 'invalid_event_type: %', p_event_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_actor_org_id AND user_id = (select auth.uid()) AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must belong to p_actor_org_id';
  END IF;

  INSERT INTO public.reach_events (campaign_id, event_type, actor_org_id, actor_user_id)
  VALUES (p_campaign_id, p_event_type, p_actor_org_id, (select auth.uid()));
END;
$$;

REVOKE ALL ON FUNCTION public.record_reach_event(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_reach_event(uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.publish_reach_campaign IS
  'Boost flow: create+publish a reach_campaign for an existing post, charge credits (money path stays pending — no gateway wired yet).';

-- ── get_reach_campaign_metrics — the 4 numbers, materialized days + live tail ──
-- Same "materialized + live tail" shape as most dashboards in this codebase
-- (e.g. product_usage): closed days come from reach_campaign_daily_metrics,
-- today is computed live so the Boost History screen isn't a day stale.

CREATE OR REPLACE FUNCTION public.get_reach_campaign_metrics(p_campaign_id uuid)
RETURNS TABLE (impressions bigint, views bigint, bids bigint, credits_used bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.reach_campaigns rc
    WHERE rc.id = p_campaign_id
      AND (
        rc.org_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = (select auth.uid()) AND status = 'active')
        OR public.has_platform_permission((select auth.uid()), 'analytics.view')
      )
  ) THEN
    RAISE EXCEPTION 'unauthorized or not_found: reach campaign %', p_campaign_id;
  END IF;

  SELECT rc.post_id INTO v_post_id FROM public.reach_campaigns rc WHERE rc.id = p_campaign_id;

  RETURN QUERY
  SELECT
    COALESCE((SELECT sum(m.impressions) FROM public.reach_campaign_daily_metrics m WHERE m.campaign_id = p_campaign_id), 0)
      + COALESCE((SELECT count(*) FROM public.reach_events e WHERE e.campaign_id = p_campaign_id AND e.event_type = 'impression' AND e.created_at >= date_trunc('day', now())), 0),
    COALESCE((SELECT sum(m.views) FROM public.reach_campaign_daily_metrics m WHERE m.campaign_id = p_campaign_id), 0)
      + COALESCE((SELECT count(*) FROM public.reach_events e WHERE e.campaign_id = p_campaign_id AND e.event_type = 'view' AND e.created_at >= date_trunc('day', now())), 0),
    COALESCE((SELECT sum(m.bids) FROM public.reach_campaign_daily_metrics m WHERE m.campaign_id = p_campaign_id), 0)
      + COALESCE((SELECT count(*) FROM public.bids b WHERE b.post_id = v_post_id AND b.created_at >= date_trunc('day', now())), 0),
    -- sum(bigint) returns numeric in Postgres (overflow-safe promotion) —
    -- cast back to bigint to match the declared return column.
    COALESCE((SELECT sum(m.credits_used) FROM public.reach_campaign_daily_metrics m WHERE m.campaign_id = p_campaign_id), 0)::bigint
      + COALESCE((
          SELECT sum(-t.amount) FROM public.pulse_credit_transactions t
          WHERE t.reference_type = 'reach_campaign_purchase' AND t.reference_id = p_campaign_id
            AND t.type = 'spend_reach' AND t.created_at >= date_trunc('day', now())
        ), 0)::bigint;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reach_campaign_metrics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reach_campaign_metrics(uuid) TO authenticated, service_role;
