-- Growth Activation (Phase 2.4) — wires the referral backend that already
-- shipped in 20261224030000_reach_growth_loop.sql (reward_rules,
-- pulse_credit_referrals, record_referral, platform_approve_verification)
-- but has never been called from the app (pulse_credit_referrals has zero
-- rows in production). This migration only closes the two real gaps: a
-- human-readable code/link (today's record_referral takes a raw org UUID),
-- and a terminal 'rejected' status (there isn't one). No change to
-- record_referral, increment_credit_wallet, or any existing RLS policy.

-- ── 1. Both parties get 500 credits — config change only, no logic change.
-- The verified org already gets reward_rules.verification_approved (500)
-- unconditionally via platform_approve_verification; only the referrer's
-- side needs raising to match. ─────────────────────────────────────────────

UPDATE public.reward_rules SET credit_amount = 500 WHERE key = 'referral_milestone_verified';

-- ── 2. Human-readable referral code, lazily generated per org ──────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

CREATE OR REPLACE FUNCTION public.generate_referral_code(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing   text;
  v_org_name   text;
  v_base       text;
  v_candidate  text;
  v_suffix     int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id AND user_id = (select auth.uid()) AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of %', p_org_id;
  END IF;

  SELECT referral_code, name INTO v_existing, v_org_name
  FROM public.organizations WHERE id = p_org_id;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Uppercase, alphanumeric-only prefix from the org name (4-6 chars),
  -- falling back to "PULSE" for names with no usable letters.
  v_base := upper(regexp_replace(coalesce(v_org_name, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_base := substring(v_base from 1 for 6);
  IF length(v_base) < 3 THEN
    v_base := 'PULSE';
  END IF;

  v_candidate := v_base;
  v_suffix := 0;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE referral_code = v_candidate) LOOP
    v_suffix := v_suffix + 1;
    v_candidate := v_base || v_suffix::text;
    EXIT WHEN v_suffix > 999; -- defensive bound, never expected to hit
  END LOOP;

  UPDATE public.organizations
  SET referral_code = v_candidate
  WHERE id = p_org_id AND referral_code IS NULL
  RETURNING referral_code INTO v_candidate;

  -- Someone else generated one concurrently between our SELECT and UPDATE —
  -- return whichever code actually stuck.
  IF v_candidate IS NULL THEN
    SELECT referral_code INTO v_candidate FROM public.organizations WHERE id = p_org_id;
  END IF;

  RETURN v_candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_referral_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_referral_code(uuid) TO authenticated;

-- Any authenticated user may resolve a code to a display name (public
-- landing page needs the referrer's org name before the visitor has an
-- account) — narrow, read-only, name-only exposure via a function rather
-- than a broad public SELECT grant on organizations.
CREATE OR REPLACE FUNCTION public.get_referrer_name_by_code(p_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT name FROM public.organizations WHERE referral_code = p_code;
$$;

REVOKE ALL ON FUNCTION public.get_referrer_name_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_referrer_name_by_code(text) TO anon, authenticated;

-- ── 3. Code-based referral recording — resolves code, delegates to the
-- existing record_referral (unchanged). ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_referral_by_code(p_code text, p_referred_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referrer_org_id uuid;
BEGIN
  SELECT id INTO v_referrer_org_id FROM public.organizations WHERE referral_code = p_code;
  IF v_referrer_org_id IS NULL THEN
    RAISE EXCEPTION 'not_found: no organization for referral code %', p_code;
  END IF;

  RETURN public.record_referral(v_referrer_org_id, p_referred_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_referral_by_code(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_referral_by_code(text, uuid) TO authenticated;

-- ── 4. Rejected status — the missing terminal state. A referral whose
-- referred org gets rejected currently stays 'pending' forever with no way
-- to distinguish "still pending" from "will never complete". ──────────────

ALTER TABLE public.pulse_credit_referrals DROP CONSTRAINT IF EXISTS pulse_credit_referrals_status_check;
ALTER TABLE public.pulse_credit_referrals
  ADD CONSTRAINT pulse_credit_referrals_status_check
  CHECK (status IN ('pending', 'milestone_met', 'credited', 'rejected'));

CREATE OR REPLACE FUNCTION public.platform_reject_verification(
  p_org_id            uuid,
  p_rejection_reasons jsonb,
  p_notes             text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.has_platform_permission((select auth.uid()), 'verification.review') THEN
    RAISE EXCEPTION 'unauthorized: verification.review permission required';
  END IF;

  v_result := public.admin_reject_profile(p_org_id, (select auth.uid()), p_rejection_reasons, p_notes);

  -- Mirrors platform_approve_verification's referral-settlement step, but
  -- for the failure path: a pending referral for this org can never
  -- complete now, so mark it rejected instead of leaving it pending forever.
  UPDATE public.pulse_credit_referrals
  SET status = 'rejected'
  WHERE referred_org_id = p_org_id AND status = 'pending';

  PERFORM public.emit_platform_event(
    'BusinessVerificationRejected', p_org_id,
    jsonb_build_object('admin_user_id', (select auth.uid()), 'rejection_reasons', p_rejection_reasons)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_reject_verification(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_reject_verification(uuid, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.generate_referral_code IS
  'Lazily generates and returns a stable, human-readable referral code for an org (idempotent — safe to call every time Earn Credits loads).';
COMMENT ON FUNCTION public.record_referral_by_code IS
  'Resolves a referral_code to its owning org and delegates to record_referral — no change to that function.';
