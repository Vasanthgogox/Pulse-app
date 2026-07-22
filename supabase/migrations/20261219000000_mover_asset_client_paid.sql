-- Shared-ledger visibility: how much the aggregator has paid the mover on a
-- mover_asset trip's linked load.
--
-- A mover's asset trip (source='mover_asset') has no ledger of its own for the
-- client receivable — the payment lives on the AGGREGATOR's trip (same indent),
-- recorded as a supplier payout (amount_out, contact_type supplier). This
-- returns that paid total so the mover's receivable can show "MAX marked paid
-- ₹X" without mirroring any row onto the mover's books.
--
-- SECURITY DEFINER + membership check: only the mover org (assigned supplier on
-- the indent) may read it.
CREATE OR REPLACE FUNCTION public.get_mover_asset_client_paid(p_trip_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mover_trip   public.trips%ROWTYPE;
  v_indent_id    uuid;
  v_paid         numeric := 0;
BEGIN
  SELECT * INTO v_mover_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND OR v_mover_trip.source <> 'mover_asset' THEN
    RETURN 0;
  END IF;

  -- Caller must be a member of the mover org that owns this asset trip.
  IF NOT public.is_org_member(v_mover_trip.organization_id) THEN
    RETURN 0;
  END IF;

  v_indent_id := v_mover_trip.source_indent_id;
  IF v_indent_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Sum supplier-payout outflows on the aggregator's trip(s) for the same load.
  SELECT COALESCE(SUM(tx.amount_out), 0) INTO v_paid
  FROM public.transactions tx
  JOIN public.trips agg ON agg.id = tx.trip_id
  WHERE agg.indent_id = v_indent_id
    AND agg.organization_id <> v_mover_trip.organization_id
    AND lower(COALESCE(tx.contact_type, '')) = 'supplier'
    AND COALESCE(tx.amount_out, 0) > 0;

  RETURN v_paid;
END;
$function$;
