-- Boost V2 — Opportunities positioning: driver intent, suggested rate,
-- priority-scoring signals, and decision funnel events.
--
-- The fleet owner isn't processing referrals — they're evaluating business
-- opportunities. To decide fast they need structure, not free text:
--   1. Driver intent (reason): WHY the driver recommends — structured enum,
--      not just a note. Better data than prose, and it powers future scoring.
--   2. Suggested rate: what the driver thinks the load is worth. Approve →
--      the bid form opens PRE-FILLED with this rate + note (fleet owner only
--      edits if needed) — removes duplicate data entry from the funnel.
--   3. Scoring signals on the inbox: driver's completed trips in this fleet
--      and their recommendation track record (total / converted). Simple
--      heuristics client-side for V2; an AI model can replace the formula
--      later without touching this schema.
--   4. decide_reach_referral now emits a platform event, completing the
--      funnel: Recommended → Decided → (bid → trip → Rewarded already emit).

ALTER TABLE public.reach_referrals
  ADD COLUMN IF NOT EXISTS reason         text,
  ADD COLUMN IF NOT EXISTS suggested_rate numeric(12,2);

ALTER TABLE public.reach_referrals
  DROP CONSTRAINT IF EXISTS reach_referrals_reason_check;
ALTER TABLE public.reach_referrals
  ADD CONSTRAINT reach_referrals_reason_check
  CHECK (reason IS NULL OR reason IN (
    'truck_available', 'empty_nearby', 'good_margin', 'reliable_customer', 'other'
  ));

ALTER TABLE public.reach_referrals
  DROP CONSTRAINT IF EXISTS reach_referrals_suggested_rate_check;
ALTER TABLE public.reach_referrals
  ADD CONSTRAINT reach_referrals_suggested_rate_check
  CHECK (suggested_rate IS NULL OR suggested_rate > 0);

-- ── recommend_reach_campaign — driver intent + suggested rate ───────────────
-- Old 3-arg signature dropped so PostgREST doesn't see an ambiguous overload.

DROP FUNCTION IF EXISTS public.recommend_reach_campaign(uuid, uuid, text);

CREATE FUNCTION public.recommend_reach_campaign(
  p_campaign_id    uuid,
  p_fleet_org_id   uuid,
  p_note           text    DEFAULT NULL,
  p_reason         text    DEFAULT NULL,
  p_suggested_rate numeric DEFAULT NULL
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

  IF p_reason IS NOT NULL AND p_reason NOT IN (
    'truck_available', 'empty_nearby', 'good_margin', 'reliable_customer', 'other'
  ) THEN
    RAISE EXCEPTION 'invalid_reason: %', p_reason;
  END IF;
  IF p_suggested_rate IS NOT NULL AND p_suggested_rate <= 0 THEN
    RAISE EXCEPTION 'invalid_suggested_rate: must be positive';
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

  INSERT INTO public.reach_referrals
    (campaign_id, driver_user_id, fleet_org_id, reward_amount, note, reason, suggested_rate)
  VALUES (
    p_campaign_id, (select auth.uid()), p_fleet_org_id,
    CASE WHEN v_campaign.driver_reward_enabled THEN v_campaign.reward_amount ELSE 0 END,
    NULLIF(TRIM(p_note), ''), p_reason, p_suggested_rate
  )
  ON CONFLICT (campaign_id, driver_user_id) DO NOTHING
  RETURNING id INTO v_referral_id;

  IF v_referral_id IS NULL THEN
    RAISE EXCEPTION 'duplicate: you already recommended this campaign';
  END IF;

  PERFORM public.emit_platform_event(
    'ReachReferralRecommended', p_fleet_org_id,
    jsonb_build_object(
      'referral_id', v_referral_id, 'campaign_id', p_campaign_id,
      'reason', p_reason, 'suggested_rate', p_suggested_rate
    )
  );

  RETURN jsonb_build_object('ok', true, 'referral_id', v_referral_id, 'reward_amount',
    CASE WHEN v_campaign.driver_reward_enabled THEN v_campaign.reward_amount ELSE 0 END);
END;
$$;

REVOKE ALL ON FUNCTION public.recommend_reach_campaign(uuid, uuid, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recommend_reach_campaign(uuid, uuid, text, text, numeric) TO authenticated;

-- ── get_reach_referral_inbox — + intent, rate, and scoring signals ──────────
-- Return type changes, so drop-and-recreate (CREATE OR REPLACE can't alter
-- OUT columns).

DROP FUNCTION IF EXISTS public.get_reach_referral_inbox(uuid);

CREATE FUNCTION public.get_reach_referral_inbox(p_fleet_org_id uuid)
RETURNS TABLE (
  id                          uuid,
  campaign_id                 uuid,
  status                      text,
  reward_amount               bigint,
  note                        text,
  reason                      text,
  suggested_rate              numeric,
  created_at                  timestamptz,
  decided_at                  timestamptz,
  rewarded_at                 timestamptz,
  driver_user_id              uuid,
  driver_name                 text,
  driver_phone                text,
  -- Scoring signals (simple heuristics client-side for V2; AI-ready later).
  driver_trips_completed      bigint,
  driver_referrals_total      bigint,
  driver_referrals_converted  bigint,
  -- Story identity from the campaign snapshot (survives post deletion).
  post_id                     uuid,
  campaign_org_id             uuid,
  campaign_status             text,
  snapshot_post_type          text,
  snapshot_title              text,
  snapshot_origin             text,
  snapshot_destination        text,
  snapshot_vehicle_type       text,
  snapshot_material           text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_fleet_org_id AND user_id = (select auth.uid()) AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of the fleet organization';
  END IF;

  RETURN QUERY
  SELECT
    r.id, r.campaign_id, r.status, r.reward_amount, r.note, r.reason, r.suggested_rate,
    r.created_at, r.decided_at, r.rewarded_at,
    r.driver_user_id,
    COALESCE(pr.full_name, 'Driver') AS driver_name,
    pr.phone AS driver_phone,
    COALESCE(trip_stats.completed, 0) AS driver_trips_completed,
    COALESCE(ref_stats.total, 0) AS driver_referrals_total,
    COALESCE(ref_stats.converted, 0) AS driver_referrals_converted,
    rc.post_id, rc.org_id AS campaign_org_id, rc.status AS campaign_status,
    rc.snapshot_post_type, rc.snapshot_title, rc.snapshot_origin,
    rc.snapshot_destination, rc.snapshot_vehicle_type, rc.snapshot_material
  FROM public.reach_referrals r
  JOIN public.reach_campaigns rc ON rc.id = r.campaign_id
  LEFT JOIN public.profiles pr ON pr.id = r.driver_user_id
  LEFT JOIN public.drivers d
    ON d.organization_id = r.fleet_org_id AND d.user_id = r.driver_user_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS completed
    FROM public.trips t
    WHERE t.driver_id = d.id AND t.status = 'completed'
  ) trip_stats ON d.id IS NOT NULL
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE rr.status <> 'recommended') AS total,
      count(*) FILTER (WHERE rr.status = 'rewarded')     AS converted
    FROM public.reach_referrals rr
    WHERE rr.driver_user_id = r.driver_user_id AND rr.id <> r.id
  ) ref_stats ON true
  WHERE r.fleet_org_id = p_fleet_org_id
  ORDER BY (r.status = 'recommended') DESC, r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reach_referral_inbox(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reach_referral_inbox(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_reach_referral_inbox IS
  'Opportunities inbox (driver recommendations for a fleet org) enriched with campaign story snapshot, driver identity, intent, suggested rate, and scoring signals (completed trips + recommendation track record). Pending first, then newest.';

-- ── decide_reach_referral — funnel event on the decision ────────────────────

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

  PERFORM public.emit_platform_event(
    'ReachReferralDecided', v_referral.fleet_org_id,
    jsonb_build_object(
      'referral_id', p_referral_id, 'campaign_id', v_referral.campaign_id,
      'approved', p_approve
    )
  );

  RETURN jsonb_build_object('ok', true, 'referral_id', p_referral_id,
    'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END;
$$;
