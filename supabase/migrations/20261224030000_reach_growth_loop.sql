-- ============================================================
-- Reach growth loop — credit producers: org verification + referrals.
-- ============================================================
-- Does NOT reintroduce KYC review as a new table — organizations.verification_status,
-- admin_approve_profile()/admin_reject_profile(), and verification_audit_logs
-- (supabase/migrations/20260801000000_workspace_kyc_structure.sql,
-- 20260716062940_admin_approve_reject_allow_unverified.sql) already implement
-- the full review pipeline. This migration only adds: configurable award
-- amounts, a referral ledger, and two `authenticated`-safe wrapper RPCs so the
-- new control-tower/ app (real Supabase Auth, no service-role key) can drive
-- the existing approve/reject functions without those functions' grants
-- changing at all — analytics/'s direct service-role calls are untouched.

-- ── 1. Configurable award amounts (not hardcoded) ────────────────────────────

CREATE TABLE IF NOT EXISTS public.reward_rules (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key            text        NOT NULL UNIQUE CHECK (key IN ('verification_approved', 'referral_milestone_verified')),
  credit_amount  bigint      NOT NULL CHECK (credit_amount >= 0),
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_reward_rules_updated_at ON public.reward_rules;
CREATE TRIGGER trg_reward_rules_updated_at
  BEFORE UPDATE ON public.reward_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.reward_rules (key, credit_amount) VALUES
  ('verification_approved',        500),
  ('referral_milestone_verified',  250)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.reward_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reward_rules_platform_read" ON public.reward_rules;
CREATE POLICY "reward_rules_platform_read" ON public.reward_rules
  FOR SELECT USING (public.has_platform_permission((select auth.uid()), 'credits.issue'));

DROP POLICY IF EXISTS "reward_rules_platform_write" ON public.reward_rules;
CREATE POLICY "reward_rules_platform_write" ON public.reward_rules
  FOR ALL USING (public.has_platform_permission((select auth.uid()), 'credits.issue'))
  WITH CHECK (public.has_platform_permission((select auth.uid()), 'credits.issue'));

-- ── 2. Referral ledger ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pulse_credit_referrals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_org_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  referred_org_id   uuid        NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  status            text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'milestone_met', 'credited')),
  credited_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pcr_no_self_referral CHECK (referrer_org_id <> referred_org_id)
);

CREATE INDEX IF NOT EXISTS idx_pcr_referrer ON public.pulse_credit_referrals(referrer_org_id);

ALTER TABLE public.pulse_credit_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pcr_visible_to_participants" ON public.pulse_credit_referrals;
CREATE POLICY "pcr_visible_to_participants" ON public.pulse_credit_referrals
  FOR SELECT USING (
    referrer_org_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = (select auth.uid()) AND status = 'active')
    OR referred_org_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = (select auth.uid()) AND status = 'active')
    OR public.has_platform_permission((select auth.uid()), 'credits.issue')
  );

-- Self-service: the referred org records who referred them (e.g. during
-- onboarding). One referral per referred org (first write wins).
CREATE OR REPLACE FUNCTION public.record_referral(p_referrer_org_id uuid, p_referred_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_referred_org_id AND user_id = (select auth.uid()) AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of the referred organization';
  END IF;

  IF p_referrer_org_id = p_referred_org_id THEN
    RAISE EXCEPTION 'invalid_referral: an organization cannot refer itself';
  END IF;

  INSERT INTO public.pulse_credit_referrals (referrer_org_id, referred_org_id)
  VALUES (p_referrer_org_id, p_referred_org_id)
  ON CONFLICT (referred_org_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_referral(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_referral(uuid, uuid) TO authenticated;

-- ── 3. Authenticated-safe verification wrappers (Control Tower entry point) ──
-- Both are SECURITY DEFINER, owned by the migration role, and call the
-- existing admin_approve_profile/admin_reject_profile (also owned by that
-- role) directly — no grant changes to those functions, no new table
-- duplicating organizations.verification_status.

CREATE OR REPLACE FUNCTION public.platform_approve_verification(
  p_org_id  uuid,
  p_notes   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result           jsonb;
  v_verification_amt bigint;
  v_referral_amt      bigint;
  v_referral          record;
BEGIN
  IF NOT public.has_platform_permission((select auth.uid()), 'verification.approve') THEN
    RAISE EXCEPTION 'unauthorized: verification.approve permission required';
  END IF;

  v_result := public.admin_approve_profile(p_org_id, (select auth.uid()), p_notes);

  SELECT credit_amount INTO v_verification_amt
  FROM public.reward_rules WHERE key = 'verification_approved' AND is_active;

  IF v_verification_amt IS NOT NULL AND v_verification_amt > 0 THEN
    PERFORM public.increment_credit_wallet(
      p_org_id, 'earn_verification', v_verification_amt,
      'org_verification', p_org_id, 'Verification approved'
    );
  END IF;

  PERFORM public.emit_platform_event(
    'BusinessVerified', p_org_id,
    jsonb_build_object('admin_user_id', (select auth.uid()), 'credits_awarded', coalesce(v_verification_amt, 0))
  );

  -- Referral milestone: if this org was referred and the referral is still
  -- pending, crediting the referrer now that the referred org is verified.
  SELECT * INTO v_referral
  FROM public.pulse_credit_referrals
  WHERE referred_org_id = p_org_id AND status = 'pending'
  FOR UPDATE;

  IF FOUND THEN
    SELECT credit_amount INTO v_referral_amt
    FROM public.reward_rules WHERE key = 'referral_milestone_verified' AND is_active;

    IF v_referral_amt IS NOT NULL AND v_referral_amt > 0 THEN
      PERFORM public.increment_credit_wallet(
        v_referral.referrer_org_id, 'earn_referral', v_referral_amt,
        'pulse_credit_referral', v_referral.id, 'Referred org verified'
      );
    END IF;

    UPDATE public.pulse_credit_referrals
    SET status = 'credited', credited_at = now()
    WHERE id = v_referral.id;

    PERFORM public.emit_platform_event(
      'ReferralCompleted', v_referral.referrer_org_id,
      jsonb_build_object('referred_org_id', p_org_id, 'credits_awarded', coalesce(v_referral_amt, 0))
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_approve_verification(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_approve_verification(uuid, text) TO authenticated;

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

  PERFORM public.emit_platform_event(
    'BusinessVerificationRejected', p_org_id,
    jsonb_build_object('admin_user_id', (select auth.uid()), 'rejection_reasons', p_rejection_reasons)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_reject_verification(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_reject_verification(uuid, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.platform_approve_verification IS
  'Control Tower entry point (authenticated, permission-checked) for the existing admin_approve_profile pipeline. Also awards Pulse Credits and settles any pending referral for this org.';
COMMENT ON FUNCTION public.platform_reject_verification IS
  'Control Tower entry point (authenticated, permission-checked) for the existing admin_reject_profile pipeline.';
