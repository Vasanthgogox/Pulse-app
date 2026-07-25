-- Two bug fixes surfaced by actually using the deployed Boost flow:
--
-- 1. State mismatch: publish_reach_campaign set status='active' immediately
--    regardless of payment method, so a 'money' (cash) boost — which has no
--    real payment gateway behind it — went live at the same moment its own
--    success screen said "Payment is pending". Fix: only 'credits' (fully
--    real, atomic) goes active immediately. 'money' stays 'draft' — reusing
--    the existing lifecycle rather than inventing a new state — until
--    something (a future admin confirm-payment action, not built here)
--    activates it. published_at/expires_at stay null until that happens.
--
-- 2. Dead end: a customer with 0 credits had no way to ever get any — Earn
--    Credits is intentionally deferred. Until it exists, the existing
--    (service-role, no-login) analytics/ admin console needs a way to grant
--    credits directly, the same trust model already used for
--    admin_approve_profile/admin_reject_profile (service_role-only, no
--    Platform IAM check) — NOT the has_platform_permission(auth.uid(), ...)
--    path, which requires a real logged-in platform user that analytics/
--    doesn't have.

CREATE OR REPLACE FUNCTION public.publish_reach_campaign(
  p_org_id          uuid,
  p_post_id         uuid,
  p_plan_id         uuid,
  p_payment_method  text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan          record;
  v_campaign_id   uuid;
  v_purchase_id   uuid;
  v_purchase_status text;
  v_campaign_status text;
  v_published_at  timestamptz;
  v_expires_at    timestamptz;
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

  IF p_payment_method = 'credits' THEN
    v_campaign_status := 'active';
    v_published_at := now();
    v_expires_at := now() + (v_plan.duration_hours || ' hours')::interval;
  ELSE
    -- No payment gateway exists yet — don't go live on an unconfirmed charge.
    v_campaign_status := 'draft';
    v_published_at := NULL;
    v_expires_at := NULL;
  END IF;

  INSERT INTO public.reach_campaigns (org_id, post_id, created_by, plan_id, status, published_at, expires_at)
  VALUES (p_org_id, p_post_id, (select auth.uid()), p_plan_id, v_campaign_status, v_published_at, v_expires_at)
  RETURNING id INTO v_campaign_id;

  IF p_payment_method = 'credits' THEN
    PERFORM public.increment_credit_wallet(
      p_org_id, 'spend_reach', -v_plan.credit_price,
      'reach_campaign_purchase', v_campaign_id, 'Boost: ' || v_plan.name
    );
    v_purchase_status := 'paid';
  ELSE
    v_purchase_status := 'pending';
  END IF;

  INSERT INTO public.reach_campaign_purchases
    (campaign_id, plan_id, payment_method, credits_charged, amount_inr_charged, status)
  VALUES (
    v_campaign_id, p_plan_id, p_payment_method,
    CASE WHEN p_payment_method = 'credits' THEN v_plan.credit_price ELSE 0 END,
    CASE WHEN p_payment_method = 'money' THEN v_plan.price_inr ELSE 0 END,
    v_purchase_status
  )
  RETURNING id INTO v_purchase_id;

  PERFORM public.emit_platform_event(
    'ReachCampaignPublished', p_org_id,
    jsonb_build_object('campaign_id', v_campaign_id, 'post_id', p_post_id, 'plan_code', v_plan.code, 'payment_method', p_payment_method, 'status', v_campaign_status)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', v_campaign_id,
    'purchase_id', v_purchase_id,
    'purchase_status', v_purchase_status,
    'campaign_status', v_campaign_status,
    'plan_code', v_plan.code,
    'expires_at', v_expires_at
  );
END;
$$;

-- reach_campaigns_one_active_per_post already covers 'draft' + 'active', so a
-- pending-cash draft still correctly blocks a second simultaneous boost on
-- the same post — no index change needed.

-- ── Admin credit grant — same trust model as admin_approve_profile ─────────

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
  -- admin_adjustment is authorized either by a real platform-permission
  -- holder (control-tower, once it exists) OR by the service_role itself —
  -- the same bare trust model this codebase already uses for
  -- admin_approve_profile/admin_reject_profile (analytics/ has no logged-in
  -- platform user to check has_platform_permission against).
  -- NULL-safe: (select auth.role()) is NULL for any normal authenticated
  -- caller (no JWT role claim), and `false OR NULL` is NULL, not false — a
  -- bare `NOT (... OR auth.role() = 'service_role')` would silently skip the
  -- exception for every non-service-role caller. Coalesce both sides to a
  -- real boolean before combining. (Caught by an actual security regression
  -- during testing — verify this class of change with a real "unrelated
  -- user, no special role" test case, not just the happy path.)
  IF p_type = 'admin_adjustment'
     AND NOT (
       COALESCE(public.has_platform_permission((select auth.uid()), 'credits.issue'), false)
       OR COALESCE((select auth.role()) = 'service_role', false)
     )
  THEN
    RAISE EXCEPTION 'unauthorized: credits.issue permission required';
  END IF;

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

COMMENT ON FUNCTION public.increment_credit_wallet IS
  'Atomic Pulse Credits wallet update + ledger row. admin_adjustment requires either credits.issue platform permission or service_role (analytics/ admin console).';
