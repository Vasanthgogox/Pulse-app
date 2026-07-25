-- ============================================================
-- Pulse Credits — org-level wallet + append-only ledger.
-- ============================================================
-- "Credits" are Pulse's internal token/currency: earned via referral or org
-- verification (see the growth-loop migration), spent on Reach campaign
-- publishing (see the Reach core migration) as an alternative to paying cash.
-- Modeled directly on the existing usage-metering pattern in
-- supabase/migrations/20260910000000_workspace_products.sql
-- (increment_product_usage / product_usage) — same atomic upsert shape.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pulse_credit_wallets (
  org_id          uuid        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance         bigint      NOT NULL DEFAULT 0,
  lifetime_earned bigint      NOT NULL DEFAULT 0,
  lifetime_spent  bigint      NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pcw_balance_nonnegative CHECK (balance >= 0)
);

CREATE TABLE IF NOT EXISTS public.pulse_credit_transactions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type            text        NOT NULL CHECK (type IN (
                    'earn_referral', 'earn_verification', 'spend_reach',
                    'admin_adjustment', 'refund', 'expiry'
                  )),
  amount          bigint      NOT NULL,  -- signed: positive = credit, negative = debit
  balance_after   bigint      NOT NULL,
  reference_type  text,                  -- e.g. 'reach_campaign_purchase', 'org_verification'
  reference_id    uuid,
  created_by      uuid        REFERENCES auth.users(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pct_org_created   ON public.pulse_credit_transactions(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pct_reference      ON public.pulse_credit_transactions(reference_type, reference_id);

ALTER TABLE public.pulse_credit_wallets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_credit_transactions  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_view_wallet" ON public.pulse_credit_wallets;
CREATE POLICY "org_members_view_wallet" ON public.pulse_credit_wallets
  FOR SELECT USING (
    org_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
    OR public.has_platform_permission((select auth.uid()), 'credits.issue')
  );

DROP POLICY IF EXISTS "org_members_view_ledger" ON public.pulse_credit_transactions;
CREATE POLICY "org_members_view_ledger" ON public.pulse_credit_transactions
  FOR SELECT USING (
    org_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
    OR public.has_platform_permission((select auth.uid()), 'credits.issue')
  );

-- Writes go exclusively through increment_credit_wallet (SECURITY DEFINER) —
-- no direct INSERT/UPDATE policy for authenticated/anon on either table.

-- ── Atomic ledger + wallet update ─────────────────────────────────────────────
-- p_amount is signed. Debits (negative amounts, e.g. type='spend_reach') fail
-- if they would take the balance below zero — caller should pre-check balance
-- for a friendly error, but this is the authoritative guard.

CREATE OR REPLACE FUNCTION public.increment_credit_wallet(
  p_org_id         uuid,
  p_type           text,
  p_amount         bigint,
  p_reference_type text DEFAULT NULL,
  p_reference_id   uuid DEFAULT NULL,
  p_notes          text DEFAULT NULL
)
RETURNS TABLE (balance bigint, transaction_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_balance bigint;
  v_tx_id   uuid;
BEGIN
  -- Admin-adjustment (either direction) requires the credits permission;
  -- every other type is only ever called from other SECURITY DEFINER RPCs
  -- (verification approval, referral milestone, Reach publish/refund), so no
  -- additional auth.uid() gate is applied here for those.
  IF p_type = 'admin_adjustment'
     AND NOT public.has_platform_permission((select auth.uid()), 'credits.issue')
  THEN
    RAISE EXCEPTION 'unauthorized: credits.issue permission required';
  END IF;

  -- The pcw_balance_nonnegative CHECK constraint is the authoritative guard
  -- against a negative balance; catch its violation here and re-raise as a
  -- friendly, caller-matchable error instead of a raw constraint message.
  BEGIN
    INSERT INTO public.pulse_credit_wallets (org_id, balance, lifetime_earned, lifetime_spent)
    VALUES (
      p_org_id,
      GREATEST(p_amount, 0),
      GREATEST(p_amount, 0),
      GREATEST(-p_amount, 0)
    )
    ON CONFLICT (org_id) DO UPDATE SET
      balance         = public.pulse_credit_wallets.balance + p_amount,
      lifetime_earned = public.pulse_credit_wallets.lifetime_earned + GREATEST(p_amount, 0),
      lifetime_spent  = public.pulse_credit_wallets.lifetime_spent + GREATEST(-p_amount, 0),
      updated_at      = now()
    RETURNING public.pulse_credit_wallets.balance INTO v_balance;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'insufficient_credits: wallet balance would go negative for org %', p_org_id;
  END;

  INSERT INTO public.pulse_credit_transactions
    (org_id, type, amount, balance_after, reference_type, reference_id, created_by, notes)
  VALUES
    (p_org_id, p_type, p_amount, v_balance, p_reference_type, p_reference_id, (select auth.uid()), p_notes)
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_balance, v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_credit_wallet(uuid, text, bigint, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_credit_wallet(uuid, text, bigint, text, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.increment_credit_wallet IS
  'Atomic Pulse Credits wallet update + ledger row. Rolls back (raises insufficient_credits) if balance would go negative.';
