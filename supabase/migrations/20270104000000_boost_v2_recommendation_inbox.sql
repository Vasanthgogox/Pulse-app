-- Boost V2 — Fleet Owner Recommendation Inbox + dual driver participation.
--
-- Persona model (derived from the EXISTING organization membership — no new
-- driver_type flag to keep in sync):
--   • Fleet-employed driver (active org membership, role='driver'):
--     recommends the load to their fleet owner; never bids directly. Reward
--     eligible. recommend_reach_campaign already enforces this membership.
--   • Independent driver (no active fleet membership): bids directly via the
--     existing bid lifecycle; the recommendation workflow is skipped entirely
--     and no recommendation reward applies (they're already the bidder).
--
-- This migration adds what the FLEET OWNER's decision screen needs:
--   1. Optional driver note on a recommendation.
--   2. get_reach_referral_inbox — one RPC returning the recommendation plus
--      the campaign's story snapshot and the driver's name, so the inbox can
--      render a decision-ready card without N+1 client joins.

ALTER TABLE public.reach_referrals
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.reach_referrals
  DROP CONSTRAINT IF EXISTS reach_referrals_note_length;
ALTER TABLE public.reach_referrals
  ADD CONSTRAINT reach_referrals_note_length CHECK (note IS NULL OR char_length(note) <= 500);

-- ── recommend_reach_campaign — optional driver note ─────────────────────────
-- Old 2-arg signature dropped so PostgREST doesn't see an ambiguous overload.

DROP FUNCTION IF EXISTS public.recommend_reach_campaign(uuid, uuid);

CREATE FUNCTION public.recommend_reach_campaign(
  p_campaign_id  uuid,
  p_fleet_org_id uuid,
  p_note         text DEFAULT NULL
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

  INSERT INTO public.reach_referrals (campaign_id, driver_user_id, fleet_org_id, reward_amount, note)
  VALUES (
    p_campaign_id, (select auth.uid()), p_fleet_org_id,
    CASE WHEN v_campaign.driver_reward_enabled THEN v_campaign.reward_amount ELSE 0 END,
    NULLIF(TRIM(p_note), '')
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

REVOKE ALL ON FUNCTION public.recommend_reach_campaign(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recommend_reach_campaign(uuid, uuid, text) TO authenticated;

-- ── get_reach_referral_inbox — decision-ready rows for the fleet owner ──────

CREATE OR REPLACE FUNCTION public.get_reach_referral_inbox(p_fleet_org_id uuid)
RETURNS TABLE (
  id                    uuid,
  campaign_id           uuid,
  status                text,
  reward_amount         bigint,
  note                  text,
  created_at            timestamptz,
  decided_at            timestamptz,
  rewarded_at           timestamptz,
  driver_user_id        uuid,
  driver_name           text,
  driver_phone          text,
  -- Story identity from the campaign snapshot (survives post deletion).
  post_id               uuid,
  campaign_org_id       uuid,
  campaign_status       text,
  snapshot_post_type    text,
  snapshot_title        text,
  snapshot_origin       text,
  snapshot_destination  text,
  snapshot_vehicle_type text,
  snapshot_material     text
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
    r.id, r.campaign_id, r.status, r.reward_amount, r.note,
    r.created_at, r.decided_at, r.rewarded_at,
    r.driver_user_id,
    COALESCE(pr.full_name, 'Driver') AS driver_name,
    pr.phone AS driver_phone,
    rc.post_id, rc.org_id AS campaign_org_id, rc.status AS campaign_status,
    rc.snapshot_post_type, rc.snapshot_title, rc.snapshot_origin,
    rc.snapshot_destination, rc.snapshot_vehicle_type, rc.snapshot_material
  FROM public.reach_referrals r
  JOIN public.reach_campaigns rc ON rc.id = r.campaign_id
  LEFT JOIN public.profiles pr ON pr.id = r.driver_user_id
  WHERE r.fleet_org_id = p_fleet_org_id
  ORDER BY (r.status = 'recommended') DESC, r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reach_referral_inbox(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reach_referral_inbox(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_reach_referral_inbox IS
  'Fleet Owner Recommendation Inbox: driver recommendations addressed to this org, enriched with the campaign story snapshot and driver identity. Pending first, then newest.';
