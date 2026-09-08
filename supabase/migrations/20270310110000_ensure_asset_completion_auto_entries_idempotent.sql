-- Phase 6a: close the check-then-insert race in ensureAssetCompletionAutoEntries
-- (features/trips/services/trips.service.ts). Today that function does a plain
-- client-side SELECT (existing transactions for this trip) then conditionally
-- INSERTs client-revenue / driver-commission / marketplace-platform-fee rows
-- if none exist -- with no transaction, no lock, no unique constraint. Two
-- concurrent completions of the same trip (double-tap, retry, request replay)
-- can each pass the "does it exist" check before either commits, producing
-- duplicate ledger entries.
--
-- The three ledger_category values written here (TRIP_REVENUE,
-- DRIVER_COMMISSION, MARKETPLACE_PLATFORM_FEE) are system-reserved: confirmed
-- by repo-wide grep, they are referenced nowhere else except this function and
-- the historical A8.4 backfill migration -- no manual/user-facing entry path
-- ever writes them. That makes (trip_id, ledger_category) a safe natural
-- idempotency key: this partial unique index can never collide with a
-- legitimate manual ledger entry, so INSERT ... ON CONFLICT ... DO NOTHING
-- gives true database-level protection with no advisory lock needed -- unlike
-- the driver-phone fix, there is no cross-entity "whose row wins" ambiguity
-- here, just per-trip idempotency.

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_trip_auto_category
  ON public.transactions (trip_id, ledger_category)
  WHERE ledger_category IN ('TRIP_REVENUE', 'DRIVER_COMMISSION', 'MARKETPLACE_PLATFORM_FEE');

-- Ports ensureAssetCompletionAutoEntries verbatim: same three conditional
-- inserts, same amount/fallback logic (including the Math.max(0, ...) floor
-- and the A8.4.1 lowercase ledger_entity_type values already fixed in the
-- source), same "asset payout mode only" gate. The only behavior change is
-- swapping "SELECT existing, then INSERT if missing" for
-- "INSERT ... ON CONFLICT DO NOTHING", which is the atomicity fix itself, not
-- a business-rule change.
--
-- Preserves the current operational contract: this must remain best-effort
-- and must never make trip completion depend on ledger-entry creation
-- succeeding. It does not RAISE on a failed insert; the one exception is the
-- authorization/not-found guards, which mirror what the client-side caller
-- already implicitly required (the caller can only reach this after its own
-- successful, RLS-authorized trip completion).
CREATE OR REPLACE FUNCTION public.ensure_asset_completion_auto_entries(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_trip              public.trips%ROWTYPE;
  v_payout_mode       text;
  v_transaction_date  date;
  v_client_amount     numeric;
  v_driver_target     numeric;
BEGIN
  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT public.is_org_member(v_trip.organization_id) THEN
    RETURN;
  END IF;

  v_payout_mode := lower(trim(coalesce(v_trip.trip_payout_mode, '')));
  IF v_payout_mode NOT IN ('market', 'asset') THEN
    v_payout_mode := CASE WHEN trim(coalesce(v_trip.supplier_id::text, '')) <> '' THEN 'market' ELSE 'asset' END;
  END IF;
  IF v_payout_mode <> 'asset' THEN
    RETURN;
  END IF;

  v_transaction_date := coalesce(v_trip.completed_at::date, now()::date);
  v_client_amount := greatest(0, coalesce(v_trip.client_price, 0));
  v_driver_target := greatest(0, coalesce(v_trip.driver_commission, v_trip.supplier_rate, 0));

  IF v_client_amount > 0 THEN
    INSERT INTO public.transactions (
      organization_id, trip_id, party_name, description,
      amount_in, amount_out, transaction_date,
      contact_id, contact_type, ledger_entity_type, ledger_flow_type, ledger_category
    )
    VALUES (
      v_trip.organization_id, v_trip.id,
      nullif(trim(coalesce(v_trip.client_name, '')), '') , 'TRIP REVENUE AUTO | Mode: System',
      v_client_amount, 0, v_transaction_date,
      v_trip.client_id, 'client', 'client', 'receivable', 'TRIP_REVENUE'
    )
    ON CONFLICT (trip_id, ledger_category) WHERE (ledger_category IN ('TRIP_REVENUE', 'DRIVER_COMMISSION', 'MARKETPLACE_PLATFORM_FEE'))
    DO NOTHING;
  END IF;

  IF v_driver_target > 0 AND v_trip.driver_id IS NOT NULL THEN
    INSERT INTO public.transactions (
      organization_id, trip_id, party_name, description,
      amount_in, amount_out, transaction_date,
      contact_id, contact_type, ledger_entity_type, ledger_flow_type, ledger_category
    )
    VALUES (
      v_trip.organization_id, v_trip.id,
      nullif(trim(coalesce(v_trip.driver_display_name, '')), ''), 'DRIVER COMMISSION AUTO | Mode: System',
      0, v_driver_target, v_transaction_date,
      v_trip.driver_id, 'driver', 'driver', 'payable', 'DRIVER_COMMISSION'
    )
    ON CONFLICT (trip_id, ledger_category) WHERE (ledger_category IN ('TRIP_REVENUE', 'DRIVER_COMMISSION', 'MARKETPLACE_PLATFORM_FEE'))
    DO NOTHING;
  END IF;

  IF v_trip.source = 'market_bid' AND coalesce(v_trip.platform_fee, 0) > 0 THEN
    INSERT INTO public.transactions (
      organization_id, trip_id, party_name, description,
      amount_in, amount_out, transaction_date,
      contact_id, contact_type, ledger_entity_type, ledger_flow_type, ledger_category
    )
    VALUES (
      v_trip.organization_id, v_trip.id,
      'Pulse Marketplace', 'MARKETPLACE PLATFORM FEE AUTO | Mode: System',
      0, v_trip.platform_fee, v_transaction_date,
      NULL, NULL, 'platform', 'expense', 'MARKETPLACE_PLATFORM_FEE'
    )
    ON CONFLICT (trip_id, ledger_category) WHERE (ledger_category IN ('TRIP_REVENUE', 'DRIVER_COMMISSION', 'MARKETPLACE_PLATFORM_FEE'))
    DO NOTHING;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_asset_completion_auto_entries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_asset_completion_auto_entries(uuid) TO authenticated;
