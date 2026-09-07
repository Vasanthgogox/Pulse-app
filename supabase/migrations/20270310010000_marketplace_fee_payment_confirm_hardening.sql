-- A8.7 amendment (pre-E2E hardening, requested before any commit):
-- 1. order.paid handling is added at the edge-function layer (no DB change
--    needed there -- it maps to the same p_outcome='paid' this function
--    already accepts).
-- 2. Explicit provider-order <-> Pulse-bid cross-check: an optional
--    p_expected_market_bid_id, sourced from the webhook payload's own
--    notes/receipt field when present, checked against the payment row's
--    actual market_bid_id (looked up via provider_order_id). A mismatch
--    is a distinct, named failure (bid_mismatch), not silently ignored.
-- 3. provider_payment_id reuse is now caught as a clean, named exception
--    (payment_id_reused) instead of a raw unique-constraint crash --
--    structurally this can't legitimately happen (Razorpay payment ids
--    belong to exactly one order), but a clear error is far better than an
--    opaque 23505 if it ever does.

CREATE OR REPLACE FUNCTION public.confirm_marketplace_fee_payment(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_provider_event_id text,
  p_provider_amount numeric,
  p_provider text DEFAULT 'razorpay',
  p_outcome text DEFAULT 'paid',
  p_failure_reason text DEFAULT NULL,
  p_expected_market_bid_id uuid DEFAULT NULL
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

  -- NEW: provider order <-> Pulse bid cross-check, when the caller has a
  -- value to check against (the webhook extracts this from the payload's
  -- own notes/receipt field, set by us at order-creation time). Optional
  -- because not every event payload reliably carries it (order entity is
  -- only present on order.paid, not payment.captured) -- but when present,
  -- it must agree with what WE recorded for this provider_order_id.
  IF p_expected_market_bid_id IS NOT NULL AND p_expected_market_bid_id <> v_payment.market_bid_id THEN
    RAISE EXCEPTION 'bid_mismatch: provider_order_id % is recorded against bid % but payload claims bid %',
      p_provider_order_id, v_payment.market_bid_id, p_expected_market_bid_id;
  END IF;

  -- Idempotency layer 1: this exact webhook event already processed on
  -- this row. Layer 2 is the unique index on provider_event_id itself.
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

  -- NEW: clean, named rejection of a provider_payment_id already attached
  -- to a DIFFERENT payment row -- structurally shouldn't happen (a
  -- Razorpay payment id belongs to exactly one order), but this turns a
  -- hypothetical raw 23505 into a clear, intentional error.
  IF p_provider_payment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.marketplace_fee_payments
    WHERE provider_payment_id = p_provider_payment_id AND id <> v_payment.id
  ) THEN
    RAISE EXCEPTION 'payment_id_reused: provider_payment_id % is already attached to a different payment attempt', p_provider_payment_id;
  END IF;

  -- Idempotency layer 3 (existing A8.6.2 behavior): a repeat confirmation
  -- of an already-paid attempt is a no-op success.
  IF v_payment.status = 'paid' AND p_outcome = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'market_bid_id', v_payment.market_bid_id, 'fee_payment_status', 'paid');
  END IF;

  IF p_outcome = 'paid' THEN
    -- Known, accepted limitation (rare double-checkout-tab scenario,
    -- explicitly out of scope to fully reconcile per A8.7's frozen scope):
    -- if a DIFFERENT row for this same bid is already 'paid', this row
    -- cannot also become 'paid' -- idx_marketplace_fee_payments_one_active_per_bid
    -- (A8.6.2) permits only one pending/paid row per bid. Record the
    -- payment facts for traceability without changing this row's status
    -- or touching market_bids.
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

REVOKE ALL ON FUNCTION public.confirm_marketplace_fee_payment(text, text, text, numeric, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_marketplace_fee_payment(text, text, text, numeric, text, text, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_marketplace_fee_payment(text, text, text, numeric, text, text, text, uuid) IS
  'A8.7: webhook-driven payment confirmation, correlated by provider_order_id. NOT callable by an ordinary bidder on themselves -- requires service_role or marketplace_fees.manage. Cross-checks p_provider_amount against the frozen payment amount, and (when supplied) p_expected_market_bid_id against the recorded market_bid_id -- both are named, explicit rejections rather than silent trust. provider_payment_id reuse is rejected cleanly. Idempotent on provider_event_id and on an already-paid row.';

DROP FUNCTION IF EXISTS public.confirm_marketplace_fee_payment(text, text, text, numeric, text, text, text);
