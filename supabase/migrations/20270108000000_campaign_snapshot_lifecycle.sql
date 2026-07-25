-- Boost V2 — Campaign Snapshot Lifecycle + canonical delivery record.
--
-- Product decision: the customer didn't buy a story, they bought
-- DISTRIBUTION. An active paid campaign now survives source-story deletion:
--
--   Story → Publish (snapshot created) → Story deleted → CAMPAIGN CONTINUES
--         → Campaign ends → snapshot archived (row is the immutable artifact)
--
-- Previously the client delete flow cancelled the campaign
-- ('source_deleted') and the feed served sponsored stories FROM posts, so a
-- deleted story killed paid delivery instantly with no refund. The snapshot
-- columns (20261230) already made the campaign row self-sufficient — this
-- migration makes delivery actually use them.
--
--   1. reach_campaigns.source_deleted_at + mark RPC (transparency stamp; the
--      campaign detail screen shows "Original story deleted — serving
--      campaign snapshot").
--   2. get_network_feed: active campaigns whose post is gone/deactivated are
--      served from the campaign snapshot to their released targets — unless
--      the load was already assigned (accepted bid), where continued
--      distribution has no value.
--   3. reach_campaign_targets becomes the canonical per-target delivery
--      record: released_at → viewed_at → bid_at → converted_at on ONE row.
--      (Click/trip/reward refinements can extend the same row later.)

-- ── 1. Source-deletion stamp ─────────────────────────────────────────────────

ALTER TABLE public.reach_campaigns
  ADD COLUMN IF NOT EXISTS source_deleted_at timestamptz;

COMMENT ON COLUMN public.reach_campaigns.source_deleted_at IS
  'When the source story was deleted while this campaign was active. The campaign keeps serving from its snapshot — this is a transparency/analytics stamp, NOT a lifecycle state.';

CREATE OR REPLACE FUNCTION public.mark_reach_campaign_source_deleted(p_campaign_id uuid)
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
    RAISE EXCEPTION 'unauthorized: caller must be a member of the campaign organization';
  END IF;

  UPDATE public.reach_campaigns
  SET source_deleted_at = COALESCE(source_deleted_at, now())
  WHERE id = p_campaign_id;

  PERFORM public.emit_platform_event(
    'ReachCampaignSourceDeleted', v_campaign.org_id,
    jsonb_build_object('campaign_id', p_campaign_id, 'campaign_status', v_campaign.status)
  );

  RETURN jsonb_build_object('ok', true, 'campaign_id', p_campaign_id);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_reach_campaign_source_deleted(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_reach_campaign_source_deleted(uuid) TO authenticated;

-- ── 2. Canonical delivery record columns ────────────────────────────────────

ALTER TABLE public.reach_campaign_targets
  ADD COLUMN IF NOT EXISTS viewed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS bid_at       timestamptz,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

COMMENT ON TABLE public.reach_campaign_targets IS
  'Canonical delivery record — one row per (campaign, org) tells the full lifecycle: wave/released_at (delivered) → viewed_at (first impression) → bid_at (first bid) → converted_at (referral converted to a trip). Verified-first allocation; waves 1-3 = 40/40/20 of plan reach; wave 4 = no-bid escalation.';

-- Backfill viewed_at from historical impression events.
UPDATE public.reach_campaign_targets t
SET viewed_at = e.first_seen
FROM (
  SELECT campaign_id, actor_org_id, min(created_at) AS first_seen
  FROM public.reach_events
  WHERE event_type = 'impression' AND actor_org_id IS NOT NULL
  GROUP BY campaign_id, actor_org_id
) e
WHERE t.campaign_id = e.campaign_id AND t.org_id = e.actor_org_id
  AND t.viewed_at IS NULL;

-- Backfill bid_at from existing bids against targeted campaigns.
UPDATE public.reach_campaign_targets t
SET bid_at = fb.first_bid
FROM (
  SELECT rc.id AS campaign_id, b.bidder_organization_id AS org_id, min(b.created_at) AS first_bid
  FROM public.reach_campaigns rc
  JOIN public.bids b ON b.post_id = rc.post_id
  WHERE rc.post_id IS NOT NULL
  GROUP BY rc.id, b.bidder_organization_id
) fb
WHERE t.campaign_id = fb.campaign_id AND t.org_id = fb.org_id
  AND t.bid_at IS NULL;

-- record_reach_event: same contract as 20261224040000, plus the canonical
-- viewed_at stamp (first impression/view by that targeted org).
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

  UPDATE public.reach_campaign_targets
  SET viewed_at = now()
  WHERE campaign_id = p_campaign_id AND org_id = p_actor_org_id AND viewed_at IS NULL;
END;
$$;

-- bid_at: stamped by trigger so EVERY bid path (sheet, story detail, future
-- surfaces) feeds the canonical record without client cooperation.
CREATE OR REPLACE FUNCTION public.fn_stamp_reach_target_bid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.reach_campaign_targets t
  SET bid_at = NEW.created_at
  FROM public.reach_campaigns rc
  WHERE rc.post_id = NEW.post_id
    AND rc.status = 'active'
    AND t.campaign_id = rc.id
    AND t.org_id = NEW.bidder_organization_id
    AND t.bid_at IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bids_stamp_reach_target ON public.bids;
CREATE TRIGGER trg_bids_stamp_reach_target
  AFTER INSERT ON public.bids
  FOR EACH ROW EXECUTE FUNCTION public.fn_stamp_reach_target_bid();

-- converted_at: stamped inside convert_reach_referral (full body reproduced
-- from 20270103000000 — only the target stamp is added).
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
  v_referral   record;
  v_campaign   record;
  v_trip       record;
  v_driver_id  uuid;
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

    SELECT id INTO v_driver_id
    FROM public.drivers
    WHERE organization_id = v_referral.fleet_org_id AND user_id = v_referral.driver_user_id;

    IF v_driver_id IS NULL THEN
      RAISE EXCEPTION 'not_found: no driver record for user % in organization %', v_referral.driver_user_id, v_referral.fleet_org_id;
    END IF;

    PERFORM public.add_driver_ledger_entry(
      v_referral.fleet_org_id, v_driver_id, 'reward', v_referral.reward_amount,
      'Recommendation reward — trip started', p_trip_id, p_referral_id, 'reach_referral'
    );

    UPDATE public.reach_campaigns
    SET reward_reserved = reward_reserved - v_referral.reward_amount,
        reward_paid     = reward_paid + v_referral.reward_amount
    WHERE id = v_campaign.id;
  END IF;

  UPDATE public.reach_referrals
  SET status = 'rewarded', trip_id = p_trip_id, rewarded_at = now()
  WHERE id = p_referral_id;

  -- Canonical delivery record: the fleet org's target row converted.
  UPDATE public.reach_campaign_targets
  SET converted_at = now()
  WHERE campaign_id = v_referral.campaign_id
    AND org_id = v_referral.fleet_org_id
    AND converted_at IS NULL;

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

-- ── 3. get_network_feed — snapshot-served sponsored stories ─────────────────
-- Branch A: live posts (unchanged behavior). Branch B: active campaigns whose
-- source post is deactivated or hard-deleted, rendered from the campaign
-- snapshot. Branch B stops when the load is already assigned (accepted bid) —
-- continued distribution of a filled load has no value to anyone.

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
  SELECT * FROM (
    -- Branch A: live posts.
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
        OR (
          rc.status = 'active'
          AND EXISTS (
            SELECT 1 FROM public.reach_campaign_targets t
            WHERE t.campaign_id = rc.id AND t.org_id = p_org_id AND t.released_at <= now()
          )
        )
      )

    UNION ALL

    -- Branch B: snapshot-served campaigns (source story deleted/deactivated).
    -- The campaign is the immutable marketing artifact — the customer bought
    -- distribution, not the story row.
    SELECT
      COALESCE(rc.post_id, rc.id) AS id, rc.org_id AS organization_id,
      o.name AS org_name, o.avatar_seed AS org_avatar_seed, o.logo_url AS org_avatar_url,
      rc.created_by AS author_user_id,
      COALESCE(rc.snapshot_post_type, 'UPDATE') AS type,
      rc.snapshot_content AS content, rc.snapshot_origin AS origin, rc.snapshot_destination AS destination,
      NULL::date AS load_date, rc.snapshot_vehicle_type AS vehicle_type, NULL::numeric AS weight_tonnes,
      NULL::numeric AS rate_offer, rc.snapshot_material AS material,
      rc.expires_at, true AS is_active, 0 AS view_count,
      COALESCE(b.cnt, 0) AS bid_count,
      COALESCE(rc.snapshot_posted_at, rc.published_at) AS created_at,
      rc.snapshot_source_indent_id AS source_indent_id,
      true AS is_sponsored, rc.id AS reach_campaign_id
    FROM public.reach_campaigns rc
    JOIN public.organizations o ON o.id = rc.org_id
    LEFT JOIN (
      SELECT post_id, count(*) AS cnt FROM public.bids GROUP BY post_id
    ) b ON b.post_id = rc.post_id
    WHERE rc.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.posts p2 WHERE p2.id = rc.post_id AND p2.is_active = true
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.bids ab
        WHERE ab.post_id = rc.post_id AND ab.status = 'accepted'
      )
      AND (
        rc.org_id = p_org_id
        OR EXISTS (
          SELECT 1 FROM public.reach_campaign_targets t
          WHERE t.campaign_id = rc.id AND t.org_id = p_org_id AND t.released_at <= now()
        )
      )
  ) feed
  ORDER BY feed.is_sponsored DESC, feed.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$function$;

COMMENT ON FUNCTION public.get_network_feed(uuid, integer, integer) IS
  'Network feed. Sponsored delivery via reach_campaign_targets (verified-first waves + escalation). Active campaigns survive source-story deletion: served from the campaign snapshot until the campaign ends or the load is assigned (accepted bid).';

-- ── 4. Delivery analytics — canonical columns per wave ──────────────────────
-- Return shape changes (viewed/bids from the canonical record), so drop and
-- recreate.

DROP FUNCTION IF EXISTS public.get_reach_campaign_delivery(uuid);

CREATE FUNCTION public.get_reach_campaign_delivery(p_campaign_id uuid)
RETURNS TABLE (
  wave              smallint,
  targets           bigint,
  verified_targets  bigint,
  released_at       timestamptz,
  viewed            bigint,
  bids              bigint,
  conversions       bigint
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
    count(*)::bigint,
    count(*) FILTER (WHERE t.is_verified)::bigint,
    min(t.released_at),
    count(*) FILTER (WHERE t.viewed_at IS NOT NULL)::bigint,
    count(*) FILTER (WHERE t.bid_at IS NOT NULL)::bigint,
    count(*) FILTER (WHERE t.converted_at IS NOT NULL)::bigint
  FROM public.reach_campaign_targets t
  WHERE t.campaign_id = p_campaign_id
  GROUP BY t.wave
  ORDER BY t.wave;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reach_campaign_delivery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reach_campaign_delivery(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_reach_campaign_delivery IS
  'Per-wave delivery funnel from the canonical reach_campaign_targets record: allocated (verified split) → viewed → bid → converted. Wave 4 = no-bid escalation push.';
