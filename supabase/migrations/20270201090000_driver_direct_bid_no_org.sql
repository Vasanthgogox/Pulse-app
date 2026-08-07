-- =============================================================================
-- Driver direct bidding — no organization required.
--
-- Context: Boost V2 (20270107000000) already specs three driver personas for
-- a boosted story (features/reach/utils/driverParticipation.ts):
--   employed    -> "Recommend to Fleet Owner" (already wired, works today)
--   invited     -> "Join your fleet to participate" (informational, no action)
--   independent -> "Bid Now" (spec'd in driverStoryCta(), never actually wired)
--
-- The existing marketplace bid path (submit_pulse_bid_with_direct_quote,
-- bids.bidder_organization_id NOT NULL) requires the caller to be a member of
-- a bidding organization. Independent drivers have none — handle_new_user()
-- only provisions an organization for role='user' owner signups, never for
-- role='driver'. Rather than retrofit the core, already-gated Marketplace
-- bids table (docs/MARKETPLACE_P0_VALIDATION.md gates still open) to accept
-- nullable orgs, this is a separate, narrowly-scoped table + RPC just for a
-- driver bidding on a Reach story as themselves. Award/acceptance (what a
-- shipper does with a driver's direct bid — trip creation, payout) is
-- deliberately NOT built here; this covers submission + status display only.
-- =============================================================================

CREATE TABLE public.driver_direct_bids (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  driver_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount          numeric NOT NULL CHECK (amount > 0),
  note            text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status = ANY (ARRAY['pending', 'accepted', 'rejected', 'withdrawn'])),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, driver_user_id)
);

CREATE INDEX idx_driver_direct_bids_post ON public.driver_direct_bids (post_id);
CREATE INDEX idx_driver_direct_bids_driver ON public.driver_direct_bids (driver_user_id);

ALTER TABLE public.driver_direct_bids ENABLE ROW LEVEL SECURITY;

-- One SELECT policy (One Authorization Truth — docs/REALTIME_PLATFORM_RULES.md):
-- the driver who placed it, or a member of the org that owns the post (for a
-- future award/acceptance surface — read-only for now, nothing consumes this
-- side yet).
CREATE POLICY "driver_direct_bids_select"
  ON public.driver_direct_bids FOR SELECT
  TO authenticated
  USING (
    driver_user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.posts p
      JOIN public.organization_members om
        ON om.organization_id = p.organization_id
       AND om.user_id = (select auth.uid())
       AND om.status = 'active'
      WHERE p.id = driver_direct_bids.post_id
    )
  );

-- Inserts only via submit_driver_direct_bid() (SECURITY DEFINER, validates the
-- post is actually boosted to drivers). No direct-table INSERT policy —
-- matches the existing bids/direct_quotes convention of RPC-gated writes for
-- anything that touches money.
REVOKE ALL ON public.driver_direct_bids FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.driver_direct_bids TO authenticated;

-- ── Submit / update a direct bid ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_driver_direct_bid(
  p_post_id uuid,
  p_amount  numeric,
  p_note    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bid_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role = 'driver')
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = v_uid AND om.role = 'driver' AND om.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a driver';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  -- Post must actually be a live, driver-channel boosted story — a driver
  -- can't direct-bid on an arbitrary post that was never distributed to them.
  IF NOT EXISTS (
    SELECT 1
    FROM public.reach_campaigns rc
    JOIN public.posts p ON p.id = rc.post_id
    WHERE rc.post_id = p_post_id
      AND rc.status = 'active'
      AND p.is_active
      AND 'driver' = ANY (rc.distribution_channels)
  ) THEN
    RAISE EXCEPTION 'not_biddable: post % is not an active driver-channel story', p_post_id;
  END IF;

  INSERT INTO public.driver_direct_bids (post_id, driver_user_id, amount, note)
  VALUES (p_post_id, v_uid, p_amount, NULLIF(TRIM(COALESCE(p_note, '')), ''))
  ON CONFLICT (post_id, driver_user_id) DO UPDATE SET
    amount = EXCLUDED.amount,
    note = EXCLUDED.note,
    updated_at = now()
  WHERE public.driver_direct_bids.status = 'pending'
  RETURNING id INTO v_bid_id;

  IF v_bid_id IS NULL THEN
    RAISE EXCEPTION 'bid_locked: an existing decided bid cannot be changed';
  END IF;

  RETURN jsonb_build_object('bid_id', v_bid_id, 'post_id', p_post_id, 'amount', p_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_driver_direct_bid(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_driver_direct_bid(uuid, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.submit_driver_direct_bid IS
  'Independent driver bids on a boosted Reach story as themselves — no organization required. Submission + status only; award/acceptance is a separate, not-yet-built surface.';

-- ── Expose post_id + the driver's own direct-bid status from the story feed ─
DROP FUNCTION public.get_driver_reach_stories();

CREATE FUNCTION public.get_driver_reach_stories()
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
  reward_available       boolean,
  referral_id            uuid,
  referral_status        text,
  referral_reward_amount bigint,
  recommended_at         timestamptz,
  rewarded_at            timestamptz,
  post_id                uuid,
  direct_bid_status      text,
  direct_bid_amount      numeric
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
    r.id, r.status, r.reward_amount, r.created_at, r.rewarded_at,
    rc.post_id, db.status, db.amount
  FROM public.reach_campaigns rc
  JOIN public.organizations o ON o.id = rc.org_id
  LEFT JOIN public.reach_referrals r
    ON r.campaign_id = rc.id AND r.driver_user_id = (select auth.uid())
  LEFT JOIN public.driver_direct_bids db
    ON db.post_id = rc.post_id AND db.driver_user_id = (select auth.uid())
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
  'Driver Story tab: active driver-channel boosted stories (disappear once the load is assigned to someone else) plus the driver''s own rewarded conversions with earnings, and (post_id, direct_bid_status, direct_bid_amount) for the independent-driver direct-bid path. Rejected recommendations remain visible while the story is live.';
