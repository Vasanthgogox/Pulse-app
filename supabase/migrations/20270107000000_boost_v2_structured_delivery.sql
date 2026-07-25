-- Boost V2 — Structured Delivery Engine (waves, verified-first, escalation).
--
-- Fixes the real reason campaigns "don't perform": delivery was passive.
-- get_network_feed made an active sponsored post visible platform-wide, but
-- nothing was ever DELIVERED to anyone — impressions only happened if another
-- org organically opened its feed. No targeting, no verified-first priority,
-- no pacing, and the plan's reach number was cosmetic.
--
-- New model:
--   • reach_campaign_targets — the delivery list. Allocated VERIFIED orgs
--     first; unverified only fill whatever verified supply can't cover.
--   • Waves — 40% / 40% / 20% of the plan's estimated_reach_max, released at
--     publish, 1/3 and 2/3 of campaign duration (a 25-reach plan = 10+10+5).
--   • No-bid escalation — once all waves are out, if the campaign still has
--     ZERO bids and ZERO driver recommendations, ONE extra push of up to +20%
--     of the plan reach is allocated automatically.
--   • get_network_feed — sponsored visibility is now targets-only: an org
--     sees a sponsored story only when its wave has been released.
--   • get_driver_reach_stories — the driver Story tab feed. A story
--     disappears once the load is assigned to someone else; it stays for the
--     driver whose recommendation converted (so the earning stays visible).
--   • record_reach_driver_event — driver-channel impressions/views (the org
--     variant requires an actor org, which drivers don't have).

-- ── 1. Delivery targets ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reach_campaign_targets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid        NOT NULL REFERENCES public.reach_campaigns(id) ON DELETE CASCADE,
  org_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- 1..3 = scheduled waves (40/40/20). 4 = the no-bid escalation push.
  wave         smallint    NOT NULL CHECK (wave BETWEEN 1 AND 4),
  -- Snapshot at allocation time — reporting stays truthful even if the org's
  -- KYC status changes later.
  is_verified  boolean     NOT NULL DEFAULT false,
  released_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_reach_targets_campaign ON public.reach_campaign_targets(campaign_id, wave);
CREATE INDEX IF NOT EXISTS idx_reach_targets_org      ON public.reach_campaign_targets(org_id, released_at);

ALTER TABLE public.reach_campaign_targets ENABLE ROW LEVEL SECURITY;

-- Reads: campaign owner (delivery analytics) and the targeted org (feed
-- gating joins run inside SECURITY DEFINER functions, but direct reads are
-- harmless for your own org). All writes go through the allocator below.
DROP POLICY IF EXISTS reach_campaign_targets_select ON public.reach_campaign_targets;
CREATE POLICY reach_campaign_targets_select ON public.reach_campaign_targets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = reach_campaign_targets.org_id
        AND om.user_id = (select auth.uid()) AND om.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.reach_campaigns rc
      JOIN public.organization_members om ON om.organization_id = rc.org_id
      WHERE rc.id = reach_campaign_targets.campaign_id
        AND om.user_id = (select auth.uid()) AND om.status = 'active'
    )
  );

-- ── 2. Allocator — verified first, unverified fill ───────────────────────────

CREATE OR REPLACE FUNCTION public.fn_allocate_reach_targets(
  p_campaign_id uuid,
  p_wave        smallint,
  p_count       integer
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_org uuid;
  v_inserted  integer;
BEGIN
  IF p_count <= 0 THEN
    RETURN 0;
  END IF;

  SELECT org_id INTO v_owner_org FROM public.reach_campaigns WHERE id = p_campaign_id;
  IF v_owner_org IS NULL THEN
    RETURN 0;
  END IF;

  -- Verified orgs are ranked strictly ahead of unverified — an unverified org
  -- is only picked once the verified pool for this campaign is exhausted.
  -- Random within each tier so one org doesn't absorb every campaign.
  INSERT INTO public.reach_campaign_targets (campaign_id, org_id, wave, is_verified)
  SELECT p_campaign_id, o.id, p_wave, (o.verification_status::text = 'verified')
  FROM public.organizations o
  WHERE o.id <> v_owner_org
    AND NOT EXISTS (
      SELECT 1 FROM public.reach_campaign_targets t
      WHERE t.campaign_id = p_campaign_id AND t.org_id = o.id
    )
  ORDER BY (o.verification_status::text = 'verified') DESC, random()
  LIMIT p_count;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_allocate_reach_targets(uuid, smallint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_allocate_reach_targets(uuid, smallint, integer) TO service_role;

-- Wave sizing from the plan's reach cap: 40% / 40% / 20% (a 25-reach plan is
-- exactly 10 + 10 + 5). Wave 3 takes the remainder so the three waves always
-- sum to the cap. Escalation is ceil(20%).
CREATE OR REPLACE FUNCTION public.fn_reach_wave_size(p_cap integer, p_wave smallint)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_wave
    WHEN 1 THEN ceil(p_cap * 0.4)::integer
    WHEN 2 THEN ceil(p_cap * 0.4)::integer
    WHEN 3 THEN greatest(0, p_cap - 2 * ceil(p_cap * 0.4)::integer)
    WHEN 4 THEN ceil(p_cap * 0.2)::integer
    ELSE 0
  END;
$$;

-- ── 3. publish_reach_campaign — wave 1 goes out AT publish ──────────────────
-- Same 9-arg signature as 20270102 (+ payout fix): body reproduced with the
-- wave-1 allocation added after the campaign insert.

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

-- ── 4. Pacing + no-bid escalation cron ──────────────────────────────────────
-- Wave 2 at 1/3 elapsed, wave 3 at 2/3. Escalation (wave 4, +20%) fires once,
-- only after wave 3 is out, 75%+ elapsed, and the campaign has ZERO bids and
-- ZERO driver recommendations — "the market saw it and nobody moved".

CREATE OR REPLACE FUNCTION public.fn_pace_reach_campaigns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row       record;
  v_elapsed   numeric;
  v_max_wave  smallint;
  v_added     integer;
BEGIN
  FOR v_row IN
    SELECT rc.id, rc.org_id, rc.post_id, rc.published_at, rc.expires_at,
           rp.estimated_reach_max AS cap
    FROM public.reach_campaigns rc
    JOIN public.reach_plans rp ON rp.id = rc.plan_id
    WHERE rc.status = 'active'
      AND rc.published_at IS NOT NULL
      AND rc.expires_at IS NOT NULL
      AND rc.expires_at > rc.published_at
  LOOP
    v_elapsed := EXTRACT(EPOCH FROM (now() - v_row.published_at))
               / EXTRACT(EPOCH FROM (v_row.expires_at - v_row.published_at));

    SELECT COALESCE(max(wave), 0) INTO v_max_wave
    FROM public.reach_campaign_targets WHERE campaign_id = v_row.id;

    IF v_max_wave < 1 THEN
      PERFORM public.fn_allocate_reach_targets(
        v_row.id, 1::smallint, public.fn_reach_wave_size(v_row.cap, 1::smallint));
      v_max_wave := 1;
    END IF;

    IF v_max_wave < 2 AND v_elapsed >= 1.0 / 3 THEN
      PERFORM public.fn_allocate_reach_targets(
        v_row.id, 2::smallint, public.fn_reach_wave_size(v_row.cap, 2::smallint));
      v_max_wave := 2;
    END IF;

    IF v_max_wave < 3 AND v_elapsed >= 2.0 / 3 THEN
      PERFORM public.fn_allocate_reach_targets(
        v_row.id, 3::smallint, public.fn_reach_wave_size(v_row.cap, 3::smallint));
      v_max_wave := 3;
    END IF;

    IF v_max_wave = 3
       AND v_elapsed >= 0.75
       AND NOT EXISTS (SELECT 1 FROM public.bids b WHERE b.post_id = v_row.post_id)
       AND NOT EXISTS (SELECT 1 FROM public.reach_referrals r WHERE r.campaign_id = v_row.id)
    THEN
      v_added := public.fn_allocate_reach_targets(
        v_row.id, 4::smallint, public.fn_reach_wave_size(v_row.cap, 4::smallint));
      IF v_added > 0 THEN
        PERFORM public.emit_platform_event(
          'ReachCampaignEscalated', v_row.org_id,
          jsonb_build_object('campaign_id', v_row.id, 'extra_targets', v_added)
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_pace_reach_campaigns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_pace_reach_campaigns() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'reach_campaigns_pace',
      '*/10 * * * *',
      $cron$ SELECT public.fn_pace_reach_campaigns(); $cron$
    );
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron not available: %', SQLERRM;
END;
$$;

-- ── 5. get_network_feed — sponsored visibility is targets-only now ──────────

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
      -- Structured delivery: a sponsored story reaches an org only when the
      -- delivery engine released a wave containing it — verified-first,
      -- 40/40/20 pacing, plan reach respected. No more platform-wide spray.
      OR (
        rc.status = 'active'
        AND EXISTS (
          SELECT 1 FROM public.reach_campaign_targets t
          WHERE t.campaign_id = rc.id AND t.org_id = p_org_id AND t.released_at <= now()
        )
      )
    )
  ORDER BY (rc.status = 'active') DESC, p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$function$;

COMMENT ON FUNCTION public.get_network_feed(uuid, integer, integer) IS
  'Network feed. Sponsored posts are delivered via reach_campaign_targets (verified-first waves with escalation), replacing the earlier platform-wide sponsored visibility.';

-- ── 6. Delivery analytics for the campaign detail screen ────────────────────

CREATE OR REPLACE FUNCTION public.get_reach_campaign_delivery(p_campaign_id uuid)
RETURNS TABLE (
  wave              smallint,
  targets           bigint,
  verified_targets  bigint,
  released_at       timestamptz,
  impressions       bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.reach_campaigns rc
      JOIN public.organization_members om ON om.organization_id = rc.org_id
      WHERE rc.id = p_campaign_id
        AND om.user_id = (select auth.uid()) AND om.status = 'active'
    )
    OR public.has_platform_permission((select auth.uid()), 'reach.manage')
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of the campaign organization';
  END IF;

  RETURN QUERY
  SELECT
    t.wave,
    count(*)::bigint AS targets,
    count(*) FILTER (WHERE t.is_verified)::bigint AS verified_targets,
    min(t.released_at) AS released_at,
    (
      SELECT count(DISTINCT e.actor_org_id) FROM public.reach_events e
      WHERE e.campaign_id = p_campaign_id
        AND e.event_type = 'impression'
        AND e.actor_org_id IN (
          SELECT t2.org_id FROM public.reach_campaign_targets t2
          WHERE t2.campaign_id = p_campaign_id AND t2.wave = t.wave
        )
    )::bigint AS impressions
  FROM public.reach_campaign_targets t
  WHERE t.campaign_id = p_campaign_id
  GROUP BY t.wave
  ORDER BY t.wave;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reach_campaign_delivery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reach_campaign_delivery(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_reach_campaign_delivery IS
  'Per-wave delivery stats for a campaign: targets allocated (verified split), release time, and distinct targeted orgs that actually logged an impression. Wave 4 = no-bid escalation push.';

-- ── 7. Driver Story tab feed ─────────────────────────────────────────────────
-- Visibility rules (per product spec):
--   • Active driver-channel campaigns the driver can act on — hidden the
--     moment the load is ASSIGNED to someone else (an accepted bid exists that
--     is not the driver's own referral bid).
--   • The driver's own converted (rewarded) recommendations stay visible even
--     after campaign completion — that row shows the earning (paid to the
--     driver's existing wallet via driver_ledger).
--   • Rejected recommendations stay visible while the story itself is still
--     live, so the driver sees the outcome — they disappear with the story.

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
  -- False once escrow can no longer cover another reward.
  reward_available       boolean,
  referral_id            uuid,
  referral_status        text,
  referral_reward_amount bigint,
  recommended_at         timestamptz,
  rewarded_at            timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.role = 'driver')
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = (select auth.uid()) AND om.role = 'driver' AND om.status = 'active'
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
    r.id, r.status, r.reward_amount, r.created_at, r.rewarded_at
  FROM public.reach_campaigns rc
  JOIN public.organizations o ON o.id = rc.org_id
  LEFT JOIN public.reach_referrals r
    ON r.campaign_id = rc.id AND r.driver_user_id = (select auth.uid())
  LEFT JOIN LATERAL (
    SELECT b.id FROM public.bids b
    WHERE b.post_id = rc.post_id AND b.status = 'accepted'
    ORDER BY b.created_at DESC
    LIMIT 1
  ) won ON true
  WHERE 'driver' = ANY(rc.distribution_channels)
    AND (
      -- Live story, not yet assigned elsewhere (or assigned via THIS driver's
      -- recommendation — their fleet won it).
      (rc.status = 'active' AND (won.id IS NULL OR won.id = r.bid_id))
      -- Converted by this driver: earning stays visible after the campaign.
      OR r.status = 'rewarded'
    )
  ORDER BY (r.status = 'rewarded') DESC, rc.published_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_reach_stories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_reach_stories() TO authenticated;

COMMENT ON FUNCTION public.get_driver_reach_stories IS
  'Driver Story tab: active driver-channel boosted stories (disappear once the load is assigned to someone else) plus the driver''s own rewarded conversions with earnings. Rejected recommendations remain visible while the story is live.';

-- ── 8. Driver-channel engagement events ─────────────────────────────────────
-- record_reach_event requires an actor ORG; drivers view stories as
-- individuals. Deduped per campaign/type/day so a scrolling driver doesn't
-- inflate the funnel.

CREATE OR REPLACE FUNCTION public.record_reach_driver_event(
  p_campaign_id uuid,
  p_event_type  text
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

  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.role = 'driver')
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = (select auth.uid()) AND om.role = 'driver' AND om.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a driver';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reach_events e
    WHERE e.campaign_id = p_campaign_id
      AND e.event_type = p_event_type
      AND e.actor_user_id = (select auth.uid())
      AND e.created_at >= date_trunc('day', now())
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.reach_events (campaign_id, event_type, actor_org_id, actor_user_id)
  VALUES (p_campaign_id, p_event_type, NULL, (select auth.uid()));
END;
$$;

REVOKE ALL ON FUNCTION public.record_reach_driver_event(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_reach_driver_event(uuid, text) TO authenticated;

-- ── 9. Backfill — running campaigns must not go dark ─────────────────────────
-- Feed gating flips to targets-only above; any currently-active campaign has
-- no targets yet. Give each its wave-1 allocation now — the pacing cron takes
-- over from there.

DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT rc.id, rp.estimated_reach_max AS cap
    FROM public.reach_campaigns rc
    JOIN public.reach_plans rp ON rp.id = rc.plan_id
    WHERE rc.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.reach_campaign_targets t WHERE t.campaign_id = rc.id
      )
  LOOP
    PERFORM public.fn_allocate_reach_targets(
      v_row.id, 1::smallint, public.fn_reach_wave_size(v_row.cap, 1::smallint));
  END LOOP;
END;
$$;

COMMENT ON TABLE public.reach_campaign_targets IS
  'Boost V2 structured delivery: which orgs a campaign is delivered to. Verified orgs allocated first, unverified fill the remainder; waves 1-3 = 40/40/20 of plan reach released across the campaign duration; wave 4 = one-time no-bid escalation push (+20%).';
