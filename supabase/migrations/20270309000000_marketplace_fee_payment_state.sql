-- A8.6.2 — Marketplace platform fee payment state, decoupled from award state.
--
-- market_bids.status keeps meaning "who won" only. Whether the winner has
-- paid Pulse's platform fee is a SEPARATE state machine, tracked here and in
-- the new marketplace_fee_payments table -- never overloaded onto
-- market_bids.status itself (that would make e.g. "accepted-but-unpaid" and
-- "accepted-and-paid" indistinguishable to every existing consumer of
-- status, several of which (OrgMyBidsList, MyBidsScreen,
-- AvailableLoadDetailScreen) already branch on status === 'accepted').

ALTER TABLE public.market_bids
  ADD COLUMN fee_payment_status text NOT NULL DEFAULT 'not_required'
    CHECK (fee_payment_status IN ('not_required', 'required', 'pending', 'paid', 'failed', 'expired')),
  ADD COLUMN platform_fee_amount numeric NULL
    CHECK (platform_fee_amount IS NULL OR platform_fee_amount >= 0),
  ADD COLUMN platform_fee_calc_snapshot jsonb NULL;

COMMENT ON COLUMN public.market_bids.fee_payment_status IS
  'A8.6.2: independent of status (award outcome). not_required = fee engine inactive/resolved to 0 at award time (todays default, in production); required = fee >0 and unpaid; pending = payment initiated with a provider (A8.7); paid = confirmed by confirm_marketplace_fee_payment(); failed = provider reported failure, retryable, no auto-expiry in this phase; expired = reserved for a future TTL policy, not set by anything yet. Populated once at award (award_market_bid()) for BOTH bidder types and never recomputed after.';

COMMENT ON COLUMN public.market_bids.platform_fee_amount IS
  'A8.6.2: resolved_fee from calculate_marketplace_platform_fee() at the moment of award, for BOTH bidder types. 0 when fee_payment_status=not_required. Locked in at award time -- a later Admin config change never retroactively changes this.';

COMMENT ON COLUMN public.market_bids.platform_fee_calc_snapshot IS
  'A8.6.2: full calculate_marketplace_platform_fee() breakdown at award time, for BOTH bidder types (mirrors trips.platform_fee_calc_snapshot, added A8.3, DCO-only). Explain-why breakdown, not authoritative -- platform_fee_amount is.';

-- ---------------------------------------------------------------------
-- marketplace_fee_payments: separate money-movement/provider record, NOT
-- reusing transactions (org accounting ledger) or market_bids itself.
-- One row per payment ATTEMPT, not one row per bid -- a failed attempt is
-- retryable via a new row, so "one payment intent per bid" is enforced only
-- across ACTIVE (non-terminal-failure) attempts, via a partial unique index,
-- not a plain UNIQUE(market_bid_id).
CREATE TABLE public.marketplace_fee_payments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_bid_id          uuid NOT NULL REFERENCES public.market_bids(id) ON DELETE CASCADE,
  bidder_type            text NOT NULL CHECK (bidder_type IN ('dco', 'organization')),
  bidder_user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bidder_organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount                 numeric NOT NULL CHECK (amount > 0),
  currency               text NOT NULL DEFAULT 'INR',
  status                 text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  provider               text NULL,
  provider_order_id      text NULL,
  provider_payment_id    text NULL,
  failure_reason         text NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  paid_at                timestamptz NULL,
  failed_at              timestamptz NULL,
  CONSTRAINT marketplace_fee_payments_bidder_shape CHECK (
    (bidder_type = 'dco' AND bidder_organization_id IS NULL)
    OR (bidder_type = 'organization' AND bidder_organization_id IS NOT NULL)
  )
);

-- At most one ACTIVE (pending or paid) payment row per bid at a time --
-- permits a fresh retry row after a 'failed'/'expired'/'cancelled' terminal
-- outcome without ever having two live attempts racing on the same bid.
CREATE UNIQUE INDEX idx_marketplace_fee_payments_one_active_per_bid
  ON public.marketplace_fee_payments (market_bid_id)
  WHERE status IN ('pending', 'paid');

CREATE INDEX idx_marketplace_fee_payments_market_bid_id
  ON public.marketplace_fee_payments (market_bid_id);
CREATE INDEX idx_marketplace_fee_payments_bidder_user
  ON public.marketplace_fee_payments (bidder_user_id);

DROP TRIGGER IF EXISTS set_marketplace_fee_payments_updated_at ON public.marketplace_fee_payments;
CREATE TRIGGER set_marketplace_fee_payments_updated_at
  BEFORE UPDATE ON public.marketplace_fee_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.marketplace_fee_payments ENABLE ROW LEVEL SECURITY;

-- One SELECT policy, modeled on market_bids_select's own shape: the bidder
-- who owns the underlying bid may read their own payment attempts. The
-- awarding org does NOT need row access here -- they already see
-- fee_payment_status via list_market_bids_for_indent()/list_my_org_market_bids(),
-- and this table is bidder-facing payment history, not award-review data.
DROP POLICY IF EXISTS marketplace_fee_payments_select ON public.marketplace_fee_payments;
CREATE POLICY marketplace_fee_payments_select ON public.marketplace_fee_payments
  FOR SELECT
  TO authenticated
  USING (
    bidder_user_id = (select auth.uid())
    OR (
      bidder_organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = marketplace_fee_payments.bidder_organization_id
          AND om.user_id = (select auth.uid())
          AND om.status = 'active'
      )
    )
  );

-- No INSERT/UPDATE/DELETE policy -- all writes go through SECURITY DEFINER
-- functions only (same convention as market_bids itself: REVOKE ALL, GRANT
-- SELECT only to authenticated).
REVOKE ALL ON public.marketplace_fee_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.marketplace_fee_payments TO authenticated;

COMMENT ON TABLE public.marketplace_fee_payments IS
  'A8.6.2: money-movement/provider record for a Marketplace platform-fee payment attempt. One row per attempt (retries get a new row); at most one active (pending/paid) row per market_bid_id via a partial unique index. Distinct from transactions (org accounting ledger) and market_bids (award state). No real payment gateway wired in this phase -- provider/provider_order_id/provider_payment_id stay NULL or carry a manual-test marker until A8.7.';
