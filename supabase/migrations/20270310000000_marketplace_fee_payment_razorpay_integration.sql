-- A8.7 — Razorpay test-mode integration for the Marketplace platform fee.
-- Fills in the payment mechanism A8.6.2 deliberately left unbuilt: the
-- fee_payment_status state machine (not_required/required/pending/paid/
-- failed/expired), the trip-creation gates, and the contact-reveal gates
-- are all UNCHANGED -- this migration only adds the plumbing that lets a
-- real order -> checkout -> webhook round trip move that state from
-- required to paid.

-- ---------------------------------------------------------------------
-- 1a. marketplace_fee_payments hardening: an event, an order, and a
-- captured payment can each correspond to at most one payment attempt row.
ALTER TABLE public.marketplace_fee_payments
  ADD COLUMN provider_event_id text NULL;

CREATE UNIQUE INDEX idx_marketplace_fee_payments_provider_order_id
  ON public.marketplace_fee_payments (provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE UNIQUE INDEX idx_marketplace_fee_payments_provider_payment_id
  ON public.marketplace_fee_payments (provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE UNIQUE INDEX idx_marketplace_fee_payments_provider_event_id
  ON public.marketplace_fee_payments (provider_event_id) WHERE provider_event_id IS NOT NULL;

COMMENT ON COLUMN public.marketplace_fee_payments.provider_event_id IS
  'A8.7: Razorpay webhook event id (x-razorpay-event-id), used for idempotent webhook-delivery dedup. Unique when set.';

-- ---------------------------------------------------------------------
-- 1b. initiate_marketplace_fee_payment_order(): the bidder-initiated
-- "checkout started" step. Called by razorpay-create-order using the
-- bidder's own forwarded JWT (not service_role) -- same trust level as
-- submit_market_bid. Amount is always read server-side from
-- market_bids.platform_fee_amount, never accepted as a parameter.
CREATE OR REPLACE FUNCTION public.initiate_marketplace_fee_payment_order(
  p_bid_id uuid,
  p_provider_order_id text,
  p_provider text DEFAULT 'razorpay'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_bid public.market_bids;
BEGIN
  SELECT * INTO v_bid FROM public.market_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: bid %', p_bid_id;
  END IF;

  IF (select auth.uid()) <> v_bid.bidder_user_id THEN
    RAISE EXCEPTION 'unauthorized: caller must be the bidder who won this bid';
  END IF;
  IF v_bid.status <> 'accepted' THEN
    RAISE EXCEPTION 'invalid_state: bid % is not an accepted award (current: %)', p_bid_id, v_bid.status;
  END IF;
  -- 'pending' is allowed alongside 'required'/'failed': it represents an
  -- earlier checkout attempt that was started but never confirmed
  -- (abandoned WebView, no webhook ever arrived) -- exactly the retry case
  -- the cancel-on-retry step below exists to handle. No expiry policy
  -- exists (A8.7 scope), so this is the only path back to a fresh attempt.
  IF v_bid.fee_payment_status NOT IN ('required', 'failed', 'pending') THEN
    RAISE EXCEPTION 'invalid_state: fee_payment_status is % -- nothing to pay', v_bid.fee_payment_status;
  END IF;
  IF coalesce(v_bid.platform_fee_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'invalid_fee: bid % has no positive platform_fee_amount to collect', p_bid_id;
  END IF;

  -- Supersede, don't delete: no expiry/reconciliation policy exists (A8.7
  -- scope), so an abandoned earlier attempt is marked 'cancelled' rather
  -- than overwritten -- its provider_order_id stays queryable if a stray
  -- webhook for it ever arrives later. Frees the "one active row per bid"
  -- partial unique index (idx_marketplace_fee_payments_one_active_per_bid,
  -- A8.6.2) for the fresh row below.
  UPDATE public.marketplace_fee_payments
  SET status = 'cancelled', updated_at = now()
  WHERE market_bid_id = p_bid_id AND status = 'pending';

  INSERT INTO public.marketplace_fee_payments (
    market_bid_id, bidder_type, bidder_user_id, bidder_organization_id,
    amount, provider, provider_order_id, status
  ) VALUES (
    p_bid_id, v_bid.bidder_type, v_bid.bidder_user_id, v_bid.bidder_organization_id,
    v_bid.platform_fee_amount, p_provider, p_provider_order_id, 'pending'
  );

  UPDATE public.market_bids SET fee_payment_status = 'pending', updated_at = now() WHERE id = p_bid_id;

  RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'amount', v_bid.platform_fee_amount);
END;
$function$;

REVOKE ALL ON FUNCTION public.initiate_marketplace_fee_payment_order(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initiate_marketplace_fee_payment_order(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.initiate_marketplace_fee_payment_order(uuid, text, text) IS
  'A8.7: bidder-initiated "checkout started" step, called by the razorpay-create-order edge function with the bidder''s own forwarded JWT. Records the pending payment attempt (amount frozen server-side from market_bids.platform_fee_amount, never client-supplied) and flips fee_payment_status to pending. Cancels (not deletes) any prior pending attempt for this bid.';

-- ---------------------------------------------------------------------
-- 1c. confirm_marketplace_fee_payment(): re-signatured to correlate by
-- provider_order_id (what a Razorpay webhook payload actually identifies)
-- instead of a market_bids.id the webhook never has. The authorization
-- gate (service_role OR marketplace_fees.manage) is unchanged from A8.6.2.
-- The only real caller before this migration was a manual-test path with
-- no production traffic, so this signature change carries no live-caller
-- risk.
CREATE OR REPLACE FUNCTION public.confirm_marketplace_fee_payment(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_provider_event_id text,
  p_provider_amount numeric,
  p_provider text DEFAULT 'razorpay',
  p_outcome text DEFAULT 'paid',
  p_failure_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_payment public.marketplace_fee_payments;
BEGIN
  IF NOT (
    current_user = 'service_role'
    OR current_setting('role', true) = 'service_role'
    OR public.has_platform_permission((select auth.uid()), 'marketplace_fees.manage')
  ) THEN
    RAISE EXCEPTION 'unauthorized: marketplace_fees.manage permission (or service_role) required';
  END IF;
  IF p_outcome NOT IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'invalid_outcome: % (must be paid or failed)', p_outcome;
  END IF;

  SELECT * INTO v_payment FROM public.marketplace_fee_payments
  WHERE provider_order_id = p_provider_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: no payment attempt for provider_order_id %', p_provider_order_id;
  END IF;

  -- Idempotency layer 1: this exact webhook event already processed on
  -- this row. Layer 2 is the unique index on provider_event_id itself
  -- (belt and suspenders, per review -- don't rely on one mechanism).
  IF v_payment.provider_event_id IS NOT NULL AND v_payment.provider_event_id = p_provider_event_id THEN
    RETURN jsonb_build_object('ok', true, 'note', 'duplicate_event_ignored', 'market_bid_id', v_payment.market_bid_id);
  END IF;

  -- Security check: the gateway's reported amount must match the frozen
  -- fee amount recorded at order-initiation time -- never trust the
  -- webhook payload's amount blindly.
  IF p_outcome = 'paid' AND p_provider_amount IS DISTINCT FROM v_payment.amount THEN
    RAISE EXCEPTION 'amount_mismatch: provider reported % but payment % was recorded for %',
      p_provider_amount, v_payment.id, v_payment.amount;
  END IF;

  -- Idempotency layer 3 (existing A8.6.2 behavior): a repeat confirmation
  -- of an already-paid attempt is a no-op success.
  IF v_payment.status = 'paid' AND p_outcome = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'market_bid_id', v_payment.market_bid_id, 'fee_payment_status', 'paid');
  END IF;

  IF p_outcome = 'paid' THEN
    -- Known, accepted limitation (rare double-checkout-tab scenario,
    -- explicitly out of scope to fully reconcile per A8.7's frozen scope):
    -- if a DIFFERENT row for this same bid is already 'paid' (the bidder
    -- somehow completed two separate checkout attempts), this row cannot
    -- also become 'paid' -- idx_marketplace_fee_payments_one_active_per_bid
    -- (A8.6.2) permits only one pending/paid row per bid. Record the
    -- payment facts for traceability without changing this row's status
    -- or touching market_bids (already correctly 'paid' via the other
    -- row) -- surfaced distinctly so the caller can log/alert on it
    -- rather than crashing on a raw constraint violation.
    IF EXISTS (
      SELECT 1 FROM public.marketplace_fee_payments
      WHERE market_bid_id = v_payment.market_bid_id AND status = 'paid' AND id <> v_payment.id
    ) THEN
      UPDATE public.marketplace_fee_payments
      SET paid_at = now(), provider_payment_id = p_provider_payment_id,
          provider_event_id = p_provider_event_id, updated_at = now()
      WHERE id = v_payment.id;
      RETURN jsonb_build_object(
        'ok', true, 'note', 'duplicate_payment_recorded_not_applied',
        'market_bid_id', v_payment.market_bid_id
      );
    END IF;

    UPDATE public.marketplace_fee_payments
    SET status = 'paid', paid_at = now(),
        provider_payment_id = p_provider_payment_id,
        provider_event_id = p_provider_event_id,
        updated_at = now()
    WHERE id = v_payment.id;

    UPDATE public.market_bids
    SET fee_payment_status = 'paid', updated_at = now()
    WHERE id = v_payment.market_bid_id AND fee_payment_status <> 'paid';

    RETURN jsonb_build_object('ok', true, 'market_bid_id', v_payment.market_bid_id, 'fee_payment_status', 'paid');
  ELSE
    UPDATE public.marketplace_fee_payments
    SET status = 'failed', failed_at = now(), failure_reason = p_failure_reason,
        provider_event_id = p_provider_event_id, updated_at = now()
    WHERE id = v_payment.id;

    UPDATE public.market_bids
    SET fee_payment_status = 'failed', updated_at = now()
    WHERE id = v_payment.market_bid_id AND fee_payment_status = 'pending';

    RETURN jsonb_build_object('ok', true, 'market_bid_id', v_payment.market_bid_id, 'fee_payment_status', 'failed');
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_marketplace_fee_payment(text, text, text, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_marketplace_fee_payment(text, text, text, numeric, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_marketplace_fee_payment(text, text, text, numeric, text, text, text) IS
  'A8.7: webhook-driven payment confirmation, correlated by provider_order_id. NOT callable by an ordinary bidder on themselves -- requires service_role (the razorpay-webhook edge function) or marketplace_fees.manage (manual staff override). Cross-checks p_provider_amount against the frozen payment amount before marking paid. Idempotent on provider_event_id and on an already-paid row.';

-- Drop the old A8.6.2 5-argument signature -- no live caller depends on
-- it (confirmed: only a manual-test/SQL-console path existed, never
-- shipped to any frontend).
DROP FUNCTION IF EXISTS public.confirm_marketplace_fee_payment(uuid, text, text, text, text);
