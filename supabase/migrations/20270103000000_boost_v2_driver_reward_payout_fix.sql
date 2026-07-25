-- Fix: convert_reach_referral marked a referral 'rewarded' and moved the
-- campaign's internal reward_reserved -> reward_paid bookkeeping, but never
-- actually paid the driver anywhere — no increment_credit_wallet (drivers
-- aren't organizations, that wouldn't even resolve) and no
-- add_driver_ledger_entry (would need driver_user_id -> drivers.id, never
-- done). The campaign's books said the money moved; the driver's balance
-- never did.
--
-- Fix, per product decision: driver rewards settle in INR via the existing
-- driver_ledger (add_driver_ledger_entry) — same ledger drivers already see
-- for trip earnings/salary, not a new Pulse Credits balance drivers have no
-- existing use for. add_driver_ledger_entry's amount-sign CASE already
-- defaults unrecognized types to a positive (credit) amount via its ELSE
-- branch, so only the CHECK constraint needs widening — no change to that
-- function's logic.

ALTER TABLE public.driver_ledger DROP CONSTRAINT IF EXISTS driver_ledger_type_check;
ALTER TABLE public.driver_ledger
  ADD CONSTRAINT driver_ledger_type_check
  CHECK (type = ANY (ARRAY['advance','settlement','salary','reimbursement','adjustment','deduction','reward']::text[]));

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

    -- Resolve the recommending driver's row in THIS fleet org (driver_user_id
    -- is an auth.users id; driver_ledger needs drivers.id).
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

COMMENT ON FUNCTION public.convert_reach_referral IS
  'Reward release on trip conversion — moves campaign escrow reserved->paid AND actually pays the driver via add_driver_ledger_entry (INR, driver_ledger). Fixed: previously moved campaign bookkeeping only, never paid the driver.';
